import { describe, expect, it } from 'vitest'
import { canTransitionOrderStatus, isTerminalOrderStatus } from './order-status'

describe('order status transitions', () => {
  it('only permits the operational lifecycle', () => {
    expect(canTransitionOrderStatus('payment_submitted', 'payment_confirmed')).toBe(true)
    expect(canTransitionOrderStatus('payment_submitted', 'shipped')).toBe(false)
    expect(canTransitionOrderStatus('shipped', 'delivered')).toBe(true)
    expect(canTransitionOrderStatus('delivered', 'shipped')).toBe(false)
  })

  it('treats delivery and cancellation as terminal for sensitive-data retention', () => {
    expect(isTerminalOrderStatus('delivered')).toBe(true)
    expect(isTerminalOrderStatus('cancelled')).toBe(true)
    expect(isTerminalOrderStatus('in_production')).toBe(false)
  })
})
