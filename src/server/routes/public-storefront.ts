import { and, asc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { STOREFRONT_LOCALES, type StorefrontLocale } from '@shared/constants'
import { announcementBarSchema, editablePageKeySchema } from '@shared/contracts/content'
import { createDb } from '../db'
import {
  categoriesTable,
  categoryTranslationsTable,
  contentPageTranslationsTable,
  contentPagesTable,
  faqTranslationsTable,
  faqsTable,
  governoratesTable,
  productAddonTranslationsTable,
  productAddonsTable,
  productCategoriesTable,
  productMediaTable,
  productTranslationsTable,
  productsTable,
  siteSettingsTable,
  testimonialTranslationsTable,
  testimonialsTable,
} from '../db/schema'
import { errorResponse } from '../lib/http'
import { localeFromRequest } from '../services/checkout-data'
import { parsePersonalizationDefinition } from '../services/personalization'
import type { Bindings } from '../types'

type AppEnvironment = { Bindings: Bindings }
type LocalizedRow = { locale: string }

function requestLocale(context: { req: { query(name: string): string | undefined; raw: Request } }): StorefrontLocale {
  const requested = context.req.query('locale')
  return (STOREFRONT_LOCALES as readonly string[]).includes(requested ?? '')
    ? (requested as StorefrontLocale)
    : localeFromRequest(context.req.raw)
}

function localized<T extends LocalizedRow>(rows: T[], locale: StorefrontLocale) {
  return rows.find((row) => row.locale === locale) ?? rows.find((row) => row.locale === 'en') ?? rows.find((row) => row.locale === 'ar') ?? null
}

function slugIsValid(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 160
}

function settingMap(rows: Array<{ key: string; value: string | null }>) {
  return new Map(rows.map((row) => [row.key, row.value]))
}

function parsePaymentDetails(value: string | null | undefined) {
  if (!value) return { instapay: null, mobileWallet: null }
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { instapay: null, mobileWallet: null }
    }
    const details = parsed as Record<string, unknown>
    return {
      instapay: typeof details.instapay === 'string' ? details.instapay : null,
      mobileWallet: typeof details.mobileWallet === 'string' ? details.mobileWallet : null,
    }
  } catch {
    return { instapay: null, mobileWallet: null }
  }
}

function parseJsonObject(value: string | null | undefined) {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function parseAnnouncementBar(value: string | null | undefined) {
  const parsed = parseJsonObject(value)
  const result = announcementBarSchema.safeParse(parsed)
  if (!result.success) return null
  return {
    isEnabled: result.data.isEnabled,
    translations: result.data.translations.map((translation) => ({
      ...translation,
      href: translation.href ?? null,
    })),
  }
}

function parseSeoDefaults(value: string | null | undefined) {
  const parsed = parseJsonObject(value)
  if (!parsed) return null
  return {
    title: typeof parsed.title === 'string' ? parsed.title : null,
    description: typeof parsed.description === 'string' ? parsed.description : null,
    ogImageUrl: typeof parsed.ogImageUrl === 'string' ? parsed.ogImageUrl : null,
  }
}

async function buildProductCards(
  db: ReturnType<typeof createDb>,
  productRows: Array<{
    id: string
    slug: string
    basePriceAmount: number
    salePriceAmount: number | null
    isFeatured: boolean
    personalizationDefinition: string | null
    personalizationVersion: number
  }>,
  locale: StorefrontLocale,
) {
  const productIds = productRows.map((product) => product.id)
  if (productIds.length === 0) return []
  const [translations, media] = await Promise.all([
    db
      .select({
        productId: productTranslationsTable.productId,
        locale: productTranslationsTable.locale,
        title: productTranslationsTable.title,
        shortDescription: productTranslationsTable.shortDescription,
      })
      .from(productTranslationsTable)
      .where(inArray(productTranslationsTable.productId, productIds)),
    db
      .select({ productId: productMediaTable.productId, url: productMediaTable.url })
      .from(productMediaTable)
      .where(inArray(productMediaTable.productId, productIds))
      .orderBy(asc(productMediaTable.sortOrder), asc(productMediaTable.createdAt)),
  ])
  const translationsByProduct = new Map<string, typeof translations>()
  const imageByProduct = new Map<string, string>()
  for (const translation of translations) {
    const rows = translationsByProduct.get(translation.productId) ?? []
    rows.push(translation)
    translationsByProduct.set(translation.productId, rows)
  }
  for (const image of media) {
    if (!imageByProduct.has(image.productId)) imageByProduct.set(image.productId, image.url)
  }

  return productRows.flatMap((product) => {
    const translation = localized(translationsByProduct.get(product.id) ?? [], locale)
    if (!translation) return []
    return [
      {
        id: product.id,
        slug: product.slug,
        title: translation.title,
        shortDescription: translation.shortDescription,
        basePriceAmount: product.basePriceAmount,
        salePriceAmount: product.salePriceAmount,
        isFeatured: product.isFeatured,
        isPersonalized: Boolean(parsePersonalizationDefinition(product.personalizationDefinition, product.personalizationVersion)),
        imageUrl: imageByProduct.get(product.id) ?? null,
      },
    ]
  })
}

export const publicStorefrontRoutes = new Hono<AppEnvironment>()

publicStorefrontRoutes.get('/products', async (context) => {
  const locale = requestLocale(context)
  const categorySlug = context.req.query('category')?.trim().toLocaleLowerCase('en-US')
  const featured = context.req.query('featured')
  const search = context.req.query('search')?.trim().toLocaleLowerCase('en-US')
  if (categorySlug && !slugIsValid(categorySlug)) {
    return errorResponse(context, 422, 'invalid_category', 'The selected category is invalid.')
  }
  if (featured && featured !== 'true' && featured !== 'false') {
    return errorResponse(context, 422, 'invalid_filter', 'The selected filter is invalid.')
  }
  if (search && search.length > 100) {
    return errorResponse(context, 422, 'invalid_search', 'The search text is too long.')
  }

  const db = createDb(context.env)
  const conditions = [eq(productsTable.status, 'published')]
  if (featured === 'true') conditions.push(eq(productsTable.isFeatured, true))
  let rows
  if (categorySlug) {
    rows = await db
      .select({
        id: productsTable.id,
        slug: productsTable.slug,
        basePriceAmount: productsTable.basePriceAmount,
        salePriceAmount: productsTable.salePriceAmount,
        isFeatured: productsTable.isFeatured,
        personalizationDefinition: productsTable.personalizationDefinition,
        personalizationVersion: productsTable.personalizationVersion,
      })
      .from(productsTable)
      .innerJoin(productCategoriesTable, eq(productCategoriesTable.productId, productsTable.id))
      .innerJoin(categoriesTable, eq(categoriesTable.id, productCategoriesTable.categoryId))
      .where(and(...conditions, eq(categoriesTable.slug, categorySlug)))
      .orderBy(asc(productsTable.sortOrder), asc(productsTable.createdAt))
  } else {
    rows = await db
      .select({
        id: productsTable.id,
        slug: productsTable.slug,
        basePriceAmount: productsTable.basePriceAmount,
        salePriceAmount: productsTable.salePriceAmount,
        isFeatured: productsTable.isFeatured,
        personalizationDefinition: productsTable.personalizationDefinition,
        personalizationVersion: productsTable.personalizationVersion,
      })
      .from(productsTable)
      .where(and(...conditions))
      .orderBy(asc(productsTable.sortOrder), asc(productsTable.createdAt))
  }
  const products = await buildProductCards(db, rows, locale)
  return context.json({
    products: search
      ? products.filter((product) =>
          `${product.title} ${product.shortDescription ?? ''}`.toLocaleLowerCase(locale).includes(search),
        )
      : products,
  })
})

publicStorefrontRoutes.get('/products/:slug', async (context) => {
  const slug = context.req.param('slug').toLocaleLowerCase('en-US')
  if (!slugIsValid(slug)) return errorResponse(context, 404, 'product_not_found', 'This story was not found.')
  const locale = requestLocale(context)
  const db = createDb(context.env)
  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.slug, slug), eq(productsTable.status, 'published')))
    .limit(1)
  if (!product) return errorResponse(context, 404, 'product_not_found', 'This story was not found.')

  const [translations, media, addons, categoryLinks] = await Promise.all([
    db.select().from(productTranslationsTable).where(eq(productTranslationsTable.productId, product.id)),
    db
      .select()
      .from(productMediaTable)
      .where(eq(productMediaTable.productId, product.id))
      .orderBy(asc(productMediaTable.sortOrder), asc(productMediaTable.createdAt)),
    db
      .select()
      .from(productAddonsTable)
      .where(and(eq(productAddonsTable.productId, product.id), eq(productAddonsTable.isActive, true)))
      .orderBy(asc(productAddonsTable.sortOrder)),
    db
      .select({
        id: categoriesTable.id,
        slug: categoriesTable.slug,
      })
      .from(productCategoriesTable)
      .innerJoin(categoriesTable, eq(categoriesTable.id, productCategoriesTable.categoryId))
      .where(eq(productCategoriesTable.productId, product.id)),
  ])
  const translation = localized(translations, locale)
  if (!translation) return errorResponse(context, 404, 'product_not_found', 'This story was not found.')

  const addonTranslations =
    addons.length === 0
      ? []
      : await db
          .select()
          .from(productAddonTranslationsTable)
          .where(inArray(productAddonTranslationsTable.productAddonId, addons.map((addon) => addon.id)))
  const categoryTranslations =
    categoryLinks.length === 0
      ? []
      : await db
          .select()
          .from(categoryTranslationsTable)
          .where(inArray(categoryTranslationsTable.categoryId, categoryLinks.map((category) => category.id)))

  return context.json({
    product: {
      id: product.id,
      slug: product.slug,
      title: translation.title,
      shortDescription: translation.shortDescription,
      description: translation.description,
      basePriceAmount: product.basePriceAmount,
      salePriceAmount: product.salePriceAmount,
      personalizationDefinition: parsePersonalizationDefinition(
        product.personalizationDefinition,
        product.personalizationVersion,
      ),
      media: media.map((item) => ({
        id: item.id,
        kind: item.kind,
        url: item.url,
        altText: item.altText,
      })),
      addons: addons.flatMap((addon) => {
        const addonTranslation = localized(
          addonTranslations.filter((translationRow) => translationRow.productAddonId === addon.id),
          locale,
        )
        return addonTranslation
          ? [
              {
                id: addon.id,
                name: addonTranslation.name,
                description: addonTranslation.description,
                priceAmount: addon.priceAmount,
              },
            ]
          : []
      }),
      categories: categoryLinks.flatMap((category) => {
        const categoryTranslation = localized(
          categoryTranslations.filter((translationRow) => translationRow.categoryId === category.id),
          locale,
        )
        return categoryTranslation ? [{ slug: category.slug, name: categoryTranslation.name }] : []
      }),
    },
  })
})

publicStorefrontRoutes.get('/categories', async (context) => {
  const locale = requestLocale(context)
  const db = createDb(context.env)
  const categories = await db.select().from(categoriesTable).orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.createdAt))
  const translations =
    categories.length === 0
      ? []
      : await db
          .select()
          .from(categoryTranslationsTable)
          .where(inArray(categoryTranslationsTable.categoryId, categories.map((category) => category.id)))
  return context.json({
    categories: categories.flatMap((category) => {
      const translation = localized(
        translations.filter((translationRow) => translationRow.categoryId === category.id),
        locale,
      )
      return translation
        ? [
            {
              id: category.id,
              slug: category.slug,
              name: translation.name,
              description: translation.description,
              imageUrl: category.imageUrl,
              isFeatured: category.isFeatured,
            },
          ]
        : []
    }),
  })
})

publicStorefrontRoutes.get('/governorates', async (context) => {
  const locale = requestLocale(context)
  const governorates = await createDb(context.env)
    .select()
    .from(governoratesTable)
    .where(eq(governoratesTable.isActive, true))
    .orderBy(asc(governoratesTable.sortOrder), asc(governoratesTable.nameEn))
  return context.json({
    governorates: governorates.map((governorate) => ({
      code: governorate.code,
      name: locale === 'ar' ? governorate.nameAr : governorate.nameEn,
      shippingFeeAmount: governorate.shippingFeeAmount,
    })),
  })
})

publicStorefrontRoutes.get('/settings', async (context) => {
  const settings = await createDb(context.env)
    .select({ key: siteSettingsTable.key, value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.isPublic, true))
  const values = settingMap(
    settings.filter((setting) =>
      [
        'brand_name',
        'whatsapp_url',
        'free_shipping_threshold_amount',
        'payment_details',
        'support_phone',
        'support_email',
        'business_hours',
        'delivery_guidance',
        'payment_guidance',
        'announcement_bar',
        'seo_defaults',
      ].includes(setting.key),
    ),
  )
  const threshold = Number.parseInt(values.get('free_shipping_threshold_amount') ?? '', 10)
  return context.json({
    settings: {
      brandName: values.get('brand_name') ?? null,
      whatsappUrl: values.get('whatsapp_url') ?? null,
      freeShippingThresholdAmount: Number.isSafeInteger(threshold) && threshold >= 0 ? threshold : null,
      paymentDetails: parsePaymentDetails(values.get('payment_details')),
      supportPhone: values.get('support_phone') ?? null,
      supportEmail: values.get('support_email') ?? null,
      businessHours: values.get('business_hours') ?? null,
      deliveryGuidance: values.get('delivery_guidance') ?? null,
      paymentGuidance: values.get('payment_guidance') ?? null,
      announcementBar: parseAnnouncementBar(values.get('announcement_bar')),
      seoDefaults: parseSeoDefaults(values.get('seo_defaults')),
    },
  })
})

publicStorefrontRoutes.get('/pages/:key', async (context) => {
  const key = editablePageKeySchema.safeParse(context.req.param('key'))
  if (!key.success) return errorResponse(context, 404, 'page_not_found', 'This page was not found.')
  const locale = requestLocale(context)
  const db = createDb(context.env)
  const [page] = await db
    .select()
    .from(contentPagesTable)
    .where(and(eq(contentPagesTable.key, key.data), eq(contentPagesTable.isPublished, true)))
    .limit(1)
  if (!page) return errorResponse(context, 404, 'page_not_found', 'This page was not found.')
  const translations = await db
    .select()
    .from(contentPageTranslationsTable)
    .where(eq(contentPageTranslationsTable.contentPageId, page.id))
  const translation = localized(translations, locale)
  if (!translation) return errorResponse(context, 404, 'page_not_found', 'This page was not found.')
  return context.json({ page: { key: page.key, title: translation.title, content: translation.content } })
})

publicStorefrontRoutes.get('/faqs', async (context) => {
  const locale = requestLocale(context)
  const db = createDb(context.env)
  const faqs = await db
    .select()
    .from(faqsTable)
    .where(eq(faqsTable.isPublished, true))
    .orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt))
  const translations =
    faqs.length === 0
      ? []
      : await db
          .select()
          .from(faqTranslationsTable)
          .where(inArray(faqTranslationsTable.faqId, faqs.map((faq) => faq.id)))
  return context.json({
    faqs: faqs.flatMap((faq) => {
      const translation = localized(translations.filter((row) => row.faqId === faq.id), locale)
      return translation ? [{ id: faq.id, question: translation.question, answer: translation.answer }] : []
    }),
  })
})

publicStorefrontRoutes.get('/testimonials', async (context) => {
  const locale = requestLocale(context)
  const db = createDb(context.env)
  const testimonials = await db
    .select()
    .from(testimonialsTable)
    .where(eq(testimonialsTable.isPublished, true))
    .orderBy(asc(testimonialsTable.sortOrder), asc(testimonialsTable.createdAt))
  const translations =
    testimonials.length === 0
      ? []
      : await db
          .select()
          .from(testimonialTranslationsTable)
          .where(inArray(testimonialTranslationsTable.testimonialId, testimonials.map((testimonial) => testimonial.id)))
  return context.json({
    testimonials: testimonials.flatMap((testimonial) => {
      const translation = localized(translations.filter((row) => row.testimonialId === testimonial.id), locale)
      return translation ? [{ id: testimonial.id, displayName: testimonial.displayName, quote: translation.quote }] : []
    }),
  })
})
