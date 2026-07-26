import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  announcementBarSchema,
  editablePageKeySchema,
  updateContentPageSchema,
  updateStoreSettingsSchema,
} from '@shared/contracts/content'
import { createDb } from '../db'
import {
  contentPageTranslationsTable,
  contentPagesTable,
  siteSettingsTable,
} from '../db/schema'
import { errorResponse, hasTrustedOrigin, parseJson } from '../lib/http'
import { requireAdmin } from './auth'
import type { Bindings } from '../types'

type AppEnvironment = { Bindings: Bindings }

const managedSettings = new Set([
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
])

function serializePaymentDetails(
  value: { instapay?: string | null; mobileWallet?: string | null },
) {
  return JSON.stringify({
    instapay: value.instapay ?? null,
    mobileWallet: value.mobileWallet ?? null,
  })
}

function parseJsonObject(value: string | null | undefined) {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
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
  const stringOrNull = (candidate: unknown) => typeof candidate === 'string' ? candidate : null
  return {
    title: stringOrNull(parsed.title),
    description: stringOrNull(parsed.description),
    ogImageUrl: stringOrNull(parsed.ogImageUrl),
  }
}

export const adminContentRoutes = new Hono<AppEnvironment>()

adminContentRoutes.get('/admin/content/pages', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')

  const db = createDb(context.env)
  const pages = await db.select().from(contentPagesTable).orderBy(asc(contentPagesTable.key))
  const translations = await db
    .select()
    .from(contentPageTranslationsTable)
    .orderBy(asc(contentPageTranslationsTable.locale))
  return context.json({
    pages: pages.map((page) => ({
      ...page,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
      translations: translations
        .filter((translation) => translation.contentPageId === page.id)
        .map((translation) => ({
          locale: translation.locale,
          title: translation.title,
          content: translation.content,
        })),
    })),
  })
})

adminContentRoutes.put('/admin/content/pages/:key', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')

  const pageKey = editablePageKeySchema.safeParse(context.req.param('key'))
  if (!pageKey.success) return errorResponse(context, 404, 'page_not_found', 'This page cannot be edited.')
  const parsed = await parseJson(context, updateContentPageSchema)
  if (!parsed.success) return parsed.response

  const db = createDb(context.env)
  const [existing] = await db
    .select({ id: contentPagesTable.id })
    .from(contentPagesTable)
    .where(eq(contentPagesTable.key, pageKey.data))
    .limit(1)
  const pageId = existing?.id ?? crypto.randomUUID()
  const now = new Date()

  const pageStatement = existing
    ? db
        .update(contentPagesTable)
        .set({ isPublished: parsed.data.isPublished, updatedAt: now })
        .where(eq(contentPagesTable.id, pageId))
    : db.insert(contentPagesTable).values({ id: pageId, key: pageKey.data, isPublished: parsed.data.isPublished })
  const translationStatements = parsed.data.translations.map((translation) =>
    db
      .insert(contentPageTranslationsTable)
      .values({
        contentPageId: pageId,
        locale: translation.locale,
        title: translation.title,
        content: translation.content,
      })
      .onConflictDoUpdate({
        target: [contentPageTranslationsTable.contentPageId, contentPageTranslationsTable.locale],
        set: { title: translation.title, content: translation.content, updatedAt: now },
      }),
  )
  await db.batch([pageStatement, ...translationStatements])

  return context.json({ saved: true, key: pageKey.data })
})

adminContentRoutes.get('/admin/settings', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')

  const settings = await createDb(context.env).select().from(siteSettingsTable)
  const values = new Map(settings.filter((setting) => managedSettings.has(setting.key)).map((setting) => [setting.key, setting.value]))
  const rawPaymentDetails = parseJsonObject(values.get('payment_details'))
  const paymentDetails = rawPaymentDetails
    ? {
        instapay: typeof rawPaymentDetails.instapay === 'string' ? rawPaymentDetails.instapay : null,
        mobileWallet: typeof rawPaymentDetails.mobileWallet === 'string' ? rawPaymentDetails.mobileWallet : null,
      }
    : null

  return context.json({
    settings: {
      brandName: values.get('brand_name') ?? null,
      whatsappUrl: values.get('whatsapp_url') ?? null,
      freeShippingThresholdAmount: values.get('free_shipping_threshold_amount')
        ? Number.parseInt(values.get('free_shipping_threshold_amount') ?? '', 10)
        : null,
      paymentDetails,
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

adminContentRoutes.put('/admin/settings', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const parsed = await parseJson(context, updateStoreSettingsSchema)
  if (!parsed.success) return parsed.response

  const values: Array<{ key: string; value: string | null }> = []
  if ('brandName' in parsed.data) values.push({ key: 'brand_name', value: parsed.data.brandName ?? null })
  if ('whatsappUrl' in parsed.data) values.push({ key: 'whatsapp_url', value: parsed.data.whatsappUrl ?? null })
  if ('freeShippingThresholdAmount' in parsed.data) {
    values.push({
      key: 'free_shipping_threshold_amount',
      value: parsed.data.freeShippingThresholdAmount === null ? null : String(parsed.data.freeShippingThresholdAmount),
    })
  }
  if ('paymentDetails' in parsed.data) {
    values.push({ key: 'payment_details', value: serializePaymentDetails(parsed.data.paymentDetails ?? {}) })
  }
  if ('supportPhone' in parsed.data) values.push({ key: 'support_phone', value: parsed.data.supportPhone ?? null })
  if ('supportEmail' in parsed.data) values.push({ key: 'support_email', value: parsed.data.supportEmail ?? null })
  if ('businessHours' in parsed.data) values.push({ key: 'business_hours', value: parsed.data.businessHours ?? null })
  if ('deliveryGuidance' in parsed.data) values.push({ key: 'delivery_guidance', value: parsed.data.deliveryGuidance ?? null })
  if ('paymentGuidance' in parsed.data) values.push({ key: 'payment_guidance', value: parsed.data.paymentGuidance ?? null })
  if ('announcementBar' in parsed.data) {
    values.push({
      key: 'announcement_bar',
      value: parsed.data.announcementBar === null ? null : JSON.stringify(parsed.data.announcementBar),
    })
  }
  if ('seoDefaults' in parsed.data) {
    values.push({
      key: 'seo_defaults',
      value: parsed.data.seoDefaults === null ? null : JSON.stringify(parsed.data.seoDefaults),
    })
  }

  if (values.length === 0) return context.json({ saved: true })

  const db = createDb(context.env)
  const now = new Date()
  const statements = values.map((value) =>
      db
        .insert(siteSettingsTable)
        .values({ key: value.key, value: value.value, isPublic: true })
        .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value: value.value, isPublic: true, updatedAt: now } }),
  )
  const [firstStatement, ...remainingStatements] = statements
  if (firstStatement) await db.batch([firstStatement, ...remainingStatements])
  return context.json({ saved: true })
})
