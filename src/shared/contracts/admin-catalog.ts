import { z } from 'zod'
import { STOREFRONT_LOCALES } from '@shared/constants'
import {
  DEFAULT_PERSONALIZED_PRODUCT_DEFINITION,
  personalizationDefinitionSchema,
} from './personalization'

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens.')

const plainTextSchema = z.string().trim().max(20_000)

// Product descriptions are rendered by a Markdown renderer in the storefront.
// Raw HTML and executable/data URLs are rejected at the boundary so a future
// renderer change cannot accidentally turn stored catalog content into XSS.
const markdownSchema = z
  .string()
  .trim()
  .max(20_000)
  .superRefine((value, context) => {
    if (/<\/?[a-z][^>]*>/i.test(value)) {
      context.addIssue({ code: 'custom', message: 'Raw HTML is not allowed in Markdown descriptions.' })
    }
    if(/(?:javascript|vbscript|data)\s*:/i.test(value)) {
      context.addIssue({ code: 'custom', message: 'Unsafe link protocols are not allowed.' })
    }
    if (/\[[^\]]*]\(\s*\/(?:\/|\\)/.test(value)) {
      context.addIssue({ code: 'custom', message: 'Unsafe internal link paths are not allowed.' })
    }
  })

function localizedArray<T extends z.ZodType>(item: T) {
  return z.array(item).length(2).superRefine((translations, context) => {
    const locales = new Set(translations.map((translation) => {
      const candidate = translation as { locale?: string }
      return candidate.locale
    }))
    if (!locales.has('ar') || !locales.has('en') || locales.size !== 2) {
      context.addIssue({ code: 'custom', message: 'Arabic and English entries are both required.' })
    }
  })
}

const productTranslationSchema = z.object({
  locale: z.enum(STOREFRONT_LOCALES),
  title: z.string().trim().min(1).max(180),
  shortDescription: plainTextSchema.nullable().optional(),
  description: markdownSchema.nullable().optional(),
  metaTitle: z.string().trim().max(180).nullable().optional(),
  metaDescription: z.string().trim().max(300).nullable().optional(),
})

const addonSchema = z.object({
  priceAmount: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  translations: localizedArray(
    z.object({
      locale: z.enum(STOREFRONT_LOCALES),
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(500).nullable().optional(),
    }),
  ),
})

const mediaSchema = z.object({
  kind: z.enum(['cover', 'gallery']).default('gallery'),
  url: z.string().trim().url().max(2_000),
  cloudinaryPublicId: z.string().trim().min(1).max(500).nullable().optional(),
  altText: z.string().trim().max(240).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
})

// The customer form is intentionally a simple product setting, not a form
// builder. API callers can choose any subset of these fields, but cannot add
// new ones or change their labels, options, validation, or retention flags.
const fixedPersonalizationDefinitionSchema = personalizationDefinitionSchema.superRefine((definition, context) => {
  const fixedFields = new Map(
    DEFAULT_PERSONALIZED_PRODUCT_DEFINITION.fields.map((field) => {
      const normalized = personalizationDefinitionSchema.parse({ fields: [field] }).fields[0]
      return [field.key, JSON.stringify(normalized)]
    }),
  )
  for (const [index, field] of definition.fields.entries()) {
    if (fixedFields.get(field.key) !== JSON.stringify(field)) {
      context.addIssue({
        code: 'custom',
        path: ['fields', index],
        message: 'Use only the fixed personalized-product fields and settings.',
      })
    }
  }
})

export const productWriteSchema = z
  .object({
    slug: slugSchema,
    status: z.enum(['draft', 'published', 'archived']),
    basePriceAmount: z.number().int().positive(),
    salePriceAmount: z.number().int().nonnegative().nullable().optional(),
    isFeatured: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
    translations: localizedArray(productTranslationSchema),
    categoryIds: z.array(z.string().uuid()).max(20).default([]),
    media: z.array(mediaSchema).max(12).default([]),
    addons: z.array(addonSchema).max(12).default([]),
    // Null means a normal, non-personalized product. The admin editor creates
    // only the fixed, supported product fields when personalization is on.
    personalizationDefinition: fixedPersonalizationDefinitionSchema.nullable().optional(),
  })
  .superRefine((product, context) => {
    if (product.salePriceAmount !== null && product.salePriceAmount !== undefined && product.salePriceAmount > product.basePriceAmount) {
      context.addIssue({ code: 'custom', path: ['salePriceAmount'], message: 'Sale price cannot exceed base price.' })
    }
    if (product.media.filter((media) => media.kind === 'cover').length > 1) {
      context.addIssue({ code: 'custom', path: ['media'], message: 'Choose only one cover image.' })
    }
  })

export const categoryWriteSchema = z.object({
  slug: slugSchema,
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  imageUrl: z.string().trim().url().max(2_000).nullable().optional(),
  cloudinaryPublicId: z.string().trim().min(1).max(500).nullable().optional(),
  translations: localizedArray(
    z.object({
      locale: z.enum(STOREFRONT_LOCALES),
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1_000).nullable().optional(),
    }),
  ),
})

export const adminMediaUploadRequestSchema = z.object({
  kind: z.enum(['product', 'category']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
})

export type ProductWriteInput = z.infer<typeof productWriteSchema>
export type CategoryWriteInput = z.infer<typeof categoryWriteSchema>
