import { createHash } from 'node:crypto'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 30_000
const SYNTHETIC_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlX5FQAAAAASUVORK5CYII=',
  'base64',
)

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value || value.startsWith('replace-with-')) {
    throw new Error(`${name} is missing. Populate it in .dev.vars before running this smoke test.`)
  }
  return value
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function apiSignature(parameters, apiSecret) {
  const serialized = Object.entries(parameters)
    .filter(([, value]) => String(value).length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  return createHash('sha1').update(`${serialized}${apiSecret}`).digest('hex')
}

function deliverySignature(path, apiSecret) {
  return createHash('sha1').update(`${path}${apiSecret}`).digest('base64url').slice(0, 8)
}

function encodedPublicId(publicId) {
  return publicId.split('/').map(encodeURIComponent).join('/')
}

async function request(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

async function responseJson(response) {
  return response.json().catch(() => null)
}

function responseError(response, payload, action) {
  const cloudinaryMessage =
    isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string'
      ? `: ${payload.error.message}`
      : ''
  return new Error(`${action} failed with HTTP ${response.status}${cloudinaryMessage}`)
}

async function getAuthenticatedResource({ cloudName, apiKey, apiSecret, publicId }) {
  const authorization = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const endpoint =
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}` +
    `/resources/image/authenticated/${encodeURIComponent(publicId)}`
  const response = await request(endpoint, {
    headers: { Authorization: `Basic ${authorization}` },
  })
  const payload = await responseJson(response)
  if (!response.ok) throw responseError(response, payload, 'Authenticated resource lookup')
  return payload
}

async function destroyAuthenticatedResource({ cloudName, apiKey, apiSecret, publicId }) {
  const parameters = {
    invalidate: 'true',
    public_id: publicId,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    type: 'authenticated',
  }
  const body = new URLSearchParams({
    ...parameters,
    api_key: apiKey,
    signature: apiSignature(parameters, apiSecret),
  })
  const response = await request(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  )
  const payload = await responseJson(response)
  if (
    !response.ok ||
    !isRecord(payload) ||
    (payload.result !== 'ok' && payload.result !== 'not found')
  ) {
    throw responseError(response, payload, 'Cloudinary cleanup')
  }
}

async function main() {
  const cloudName = requiredEnvironment('CLOUDINARY_CLOUD_NAME')
  const apiKey = requiredEnvironment('CLOUDINARY_API_KEY')
  const apiSecret = requiredEnvironment('CLOUDINARY_API_SECRET')
  const baseUrl = new URL(process.env.SMOKE_BASE_URL?.trim() || 'http://127.0.0.1:5173')

  let publicId = null
  let uploaded = false
  let failure = null
  let cleanupFailure = null

  try {
    const signResponse = await request(new URL('/api/uploads/sign', baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: baseUrl.origin,
      },
      body: JSON.stringify({
        kind: 'payment_proof',
        mimeType: 'image/png',
        byteSize: SYNTHETIC_PNG.byteLength,
      }),
    })
    const signPayload = await responseJson(signResponse)
    if (!signResponse.ok) throw responseError(signResponse, signPayload, 'Worker upload signing')

    assert(isRecord(signPayload) && isRecord(signPayload.upload), 'Worker returned an invalid signing payload.')
    const signed = signPayload.upload
    assert(isRecord(signed.upload) && isRecord(signed.upload.fields), 'Worker returned invalid upload fields.')
    assert(
      signed.upload.endpoint ===
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      'Worker returned an unexpected Cloudinary upload endpoint.',
    )
    assert(signed.upload.fields.type === 'authenticated', 'Upload is not constrained to authenticated delivery.')
    assert(signed.upload.fields.overwrite === 'false', 'Upload does not disable overwrite.')
    assert(signed.upload.fields.backup === 'false', 'Private upload does not disable Cloudinary backups.')
    assert(
      signed.upload.fields.discard_original_filename === 'true',
      'Private upload does not discard the original filename.',
    )
    assert(
      signed.upload.fields.transformation === 'fl_force_strip',
      'Private upload does not strip embedded image metadata.',
    )
    assert(
      typeof signed.upload.fields.public_id === 'string' &&
        signed.upload.fields.public_id.startsWith('storybook-private/'),
      'Worker returned an invalid private-media namespace.',
    )
    assert(!JSON.stringify(signPayload).includes(apiSecret), 'Worker response exposed the Cloudinary API secret.')

    publicId = signed.upload.fields.public_id
    const formData = new FormData()
    for (const [key, value] of Object.entries(signed.upload.fields)) {
      assert(typeof value === 'string', `Upload field ${key} is not a string.`)
      formData.set(key, value)
    }
    formData.set('file', new Blob([SYNTHETIC_PNG], { type: 'image/png' }), 'mint-meow-smoke.png')

    const uploadResponse = await request(signed.upload.endpoint, {
      method: 'POST',
      body: formData,
    })
    const uploadPayload = await responseJson(uploadResponse)
    if (!uploadResponse.ok) throw responseError(uploadResponse, uploadPayload, 'Cloudinary upload')
    uploaded = true

    assert(isRecord(uploadPayload), 'Cloudinary returned an invalid upload response.')
    assert(uploadPayload.public_id === publicId, 'Cloudinary returned a different public ID.')
    assert(uploadPayload.resource_type === 'image', 'Cloudinary did not store an image asset.')
    assert(uploadPayload.type === 'authenticated', 'Cloudinary did not store an authenticated asset.')
    assert(uploadPayload.format === 'png', 'Cloudinary did not preserve the expected PNG format.')
    assert(
      typeof uploadPayload.bytes === 'number' &&
        uploadPayload.bytes > 0 &&
        uploadPayload.bytes <= MAX_IMAGE_BYTES,
      'Cloudinary returned an invalid asset size.',
    )

    const resource = await getAuthenticatedResource({ cloudName, apiKey, apiSecret, publicId })
    assert(isRecord(resource) && resource.public_id === publicId, 'Admin API returned a different public ID.')
    assert(resource.type === 'authenticated', 'Admin API did not confirm authenticated delivery.')

    const deliveryPath = `${encodedPublicId(publicId)}.${encodeURIComponent(uploadPayload.format)}`
    const unsignedUrls = [
      `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/authenticated/${deliveryPath}`,
      `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/${deliveryPath}`,
    ]
    for (const unsignedUrl of unsignedUrls) {
      const response = await request(`${unsignedUrl}?mint_meow_smoke=${Date.now()}`, {
        redirect: 'manual',
      })
      assert(!response.ok, 'An unsigned Cloudinary delivery URL exposed the private test asset.')
    }

    const signature = deliverySignature(deliveryPath, apiSecret)
    const signedUrl =
      `https://res.cloudinary.com/${encodeURIComponent(cloudName)}` +
      `/image/authenticated/s--${signature}--/${deliveryPath}`
    const deliveryResponse = await request(signedUrl)
    assert(deliveryResponse.ok, `Signed Cloudinary delivery failed with HTTP ${deliveryResponse.status}.`)
    assert(
      deliveryResponse.headers.get('content-type')?.startsWith('image/'),
      'Signed Cloudinary delivery did not return an image.',
    )

    console.log('Cloudinary authenticated-media smoke test passed.')
    console.log('- Worker signing constraints: passed')
    console.log('- Authenticated upload and Admin API verification: passed')
    console.log('- Unsigned delivery denial: passed')
    console.log('- Signed delivery: passed')
  } catch (error) {
    failure = error
  }

  if (uploaded && publicId) {
    try {
      await destroyAuthenticatedResource({ cloudName, apiKey, apiSecret, publicId })
      console.log('- Test asset cleanup: passed')
    } catch (error) {
      cleanupFailure = error
    }
  }

  if (cleanupFailure) {
    console.error(`Automatic cleanup failed. Delete this synthetic asset manually: ${publicId}`)
    if (!failure) failure = cleanupFailure
  }
  if (failure) throw failure
}

main().catch((error) => {
  console.error(`Cloudinary smoke test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  process.exitCode = 1
})
