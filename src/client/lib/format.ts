import type { Locale } from './api'

export function formatMoney(amountInPiastres: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
  }).format(amountInPiastres / 100)
}

export function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    dateStyle: 'medium',
  }).format(new Date(value))
}

export function orderStatusLabel(status: string, locale: Locale) {
  const english: Record<string, string> = {
    payment_submitted: 'Payment under review',
    payment_confirmed: 'Payment confirmed',
    action_required: 'Action needed',
    payment_rejected: 'Payment needs attention',
    in_production: 'In production',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }
  const arabic: Record<string, string> = {
    payment_submitted: 'جاري مراجعة الدفع',
    payment_confirmed: 'تم تأكيد الدفع',
    action_required: 'مطلوب إجراء',
    payment_rejected: 'تحتاج الدفعة إلى مراجعة',
    in_production: 'قيد التنفيذ',
    shipped: 'تم الشحن',
    delivered: 'تم التسليم',
    cancelled: 'ملغي',
  }
  return (locale === 'ar' ? arabic : english)[status] ?? status
}
