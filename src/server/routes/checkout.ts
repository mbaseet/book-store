import { and, eq, gt, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { CURRENCY, STORY_LANGUAGES } from '@shared/constants'
import {
  checkoutDraftDeliveryUpdateSchema,
  checkoutDraftItemInputSchema,
  checkoutInputSchema,
  checkoutQuoteInputSchema,
  type CheckoutDraftItemInput,
  type CheckoutInput,
} from '@shared/contracts/checkout'
import { createDb } from '../db'
import {
  orderItemAddonsTable,
  orderItemsTable,
  orderSensitiveAssetsTable,
  orderStatusHistoryTable,
  ordersTable,
  promoCodeRedemptionsTable,
  promoCodesTable,
} from '../db/schema'
import { canonicalEmail, errorResponse, hasTrustedOrigin, parseJson } from '../lib/http'
import { canonicalPhone, createOrderNumber } from '../lib/order-identifiers'
import { checkRateLimit, requestSubject } from '../lib/rate-limit'
import { getCurrentCustomer } from '../lib/sessions'
import {
  CheckoutDraftConflictError,
  CheckoutDraftError,
  appendCheckoutDraftItem,
  consumeCheckoutDraft,
  getCurrentCheckoutDraft,
  publicDraft,
  removeCheckoutDraftItem,
  updateCheckoutDraftDelivery,
} from '../services/checkout-drafts'
import {
  claimPrivateCheckoutUpload,
  claimPrivateDraftUpload,
  consumePrivateCheckoutUpload,
  PrivateUploadError,
  releasePrivateCheckoutUploadClaim,
  releasePrivateDraftUploadClaim,
} from '../services/private-uploads'
import {
  loadActiveGovernorate,
  loadCheckoutProducts,
  loadConfiguredPaymentMethods,
  loadFreeShippingThresholdAmount,
  loadPromoCode,
  localeFromRequest,
} from '../services/checkout-data'
import {
  parsePersonalizationDefinition,
  PersonalizationValidationError,
  serializeOrderPersonalizationSnapshots,
  validatePersonalization,
} from '../services/personalization'
import { calculateOrderPricing, PricingError } from '../services/pricing'
import type { Bindings } from '../types'

type AppEnvironment = { Bindings: Bindings }
type Database = ReturnType<typeof createDb>

function setPrivateDraftResponseHeaders(context: { header(name: string, value: string): void }) {
  context.header('Cache-Control', 'no-store')
  context.header('Vary', 'Cookie, Accept-Language')
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function reservePromoRedemption(
  db: Database,
  promoCodeId: string,
  subtotalAmount: number,
) {
  const now = new Date()
  const result = await db
    .update(promoCodesTable)
    .set({ redemptionCount: sql`${promoCodesTable.redemptionCount} + 1`, updatedAt: now })
    .where(
      and(
        eq(promoCodesTable.id, promoCodeId),
        eq(promoCodesTable.isActive, true),
        or(isNull(promoCodesTable.startsAt), lte(promoCodesTable.startsAt, now)),
        or(isNull(promoCodesTable.endsAt), gt(promoCodesTable.endsAt, now)),
        or(isNull(promoCodesTable.maxRedemptions), lt(promoCodesTable.redemptionCount, promoCodesTable.maxRedemptions)),
        or(
          isNull(promoCodesTable.minimumSubtotalAmount),
          lte(promoCodesTable.minimumSubtotalAmount, subtotalAmount),
        ),
      ),
    )
    .run()
  return Number(result.meta.changes ?? 0) === 1
}

async function releasePromoReservation(db: Database, promoCodeId: string) {
  await db
    .update(promoCodesTable)
    .set({ redemptionCount: sql`max(${promoCodesTable.redemptionCount} - 1, 0)`, updatedAt: new Date() })
    .where(eq(promoCodesTable.id, promoCodeId))
}

async function draftItemPresentation(
  db: Database,
  input: CheckoutDraftItemInput,
  locale: ReturnType<typeof localeFromRequest>,
) {
  const products = await loadCheckoutProducts(db, [input.productId], locale)
  try {
    const pricing = calculateOrderPricing({
      cartItems: [{ productId: input.productId, quantity: input.quantity, addonIds: input.addonIds }],
      products,
      promoCode: null,
      governorateShippingFeeAmount: 0,
      freeShippingThresholdAmount: null,
    })
    const priced = pricing.items[0]
    if (!priced) throw new PricingError()
    const product = products.find((candidate) => candidate.id === priced.product.id)
    if (!product) throw new PricingError()
    const personalization = validatePersonalization(
      parsePersonalizationDefinition(product.personalizationDefinition, product.personalizationVersion),
      input,
    )
    const personalizedChildName = personalization.answers.childName
    const personalizedStoryLanguage = personalization.answers.storyLanguage
    const personalizedNote = personalization.answers.note
    return {
      productId: priced.product.id,
      productSlug: priced.product.slug,
      productTitle: priced.product.title,
      productImageUrl: priced.product.imageUrl,
      basePriceAmount: priced.baseUnitPriceAmount,
      salePriceAmount: priced.saleUnitPriceAmount,
      quantity: input.quantity,
      childName: typeof personalizedChildName === 'string' ? personalizedChildName : input.childName,
      storyLanguage:
        typeof personalizedStoryLanguage === 'string' && (STORY_LANGUAGES as readonly string[]).includes(personalizedStoryLanguage)
          ? personalizedStoryLanguage as 'ar_msa' | 'ar_eg' | 'en'
          : input.storyLanguage,
      note: typeof personalizedNote === 'string' ? personalizedNote : input.note,
      personalization: { ...personalization.answers, ...personalization.sensitiveAnswers },
      personalizationDefinition: personalization.definition,
      addons: priced.selectedAddons.map((addon) => ({ id: addon.id, name: addon.name, priceAmount: addon.priceAmount })),
    }
  } catch (error) {
    if (error instanceof PersonalizationValidationError) throw error
    if (error instanceof PricingError) {
      throw new CheckoutDraftError('This story or one of its extras is no longer available. Please choose it again.')
    }
    throw error
  }
}

function draftUploadIdsAreUnique(
  draft: NonNullable<Awaited<ReturnType<typeof getCurrentCheckoutDraft>>>,
  paymentProofUpload: CheckoutInput['paymentProofUpload'],
) {
  const uploadIds = [
    ...draft.payload.items.flatMap((item) => item.childUploadIds),
    paymentProofUpload.uploadId,
  ]
  return new Set(uploadIds).size === uploadIds.length
}

export const checkoutRoutes = new Hono<AppEnvironment>()

checkoutRoutes.get('/checkout/draft', async (context) => {
  const db = createDb(context.env)
  const draft = await getCurrentCheckoutDraft(context, db, context.env)
  setPrivateDraftResponseHeaders(context)
  return context.json({ draft: draft ? publicDraft(draft) : null })
})

checkoutRoutes.post('/checkout/draft/items', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const parsed = await parseJson(context, checkoutDraftItemInputSchema)
  if (!parsed.success) return parsed.response

  const db = createDb(context.env)
  const allowed = await checkRateLimit(db, requestSubject(context.req.raw), 'checkout_draft_item', {
    maxAttempts: 25,
    windowMs: 30 * 60 * 1000,
  })
  if (!allowed) return errorResponse(context, 429, 'rate_limited', 'Please wait before saving another story.')

  try {
    const presentation = await draftItemPresentation(db, parsed.data, localeFromRequest(context.req.raw))
    const draft = await appendCheckoutDraftItem(context, db, context.env, presentation, parsed.data.childUploads)
    setPrivateDraftResponseHeaders(context)
    return context.json({ draft }, 201)
  } catch (error) {
    if (error instanceof PersonalizationValidationError) {
      return errorResponse(context, 422, 'invalid_personalization', 'Please check the personalization details.', error.fieldErrors)
    }
    if (error instanceof CheckoutDraftConflictError) {
      return errorResponse(context, 409, 'checkout_draft_conflict', error.message)
    }
    if (error instanceof CheckoutDraftError) {
      return errorResponse(context, 422, 'checkout_draft_unavailable', error.message)
    }
    return errorResponse(context, 500, 'checkout_draft_unavailable', 'Your story could not be saved. Please try again.')
  }
})

checkoutRoutes.put('/checkout/draft/delivery', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const parsed = await parseJson(context, checkoutDraftDeliveryUpdateSchema)
  if (!parsed.success) return parsed.response

  const db = createDb(context.env)
  const allowed = await checkRateLimit(db, requestSubject(context.req.raw), 'checkout_draft_delivery', {
    maxAttempts: 60,
    windowMs: 30 * 60 * 1000,
  })
  if (!allowed) return errorResponse(context, 429, 'rate_limited', 'Please wait before saving checkout details again.')

  try {
    const { expectedRevision, ...delivery } = parsed.data
    const draft = await updateCheckoutDraftDelivery(context, db, context.env, delivery, expectedRevision)
    setPrivateDraftResponseHeaders(context)
    return context.json({ draft })
  } catch (error) {
    if (error instanceof CheckoutDraftConflictError) {
      return errorResponse(context, 409, 'checkout_draft_conflict', error.message)
    }
    if (error instanceof CheckoutDraftError) {
      return errorResponse(context, 409, 'checkout_draft_expired', error.message)
    }
    return errorResponse(context, 500, 'checkout_draft_unavailable', 'Checkout details could not be saved.')
  }
})

checkoutRoutes.delete('/checkout/draft/items/:id', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const itemId = context.req.param('id')
  if (!validUuid(itemId)) return errorResponse(context, 404, 'checkout_item_not_found', 'This story was not found.')
  const expectedRevision = Number.parseInt(context.req.query('revision') ?? '', 10)
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return errorResponse(context, 422, 'invalid_input', 'The saved checkout needs to be refreshed.')
  }

  try {
    const draft = await removeCheckoutDraftItem(context, createDb(context.env), context.env, itemId, expectedRevision)
    setPrivateDraftResponseHeaders(context)
    return context.json({ draft })
  } catch (error) {
    if (error instanceof CheckoutDraftConflictError) {
      return errorResponse(context, 409, 'checkout_draft_conflict', error.message)
    }
    if (error instanceof CheckoutDraftError) {
      return errorResponse(context, 409, 'checkout_draft_unavailable', error.message)
    }
    return errorResponse(context, 500, 'checkout_draft_unavailable', 'This story could not be removed.')
  }
})

checkoutRoutes.post('/checkout/quote', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const parsed = await parseJson(context, checkoutQuoteInputSchema)
  if (!parsed.success) return parsed.response

  const db = createDb(context.env)
  const allowed = await checkRateLimit(db, requestSubject(context.req.raw), 'checkout_quote', {
    maxAttempts: 40,
    windowMs: 15 * 60 * 1000,
  })
  if (!allowed) return errorResponse(context, 429, 'rate_limited', 'Please wait before recalculating your order.')

  const locale = localeFromRequest(context.req.raw)
  const [governorate, products, promoCode, freeShippingThresholdAmount] = await Promise.all([
    loadActiveGovernorate(db, parsed.data.governorateCode),
    loadCheckoutProducts(
      db,
      parsed.data.items.map((item) => item.productId),
      locale,
    ),
    loadPromoCode(db, parsed.data.promoCode),
    loadFreeShippingThresholdAmount(db),
  ])
  if (!governorate) {
    return errorResponse(context, 422, 'invalid_governorate', 'Please select an available governorate.')
  }
  if (parsed.data.promoCode && !promoCode) {
    return errorResponse(context, 422, 'invalid_promo_code', 'This promo code is not available.')
  }

  try {
    const pricing = calculateOrderPricing({
      cartItems: parsed.data.items,
      products,
      promoCode,
      governorateShippingFeeAmount: governorate.shippingFeeAmount,
      freeShippingThresholdAmount,
    })
    return context.json({
      quote: {
        subtotalAmount: pricing.subtotalAmount,
        promoDiscountAmount: pricing.promoDiscountAmount,
        shippingFeeAmount: pricing.shippingFeeAmount,
        totalAmount: pricing.totalAmount,
        freeShippingApplied: pricing.freeShippingApplied,
        currency: CURRENCY,
      },
    })
  } catch (error) {
    if (error instanceof PricingError) {
      return errorResponse(context, 422, 'pricing_unavailable', 'Please review your order and try again.')
    }
    return errorResponse(context, 500, 'pricing_unavailable', 'Pricing is temporarily unavailable.')
  }
})

checkoutRoutes.post('/checkout', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const parsed = await parseJson(context, checkoutInputSchema)
  if (!parsed.success) return parsed.response

  const db = createDb(context.env)
  const draft = await getCurrentCheckoutDraft(context, db, context.env)
  if (!draft) {
    return errorResponse(context, 409, 'checkout_draft_expired', 'Your saved checkout expired. Please personalize your story again.')
  }
  if (!draftUploadIdsAreUnique(draft, parsed.data.paymentProofUpload)) {
    return errorResponse(context, 422, 'duplicate_upload', 'Each uploaded image can be used only once per order.')
  }

  const allowed = await checkRateLimit(db, requestSubject(context.req.raw), 'checkout_create', {
    maxAttempts: 15,
    windowMs: 30 * 60 * 1000,
  })
  if (!allowed) return errorResponse(context, 429, 'rate_limited', 'Please wait before submitting another order.')

  const locale = localeFromRequest(context.req.raw)
  const draftItems = draft.payload.items
  const [governorate, products, promoCode, freeShippingThresholdAmount, customer, configuredPaymentMethods] = await Promise.all([
    loadActiveGovernorate(db, parsed.data.governorateCode),
    loadCheckoutProducts(
      db,
      draftItems.map((item) => item.productId),
      locale,
    ),
    loadPromoCode(db, parsed.data.promoCode),
    loadFreeShippingThresholdAmount(db),
    getCurrentCustomer(context, db),
    loadConfiguredPaymentMethods(db),
  ])
  if (!governorate) {
    return errorResponse(context, 422, 'invalid_governorate', 'Please select an available governorate.')
  }
  if (parsed.data.promoCode && !promoCode) {
    return errorResponse(context, 422, 'invalid_promo_code', 'This promo code is not available.')
  }
  if (!configuredPaymentMethods.has(parsed.data.paymentMethod)) {
    return errorResponse(context, 422, 'payment_method_unavailable', 'Please choose an available transfer method.')
  }

  let pricing
  try {
    pricing = calculateOrderPricing({
      cartItems: draftItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        addonIds: item.addons.map((addon) => addon.id),
      })),
      products,
      promoCode,
      governorateShippingFeeAmount: governorate.shippingFeeAmount,
      freeShippingThresholdAmount,
    })
  } catch (error) {
    if (error instanceof PricingError) {
      return errorResponse(context, 422, 'pricing_unavailable', 'Please review your saved story and try again.')
    }
    return errorResponse(context, 500, 'pricing_unavailable', 'Pricing is temporarily unavailable.')
  }

  const claimedDraftUploadIds: string[] = []
  const childAssetsByItem = [] as Array<
    Array<{ id: string; kind: 'child_photo' | 'payment_proof'; url: string; cloudinaryPublicId: string }>
  >
  let paymentProof: { id: string; kind: 'child_photo' | 'payment_proof'; url: string; cloudinaryPublicId: string } | null = null
  try {
    for (const item of draftItems) {
      const childAssets = [] as Array<{
        id: string
        kind: 'child_photo' | 'payment_proof'
        url: string
        cloudinaryPublicId: string
      }>
      for (const uploadId of item.childUploadIds) {
        const asset = await claimPrivateDraftUpload(db, context.env, {
          draftId: draft.id,
          uploadId,
          expectedKind: 'child_photo',
        })
        childAssets.push(asset)
        claimedDraftUploadIds.push(uploadId)
      }
      childAssetsByItem.push(childAssets)
    }
    paymentProof = await claimPrivateCheckoutUpload(
      db,
      context.env,
      parsed.data.paymentProofUpload,
      'payment_proof',
    )
  } catch (error) {
    await Promise.allSettled(claimedDraftUploadIds.map((uploadId) => releasePrivateDraftUploadClaim(db, draft.id, uploadId)))
    // Only release the payment proof when this request acquired its claim.
    // Otherwise a concurrent failed request could clear another checkout's
    // successful claim and make the proof reusable.
    if (paymentProof) await releasePrivateCheckoutUploadClaim(db, parsed.data.paymentProofUpload)
    const message = error instanceof PrivateUploadError ? error.message : 'An uploaded image could not be verified.'
    return errorResponse(context, 422, 'invalid_upload', message)
  }

  const orderId = crypto.randomUUID()
  const orderNumber = createOrderNumber()
  const orderItemRows = draftItems.map((item, index) => {
    const pricedItem = pricing.items[index]
    const snapshots = serializeOrderPersonalizationSnapshots(
      item.personalizationDefinition,
      item.personalization,
    )
    return {
      id: crypto.randomUUID(),
      orderId,
      productId: pricedItem.product.id,
      productSlug: pricedItem.product.slug,
      productTitle: pricedItem.product.title,
      productImageUrl: pricedItem.product.imageUrl,
      baseUnitPriceAmount: pricedItem.baseUnitPriceAmount,
      saleUnitPriceAmount: pricedItem.saleUnitPriceAmount,
      finalUnitPriceAmount: pricedItem.finalUnitPriceAmount,
      quantity: item.quantity,
      childName: item.childName,
      storyLanguage: item.storyLanguage,
      customerNote: item.note || null,
      ...snapshots,
      lineTotalAmount: pricedItem.lineTotalAmount,
    }
  })
  const addonRows = pricing.items.flatMap((pricedItem, index) =>
    pricedItem.selectedAddons.map((addon) => ({
      id: crypto.randomUUID(),
      orderItemId: orderItemRows[index].id,
      productAddonId: addon.id,
      addonName: addon.name,
      unitPriceAmount: addon.priceAmount,
      quantity: draftItems[index].quantity,
      lineTotalAmount: addon.priceAmount * draftItems[index].quantity,
    })),
  )
  const assetRows = [
    ...childAssetsByItem.flatMap((assets, index) =>
      assets.map((asset) => ({
        id: crypto.randomUUID(),
        orderId,
        orderItemId: orderItemRows[index].id,
        kind: asset.kind,
        url: asset.url,
        cloudinaryPublicId: asset.cloudinaryPublicId,
        deleteAfter: null,
      })),
    ),
    {
      id: crypto.randomUUID(),
      orderId,
      orderItemId: null,
      kind: paymentProof.kind,
      url: paymentProof.url,
      cloudinaryPublicId: paymentProof.cloudinaryPublicId,
      deleteAfter: null,
    },
  ]
  const orderRow = {
    id: orderId,
    orderNumber,
    customerAccountId: customer?.id ?? null,
    status: 'payment_submitted',
    customerName: parsed.data.customerName,
    email: canonicalEmail(parsed.data.email),
    phone: canonicalPhone(parsed.data.phone),
    governorateId: governorate.id,
    governorateName: locale === 'ar' ? governorate.nameAr : governorate.nameEn,
    city: parsed.data.city,
    addressLine1: parsed.data.addressLine1,
    addressLine2: parsed.data.addressLine2 || null,
    addressNote: parsed.data.addressNote || null,
    paymentMethod: parsed.data.paymentMethod,
    subtotalAmount: pricing.subtotalAmount,
    promoCodeId: promoCode?.id ?? null,
    promoCode: promoCode?.code ?? null,
    promoDiscountAmount: pricing.promoDiscountAmount,
    shippingFeeAmount: pricing.shippingFeeAmount,
    freeShippingThresholdAmount,
    totalAmount: pricing.totalAmount,
    currency: CURRENCY,
  }

  let promoReserved = false
  try {
    if (promoCode) {
      promoReserved = await reservePromoRedemption(db, promoCode.id, pricing.subtotalAmount)
      if (!promoReserved) {
        await Promise.allSettled(claimedDraftUploadIds.map((uploadId) => releasePrivateDraftUploadClaim(db, draft.id, uploadId)))
        await releasePrivateCheckoutUploadClaim(db, parsed.data.paymentProofUpload)
        return errorResponse(context, 409, 'promo_code_unavailable', 'This promo code is no longer available.')
      }
    }

    const insertOrder = db.insert(ordersTable).values(orderRow)
    const insertItems = db.insert(orderItemsTable).values(orderItemRows)
    const insertAssets = db.insert(orderSensitiveAssetsTable).values(assetRows)
    const insertHistory = db.insert(orderStatusHistoryTable).values({
      orderId,
      fromStatus: null,
      toStatus: 'payment_submitted',
      customerVisibleNote: null,
    })
    if (promoCode && addonRows.length > 0) {
      await db.batch([
        insertOrder,
        insertItems,
        db.insert(orderItemAddonsTable).values(addonRows),
        insertAssets,
        insertHistory,
        db.insert(promoCodeRedemptionsTable).values({
          promoCodeId: promoCode.id,
          orderId,
          discountAmount: pricing.promoDiscountAmount,
        }),
      ])
    } else if (promoCode) {
      await db.batch([
        insertOrder,
        insertItems,
        insertAssets,
        insertHistory,
        db.insert(promoCodeRedemptionsTable).values({
          promoCodeId: promoCode.id,
          orderId,
          discountAmount: pricing.promoDiscountAmount,
        }),
      ])
    } else if (addonRows.length > 0) {
      await db.batch([insertOrder, insertItems, db.insert(orderItemAddonsTable).values(addonRows), insertAssets, insertHistory])
    } else {
      await db.batch([insertOrder, insertItems, insertAssets, insertHistory])
    }
  } catch {
    if (promoReserved && promoCode) await releasePromoReservation(db, promoCode.id)
    await Promise.allSettled(claimedDraftUploadIds.map((uploadId) => releasePrivateDraftUploadClaim(db, draft.id, uploadId)))
    await releasePrivateCheckoutUploadClaim(db, parsed.data.paymentProofUpload)
    return errorResponse(context, 500, 'checkout_unavailable', 'Your order could not be submitted. Please try again.')
  }

  await Promise.allSettled([
    consumeCheckoutDraft(context, db, draft),
    consumePrivateCheckoutUpload(db, parsed.data.paymentProofUpload),
  ])

  return context.json(
    {
      order: {
        orderNumber,
        status: 'payment_submitted',
        subtotalAmount: pricing.subtotalAmount,
        promoDiscountAmount: pricing.promoDiscountAmount,
        shippingFeeAmount: pricing.shippingFeeAmount,
        totalAmount: pricing.totalAmount,
        currency: CURRENCY,
      },
    },
    201,
  )
})
