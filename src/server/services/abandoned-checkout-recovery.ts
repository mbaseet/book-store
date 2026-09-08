import { and, eq, gt, inArray, lte } from 'drizzle-orm'
import { PAYMENT_METHODS, PAYMENT_PLANS } from '@shared/constants'
import {
  recoveryLeadPayloadSchema,
  type RecoveryLeadPayload,
} from '@shared/contracts/recovery'
import { createDb } from '../db'
import { abandonedCheckoutRecoveryLeadsTable } from '../db/schema'
import type { Bindings } from '../types'

type Database = ReturnType<typeof createDb>

const RECOVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const RECOVERY_AAD = new TextEncoder().encode('personalized-storybooks-eg:abandoned-checkout-recovery:v1')
const MINIMUM_RECOVERY_SECRET_LENGTH = 32

type RecoverableDraft = {
  id: string
  expiresAt: Date
  payload: {
    delivery: {
      email: string
      phone: string
      governorateCode: string
      city: string
      paymentMethod: string
      paymentPlan: string
    }
    items: Array<{
      productId: string
      productSlug: string
      productTitle: string
      basePriceAmount: number
      salePriceAmount: number | null
      quantity: number
      addons: Array<{ id: string; name: string; priceAmount: number }>
    }>
  }
}

export class AbandonedCheckoutRecoveryError extends Error {
  constructor(message = 'Abandoned checkout recovery is temporarily unavailable.') {
    super(message)
    this.name = 'AbandonedCheckoutRecoveryError'
  }
}

function recoverySecret(env: Bindings) {
  const secret = env.ABANDONED_CART_ENCRYPTION_SECRET
  if (!secret || secret.length < MINIMUM_RECOVERY_SECRET_LENGTH) {
    throw new AbandonedCheckoutRecoveryError()
  }
  return secret
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new AbandonedCheckoutRecoveryError('Recovery data is invalid.')
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function encryptionKey(env: Bindings) {
  const material = new TextEncoder().encode(`abandoned-checkout-recovery:encryption:${recoverySecret(env)}`)
  const digest = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function hmacKey(env: Bindings) {
  const material = new TextEncoder().encode(`abandoned-checkout-recovery:hmac:${recoverySecret(env)}`)
  const digest = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

async function keyedHash(env: Bindings, value: string) {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(env), new TextEncoder().encode(value))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function nullableValue(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

function nullablePaymentMethod(value: string) {
  return (PAYMENT_METHODS as readonly string[]).includes(value) ? value : null
}

function nullablePaymentPlan(value: string) {
  return (PAYMENT_PLANS as readonly string[]).includes(value) ? value : null
}

/**
 * Normalizes presentation differences without persisting the phone in the
 * index. Egypt's local and +20/0020 representations resolve to the same HMAC
 * when their subscriber number is otherwise identical.
 */
export function normalizeRecoveryPhone(rawPhone: string) {
  const westernDigits = rawPhone
    .trim()
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  let normalized = westernDigits.replace(/[^0-9]/g, '')
  if (normalized.startsWith('00')) normalized = normalized.slice(2)
  if (/^0\d{10}$/.test(normalized)) normalized = `20${normalized.slice(1)}`
  if (/^1\d{9}$/.test(normalized)) normalized = `20${normalized}`
  return normalized.length >= 7 && normalized.length <= 20 ? normalized : ''
}

export async function hashRecoveryPhone(env: Bindings, phone: string) {
  const normalized = normalizeRecoveryPhone(phone)
  if (!normalized) return null
  return keyedHash(env, `phone:${normalized}`)
}

async function hashSourceDraft(env: Bindings, draftId: string) {
  return keyedHash(env, `draft:${draftId}`)
}

export function assertAbandonedCheckoutRecoveryAvailable(env: Bindings) {
  recoverySecret(env)
}

export async function encryptRecoveryPayload(env: Bindings, payload: RecoveryLeadPayload) {
  // Type annotations cannot defend against future callers using a cast. Parse
  // again at the encryption boundary so unknown keys are stripped even before
  // ciphertext is created, making this contract the final retention gate.
  const parsed = recoveryLeadPayloadSchema.safeParse(payload)
  if (!parsed.success) throw new AbandonedCheckoutRecoveryError('Recovery data is invalid.')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: Uint8Array.from(iv), additionalData: Uint8Array.from(RECOVERY_AAD) },
    await encryptionKey(env),
    new TextEncoder().encode(JSON.stringify(parsed.data)),
  )
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`
}

export async function decryptRecoveryPayload(env: Bindings, encryptedPayload: string) {
  const [encodedIv, encodedCiphertext, unexpectedPart] = encryptedPayload.split('.')
  if (!encodedIv || !encodedCiphertext || unexpectedPart) {
    throw new AbandonedCheckoutRecoveryError('Recovery data is invalid.')
  }
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: Uint8Array.from(base64UrlToBytes(encodedIv)),
        additionalData: Uint8Array.from(RECOVERY_AAD),
      },
      await encryptionKey(env),
      Uint8Array.from(base64UrlToBytes(encodedCiphertext)),
    )
    const parsed = recoveryLeadPayloadSchema.safeParse(JSON.parse(new TextDecoder().decode(decrypted)))
    if (!parsed.success) throw new AbandonedCheckoutRecoveryError('Recovery data is invalid.')
    return parsed.data
  } catch (error) {
    if (error instanceof AbandonedCheckoutRecoveryError) throw error
    throw new AbandonedCheckoutRecoveryError('Recovery data is invalid.')
  }
}

/**
 * Whitelists the only data that can survive draft expiry. This function never
 * carries through personalizations, child details, upload IDs, address lines,
 * notes, or media data from the richer encrypted checkout draft.
 */
export function recoveryPayloadFromExpiredDraft(draft: RecoverableDraft): RecoveryLeadPayload | null {
  const phone = draft.payload.delivery.phone.trim()
  // Phone is the required checkout contact and the only recovery contact we
  // retain. Email remains optional. Reject incomplete or unparseable contact
  // data before the safe snapshot is ever encrypted.
  if (!normalizeRecoveryPhone(phone)) return null

  const parsed = recoveryLeadPayloadSchema.safeParse({
    version: 1,
    contact: {
      email: nullableValue(draft.payload.delivery.email),
      phone,
    },
    delivery: {
      governorateCode: nullableValue(draft.payload.delivery.governorateCode),
      city: nullableValue(draft.payload.delivery.city),
    },
    checkout: {
      paymentMethod: nullablePaymentMethod(draft.payload.delivery.paymentMethod),
      paymentPlan: nullablePaymentPlan(draft.payload.delivery.paymentPlan),
    },
    items: draft.payload.items.map((item) => ({
      productId: item.productId,
      productSlug: item.productSlug,
      productTitle: item.productTitle,
      basePriceAmount: item.basePriceAmount,
      salePriceAmount: item.salePriceAmount,
      quantity: item.quantity,
      addons: item.addons.map((addon) => ({
        id: addon.id,
        name: addon.name,
        priceAmount: addon.priceAmount,
      })),
    })),
  })
  return parsed.success ? parsed.data : null
}

/**
 * Promotion occurs only at expiry when the draft has enough contact data. A
 * unique HMAC of the draft ID makes retries idempotent without retaining a
 * draft token or exposing a browser-bound identifier.
 */
export async function promoteExpiredCheckoutDraftToRecoveryLead(
  db: Database,
  env: Bindings,
  draft: RecoverableDraft,
  now = new Date(),
) {
  if (draft.expiresAt > now) return false
  const payload = recoveryPayloadFromExpiredDraft(draft)
  if (!payload) return false

  const phoneHash = await hashRecoveryPhone(env, payload.contact.phone)
  if (!phoneHash) return false
  const [sourceDraftHash, encryptedPayload] = await Promise.all([
    hashSourceDraft(env, draft.id),
    encryptRecoveryPayload(env, payload),
  ])
  const result = await db
    .insert(abandonedCheckoutRecoveryLeadsTable)
    .values({
      sourceDraftHash,
      phoneHash,
      encryptedPayload,
      state: 'open',
      expiresAt: new Date(now.getTime() + RECOVERY_RETENTION_MS),
    })
    .onConflictDoNothing({ target: abandonedCheckoutRecoveryLeadsTable.sourceDraftHash })
    .run()
  return Number(result.meta.changes ?? 0) === 1
}

/**
 * Best-effort conversion must never affect order creation. The recovery table
 * can be unavailable during a migration or secret rollout, while checkout is
 * still the primary conversion path and must remain available.
 */
export async function markActionableRecoveryLeadsConverted(
  db: Database,
  env: Bindings,
  phone: string,
  orderId: string,
  now = new Date(),
) {
  try {
    const phoneHash = await hashRecoveryPhone(env, phone)
    if (!phoneHash) return 0
    const result = await db
      .update(abandonedCheckoutRecoveryLeadsTable)
      .set({ state: 'converted', convertedOrderId: orderId, convertedAt: now, updatedAt: now })
      .where(
        and(
          eq(abandonedCheckoutRecoveryLeadsTable.phoneHash, phoneHash),
          inArray(abandonedCheckoutRecoveryLeadsTable.state, ['open', 'contacted']),
          gt(abandonedCheckoutRecoveryLeadsTable.expiresAt, now),
        ),
      )
      .run()
    return Number(result.meta.changes ?? 0)
  } catch {
    return 0
  }
}

export async function purgeExpiredAbandonedCheckoutRecoveryLeads(
  db: Database,
  { limit = 100, now = new Date() }: { limit?: number; now?: Date } = {},
) {
  const leads = await db
    .select({ id: abandonedCheckoutRecoveryLeadsTable.id })
    .from(abandonedCheckoutRecoveryLeadsTable)
    .where(lte(abandonedCheckoutRecoveryLeadsTable.expiresAt, now))
    .limit(Math.min(Math.max(limit, 1), 100))
  if (leads.length === 0) return 0
  await db.delete(abandonedCheckoutRecoveryLeadsTable).where(inArray(abandonedCheckoutRecoveryLeadsTable.id, leads.map((lead) => lead.id)))
  return leads.length
}
