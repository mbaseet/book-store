import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { z } from 'zod'
import type {
  CheckoutDraftDeliveryInput,
  CheckoutUploadReference,
} from '@shared/contracts/checkout'
import { personalizationFieldSchema } from '@shared/contracts/personalization'
import { createDb } from '../db'
import { checkoutDraftsTable, checkoutUploadsTable } from '../db/schema'
import { createOpaqueToken, hashToken } from '../lib/crypto'
import type { Bindings } from '../types'

type Database = ReturnType<typeof createDb>
type CookieContext = Context

const DRAFT_COOKIE = 'storybook_checkout_draft'
const DRAFT_LIFETIME_MS = 60 * 60 * 1000
const DRAFT_AAD = new TextEncoder().encode('personalized-storybooks-eg:checkout-draft:v1')

const storedAddonSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  priceAmount: z.number().int().nonnegative(),
})

const storedPersonalizationAnswersSchema = z.record(
  z.string().min(1).max(48),
  z.union([z.string().max(20_000), z.number().int()]),
)

const storedPersonalizationDefinitionSchema = z.object({
  version: z.number().int().positive(),
  fields: z.array(personalizationFieldSchema).max(12),
})

const storedDraftItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productSlug: z.string().min(1).max(160),
  productTitle: z.string().min(1).max(500),
  productImageUrl: z.string().url().nullable(),
  basePriceAmount: z.number().int().nonnegative(),
  salePriceAmount: z.number().int().nonnegative().nullable(),
  quantity: z.number().int().min(1).max(10),
  childName: z.string().min(1).max(80).optional(),
  storyLanguage: z.enum(['ar_msa', 'ar_eg', 'en']).optional(),
  note: z.string().max(500).optional(),
  personalization: storedPersonalizationAnswersSchema.default({}),
  personalizationDefinition: storedPersonalizationDefinitionSchema.nullable().default(null),
  addons: z.array(storedAddonSchema).max(12),
  childUploadIds: z.array(z.string().uuid()).max(2),
})

const storedCheckoutDraftSchema = z.object({
  version: z.literal(1),
  items: z.array(storedDraftItemSchema).min(1).max(20),
  delivery: z.object({
    customerName: z.string().max(120),
    email: z.string().max(254),
    phone: z.string().max(30),
    governorateCode: z.string().max(64),
    city: z.string().max(100),
    addressLine1: z.string().max(250),
    addressLine2: z.string().max(250),
    addressNote: z.string().max(500),
    paymentMethod: z.union([z.enum(['instapay', 'mobile_wallet']), z.literal('')]),
    promoCode: z.string().max(40),
    appliedPromoCode: z.string().max(40),
  }),
})

type StoredCheckoutDraft = z.infer<typeof storedCheckoutDraftSchema>
type StoredCheckoutDraftItem = z.infer<typeof storedDraftItemSchema>

export type PublicCheckoutDraftItem = Omit<StoredCheckoutDraftItem, 'childUploadIds'>
export type PublicCheckoutDraft = {
  expiresAt: string
  revision: number
  items: PublicCheckoutDraftItem[]
  delivery: CheckoutDraftDeliveryInput
}

export type CurrentCheckoutDraft = {
  id: string
  expiresAt: Date
  revision: number
  payload: StoredCheckoutDraft
}

export type CheckoutDraftItemPresentation = Omit<StoredCheckoutDraftItem, 'id' | 'childUploadIds'>

export class CheckoutDraftError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutDraftError'
  }
}

export class CheckoutDraftConflictError extends CheckoutDraftError {
  constructor() {
    super('Your saved checkout changed in another tab. Please reload it and review the details.')
    this.name = 'CheckoutDraftConflictError'
  }
}

function emptyDelivery(): CheckoutDraftDeliveryInput {
  return {
    customerName: '',
    email: '',
    phone: '',
    governorateCode: '',
    city: '',
    addressLine1: '',
    addressLine2: '',
    addressNote: '',
    paymentMethod: '',
    promoCode: '',
    appliedPromoCode: '',
  }
}

function cookieOptions(requestUrl: string, expiresAt: Date) {
  return {
    httpOnly: true,
    maxAge: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
    path: '/',
    sameSite: 'lax' as const,
    secure: new URL(requestUrl).protocol === 'https:',
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new CheckoutDraftError('Saved checkout details are invalid.')
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function draftEncryptionKey(env: Bindings) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16) {
    throw new CheckoutDraftError('Checkout resume is temporarily unavailable.')
  }
  const material = new TextEncoder().encode(`checkout-draft:${env.SESSION_SECRET}`)
  const digest = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptDraft(env: Bindings, payload: StoredCheckoutDraft) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: Uint8Array.from(iv), additionalData: Uint8Array.from(DRAFT_AAD) },
    await draftEncryptionKey(env),
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`
}

async function decryptDraft(env: Bindings, encryptedPayload: string) {
  const [encodedIv, encodedCiphertext, unexpectedPart] = encryptedPayload.split('.')
  if (!encodedIv || !encodedCiphertext || unexpectedPart) throw new CheckoutDraftError('Saved checkout details are invalid.')
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: Uint8Array.from(base64UrlToBytes(encodedIv)),
        additionalData: Uint8Array.from(DRAFT_AAD),
      },
      await draftEncryptionKey(env),
      Uint8Array.from(base64UrlToBytes(encodedCiphertext)),
    )
    const parsed = storedCheckoutDraftSchema.safeParse(JSON.parse(new TextDecoder().decode(decrypted)))
    if (!parsed.success) throw new CheckoutDraftError('Saved checkout details are invalid.')
    return parsed.data
  } catch (error) {
    if (error instanceof CheckoutDraftError) throw error
    throw new CheckoutDraftError('Saved checkout details are invalid.')
  }
}

export function publicDraft(draft: CurrentCheckoutDraft): PublicCheckoutDraft {
  return {
    expiresAt: draft.expiresAt.toISOString(),
    revision: draft.revision,
    items: draft.payload.items.map(({ childUploadIds: _childUploadIds, ...item }) => item),
    delivery: draft.payload.delivery,
  }
}

function clearDraftCookie(context: CookieContext) {
  deleteCookie(context, DRAFT_COOKIE, { path: '/' })
}

function writeDraftCookie(context: CookieContext, token: string, expiresAt: Date) {
  setCookie(context, DRAFT_COOKIE, token, cookieOptions(context.req.url, expiresAt))
}

async function deleteExpiredOrUnreadableDraft(
  context: CookieContext,
  db: Database,
  draftId: string,
) {
  await db.delete(checkoutDraftsTable).where(eq(checkoutDraftsTable.id, draftId))
  clearDraftCookie(context)
}

export async function getCurrentCheckoutDraft(
  context: CookieContext,
  db: Database,
  env: Bindings,
): Promise<CurrentCheckoutDraft | null> {
  const token = getCookie(context, DRAFT_COOKIE)
  if (!token) return null

  const tokenHash = await hashToken(token)
  const [draft] = await db
    .select()
    .from(checkoutDraftsTable)
    .where(eq(checkoutDraftsTable.tokenHash, tokenHash))
    .limit(1)
  if (!draft) {
    clearDraftCookie(context)
    return null
  }
  if (draft.expiresAt <= new Date()) {
    await deleteExpiredOrUnreadableDraft(context, db, draft.id)
    return null
  }

  try {
    return {
      id: draft.id,
      expiresAt: draft.expiresAt,
      revision: draft.revision,
      payload: await decryptDraft(env, draft.payload),
    }
  } catch {
    await deleteExpiredOrUnreadableDraft(context, db, draft.id)
    return null
  }
}

async function detachDraftUploads(db: Database, draftId: string, uploadIds: string[]) {
  if (uploadIds.length === 0) return
  await db
    .update(checkoutUploadsTable)
    .set({ draftId: null })
    .where(
      and(
        eq(checkoutUploadsTable.draftId, draftId),
        inArray(checkoutUploadsTable.id, uploadIds),
        isNull(checkoutUploadsTable.claimedAt),
      ),
    )
}

async function attachDraftUploads(
  db: Database,
  draftId: string,
  references: CheckoutUploadReference[],
  maximumExpiry: Date,
) {
  if (references.length === 0) return { attachedIds: [], expiresAt: maximumExpiry }
  if (new Set(references.map((reference) => reference.uploadId)).size !== references.length) {
    throw new CheckoutDraftError('Each uploaded photo can be used only once per story.')
  }
  const attachedIds: string[] = []
  const expiryTimes: Date[] = []
  try {
    for (const reference of references) {
      const tokenHash = await hashToken(reference.claimToken)
      const claim = await db
        .update(checkoutUploadsTable)
        .set({ draftId })
        .where(
          and(
            eq(checkoutUploadsTable.id, reference.uploadId),
            eq(checkoutUploadsTable.tokenHash, tokenHash),
            eq(checkoutUploadsTable.kind, 'child_photo'),
            isNull(checkoutUploadsTable.claimedAt),
            isNull(checkoutUploadsTable.draftId),
            gt(checkoutUploadsTable.expiresAt, new Date()),
          ),
        )
        .run()
      if (Number(claim.meta.changes ?? 0) !== 1) {
        throw new CheckoutDraftError('One of the uploaded photos is no longer available. Please upload it again.')
      }
      attachedIds.push(reference.uploadId)
      const [upload] = await db
        .select({ expiresAt: checkoutUploadsTable.expiresAt })
        .from(checkoutUploadsTable)
        .where(and(eq(checkoutUploadsTable.id, reference.uploadId), eq(checkoutUploadsTable.draftId, draftId)))
        .limit(1)
      if (!upload) throw new CheckoutDraftError('One of the uploaded photos is no longer available. Please upload it again.')
      const expiresAt = new Date(Math.min(upload.expiresAt.getTime(), maximumExpiry.getTime()))
      if (expiresAt.getTime() < upload.expiresAt.getTime()) {
        const capped = await db
          .update(checkoutUploadsTable)
          .set({ expiresAt })
          .where(
            and(
              eq(checkoutUploadsTable.id, reference.uploadId),
              eq(checkoutUploadsTable.draftId, draftId),
              isNull(checkoutUploadsTable.claimedAt),
            ),
          )
          .run()
        if (Number(capped.meta.changes ?? 0) !== 1) {
          throw new CheckoutDraftError('One of the uploaded photos is no longer available. Please upload it again.')
        }
      }
      expiryTimes.push(expiresAt)
    }
    return { attachedIds, expiresAt: new Date(Math.min(...expiryTimes.map((value) => value.getTime()))) }
  } catch (error) {
    await detachDraftUploads(db, draftId, attachedIds)
    throw error
  }
}

export async function appendCheckoutDraftItem(
  context: CookieContext,
  db: Database,
  env: Bindings,
  presentation: CheckoutDraftItemPresentation,
  childUploads: CheckoutUploadReference[],
) {
  const item: StoredCheckoutDraftItem = {
    ...presentation,
    id: crypto.randomUUID(),
    childUploadIds: childUploads.map((upload) => upload.uploadId),
  }

  // The product screen normally submits one request, but a short retry loop
  // also protects against a concurrent delivery save or a second open tab.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await getCurrentCheckoutDraft(context, db, env)
    if (existing && existing.payload.items.length >= 20) {
      throw new CheckoutDraftError('You can add up to 20 stories to one order.')
    }

    if (!existing) {
      const token = createOpaqueToken()
      const draftId = crypto.randomUUID()
      const provisionalExpiresAt = new Date(Date.now() + DRAFT_LIFETIME_MS)
      const payload: StoredCheckoutDraft = { version: 1, items: [item], delivery: emptyDelivery() }
      await db.insert(checkoutDraftsTable).values({
        id: draftId,
        tokenHash: await hashToken(token),
        payload: await encryptDraft(env, payload),
        revision: 0,
        expiresAt: provisionalExpiresAt,
      })
      try {
        const attachments = await attachDraftUploads(db, draftId, childUploads, provisionalExpiresAt)
        const expiresAt = new Date(Math.min(provisionalExpiresAt.getTime(), attachments.expiresAt.getTime()))
        await db.update(checkoutDraftsTable).set({ expiresAt }).where(eq(checkoutDraftsTable.id, draftId))
        const draft = { id: draftId, expiresAt, revision: 0, payload }
        writeDraftCookie(context, token, expiresAt)
        return publicDraft(draft)
      } catch (error) {
        await db.delete(checkoutDraftsTable).where(eq(checkoutDraftsTable.id, draftId))
        throw error
      }
    }

    const attachments = await attachDraftUploads(db, existing.id, childUploads, existing.expiresAt)
    const expiresAt = new Date(Math.min(existing.expiresAt.getTime(), attachments.expiresAt.getTime()))
    const payload: StoredCheckoutDraft = {
      ...existing.payload,
      items: [...existing.payload.items, item],
    }
    try {
      const updated = await db
        .update(checkoutDraftsTable)
        .set({ payload: await encryptDraft(env, payload), expiresAt, revision: existing.revision + 1 })
        .where(
          and(
            eq(checkoutDraftsTable.id, existing.id),
            eq(checkoutDraftsTable.revision, existing.revision),
            gt(checkoutDraftsTable.expiresAt, new Date()),
          ),
        )
        .run()
      if (Number(updated.meta.changes ?? 0) !== 1) throw new CheckoutDraftConflictError()
      return publicDraft({ ...existing, expiresAt, revision: existing.revision + 1, payload })
    } catch (error) {
      await detachDraftUploads(db, existing.id, attachments.attachedIds)
      if (error instanceof CheckoutDraftConflictError && attempt < 2) continue
      throw error
    }
  }

  throw new CheckoutDraftConflictError()
}

export async function updateCheckoutDraftDelivery(
  context: CookieContext,
  db: Database,
  env: Bindings,
  delivery: CheckoutDraftDeliveryInput,
  expectedRevision: number,
) {
  const draft = await getCurrentCheckoutDraft(context, db, env)
  if (!draft) throw new CheckoutDraftError('Your saved checkout has expired. Please personalize your story again.')
  if (draft.revision !== expectedRevision) throw new CheckoutDraftConflictError()
  const payload: StoredCheckoutDraft = { ...draft.payload, delivery }
  const updated = await db
    .update(checkoutDraftsTable)
    .set({ payload: await encryptDraft(env, payload), revision: draft.revision + 1 })
    .where(
      and(
        eq(checkoutDraftsTable.id, draft.id),
        eq(checkoutDraftsTable.revision, draft.revision),
        gt(checkoutDraftsTable.expiresAt, new Date()),
      ),
    )
    .run()
  if (Number(updated.meta.changes ?? 0) !== 1) throw new CheckoutDraftConflictError()
  return publicDraft({ ...draft, revision: draft.revision + 1, payload })
}

export async function removeCheckoutDraftItem(
  context: CookieContext,
  db: Database,
  env: Bindings,
  itemId: string,
  expectedRevision: number,
) {
  const draft = await getCurrentCheckoutDraft(context, db, env)
  if (!draft) throw new CheckoutDraftError('Your saved checkout has expired. Please personalize your story again.')
  if (draft.revision !== expectedRevision) throw new CheckoutDraftConflictError()
  const removed = draft.payload.items.find((item) => item.id === itemId)
  if (!removed) throw new CheckoutDraftError('This story is no longer in the saved checkout.')

  const remainingItems = draft.payload.items.filter((item) => item.id !== itemId)
  if (remainingItems.length === 0) {
    const deleted = await db
      .delete(checkoutDraftsTable)
      .where(
        and(
          eq(checkoutDraftsTable.id, draft.id),
          eq(checkoutDraftsTable.revision, draft.revision),
          gt(checkoutDraftsTable.expiresAt, new Date()),
        ),
      )
      .run()
    if (Number(deleted.meta.changes ?? 0) !== 1) throw new CheckoutDraftConflictError()
    clearDraftCookie(context)
    return null
  }

  const payload: StoredCheckoutDraft = { ...draft.payload, items: remainingItems }
  const updated = await db
    .update(checkoutDraftsTable)
    .set({ payload: await encryptDraft(env, payload), revision: draft.revision + 1 })
    .where(
      and(
        eq(checkoutDraftsTable.id, draft.id),
        eq(checkoutDraftsTable.revision, draft.revision),
        gt(checkoutDraftsTable.expiresAt, new Date()),
      ),
    )
    .run()
  if (Number(updated.meta.changes ?? 0) !== 1) throw new CheckoutDraftConflictError()
  // The payload is durable before the old photos are released. A failed
  // cleanup is harmless: the private upload expires automatically.
  await detachDraftUploads(db, draft.id, removed.childUploadIds).catch(() => undefined)
  return publicDraft({ ...draft, revision: draft.revision + 1, payload })
}

export async function deleteCheckoutDraft(context: CookieContext, db: Database, env: Bindings) {
  const draft = await getCurrentCheckoutDraft(context, db, env)
  if (!draft) return
  await db.delete(checkoutDraftsTable).where(eq(checkoutDraftsTable.id, draft.id))
  clearDraftCookie(context)
}

export async function consumeCheckoutDraft(context: CookieContext, db: Database, draft: CurrentCheckoutDraft) {
  const childUploadIds = draft.payload.items.flatMap((item) => item.childUploadIds)
  if (childUploadIds.length > 0) {
    await db
      .delete(checkoutUploadsTable)
      .where(
        and(
          eq(checkoutUploadsTable.draftId, draft.id),
          inArray(checkoutUploadsTable.id, childUploadIds),
        ),
      )
  }
  await db.delete(checkoutDraftsTable).where(eq(checkoutDraftsTable.id, draft.id))
  clearDraftCookie(context)
}

export async function purgeExpiredCheckoutDrafts(db: Database, { limit = 100 }: { limit?: number } = {}) {
  const dueDrafts = await db
    .select({ id: checkoutDraftsTable.id })
    .from(checkoutDraftsTable)
    .where(lte(checkoutDraftsTable.expiresAt, new Date()))
    .limit(Math.min(Math.max(limit, 1), 100))
  if (dueDrafts.length === 0) return 0
  await db.delete(checkoutDraftsTable).where(inArray(checkoutDraftsTable.id, dueDrafts.map((draft) => draft.id)))
  return dueDrafts.length
}
