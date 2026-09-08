import { z } from 'zod'
import { STOREFRONT_LOCALES } from '@shared/constants'

export const editablePageKeySchema = z.enum(['how-it-works', 'terms', 'returns', 'privacy', 'contact'])

const localizedPageSchema = z.object({
  locale: z.enum(STOREFRONT_LOCALES),
  title: z.string().trim().min(1).max(160),
  // Plain text / Markdown only. Raw HTML is not accepted or rendered.
  content: z.string().trim().max(20_000),
})

export const updateContentPageSchema = z.object({
  isPublished: z.boolean(),
  translations: z.array(localizedPageSchema).length(2).superRefine((translations, context) => {
    const locales = new Set(translations.map((translation) => translation.locale))
    if (locales.size !== translations.length) {
      context.addIssue({ code: 'custom', message: 'Each locale can appear only once.' })
    }
  }),
})

const paymentDetailsSchema = z.object({
  instapay: z.string().trim().max(500).nullable().optional(),
  mobileWallet: z.string().trim().max(500).nullable().optional(),
})

const optionalTextSchema = (maximum: number) => z.string().trim().max(maximum).nullable().optional()

/** Only permit a same-site path or an explicit HTTPS destination. */
export function isSafeAnnouncementHref(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const href = value.trim()
  if (!href || href.length > 2_000) return false
  // A leading double slash is protocol-relative and could leave the site.
  if (href.startsWith('/')) return !href.startsWith('//') && !href.includes('\\')
  try {
    return new URL(href).protocol === 'https:'
  } catch {
    return false
  }
}

export const announcementHrefSchema = z
  .string()
  .trim()
  .max(2_000)
  .refine(isSafeAnnouncementHref, 'Use a site path starting with / or an HTTPS URL.')

export const announcementBarSchema = z.object({
  isEnabled: z.boolean(),
  translations: z
    .array(
      z.object({
        locale: z.enum(STOREFRONT_LOCALES),
        text: z.string().trim().min(1).max(240),
        href: announcementHrefSchema.nullable().optional(),
      }),
    )
    .length(2)
    .superRefine((translations, context) => {
      const locales = new Set(translations.map((translation) => translation.locale))
      if (locales.size !== 2 || !locales.has('ar') || !locales.has('en')) {
        context.addIssue({ code: 'custom', message: 'Arabic and English announcement text are both required.' })
      }
    }),
})

const seoDefaultsSchema = z.object({
  title: optionalTextSchema(180),
  description: optionalTextSchema(300),
  ogImageUrl: z.string().trim().url().max(2_000).nullable().optional(),
})

// These are public identifiers, not secrets. Keep the accepted syntax narrow
// so settings can only be used to construct the known provider URLs below;
// arbitrary script, HTML, or URL injection is intentionally unsupported.
const gtmContainerIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^GTM-[A-Z0-9]{4,20}$/, 'Use a GTM container ID such as GTM-ABC1234.')

const ga4MeasurementIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^G-[A-Z0-9]{4,20}$/, 'Use a GA4 measurement ID such as G-ABC1234.')

const metaPixelIdSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{4,19}$/, 'Use a numeric Meta Pixel ID.')

const tiktokPixelIdSchema = z
  .string()
  .trim()
  .regex(/^C[A-Za-z0-9]{4,31}$/, 'Use a TikTok Pixel ID beginning with C.')

export const trackingSettingsSchema = z
  .object({
    gtmContainerId: gtmContainerIdSchema.nullable(),
    ga4MeasurementId: ga4MeasurementIdSchema.nullable(),
    metaPixelId: metaPixelIdSchema.nullable(),
    tiktokPixelId: tiktokPixelIdSchema.nullable(),
  })
  .strict()

export type TrackingSettings = z.infer<typeof trackingSettingsSchema>

export const updateStoreSettingsSchema = z.object({
  brandName: z.string().trim().min(1).max(80).nullable().optional(),
  whatsappUrl: z.string().trim().url().max(500).nullable().optional(),
  freeShippingThresholdAmount: z.number().int().positive().nullable().optional(),
  paymentDetails: paymentDetailsSchema.optional(),
  supportPhone: optionalTextSchema(40),
  supportEmail: z.string().trim().email().max(254).nullable().optional(),
  businessHours: optionalTextSchema(1_000),
  deliveryGuidance: optionalTextSchema(3_000),
  paymentGuidance: optionalTextSchema(3_000),
  announcementBar: announcementBarSchema.nullable().optional(),
  seoDefaults: seoDefaultsSchema.nullable().optional(),
  tracking: trackingSettingsSchema.optional(),
}).strict()
