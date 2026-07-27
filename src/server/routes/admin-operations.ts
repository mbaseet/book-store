import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  faqWriteSchema,
  promoCodeWriteSchema,
  testimonialWriteSchema,
  updateGovernorateSchema,
  type FaqWriteInput,
  type PromoCodeWriteInput,
  type TestimonialWriteInput,
} from '@shared/contracts/admin-operations'
import { createDb } from '../db'
import {
  faqTranslationsTable,
  faqsTable,
  governoratesTable,
  promoCodesTable,
  testimonialTranslationsTable,
  testimonialsTable,
} from '../db/schema'
import { errorResponse, hasTrustedOrigin, parseJson } from '../lib/http'
import { requireAdmin } from './auth'
import type { Bindings } from '../types'

type AppEnvironment = { Bindings: Bindings }
type LocaleRow = { locale: string }

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// Governorates are bootstrap records with stable opaque IDs such as
// `gov-cairo`, while newly created records elsewhere use UUIDs. The database
// query remains parameterized; this only rejects malformed route parameters.
export function isGovernorateId(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)
}

function translationPair<T extends LocaleRow>(translations: T[]) {
  const ar = translations.find((translation) => translation.locale === 'ar')
  const en = translations.find((translation) => translation.locale === 'en')
  if (!ar || !en) throw new Error('Both translations are required.')
  return { ar, en }
}

function promotionValues(input: PromoCodeWriteInput) {
  return {
    code: input.code.toLocaleUpperCase('en-US'),
    fixedDiscountAmount: input.fixedDiscountAmount,
    minimumSubtotalAmount: input.minimumSubtotalAmount ?? null,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    maxRedemptions: input.maxRedemptions ?? null,
    isActive: input.isActive,
  }
}

async function saveFaq(db: ReturnType<typeof createDb>, input: FaqWriteInput, id?: string) {
  const faqId = id ?? crypto.randomUUID()
  const now = new Date()
  const pair = translationPair(input.translations)
  const writeFaq = id
    ? db
        .update(faqsTable)
        .set({ isPublished: input.isPublished, sortOrder: input.sortOrder, updatedAt: now })
        .where(eq(faqsTable.id, faqId))
    : db.insert(faqsTable).values({ id: faqId, isPublished: input.isPublished, sortOrder: input.sortOrder })
  const upsert = (translation: typeof pair.ar) =>
    db
      .insert(faqTranslationsTable)
      .values({ faqId, locale: translation.locale, question: translation.question, answer: translation.answer })
      .onConflictDoUpdate({
        target: [faqTranslationsTable.faqId, faqTranslationsTable.locale],
        set: { question: translation.question, answer: translation.answer, updatedAt: now },
      })
  await db.batch([writeFaq, upsert(pair.ar), upsert(pair.en)])
  return faqId
}

async function saveTestimonial(
  db: ReturnType<typeof createDb>,
  input: TestimonialWriteInput,
  id?: string,
) {
  const testimonialId = id ?? crypto.randomUUID()
  const now = new Date()
  const pair = translationPair(input.translations)
  const writeTestimonial = id
    ? db
        .update(testimonialsTable)
        .set({
          displayName: input.displayName,
          isPublished: input.isPublished,
          sortOrder: input.sortOrder,
          updatedAt: now,
        })
        .where(eq(testimonialsTable.id, testimonialId))
    : db
        .insert(testimonialsTable)
        .values({
          id: testimonialId,
          displayName: input.displayName,
          isPublished: input.isPublished,
          sortOrder: input.sortOrder,
        })
  const upsert = (translation: typeof pair.ar) =>
    db
      .insert(testimonialTranslationsTable)
      .values({ testimonialId, locale: translation.locale, quote: translation.quote })
      .onConflictDoUpdate({
        target: [testimonialTranslationsTable.testimonialId, testimonialTranslationsTable.locale],
        set: { quote: translation.quote, updatedAt: now },
      })
  await db.batch([writeTestimonial, upsert(pair.ar), upsert(pair.en)])
  return testimonialId
}

function serializePromotion(promotion: typeof promoCodesTable.$inferSelect) {
  return {
    ...promotion,
    startsAt: promotion.startsAt?.toISOString() ?? null,
    endsAt: promotion.endsAt?.toISOString() ?? null,
    createdAt: promotion.createdAt.toISOString(),
    updatedAt: promotion.updatedAt.toISOString(),
  }
}

export const adminOperationsRoutes = new Hono<AppEnvironment>()

adminOperationsRoutes.get('/admin/governorates', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')

  const governorates = await createDb(context.env)
    .select()
    .from(governoratesTable)
    .orderBy(asc(governoratesTable.sortOrder), asc(governoratesTable.nameEn))
  return context.json({
    governorates: governorates.map((governorate) => ({
      ...governorate,
      createdAt: governorate.createdAt.toISOString(),
      updatedAt: governorate.updatedAt.toISOString(),
    })),
  })
})

adminOperationsRoutes.put('/admin/governorates/:id', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!isGovernorateId(id)) return errorResponse(context, 404, 'governorate_not_found', 'The governorate was not found.')
  const parsed = await parseJson(context, updateGovernorateSchema)
  if (!parsed.success) return parsed.response

  const result = await createDb(context.env)
    .update(governoratesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(governoratesTable.id, id))
    .run()
  if (Number(result.meta.changes ?? 0) !== 1) {
    return errorResponse(context, 404, 'governorate_not_found', 'The governorate was not found.')
  }
  return context.json({ id, saved: true })
})

adminOperationsRoutes.get('/admin/promo-codes', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const promotions = await createDb(context.env)
    .select()
    .from(promoCodesTable)
    .orderBy(asc(promoCodesTable.code))
  return context.json({ promoCodes: promotions.map(serializePromotion) })
})

adminOperationsRoutes.post('/admin/promo-codes', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const parsed = await parseJson(context, promoCodeWriteSchema)
  if (!parsed.success) return parsed.response

  const id = crypto.randomUUID()
  try {
    await createDb(context.env).insert(promoCodesTable).values({ id, ...promotionValues(parsed.data) })
    return context.json({ id }, 201)
  } catch {
    return errorResponse(context, 409, 'promo_code_conflict', 'This promo code could not be saved. The code may already be in use.')
  }
})

adminOperationsRoutes.put('/admin/promo-codes/:id', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!isUuid(id)) return errorResponse(context, 404, 'promo_code_not_found', 'The promo code was not found.')
  const parsed = await parseJson(context, promoCodeWriteSchema)
  if (!parsed.success) return parsed.response
  try {
    const result = await createDb(context.env)
      .update(promoCodesTable)
      .set({ ...promotionValues(parsed.data), updatedAt: new Date() })
      .where(eq(promoCodesTable.id, id))
      .run()
    if (Number(result.meta.changes ?? 0) !== 1) {
      return errorResponse(context, 404, 'promo_code_not_found', 'The promo code was not found.')
    }
    return context.json({ id, saved: true })
  } catch {
    return errorResponse(context, 409, 'promo_code_conflict', 'This promo code could not be saved. The code may already be in use.')
  }
})

// Preserve redemption history and order snapshots: removal is an inactive
// promotion, not a destructive database delete.
adminOperationsRoutes.delete('/admin/promo-codes/:id', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!isUuid(id)) return errorResponse(context, 404, 'promo_code_not_found', 'The promo code was not found.')
  const result = await createDb(context.env)
    .update(promoCodesTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(promoCodesTable.id, id))
    .run()
  if (Number(result.meta.changes ?? 0) !== 1) {
    return errorResponse(context, 404, 'promo_code_not_found', 'The promo code was not found.')
  }
  return context.body(null, 204)
})

adminOperationsRoutes.get('/admin/faqs', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const db = createDb(context.env)
  const [faqs, translations] = await Promise.all([
    db.select().from(faqsTable).orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt)),
    db.select().from(faqTranslationsTable),
  ])
  return context.json({
    faqs: faqs.map((faq) => ({
      ...faq,
      createdAt: faq.createdAt.toISOString(),
      updatedAt: faq.updatedAt.toISOString(),
      translations: translations
        .filter((translation) => translation.faqId === faq.id)
        .map((translation) => ({ locale: translation.locale, question: translation.question, answer: translation.answer })),
    })),
  })
})

adminOperationsRoutes.post('/admin/faqs', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const parsed = await parseJson(context, faqWriteSchema)
  if (!parsed.success) return parsed.response
  const id = await saveFaq(createDb(context.env), parsed.data)
  return context.json({ id }, 201)
})

adminOperationsRoutes.put('/admin/faqs/:id', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!isUuid(id)) return errorResponse(context, 404, 'faq_not_found', 'The FAQ was not found.')
  const parsed = await parseJson(context, faqWriteSchema)
  if (!parsed.success) return parsed.response
  const db = createDb(context.env)
  const [existing] = await db.select({ id: faqsTable.id }).from(faqsTable).where(eq(faqsTable.id, id)).limit(1)
  if (!existing) return errorResponse(context, 404, 'faq_not_found', 'The FAQ was not found.')
  await saveFaq(db, parsed.data, id)
  return context.json({ id, saved: true })
})

adminOperationsRoutes.delete('/admin/faqs/:id', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!isUuid(id)) return errorResponse(context, 404, 'faq_not_found', 'The FAQ was not found.')
  const result = await createDb(context.env).delete(faqsTable).where(eq(faqsTable.id, id)).run()
  if (Number(result.meta.changes ?? 0) !== 1) return errorResponse(context, 404, 'faq_not_found', 'The FAQ was not found.')
  return context.body(null, 204)
})

adminOperationsRoutes.get('/admin/testimonials', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const db = createDb(context.env)
  const [testimonials, translations] = await Promise.all([
    db.select().from(testimonialsTable).orderBy(asc(testimonialsTable.sortOrder), asc(testimonialsTable.createdAt)),
    db.select().from(testimonialTranslationsTable),
  ])
  return context.json({
    testimonials: testimonials.map((testimonial) => ({
      ...testimonial,
      createdAt: testimonial.createdAt.toISOString(),
      updatedAt: testimonial.updatedAt.toISOString(),
      translations: translations
        .filter((translation) => translation.testimonialId === testimonial.id)
        .map((translation) => ({ locale: translation.locale, quote: translation.quote })),
    })),
  })
})

adminOperationsRoutes.post('/admin/testimonials', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const parsed = await parseJson(context, testimonialWriteSchema)
  if (!parsed.success) return parsed.response
  const id = await saveTestimonial(createDb(context.env), parsed.data)
  return context.json({ id }, 201)
})

adminOperationsRoutes.put('/admin/testimonials/:id', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!isUuid(id)) return errorResponse(context, 404, 'testimonial_not_found', 'The testimonial was not found.')
  const parsed = await parseJson(context, testimonialWriteSchema)
  if (!parsed.success) return parsed.response
  const db = createDb(context.env)
  const [existing] = await db
    .select({ id: testimonialsTable.id })
    .from(testimonialsTable)
    .where(eq(testimonialsTable.id, id))
    .limit(1)
  if (!existing) return errorResponse(context, 404, 'testimonial_not_found', 'The testimonial was not found.')
  await saveTestimonial(db, parsed.data, id)
  return context.json({ id, saved: true })
})

adminOperationsRoutes.delete('/admin/testimonials/:id', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!isUuid(id)) return errorResponse(context, 404, 'testimonial_not_found', 'The testimonial was not found.')
  const result = await createDb(context.env).delete(testimonialsTable).where(eq(testimonialsTable.id, id)).run()
  if (Number(result.meta.changes ?? 0) !== 1) {
    return errorResponse(context, 404, 'testimonial_not_found', 'The testimonial was not found.')
  }
  return context.body(null, 204)
})
