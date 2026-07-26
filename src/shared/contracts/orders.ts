import { z } from 'zod'
import { ORDER_STATUSES } from '@shared/constants'

export const orderNumberSchema = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9-]+$/, 'Order number format is invalid.')

export const guestOrderTrackingSchema = z.object({
  orderNumber: orderNumberSchema,
  phone: z.string().trim().min(7).max(30),
})

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  customerVisibleNote: z.string().trim().max(500).optional(),
})

export const addOrderInternalNoteSchema = z.object({
  body: z.string().trim().min(1).max(2_000),
})

export type GuestOrderTrackingInput = z.infer<typeof guestOrderTrackingSchema>
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>
