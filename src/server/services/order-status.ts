import type { OrderStatus } from '@shared/constants'

const allowedNextStatuses: Record<OrderStatus, readonly OrderStatus[]> = {
  payment_submitted: ['payment_confirmed', 'action_required', 'payment_rejected', 'cancelled'],
  action_required: ['payment_submitted', 'payment_confirmed', 'payment_rejected', 'cancelled'],
  payment_rejected: ['payment_submitted', 'cancelled'],
  payment_confirmed: ['in_production', 'cancelled'],
  in_production: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus) {
  return allowedNextStatuses[from].includes(to)
}

export function isTerminalOrderStatus(status: OrderStatus) {
  return status === 'delivered' || status === 'cancelled'
}
