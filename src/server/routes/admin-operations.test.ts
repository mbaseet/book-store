import { describe, expect, it } from 'vitest'
import { isGovernorateId } from './admin-operations'

describe('governorate route IDs', () => {
  it('accepts seeded opaque governorate IDs as well as UUIDs', () => {
    expect(isGovernorateId('gov-cairo')).toBe(true)
    expect(isGovernorateId('gov-beni-suef')).toBe(true)
    expect(isGovernorateId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('rejects malformed route parameters', () => {
    expect(isGovernorateId('')).toBe(false)
    expect(isGovernorateId('gov/cairo')).toBe(false)
    expect(isGovernorateId(' gov-cairo')).toBe(false)
  })
})
