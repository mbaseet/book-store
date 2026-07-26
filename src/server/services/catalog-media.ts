import type { Bindings } from '../types'

export class CatalogMediaError extends Error {
  constructor(message = 'Catalog media could not be removed.') {
    super(message)
    this.name = 'CatalogMediaError'
  }
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function configured(env: Bindings) {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
}

async function signature(env: Bindings, parameters: Record<string, string>) {
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

function isSuccessfulDestroy(payload: unknown) {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload) &&
    ((payload as Record<string, unknown>).result === 'ok' || (payload as Record<string, unknown>).result === 'not found')
}

async function destroyCatalogAsset(env: Bindings, publicId: string) {
  if (!configured(env)) throw new CatalogMediaError('Catalog media cleanup is not configured.')
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const parameters = { invalidate: 'true', public_id: publicId, timestamp }
  const body = new URLSearchParams({
    ...parameters,
    api_key: env.CLOUDINARY_API_KEY,
    signature: await signature(env, parameters),
  })
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  )
  if (!response.ok || !isSuccessfulDestroy(await response.json().catch(() => null))) {
    throw new CatalogMediaError()
  }
}

/** Remove every catalog asset before deleting its database owner. */
export async function destroyCatalogMediaAssets(env: Bindings, publicIds: Array<string | null>) {
  const uniqueIds = [...new Set(publicIds.filter((value): value is string => Boolean(value)))]
  for (const publicId of uniqueIds) await destroyCatalogAsset(env, publicId)
}
