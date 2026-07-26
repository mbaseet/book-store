import { z } from 'zod'
import { PAYMENT_METHODS, STORY_LANGUAGES } from '@shared/constants'

export const moneyAmountSchema = z.number().int().nonnegative()

export const checkoutUploadReferenceSchema = z.object({
  uploadId: z.string().uuid(),
  // A possession token makes an upload reference non-transferable even if an
  // opaque UUID were accidentally exposed in a client error or browser cache.
  claimToken: z.string().regex(/^[a-f0-9]{64}$/i),
})

export const privateUploadRequestSchema = z.object({
  kind: z.enum(['child_photo', 'payment_proof']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
})

export const orderItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
  /**
   * Product-specific controlled answers. Legacy storybook fields remain in
   * this contract during the transition so a saved product page or old client
   * cannot lose a checkout. The server validates this object against the
   * product's persisted definition before adding it to a draft.
   */
  personalization: z
    .record(z.string(), z.unknown())
    .superRefine((answers, context) => {
      if (Object.keys(answers).length > 12) {
        context.addIssue({ code: 'custom', message: 'Too many personalization answers were submitted.' })
      }
    })
    .optional(),
  // Legacy fields remain accepted for existing storybook products. They are
  // optional at the transport boundary because future product definitions can
  // legitimately omit a child name, story language, or photo field.
  childName: z.string().trim().min(1).max(80).optional(),
  storyLanguage: z.enum(STORY_LANGUAGES).optional(),
  note: z.string().trim().max(500).optional(),
  childUploads: z.array(checkoutUploadReferenceSchema).max(2).default([]),
  addonIds: z.array(z.string().uuid()).max(12).default([]),
})

// This is submitted only after the customer explicitly continues from the
// personalization step. Its upload references are exchanged for server-owned
// draft associations and are never returned to the browser on resume.
export const checkoutDraftItemInputSchema = orderItemInputSchema

const draftEmailSchema = z
  .string()
  .trim()
  .max(254)
  .refine((value) => value.length === 0 || z.string().email().safeParse(value).success, {
    message: 'Enter a valid email address.',
  })

export const checkoutDraftDeliveryInputSchema = z.object({
  customerName: z.string().trim().max(120),
  email: draftEmailSchema,
  phone: z.string().trim().max(30),
  governorateCode: z.string().trim().max(64),
  city: z.string().trim().max(100),
  addressLine1: z.string().trim().max(250),
  addressLine2: z.string().trim().max(250),
  addressNote: z.string().trim().max(500),
  paymentMethod: z.union([z.enum(PAYMENT_METHODS), z.literal('')]),
  promoCode: z.string().trim().max(40),
  // The text box is saved independently from the code the customer explicitly
  // applied to the quote, so a refresh never turns an un-applied code into a
  // discount by accident.
  appliedPromoCode: z.string().trim().max(40),
})

export const checkoutDraftDeliveryUpdateSchema = checkoutDraftDeliveryInputSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
})

const checkoutQuoteItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
  addonIds: z.array(z.string().uuid()).max(12).default([]),
})

export const checkoutQuoteInputSchema = z.object({
  governorateCode: z.string().trim().min(2).max(64),
  promoCode: z.string().trim().min(2).max(40).optional(),
  items: z.array(checkoutQuoteItemSchema).min(1).max(20),
})

export const checkoutInputSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(30),
  governorateCode: z.string().trim().min(2).max(64),
  city: z.string().trim().min(2).max(100),
  addressLine1: z.string().trim().min(5).max(250),
  addressLine2: z.string().trim().max(250).optional(),
  addressNote: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentProofUpload: checkoutUploadReferenceSchema,
  promoCode: z.string().trim().min(2).max(40).optional(),
})

export type CheckoutInput = z.infer<typeof checkoutInputSchema>
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteInputSchema>
export type OrderItemInput = z.infer<typeof orderItemInputSchema>
export type CheckoutDraftItemInput = z.infer<typeof checkoutDraftItemInputSchema>
export type CheckoutDraftDeliveryInput = z.infer<typeof checkoutDraftDeliveryInputSchema>
export type CheckoutDraftDeliveryUpdateInput = z.infer<typeof checkoutDraftDeliveryUpdateSchema>
export type CheckoutUploadReference = z.infer<typeof checkoutUploadReferenceSchema>
export type PrivateUploadRequest = z.infer<typeof privateUploadRequestSchema>

export const promoCodeLookupSchema = z.object({
  code: z.string().trim().min(2).max(40),
})
