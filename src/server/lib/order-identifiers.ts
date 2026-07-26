export function canonicalPhone(phone: string) {
  return phone.trim().replace(/[-\s().]/g, '')
}

export function createOrderNumber(now = new Date()) {
  const date = [
    now.getUTCFullYear().toString().slice(-2),
    (now.getUTCMonth() + 1).toString().padStart(2, '0'),
    now.getUTCDate().toString().padStart(2, '0'),
  ].join('')
  const random = Array.from(crypto.getRandomValues(new Uint8Array(5)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  )
    .join('')
    .toUpperCase()

  return `SB-${date}-${random}`
}
