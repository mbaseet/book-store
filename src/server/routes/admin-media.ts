import { Hono } from 'hono'
import { adminMediaUploadRequestSchema } from '@shared/contracts/admin-catalog'
import { createDb } from '../db'
import { errorResponse, hasTrustedOrigin, parseJson } from '../lib/http'
import { checkRateLimit, requestSubject } from '../lib/rate-limit'
import { requireAdmin } from './auth'
import type { Bindings } from '../types'

type AppEnvironment = { Bindings: Bindings }

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function signCloudinaryParameters(env: Bindings, parameters: Record<string, string>) {
  if (!env.CLOUDINARY_API_SECRET) throw new Error('Cloudinary is not configured.')
  const serialized = Object.entries(parameters)
    .filter(([, value]) => value.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  const digest = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(`${serialized}${env.CLOUDINARY_API_SECRET}`),
  )
  return bytesToHex(new Uint8Array(digest))
}

function cloudinaryIsConfigured(env: Bindings) {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
}

/**
 * Catalog media is intentionally public, unlike child photos and payment
 * proofs. This route signs only a constrained, random public ID beneath the
 * catalog namespace; neither a Cloudinary secret nor an arbitrary destination
 * is exposed to the browser.
 */
export const adminMediaRoutes = new Hono<AppEnvironment>()

adminMediaRoutes.post('/admin/media/sign', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const parsed = await parseJson(context, adminMediaUploadRequestSchema)
  if (!parsed.success) return parsed.response
  if (!cloudinaryIsConfigured(context.env)) {
    return errorResponse(context, 500, 'catalog_media_unavailable', 'Catalog media uploads are not configured.')
  }

  const db = createDb(context.env)
  const allowed = await checkRateLimit(db, `${admin.id}:${requestSubject(context.req.raw)}`, 'admin_media_sign', {
    maxAttempts: 100,
    windowMs: 60 * 60 * 1000,
  })
  if (!allowed) return errorResponse(context, 429, 'rate_limited', 'Please wait before uploading another image.')

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const publicId = `storybook-catalog/${parsed.data.kind}/${crypto.randomUUID()}`
  const fields = {
    allowed_formats: 'jpg,jpeg,png,webp',
    overwrite: 'false',
    public_id: publicId,
    timestamp,
  }
  const signature = await signCloudinaryParameters(context.env, fields)
  return context.json({
    upload: {
      publicId,
      endpoint: `https://api.cloudinary.com/v1_1/${encodeURIComponent(context.env.CLOUDINARY_CLOUD_NAME)}/image/upload`,
      fields: { ...fields, api_key: context.env.CLOUDINARY_API_KEY, signature },
    },
  })
})
