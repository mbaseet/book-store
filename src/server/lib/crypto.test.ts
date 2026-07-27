import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PASSWORD_HASH_ITERATIONS,
  hashPassword,
  passwordHashIterations,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from './crypto'

describe('password hashing configuration', () => {
  it('keeps the production default when no override is configured', () => {
    expect(passwordHashIterations(undefined)).toBe(DEFAULT_PASSWORD_HASH_ITERATIONS)
  })

  it('accepts the temporary staging floor and rejects malformed values', () => {
    expect(passwordHashIterations('5000')).toBe(5000)
    expect(() => passwordHashIterations('4999')).toThrow()
    expect(() => passwordHashIterations('5000ms')).toThrow()
  })

  it('verifies a staging hash and identifies it for a later work-factor upgrade', async () => {
    const stored = await hashPassword('staging-only-test-password', 5000)
    await expect(verifyPassword('staging-only-test-password', stored)).resolves.toBe(true)
    await expect(verifyPassword('wrong-password', stored)).resolves.toBe(false)
    expect(passwordHashNeedsUpgrade(stored, DEFAULT_PASSWORD_HASH_ITERATIONS)).toBe(true)
  })
})
