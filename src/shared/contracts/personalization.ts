import { z } from 'zod'
import { STORY_LANGUAGES } from '@shared/constants'

const localizedLabelSchema = z.object({
  en: z.string().trim().min(1).max(160),
  ar: z.string().trim().min(1).max(160),
})

const fieldKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Use a letter followed by letters, numbers, or underscores.')

const baseFieldSchema = z.object({
  key: fieldKeySchema,
  required: z.boolean().default(false),
  label: localizedLabelSchema,
  help: localizedLabelSchema.nullable().optional(),
  // This is deliberately explicit rather than inferred from a label. It lets
  // future product fields opt into the same retention workflow as age/gender.
  sensitive: z.boolean().default(false),
})

const textFieldSchema = baseFieldSchema.extend({
  type: z.enum(['short_text', 'long_text']),
  min: z.number().int().min(0).max(20_000).optional(),
  max: z.number().int().min(1).max(20_000).optional(),
})

const wholeNumberFieldSchema = baseFieldSchema.extend({
  type: z.literal('whole_number'),
  min: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  max: z.number().int().min(-1_000_000).max(1_000_000).optional(),
})

const selectFieldSchema = baseFieldSchema.extend({
  type: z.literal('single_select'),
  options: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
        label: localizedLabelSchema,
      }),
    )
    .min(1)
    .max(30),
})

const photoFieldSchema = baseFieldSchema.extend({
  type: z.literal('photo'),
  // Optional photo questions must remain genuinely optional. Required photo
  // questions are normalized to at least one upload by the validator below.
  min: z.number().int().min(0).max(2).default(0),
  max: z.number().int().min(1).max(2).default(2),
})

const storyLanguageFieldSchema = baseFieldSchema.extend({
  type: z.literal('story_language'),
})

export const personalizationFieldSchema = z.discriminatedUnion('type', [
  textFieldSchema,
  wholeNumberFieldSchema,
  selectFieldSchema,
  photoFieldSchema,
  storyLanguageFieldSchema,
])

export const personalizationDefinitionSchema = z
  .object({
    fields: z.array(personalizationFieldSchema).max(12),
  })
  .superRefine((definition, context) => {
    const keys = new Set<string>()
    let photoFieldCount = 0
    for (const [index, field] of definition.fields.entries()) {
      if (keys.has(field.key)) {
        context.addIssue({ code: 'custom', path: ['fields', index, 'key'], message: 'Each field key must be unique.' })
      }
      keys.add(field.key)
      if (field.type === 'photo') {
        photoFieldCount += 1
        if (field.min > field.max) {
          context.addIssue({ code: 'custom', path: ['fields', index, 'min'], message: 'Minimum photos cannot exceed maximum photos.' })
        }
      }
      if ((field.type === 'short_text' || field.type === 'long_text' || field.type === 'whole_number') && field.min !== undefined && field.max !== undefined && field.min > field.max) {
        context.addIssue({ code: 'custom', path: ['fields', index, 'min'], message: 'Minimum cannot exceed maximum.' })
      }
      if (field.type === 'single_select') {
        const optionValues = new Set<string>()
        for (const [optionIndex, option] of field.options.entries()) {
          if (optionValues.has(option.value)) {
            context.addIssue({ code: 'custom', path: ['fields', index, 'options', optionIndex, 'value'], message: 'Option values must be unique.' })
          }
          optionValues.add(option.value)
        }
      }
    }
    // The private-upload protocol currently binds one controlled photo answer
    // to the 1–2 uploaded child photos. More photo groups require a distinct
    // upload association model and are intentionally rejected rather than
    // silently mixing one product field into another.
    if (photoFieldCount > 1) {
      context.addIssue({ code: 'custom', path: ['fields'], message: 'A product can have one photo field.' })
    }
  })

export type PersonalizationDefinitionInput = z.infer<typeof personalizationDefinitionSchema>
export type PersonalizationField = z.infer<typeof personalizationFieldSchema>

export type PersonalizationDefinition = PersonalizationDefinitionInput & { version: number }

/**
 * The only customer fields the phase-one product editor can enable. A product
 * is a normal ready-to-ship product when its personalization definition is
 * null; when enabled, the admin simply switches these fixed fields on or off.
 */
export const DEFAULT_PERSONALIZED_PRODUCT_FIELDS: PersonalizationField[] = [
  {
    key: 'childName',
    type: 'short_text',
    required: true,
    label: { en: 'Child’s name', ar: 'اسم الطفل' },
    min: 1,
    max: 80,
    sensitive: false,
  },
  {
    key: 'age',
    type: 'whole_number',
    required: true,
    label: { en: 'Child’s age', ar: 'عمر الطفل' },
    min: 0,
    max: 18,
    sensitive: true,
  },
  {
    key: 'gender',
    type: 'single_select',
    required: true,
    label: { en: 'Child’s gender', ar: 'جنس الطفل' },
    options: [
      { value: 'boy', label: { en: 'Boy', ar: 'ولد' } },
      { value: 'girl', label: { en: 'Girl', ar: 'بنت' } },
    ],
    sensitive: true,
  },
  {
    key: 'childPhotos',
    type: 'photo',
    required: true,
    label: { en: 'Child photos', ar: 'صور الطفل' },
    help: { en: 'Upload one or two clear photos.', ar: 'ارفع صورة واحدة أو صورتين واضحتين.' },
    min: 1,
    max: 2,
    sensitive: true,
  },
  {
    key: 'note',
    type: 'long_text',
    required: false,
    label: { en: 'Note for the story team', ar: 'ملاحظة لفريق القصة' },
    max: 500,
    sensitive: false,
  },
]

export const DEFAULT_PERSONALIZED_PRODUCT_DEFINITION: PersonalizationDefinitionInput = {
  fields: DEFAULT_PERSONALIZED_PRODUCT_FIELDS,
}

export function storyLanguageValues() {
  return new Set<string>(STORY_LANGUAGES)
}
