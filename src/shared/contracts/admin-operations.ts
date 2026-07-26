import { z } from 'zod'
import { STOREFRONT_LOCALES } from '@shared/constants'

const moneySchema = z.number().int().min(0).max(10_000_000)
const sortOrderSchema = z.number().int().min(0).max(10_000)
const nullableIsoDateTime = z.string().datetime({ offset: true }).nullable().optional()

function bilingualTranslations<T extends z.ZodType>(schema: T) {
  return z.array(schema).length(2).superRefine((translations, context) => {
    const locales = new Set(
      translations.map((translation) => (translation as { locale?: string }).locale),
    )
    if (!locales.has('ar') || !locales.has('en') || locales.size !== 2) {
      context.addIssue({ code: 'custom', message: 'Arabic and English translations are both required.' })
    }
  })
}

export const updateGovernorateSchema = z.object({
  shippingFeeAmount: moneySchema,
  isActive: z.boolean(),
  sortOrder: sortOrderSchema,
})

export const promoCodeWriteSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens, or underscores only.'),
    fixedDiscountAmount: moneySchema.positive(),
    minimumSubtotalAmount: moneySchema.nullable().optional(),
    startsAt: nullableIsoDateTime,
    endsAt: nullableIsoDateTime,
    maxRedemptions: z.number().int().positive().max(1_000_000).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((promotion, context) => {
    if (promotion.startsAt && promotion.endsAt && new Date(promotion.endsAt) <= new Date(promotion.startsAt)) {
      context.addIssue({ code: 'custom', path: ['endsAt'], message: 'End time must be after start time.' })
    }
  })

const faqTranslationSchema = z.object({
  locale: z.enum(STOREFRONT_LOCALES),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(10_000),
})

export const faqWriteSchema = z.object({
  isPublished: z.boolean().default(true),
  sortOrder: sortOrderSchema,
  translations: bilingualTranslations(faqTranslationSchema),
})

const testimonialTranslationSchema = z.object({
  locale: z.enum(STOREFRONT_LOCALES),
  quote: z.string().trim().min(1).max(3_000),
})

export const testimonialWriteSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  isPublished: z.boolean().default(true),
  sortOrder: sortOrderSchema,
  translations: bilingualTranslations(testimonialTranslationSchema),
})

export type PromoCodeWriteInput = z.infer<typeof promoCodeWriteSchema>
export type FaqWriteInput = z.infer<typeof faqWriteSchema>
export type TestimonialWriteInput = z.infer<typeof testimonialWriteSchema>
