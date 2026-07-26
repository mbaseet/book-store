import { z } from 'zod'

const passwordSchema = z.string().min(8).max(128)

export const customerRegistrationSchema = z.object({
  email: z.string().trim().email().max(254),
  password: passwordSchema,
  phone: z.string().trim().min(7).max(30).optional(),
  displayName: z.string().trim().min(2).max(120).optional(),
})

export const customerLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: passwordSchema,
})

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(254),
})

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(32).max(256),
  password: passwordSchema,
})

export const adminLoginSchema = customerLoginSchema

// The deployment-only token itself is deliberately supplied in a request
// header, never in this JSON payload or any client-side persistence layer.
export const adminBootstrapSchema = customerLoginSchema
