import { z } from 'zod'
import { orderNumberSchema } from './orders'
export const reviewSubmissionSchema = z.object({
  orderNumber: orderNumberSchema,
  phone: z.string().trim().min(7).max(30).optional(),
  displayName: z.string().trim().min(2).max(80),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(3).max(2000),
  publicationConsent: z.literal(true),
})
export const reviewModerationSchema = z.object({
  status: z.enum(['published', 'rejected']),
  reason: z.string().trim().max(500).optional(),
})
