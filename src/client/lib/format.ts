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
    in_review: 'In review',
    confirmed: 'Confirmed',
    preparing_order: 'Preparing order',
    ready_to_ship: 'Ready to ship',
    payment_submitted: 'Payment under review',
    payment_confirmed: 'Payment confirmed',
    action_required: 'Action needed',
    payment_rejected: 'Payment needs attention',
    cod_pending_confirmation: 'Waiting COD confirmation',
    in_production: 'In production',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }
  const arabic: Record<string, string> = {
    in_review: 'قيد المراجعة',
    confirmed: 'تم التأكيد',
    preparing_order: 'جاري تجهيز الطلب',
    ready_to_ship: 'جاهز للشحن',
    payment_submitted: 'جاري مراجعة الدفع',
    payment_confirmed: 'تم تأكيد الدفع',
    action_required: 'مطلوب إجراء',
    payment_rejected: 'تحتاج الدفعة إلى مراجعة',
    cod_pending_confirmation: 'بانتظار تأكيد الدفع عند الاستلام',
    in_production: 'قيد التنفيذ',
    shipped: 'تم الشحن',
    delivered: 'تم التسليم',
    cancelled: 'ملغي',
  }
  return (locale === 'ar' ? arabic : english)[status] ?? status
}
