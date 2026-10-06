const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const decode = (text: string) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
async function key(secret: string) {
  if (!secret) throw new Error('Private payload secret is missing.')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`mint-meow:notifications:v1:${secret}`))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function sealPayload(secret: string, payload: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), new TextEncoder().encode(JSON.stringify(payload)))
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`
}
export async function openPayload(secret: string, payload: string): Promise<unknown> {
  const [iv, ciphertext] = payload.split('.')
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, await key(secret), decode(ciphertext))
  return JSON.parse(new TextDecoder().decode(bytes))
}
