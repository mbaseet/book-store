import { describe, expect, it } from 'vitest'
import { ORDER_STATUSES } from '@shared/constants'
import { canTransitionOrderStatus, isTerminalOrderStatus, paymentUpdatesForStatus } from './order-status'

describe('order lifecycle', () => {
  it('requires confirmation and the appropriate preparation stage', () => {
    expect(canTransitionOrderStatus('in_review', 'confirmed')).toBe(true)
    expect(canTransitionOrderStatus('cod_pending_confirmation', 'confirmed')).toBe(true)
    expect(canTransitionOrderStatus('cod_pending_confirmation', 'in_production')).toBe(false)
    expect(canTransitionOrderStatus('confirmed', 'preparing_order', false)).toBe(true)
    expect(canTransitionOrderStatus('confirmed', 'in_production', true)).toBe(true)
    expect(canTransitionOrderStatus('confirmed', 'preparing_order', true)).toBe(false)
    expect(canTransitionOrderStatus('confirmed', 'in_production', false)).toBe(false)
    expect(canTransitionOrderStatus('in_production', 'shipped')).toBe(false)
    expect(canTransitionOrderStatus('in_production', 'ready_to_ship')).toBe(true)
    expect(canTransitionOrderStatus('preparing_order', 'ready_to_ship')).toBe(true)
    expect(canTransitionOrderStatus('ready_to_ship', 'shipped')).toBe(true)
    expect(canTransitionOrderStatus('shipped', 'delivered')).toBe(true)
  })
  it('allows cancelling undelivered orders, and never reopens a terminal state', () => {
    for (const status of ORDER_STATUSES) {
      if (!isTerminalOrderStatus(status)) expect(canTransitionOrderStatus(status, 'cancelled')).toBe(true)
      expect(canTransitionOrderStatus('delivered', status)).toBe(false)
      expect(canTransitionOrderStatus('cancelled', status)).toBe(false)
    }
  })
  const order = { paymentPlan: 'personalized_deposit_cod', paymentStatus: 'deposit_submitted', amountDueNow: 5000, totalAmount: 12000, amountPaid: 0, amountDueOnDelivery: 7000 }
  it('records only the verified deposit at confirmation, and the balance at delivery', () => {
    const confirmed = paymentUpdatesForStatus(order, 'confirmed')
    expect(confirmed).toEqual({ paymentStatus: 'deposit_confirmed', amountPaid: 5000, amountDueOnDelivery: 7000 })
    const delivered = paymentUpdatesForStatus({ ...order, ...confirmed }, 'delivered')
    expect(delivered).toEqual({ paymentStatus: 'cash_collected', amountPaid: 12000, amountDueOnDelivery: 0 })
    expect(paymentUpdatesForStatus({ ...order, ...delivered }, 'delivered')).toEqual(delivered)
  })
  it('confirmation of COD never records uncollected money', () => {
    expect(paymentUpdatesForStatus({ ...order, paymentPlan: 'cash_on_delivery', amountDueNow: 0, amountDueOnDelivery: 12000 }, 'confirmed')).toEqual({ paymentStatus: 'cod_due', amountPaid: 0, amountDueOnDelivery: 12000 })
  })
  it('cancellation preserves actual payments for refund handling', () => {
    expect(paymentUpdatesForStatus({ ...order, amountPaid: 5000, paymentStatus: 'deposit_confirmed' }, 'cancelled').amountPaid).toBe(5000)
  })
})
