import { STORY_LANGUAGES } from '@shared/constants'
import type { CheckoutDraftItemInput } from '@shared/contracts/checkout'
import {
  personalizationDefinitionSchema,
  type PersonalizationDefinition,
  type PersonalizationDefinitionInput,
  type PersonalizationField,
} from '@shared/contracts/personalization'

export type PersonalizationAnswer = string | number
export type PersonalizationAnswers = Record<string, PersonalizationAnswer>

export type ValidatedPersonalization = {
  definition: PersonalizationDefinition | null
  answers: PersonalizationAnswers
  sensitiveAnswers: PersonalizationAnswers
}

export type PersonalizationFieldError = {
  path: string[]
  code: string
}

export class PersonalizationValidationError extends Error {
  readonly fieldErrors: PersonalizationFieldError[]

  constructor(fieldErrors: PersonalizationFieldError[]) {
    super('Please check the personalization details.')
    this.name = 'PersonalizationValidationError'
    this.fieldErrors = fieldErrors
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parsePersonalizationDefinition(
  serialized: string | null | undefined,
  version: number | null | undefined,
): PersonalizationDefinition | null {
  if (!serialized) return null
  try {
    const parsed: unknown = JSON.parse(serialized)
    const definition = personalizationDefinitionSchema.safeParse(parsed)
    if (!definition.success) return null
    return { fields: definition.data.fields, version: Math.max(1, version ?? 1) }
  } catch {
    return null
  }
}

export function serializePersonalizationDefinition(definition: PersonalizationDefinitionInput | null) {
  return definition === null ? null : JSON.stringify(definition)
}

function normalizedLegacyAnswers(input: CheckoutDraftItemInput): Record<string, unknown> {
  return {
    ...(input.personalization ?? {}),
    childName: input.personalization?.childName ?? input.childName,
    storyLanguage: input.personalization?.storyLanguage ?? input.storyLanguage,
    ...(input.note !== undefined && input.personalization?.note === undefined ? { note: input.note } : {}),
  }
}

function fieldError(field: PersonalizationField, code: string): PersonalizationFieldError {
  return { path: ['personalization', field.key], code }
}

function validateText(
  field: Extract<PersonalizationField, { type: 'short_text' | 'long_text' }>,
  value: unknown,
): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  if (field.min !== undefined && normalized.length < field.min) throw new PersonalizationValidationError([fieldError(field, 'too_short')])
  if (field.max !== undefined && normalized.length > field.max) throw new PersonalizationValidationError([fieldError(field, 'too_long')])
  return normalized
}

function validateField(
  field: PersonalizationField,
  values: Record<string, unknown>,
  photoCount: number,
): PersonalizationAnswer | undefined {
  const value = values[field.key]
  if (field.type === 'photo') {
    const minimum = field.required ? Math.max(1, field.min) : field.min
    if (photoCount < minimum) throw new PersonalizationValidationError([fieldError(field, 'too_few_photos')])
    if (photoCount > field.max) throw new PersonalizationValidationError([fieldError(field, 'too_many_photos')])
    return photoCount
  }

  if (field.type === 'short_text' || field.type === 'long_text') {
    const answer = validateText(field, value)
    if (answer === undefined && field.required) throw new PersonalizationValidationError([fieldError(field, 'required')])
    return answer
  }

  if (field.type === 'whole_number') {
    if (value === undefined || value === null || value === '') {
      if (field.required) throw new PersonalizationValidationError([fieldError(field, 'required')])
      return undefined
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new PersonalizationValidationError([fieldError(field, 'whole_number')])
    }
    if (field.min !== undefined && value < field.min) throw new PersonalizationValidationError([fieldError(field, 'too_small')])
    if (field.max !== undefined && value > field.max) throw new PersonalizationValidationError([fieldError(field, 'too_large')])
    return value
  }

  if (field.type === 'single_select') {
    if (value === undefined || value === null || value === '') {
      if (field.required) throw new PersonalizationValidationError([fieldError(field, 'required')])
      return undefined
    }
    if (typeof value !== 'string' || !field.options.some((option) => option.value === value)) {
      throw new PersonalizationValidationError([fieldError(field, 'invalid_option')])
    }
    return value
  }

  if (value === undefined || value === null || value === '') {
    if (field.required) throw new PersonalizationValidationError([fieldError(field, 'required')])
    return undefined
  }
  if (typeof value !== 'string' || !(STORY_LANGUAGES as readonly string[]).includes(value)) {
    throw new PersonalizationValidationError([fieldError(field, 'invalid_story_language')])
  }
  return value
}

/**
 * Validates only the persisted, controlled definition. Unknown answers are
 * ignored instead of being retained, which prevents a browser from smuggling
 * arbitrary customer data into an order record.
 */
export function validatePersonalization(
  definition: PersonalizationDefinition | null,
  input: CheckoutDraftItemInput,
): ValidatedPersonalization {
  if (!definition) {
    // A null definition represents a standard ready product. Do not silently
    // accept uploaded child media for it: there is no product question that
    // authorizes retaining or using that sensitive data.
    if (input.childUploads.length > 0) {
      throw new PersonalizationValidationError([{ path: ['childUploads'], code: 'unexpected_photo' }])
    }
    return { definition: null, answers: {}, sensitiveAnswers: {} }
  }
  if (!definition.fields.some((field) => field.type === 'photo') && input.childUploads.length > 0) {
    throw new PersonalizationValidationError([{ path: ['childUploads'], code: 'unexpected_photo' }])
  }
  const values = normalizedLegacyAnswers(input)
  const answers: PersonalizationAnswers = {}
  const sensitiveAnswers: PersonalizationAnswers = {}
  const errors: PersonalizationFieldError[] = []

  for (const field of definition.fields) {
    try {
      const answer = validateField(field, values, input.childUploads.length)
      if (answer === undefined || field.type === 'photo') continue
      if (field.sensitive) sensitiveAnswers[field.key] = answer
      else answers[field.key] = answer
    } catch (error) {
      if (error instanceof PersonalizationValidationError) errors.push(...error.fieldErrors)
      else throw error
    }
  }
  if (errors.length > 0) throw new PersonalizationValidationError(errors)
  return { definition, answers, sensitiveAnswers }
}

export type StoredPersonalizationSnapshot = {
  version: number
  fields: PersonalizationField[]
  answers: PersonalizationAnswers
}

export function serializePersonalizationSnapshot(snapshot: StoredPersonalizationSnapshot | null) {
  return snapshot ? JSON.stringify(snapshot) : null
}

/**
 * Produces the two immutable order records from a validated draft answer set.
 * The durable snapshot keeps all field metadata, but never a sensitive value;
 * that lets order review identify a purged field without retaining it.
 */
export function serializeOrderPersonalizationSnapshots(
  definition: PersonalizationDefinition | null,
  answers: PersonalizationAnswers,
) {
  if (!definition) {
    return { personalizationSnapshot: null, sensitivePersonalization: null }
  }

  const sensitiveFields = definition.fields.filter((field) => field.sensitive)
  const sensitiveKeys = new Set(sensitiveFields.map((field) => field.key))
  const nonSensitiveAnswers = Object.fromEntries(
    Object.entries(answers).filter(([key]) => !sensitiveKeys.has(key)),
  ) as PersonalizationAnswers
  const sensitiveAnswers = Object.fromEntries(
    Object.entries(answers).filter(([key]) => sensitiveKeys.has(key)),
  ) as PersonalizationAnswers

  return {
    personalizationSnapshot: serializePersonalizationSnapshot({
      version: definition.version,
      // Keep field definitions intact for production review and for a clear
      // "removed" marker after sensitive values are purged.
      fields: definition.fields,
      answers: nonSensitiveAnswers,
    }),
    sensitivePersonalization:
      Object.keys(sensitiveAnswers).length > 0
        ? serializePersonalizationSnapshot({
            version: definition.version,
            fields: sensitiveFields,
            answers: sensitiveAnswers,
          })
        : null,
  }
}

export function parsePersonalizationSnapshot(value: string | null | undefined): StoredPersonalizationSnapshot | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed) || typeof parsed.version !== 'number' || !Array.isArray(parsed.fields) || !isRecord(parsed.answers)) return null
    const fields = personalizationDefinitionSchema.safeParse({ fields: parsed.fields })
    if (!fields.success) return null
    const answers: PersonalizationAnswers = {}
    for (const [key, answer] of Object.entries(parsed.answers)) {
      if (typeof answer === 'string' || typeof answer === 'number') answers[key] = answer
    }
    return { version: Math.max(1, Math.floor(parsed.version)), fields: fields.data.fields, answers }
  } catch {
    return null
  }
}
