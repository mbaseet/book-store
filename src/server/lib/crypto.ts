const PBKDF2_ITERATIONS = 150_000
const SALT_BYTES = 16
const HASH_BITS = 256

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string) {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid hexadecimal value.')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    // Make a fresh ArrayBuffer-backed view. TypeScript's WebCrypto definitions
    // correctly reject a view that could point at a SharedArrayBuffer.
    { name: 'PBKDF2', salt: Uint8Array.from(salt), iterations, hash: 'SHA-256' },
    keyMaterial,
    HASH_BITS,
  )
  return new Uint8Array(derived)
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false

  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`
}

export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false

  const iterations = Number.parseInt(parts[1], 10)
  if (!Number.isSafeInteger(iterations) || iterations < 100_000) return false

  try {
    const salt = hexToBytes(parts[2])
    const expected = hexToBytes(parts[3])
    const actual = await derivePasswordHash(password, salt, iterations)
    return constantTimeEqual(actual, expected)
  } catch {
    return false
  }
}

export function createOpaqueToken(byteLength = 32) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return bytesToHex(new Uint8Array(digest))
}
