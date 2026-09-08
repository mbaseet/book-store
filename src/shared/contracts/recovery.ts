import { z } from 'zod'
import { PAYMENT_METHODS, PAYMENT_PLANS } from '@shared/constants'

export const recoveryLeadStateSchema = z.enum(['open', 'contacted', 'closed', 'converted'])
export const recoveryLeadMutableStateSchema = z.enum(['open', 'contacted', 'closed'])

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const candidate = new Date(Date.UTC(year, month - 1, day))
    return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day
  }, 'Enter a valid calendar date.')

export const recoveryLeadListQuerySchema = z
  .object({
    state: z.union([recoveryLeadStateSchema, z.literal('all')]).default('open'),
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({ code: 'custom', path: ['to'], message: 'The end date must be on or after the start date.' })
    }
  })

export const recoveryLeadStateUpdateSchema = z.object({
  state: recoveryLeadMutableStateSchema,
})

export const recoveryLeadIdSchema = z.string().uuid()

const recoveryAddonSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  priceAmount: z.number().int().nonnegative(),
})

/**
 * The sole recovery snapshot contract. It deliberately has no child answers,
 * photos, upload references, full address fields, notes, draft tokens, media
 * URLs, or Cloudinary identifiers.
 */
export const recoveryLeadPayloadSchema = z.object({
  version: z.literal(1),
  contact: z.object({
    email: z.string().email().max(254).nullable(),
    phone: z.string().min(7).max(30),
  }),
  delivery: z.object({
    governorateCode: z.string().min(1).max(64).nullable(),
    city: z.string().min(1).max(100).nullable(),
  }),
  checkout: z.object({
    paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
    paymentPlan: z.enum(PAYMENT_PLANS).nullable(),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        productSlug: z.string().min(1).max(160),
        productTitle: z.string().min(1).max(500),
        basePriceAmount: z.number().int().nonnegative(),
        salePriceAmount: z.number().int().nonnegative().nullable(),
        quantity: z.number().int().min(1).max(10),
        addons: z.array(recoveryAddonSchema).max(12),
      }),
    )
    .min(1)
    .max(20),
})

export const recoveryLeadResponseSchema = z.object({
  id: z.string().uuid(),
  state: recoveryLeadStateSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  convertedAt: z.string().datetime({ offset: true }).nullable(),
  convertedOrderNumber: z.string().nullable(),
  recovery: recoveryLeadPayloadSchema,
})

export type RecoveryLeadListQuery = z.infer<typeof recoveryLeadListQuerySchema>
export type RecoveryLeadPayload = z.infer<typeof recoveryLeadPayloadSchema>
export type RecoveryLeadResponse = z.infer<typeof recoveryLeadResponseSchema>
export type RecoveryLeadState = z.infer<typeof recoveryLeadStateSchema>
export type RecoveryLeadMutableState = z.infer<typeof recoveryLeadMutableStateSchema>
