export const STOREFRONT_LOCALES = ['ar', 'en'] as const
export type StorefrontLocale = (typeof STOREFRONT_LOCALES)[number]

export const STORY_LANGUAGES = ['ar_msa', 'ar_eg', 'en'] as const
export type StoryLanguage = (typeof STORY_LANGUAGES)[number]

export const ORDER_STATUSES = [
  'payment_submitted',
  'payment_confirmed',
  'action_required',
  'payment_rejected',
  'in_production',
  'shipped',
  'delivered',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_METHODS = ['instapay', 'mobile_wallet'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const CURRENCY = 'EGP'
export const DEFAULT_GOVERNORATE_SHIPPING_FEE = 8500
