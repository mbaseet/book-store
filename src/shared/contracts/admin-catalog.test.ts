import { describe, expect, it } from 'vitest'
import { DEFAULT_PERSONALIZED_PRODUCT_DEFINITION } from './personalization'
import { productWriteSchema } from './admin-catalog'

const productInput = {
  slug: 'ready-product',
  status: 'draft' as const,
  basePriceAmount: 25000,
  translations: [
    { locale: 'ar' as const, title: 'منتج جاهز' },
    { locale: 'en' as const, title: 'Ready product' },
  ],
}

describe('fixed product personalization settings', () => {
  it('accepts a ready product and any subset of the fixed fields', () => {
    expect(productWriteSchema.safeParse({ ...productInput, personalizationDefinition: null }).success).toBe(true)
    expect(productWriteSchema.safeParse({
      ...productInput,
      personalizationDefinition: {
        fields: DEFAULT_PERSONALIZED_PRODUCT_DEFINITION.fields.filter((field) => field.key !== 'childPhotos'),
      },
    }).success).toBe(true)
  })

  it('rejects a custom field or a changed fixed setting', () => {
    expect(productWriteSchema.safeParse({
      ...productInput,
      personalizationDefinition: {
        fields: [{
          key: 'favoriteColor',
          type: 'short_text',
          required: false,
          label: { en: 'Favorite color', ar: 'اللون المفضل' },
        }],
      },
    }).success).toBe(false)

    expect(productWriteSchema.safeParse({
      ...productInput,
      personalizationDefinition: {
        fields: DEFAULT_PERSONALIZED_PRODUCT_DEFINITION.fields.map((field) => field.key === 'age'
          ? { ...field, max: 21 }
          : field),
      },
    }).success).toBe(false)
  })
})
