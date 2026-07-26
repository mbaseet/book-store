import { Hono } from 'hono'
import { privateUploadRequestSchema } from '@shared/contracts/checkout'
import { createDb } from '../db'
import { errorResponse, hasTrustedOrigin, parseJson } from '../lib/http'
import { checkRateLimit, requestSubject } from '../lib/rate-limit'
import { initiatePrivateUpload, PrivateUploadError } from '../services/private-uploads'
import type { Bindings } from '../types'

type AppEnvironment = { Bindings: Bindings }

export const uploadRoutes = new Hono<AppEnvironment>()

/**
 * The browser uploads directly to Cloudinary using a one-use, short-lived
 * signature. This API intentionally returns no image URL.
 */
uploadRoutes.post('/uploads/sign', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const parsed = await parseJson(context, privateUploadRequestSchema)
  if (!parsed.success) return parsed.response

  const db = createDb(context.env)
  const allowed = await checkRateLimit(db, requestSubject(context.req.raw), 'private_upload_sign', {
    maxAttempts: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!allowed) return errorResponse(context, 429, 'rate_limited', 'Please wait before uploading another image.')

  try {
    const upload = await initiatePrivateUpload(db, context.env, parsed.data)
    return context.json({ upload }, 201)
  } catch (error) {
    if (error instanceof PrivateUploadError) {
      return errorResponse(context, 500, 'private_upload_unavailable', error.message)
    }
    return errorResponse(context, 500, 'private_upload_unavailable', 'Private uploads are temporarily unavailable.')
  }
})
