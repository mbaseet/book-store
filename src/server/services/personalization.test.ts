import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERSONALIZED_PRODUCT_DEFINITION,
  personalizationDefinitionSchema,
} from '@shared/contracts/personalization'
import {
  parsePersonalizationSnapshot,
  PersonalizationValidationError,
  serializeOrderPersonalizationSnapshots,
  validatePersonalization,
} from './personalization'

const baseInput = {
  productId: '11111111-1111-4111-8111-111111111111',
  quantity: 1,
  childName: 'Lina',
  storyLanguage: 'en' as const,
  note: 'Please make it cheerful.',
  childUploads: [{ uploadId: '22222222-2222-4222-8222-222222222222', claimToken: 'a'.repeat(64) }],
  addonIds: [],
}

describe('controlled personalization', () => {
  it('uses only the fixed personalized-product fields', () => {
    expect(DEFAULT_PERSONALIZED_PRODUCT_DEFINITION.fields.map((field) => field.key)).toEqual([
      'childName',
      'age',
      'gender',
      'childPhotos',
      'note',
    ])
  })

  it('separates sensitive age and gender from the durable order snapshot', () => {
    const result = validatePersonalization(
      { ...DEFAULT_PERSONALIZED_PRODUCT_DEFINITION, version: 1 },
      {
        ...baseInput,
        personalization: {
          childName: 'Lina',
          note: 'Please make it cheerful.',
          age: 6,
          gender: 'girl',
        },
      },
    )

    expect(result.answers).toEqual({
      childName: 'Lina',
      note: 'Please make it cheerful.',
    })
    expect(result.sensitiveAnswers).toEqual({ age: 6, gender: 'girl' })
  })

  it('rejects an answer outside the controlled Boy/Girl options', () => {
    expect(() => validatePersonalization(
      { ...DEFAULT_PERSONALIZED_PRODUCT_DEFINITION, version: 1 },
      {
        ...baseInput,
        personalization: { age: 6, gender: 'other' },
      },
    )).toThrow(PersonalizationValidationError)
  })

  it('allows a genuinely optional photo question to have zero uploads', () => {
    const definition = {
      version: 1,
      ...personalizationDefinitionSchema.parse({
        fields: [
          {
            key: 'recipient',
            type: 'short_text',
            required: true,
            label: { en: 'Recipient', ar: 'المستلم' },
          },
          {
            key: 'referencePhoto',
            type: 'photo',
            required: false,
            label: { en: 'Reference photo', ar: 'صورة مرجعية' },
            sensitive: true,
          },
        ],
      }),
    }

    expect(definition.fields[1]).toMatchObject({ min: 0, max: 2 })
    expect(validatePersonalization(definition, {
      ...baseInput,
      childUploads: [],
      personalization: { recipient: 'Mariam' },
    }).answers).toEqual({ recipient: 'Mariam' })
  })

  it('keeps durable instructions while sensitive age and gender are removable', () => {
    const definition = { ...DEFAULT_PERSONALIZED_PRODUCT_DEFINITION, version: 4 }
    const snapshots = serializeOrderPersonalizationSnapshots(definition, {
      childName: 'Lina',
      note: 'Please make it cheerful.',
      age: 6,
      gender: 'girl',
    })

    const durable = parsePersonalizationSnapshot(snapshots.personalizationSnapshot)
    const sensitive = parsePersonalizationSnapshot(snapshots.sensitivePersonalization)
    expect(durable?.answers).toEqual({
      childName: 'Lina',
      note: 'Please make it cheerful.',
    })
    expect(durable?.fields.some((field) => field.key === 'age' && field.sensitive)).toBe(true)
    expect(sensitive?.answers).toEqual({ age: 6, gender: 'girl' })

    // The retention job clears this separate value after the terminal-status
    // deadline. The durable snapshot cannot reconstruct age or gender.
    expect(parsePersonalizationSnapshot(null)?.answers).toBeUndefined()
    expect(durable?.answers.age).toBeUndefined()
    expect(durable?.answers.gender).toBeUndefined()
  })

  it('allows a ready product to continue without a personalization form', () => {
    expect(validatePersonalization(null, { ...baseInput, childUploads: [] })).toEqual({
      definition: null,
      answers: {},
      sensitiveAnswers: {},
    })
  })

  it('rejects a child upload for a ready product', () => {
    expect(() => validatePersonalization(null, baseInput)).toThrow(PersonalizationValidationError)
  })
})
