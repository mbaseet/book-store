import { describe, expect, it } from 'vitest'
import {
  recoveryLeadListQuerySchema,
  recoveryLeadStateUpdateSchema,
} from './recovery'

describe('recovery contracts', () => {
  it('allows staff workflow states but reserves converted for order matching', () => {
    expect(recoveryLeadStateUpdateSchema.safeParse({ state: 'contacted' }).success).toBe(true)
    expect(recoveryLeadStateUpdateSchema.safeParse({ state: 'converted' }).success).toBe(false)
  })

  it('validates inclusive list filters and their date order', () => {
    expect(recoveryLeadListQuerySchema.safeParse({ state: 'all', from: '2026-07-01', to: '2026-07-31' }).success).toBe(true)
    expect(recoveryLeadListQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false)
    expect(recoveryLeadListQuerySchema.safeParse({ from: '2026-07-31', to: '2026-07-01' }).success).toBe(false)
  })
})
