import type { OrderStatus } from '@shared/constants'

export const allowedNextStatuses: Record<OrderStatus, readonly OrderStatus[]> = {
  in_review: ['confirmed', 'cancelled'],
  cod_pending_confirmation: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'preparing_order', 'cancelled'],
  in_production: ['ready_to_ship', 'cancelled'],
  preparing_order: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus, hasPersonalizedItems?: boolean) {
  if (to === 'in_production' && hasPersonalizedItems === false) return false
  if (to === 'preparing_order' && hasPersonalizedItems === true) return false
  return allowedNextStatuses[from]?.includes(to) ?? false
}

export function isTerminalOrderStatus(status: OrderStatus) {
  return status === 'delivered' || status === 'cancelled'
}

export function paymentUpdatesForStatus(order: { paymentPlan: string; paymentStatus: string; amountDueNow: number; totalAmount: number; amountPaid: number; amountDueOnDelivery: number }, to: OrderStatus) {
  if (to === 'confirmed') {
    if (order.paymentPlan === 'cash_on_delivery') return { paymentStatus: 'cod_due', amountPaid: 0, amountDueOnDelivery: order.amountDueOnDelivery }
    return { paymentStatus: order.paymentPlan === 'personalized_deposit_cod' ? 'deposit_confirmed' : 'paid', amountPaid: order.amountDueNow, amountDueOnDelivery: order.amountDueOnDelivery }
  }
  if (to === 'delivered' && order.amountDueOnDelivery > 0) return { paymentStatus: 'cash_collected', amountPaid: order.amountPaid + order.amountDueOnDelivery, amountDueOnDelivery: 0 }
  return { paymentStatus: order.paymentStatus, amountPaid: order.amountPaid, amountDueOnDelivery: order.amountDueOnDelivery }
}

export function purchasedItemIsPersonalized(item: { personalizationSnapshot: string | null; childName: string | null; storyLanguage?: string | null }) {
  return Boolean(item.personalizationSnapshot || item.childName || item.storyLanguage)
}
