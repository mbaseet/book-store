import { and, eq, gt, isNotNull, isNull, lte, lt } from 'drizzle-orm'
import type { CheckoutUploadReference, PrivateUploadRequest } from '@shared/contracts/checkout'
import { createDb } from '../db'
import { checkoutUploadsTable, orderItemsTable, orderSensitiveAssetsTable, ordersTable } from '../db/schema'
import { createOpaqueToken, hashToken } from '../lib/crypto'
import type { Bindings } from '../types'

const TEMP_UPLOAD_LIFETIME_MS = 60 * 60 * 1000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

type Database = ReturnType<typeof createDb>
type PrivateUploadKind = PrivateUploadRequest['kind']

export class PrivateUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrivateUploadError'
  }
}

function assertCloudinaryConfigured(env: Bindings) {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new PrivateUploadError('Private media uploads are not configured.')
  }
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha1Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value))
  return bytesToHex(new Uint8Array(digest))
}

async function sha1Base64Url(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value)))
  const binary = String.fromCharCode(...digest)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function cloudinaryApiSignature(
  env: Bindings,
  parameters: Record<string, string>,
) {
  const serialized = Object.entries(parameters)
    .filter(([, value]) => value.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  return sha1Hex(`${serialized}${env.CLOUDINARY_API_SECRET}`)
}

function cloudinaryBasicAuth(env: Bindings) {
  return `Basic ${btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`)}`
}

function privatePublicId(uploadId: string) {
  return `storybook-private/${uploadId}`
}

function cloudinaryPath(publicId: string) {
  return publicId.split('/').map(encodeURIComponent).join('/')
}

type CloudinaryResource = {
  publicId: string
  format: string
  bytes: number
  type: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function cloudinaryResource(env: Bindings, publicId: string): Promise<CloudinaryResource | null> {
  assertCloudinaryConfigured(env)
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/resources/image/authenticated/${encodeURIComponent(publicId)}`,
    { headers: { Authorization: cloudinaryBasicAuth(env) } },
  )
  if (response.status === 404) return null
  if (!response.ok) throw new PrivateUploadError('Private media could not be verified.')

  const payload: unknown = await response.json()
  if (!isRecord(payload)) throw new PrivateUploadError('Private media could not be verified.')
  const publicIdValue = payload.public_id
  const format = payload.format
  const bytes = payload.bytes
  const type = payload.type
  if (
    typeof publicIdValue !== 'string' ||
    typeof format !== 'string' ||
    typeof bytes !== 'number' ||
    typeof type !== 'string'
  ) {
    throw new PrivateUploadError('Private media could not be verified.')
  }
  return { publicId: publicIdValue, format, bytes, type }
}

export async function initiatePrivateUpload(
  db: Database,
  env: Bindings,
  input: PrivateUploadRequest,
) {
  assertCloudinaryConfigured(env)
  const uploadId = crypto.randomUUID()
  const claimToken = createOpaqueToken()
  const cloudinaryPublicId = privatePublicId(uploadId)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const expiresAt = new Date(Date.now() + TEMP_UPLOAD_LIFETIME_MS)
  const parameters = {
    allowed_formats: 'jpg,jpeg,png,webp',
    type: 'authenticated',
    overwrite: 'false',
    public_id: cloudinaryPublicId,
    timestamp,
  }
  const signature = await cloudinaryApiSignature(env, parameters)

  await db.insert(checkoutUploadsTable).values({
    id: uploadId,
    tokenHash: await hashToken(claimToken),
    kind: input.kind,
    // A non-deliverable internal reference avoids storing a browser-accessible
    // URL for a child's image or payment proof.
    url: `cloudinary://${cloudinaryPublicId}`,
    cloudinaryPublicId,
    expiresAt,
  })

  return {
    uploadId,
    claimToken,
    expiresAt: expiresAt.toISOString(),
    upload: {
      endpoint: `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/upload`,
      fields: {
        ...parameters,
        api_key: env.CLOUDINARY_API_KEY,
        signature,
      },
    },
  }
}

export async function claimPrivateCheckoutUpload(
  db: Database,
  env: Bindings,
  reference: CheckoutUploadReference,
  expectedKind: PrivateUploadKind,
) {
  const tokenHash = await hashToken(reference.claimToken)
  const [upload] = await db
    .select()
    .from(checkoutUploadsTable)
    .where(
      and(
        eq(checkoutUploadsTable.id, reference.uploadId),
        eq(checkoutUploadsTable.tokenHash, tokenHash),
        isNull(checkoutUploadsTable.draftId),
      ),
    )
    .limit(1)
  if (!upload || upload.kind !== expectedKind || upload.expiresAt <= new Date() || upload.claimedAt) {
    throw new PrivateUploadError('This upload has expired or is no longer available.')
  }

  const resource = await cloudinaryResource(env, upload.cloudinaryPublicId)
  if (
    !resource ||
    resource.publicId !== upload.cloudinaryPublicId ||
    resource.type !== 'authenticated' ||
    resource.bytes <= 0 ||
    resource.bytes > MAX_IMAGE_BYTES
  ) {
    throw new PrivateUploadError('The uploaded image could not be verified.')
  }

  const claim = await db
    .update(checkoutUploadsTable)
    .set({ claimedAt: new Date() })
    .where(
      and(
        eq(checkoutUploadsTable.id, upload.id),
        eq(checkoutUploadsTable.tokenHash, tokenHash),
        isNull(checkoutUploadsTable.claimedAt),
        isNull(checkoutUploadsTable.draftId),
        gt(checkoutUploadsTable.expiresAt, new Date()),
      ),
    )
    .run()
  if (Number(claim.meta.changes ?? 0) !== 1) {
    throw new PrivateUploadError('This upload is already being used. Please upload it again.')
  }

  return {
    id: upload.id,
    kind: upload.kind as PrivateUploadKind,
    url: upload.url,
    cloudinaryPublicId: upload.cloudinaryPublicId,
  }
}

/**
 * Child photos attached to a server-side checkout draft no longer rely on a
 * browser-held claim token. Possession of the matching HTTP-only draft cookie
 * is checked by the caller before this function is used.
 */
export async function claimPrivateDraftUpload(
  db: Database,
  env: Bindings,
  { draftId, uploadId, expectedKind }: { draftId: string; uploadId: string; expectedKind: PrivateUploadKind },
) {
  const [upload] = await db
    .select()
    .from(checkoutUploadsTable)
    .where(and(eq(checkoutUploadsTable.id, uploadId), eq(checkoutUploadsTable.draftId, draftId)))
    .limit(1)
  if (!upload || upload.kind !== expectedKind || upload.expiresAt <= new Date() || upload.claimedAt) {
    throw new PrivateUploadError('A saved uploaded photo is no longer available. Please personalize the story again.')
  }

  const resource = await cloudinaryResource(env, upload.cloudinaryPublicId)
  if (
    !resource ||
    resource.publicId !== upload.cloudinaryPublicId ||
    resource.type !== 'authenticated' ||
    resource.bytes <= 0 ||
    resource.bytes > MAX_IMAGE_BYTES
  ) {
    throw new PrivateUploadError('The uploaded image could not be verified.')
  }

  const claim = await db
    .update(checkoutUploadsTable)
    .set({ claimedAt: new Date() })
    .where(
      and(
        eq(checkoutUploadsTable.id, upload.id),
        eq(checkoutUploadsTable.draftId, draftId),
        isNull(checkoutUploadsTable.claimedAt),
        gt(checkoutUploadsTable.expiresAt, new Date()),
      ),
    )
    .run()
  if (Number(claim.meta.changes ?? 0) !== 1) {
    throw new PrivateUploadError('This uploaded image is already being used. Please personalize the story again.')
  }

  return {
    id: upload.id,
    kind: upload.kind as PrivateUploadKind,
    url: upload.url,
    cloudinaryPublicId: upload.cloudinaryPublicId,
  }
}

export async function releasePrivateCheckoutUploadClaim(db: Database, reference: CheckoutUploadReference) {
  const tokenHash = await hashToken(reference.claimToken)
  await db
    .update(checkoutUploadsTable)
    .set({ claimedAt: null })
    .where(
      and(
        eq(checkoutUploadsTable.id, reference.uploadId),
        eq(checkoutUploadsTable.tokenHash, tokenHash),
        isNull(checkoutUploadsTable.draftId),
      ),
    )
}

export async function releasePrivateDraftUploadClaim(db: Database, draftId: string, uploadId: string) {
  await db
    .update(checkoutUploadsTable)
    .set({ claimedAt: null })
    .where(and(eq(checkoutUploadsTable.id, uploadId), eq(checkoutUploadsTable.draftId, draftId)))
}

export async function consumePrivateCheckoutUpload(db: Database, reference: CheckoutUploadReference) {
  const tokenHash = await hashToken(reference.claimToken)
  await db
    .delete(checkoutUploadsTable)
    .where(
      and(
        eq(checkoutUploadsTable.id, reference.uploadId),
        eq(checkoutUploadsTable.tokenHash, tokenHash),
        isNotNull(checkoutUploadsTable.claimedAt),
        isNull(checkoutUploadsTable.draftId),
      ),
    )
}

export async function destroyAuthenticatedCloudinaryAsset(env: Bindings, publicId: string) {
  assertCloudinaryConfigured(env)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const parameters = {
    invalidate: 'true',
    public_id: publicId,
    timestamp,
    type: 'authenticated',
  }
  const signature = await cloudinaryApiSignature(env, parameters)
  const body = new URLSearchParams({ ...parameters, api_key: env.CLOUDINARY_API_KEY, signature })
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  )
  if (!response.ok) throw new PrivateUploadError('Private media could not be deleted.')
  const payload: unknown = await response.json()
  return isRecord(payload) && (payload.result === 'ok' || payload.result === 'not found')
}

export async function fetchAuthenticatedCloudinaryAsset(env: Bindings, publicId: string) {
  const resource = await cloudinaryResource(env, publicId)
  if (!resource || resource.type !== 'authenticated') {
    throw new PrivateUploadError('Private media was not found.')
  }

  const deliveryPath = `${cloudinaryPath(publicId)}.${encodeURIComponent(resource.format)}`
  const signature = (await sha1Base64Url(`${deliveryPath}${env.CLOUDINARY_API_SECRET}`)).slice(0, 8)
  return fetch(
    `https://res.cloudinary.com/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/authenticated/s--${signature}--/${deliveryPath}`,
  )
}

export async function purgeExpiredUnclaimedPrivateUploads(
  db: Database,
  env: Bindings,
  { limit = 100 }: { limit?: number } = {},
) {
  const dueUploads = await db
    .select()
    .from(checkoutUploadsTable)
    .where(and(isNull(checkoutUploadsTable.claimedAt), lt(checkoutUploadsTable.expiresAt, new Date())))
    .limit(Math.min(Math.max(limit, 1), 100))
  let purged = 0
  for (const upload of dueUploads) {
    try {
      const destroyed = await destroyAuthenticatedCloudinaryAsset(env, upload.cloudinaryPublicId)
      if (destroyed) {
        await db.delete(checkoutUploadsTable).where(eq(checkoutUploadsTable.id, upload.id))
        purged += 1
      }
    } catch {
      // Leave the row in place so a later scheduled run can retry safely.
    }
  }
  return purged
}

export async function purgeDueSensitiveAssets(
  db: Database,
  env: Bindings,
  { limit = 100 }: { limit?: number } = {},
) {
  const now = new Date()
  const assets = await db
    .select()
    .from(orderSensitiveAssetsTable)
    .where(
      and(
        isNull(orderSensitiveAssetsTable.deletedAt),
        isNotNull(orderSensitiveAssetsTable.deleteAfter),
        lte(orderSensitiveAssetsTable.deleteAfter, now),
      ),
    )
    .limit(Math.min(Math.max(limit, 1), 100))
  const affectedOrderIds = new Set<string>()
  let purged = 0
  for (const asset of assets) {
    try {
      const destroyed = await destroyAuthenticatedCloudinaryAsset(env, asset.cloudinaryPublicId)
      if (destroyed) {
        await db
          .update(orderSensitiveAssetsTable)
          .set({ deletedAt: now })
          .where(eq(orderSensitiveAssetsTable.id, asset.id))
        affectedOrderIds.add(asset.orderId)
        purged += 1
      }
    } catch {
      // Retain enough metadata for a retry; never expose the failed asset URL.
    }
  }
  for (const orderId of affectedOrderIds) await markOrderSensitiveDataPurgedIfComplete(db, orderId, now)
  return purged
}

async function markOrderSensitiveDataPurgedIfComplete(db: Database, orderId: string, now: Date) {
  const [remainingAssets, remainingPersonalization] = await Promise.all([
    db
      .select({ id: orderSensitiveAssetsTable.id })
      .from(orderSensitiveAssetsTable)
      .where(and(eq(orderSensitiveAssetsTable.orderId, orderId), isNull(orderSensitiveAssetsTable.deletedAt)))
      .limit(1),
    db
      .select({ id: orderItemsTable.id })
      .from(orderItemsTable)
      .where(and(eq(orderItemsTable.orderId, orderId), isNotNull(orderItemsTable.sensitivePersonalization)))
      .limit(1),
  ])
  if (remainingAssets.length === 0 && remainingPersonalization.length === 0) {
    await db
      .update(ordersTable)
      .set({ sensitiveDataPurgedAt: now })
      .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.sensitiveDataPurgedAt)))
  }
}

/**
 * Age, gender, and any future product field explicitly marked sensitive are
 * kept separately from the immutable non-sensitive order snapshot. This lets
 * the same retention deadline erase them without deleting production/audit
 * facts such as the selected story or price.
 */
export async function purgeDueSensitivePersonalization(
  db: Database,
  { limit = 100 }: { limit?: number } = {},
) {
  const now = new Date()
  const dueItems = await db
    .select({ id: orderItemsTable.id, orderId: orderItemsTable.orderId })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, orderItemsTable.orderId))
    .where(
      and(
        isNotNull(orderItemsTable.sensitivePersonalization),
        isNull(orderItemsTable.sensitivePersonalizationPurgedAt),
        isNotNull(ordersTable.sensitiveDataPurgeAt),
        lte(ordersTable.sensitiveDataPurgeAt, now),
      ),
    )
    .limit(Math.min(Math.max(limit, 1), 100))
  const affectedOrderIds = new Set<string>()
  for (const item of dueItems) {
    const result = await db
      .update(orderItemsTable)
      .set({ sensitivePersonalization: null, sensitivePersonalizationPurgedAt: now })
      .where(and(eq(orderItemsTable.id, item.id), isNotNull(orderItemsTable.sensitivePersonalization)))
      .run()
    if (Number(result.meta.changes ?? 0) === 1) affectedOrderIds.add(item.orderId)
  }
  for (const orderId of affectedOrderIds) await markOrderSensitiveDataPurgedIfComplete(db, orderId, now)
  return dueItems.length
}
