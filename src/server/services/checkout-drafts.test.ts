import { describe, expect, it } from 'vitest'
import { shouldPromoteExpiredCheckoutDraft } from './checkout-drafts'

describe('expired checkout draft recovery eligibility', () => {
  it('never promotes a source draft atomically marked consumed with an order', () => {
    const now = new Date('2026-07-31T12:00:00.000Z')
    expect(
      shouldPromoteExpiredCheckoutDraft(
        { expiresAt: new Date('2026-07-31T11:00:00.000Z'), consumedAt: null },
        now,
      ),
    ).toBe(true)
    expect(
      shouldPromoteExpiredCheckoutDraft(
        {
          expiresAt: new Date('2026-07-31T11:00:00.000Z'),
          consumedAt: new Date('2026-07-31T11:30:00.000Z'),
        },
        now,
      ),
    ).toBe(false)
  })
})
