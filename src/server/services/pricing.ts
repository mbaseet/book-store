import type { OrderItemInput } from '@shared/contracts/checkout'
import type { PaymentMethod, PaymentPlan } from '@shared/constants'

export type PriceableAddon = {
  id: string
  name: string
  priceAmount: number
}

export type PriceableProduct = {
  id: string
  slug: string
  title: string
  imageUrl: string | null
  basePriceAmount: number
  salePriceAmount: number | null
  addons: PriceableAddon[]
  /**
   * This is derived by checkout data from the product's current
   * personalization definition. It remains optional while older call sites
   * are migrated; an omitted value is a ready-to-ship product.
   */
  isPersonalized?: boolean
}

export type EligiblePromoCode = {
  id: string
  code: string
  fixedDiscountAmount: number
  minimumSubtotalAmount: number | null
  startsAt: Date | null
  endsAt: Date | null
  maxRedemptions: number | null
  redemptionCount: number
  isActive: boolean
}

export type PriceableCartItem = Pick<OrderItemInput, 'addonIds' | 'productId' | 'quantity'>

export type PricedCartItem = {
  product: PriceableProduct
  selectedAddons: PriceableAddon[]
  baseUnitPriceAmount: number
  saleUnitPriceAmount: number | null
  finalUnitPriceAmount: number
  lineTotalAmount: number
  isPersonalized: boolean
}

// Payment options are shared with the request contracts so pricing cannot
// quietly drift from the checkout API.
export type PricingPaymentMethod = PaymentMethod
export type { PaymentPlan }

export const INSTAPAY_DISCOUNT_CAP_AMOUNT = 3000

export type PaymentEligibility = {
  hasPersonalizedItems: boolean
  hasReadyToShipItems: boolean
  fullUpfront: true
  personalizedDepositCod: boolean
  cashOnDelivery: boolean
}

export type OrderPricing = {
  items: PricedCartItem[]
  subtotalAmount: number
  promoDiscountAmount: number
  discountedSubtotalAmount: number
  shippingFeeAmount: number
  /** The order total after the fixed promo and shipping, before payment incentives. */
  totalBeforePaymentDiscountAmount: number
  /**
   * The 5% full-upfront InstaPay incentive. This intentionally excludes
   * shipping and is always zero for deposits and COD.
   */
  instapayDiscountAmount: number
  totalAmount: number
  freeShippingApplied: boolean
  personalizedSubtotalAmount: number
  readyToShipSubtotalAmount: number
  personalizedPromoDiscountAmount: number
  readyToShipPromoDiscountAmount: number
  personalizedDiscountedSubtotalAmount: number
  readyToShipDiscountedSubtotalAmount: number
  paymentPlan: PaymentPlan
  paymentMethod: PricingPaymentMethod | null
  amountDueNow: number
  amountDueOnDelivery: number
  paymentEligibility: PaymentEligibility
}

export class PricingError extends Error {}

function effectiveProductPrice(product: PriceableProduct) {
  const salePrice = product.salePriceAmount
  if (salePrice === null) return product.basePriceAmount

  if (salePrice < 0 || salePrice > product.basePriceAmount) {
    throw new PricingError(`Product ${product.id} has an invalid sale price.`)
  }

  return salePrice
}

function assertPromoIsEligible(promo: EligiblePromoCode | null, subtotalAmount: number, now: Date) {
  if (promo === null) return null

  if (!promo.isActive) throw new PricingError('This promo code is not active.')
  if (promo.startsAt !== null && promo.startsAt > now) throw new PricingError('This promo code is not active yet.')
  if (promo.endsAt !== null && promo.endsAt < now) throw new PricingError('This promo code has expired.')
  if (promo.maxRedemptions !== null && promo.redemptionCount >= promo.maxRedemptions) {
    throw new PricingError('This promo code has reached its usage limit.')
  }
  if (promo.minimumSubtotalAmount !== null && subtotalAmount < promo.minimumSubtotalAmount) {
    throw new PricingError('This promo code requires a higher cart subtotal.')
  }

  return promo
}

function resolvePaymentChoice({
  paymentPlan,
  paymentMethod,
  hasPersonalizedItems,
}: {
  paymentPlan: PaymentPlan | undefined
  paymentMethod: PricingPaymentMethod | undefined
  hasPersonalizedItems: boolean
}) {
  const resolvedPaymentPlan = paymentPlan ?? (paymentMethod === 'cash_on_delivery' ? 'cash_on_delivery' : 'full_upfront')
  const resolvedPaymentMethod = paymentMethod ?? null

  if (resolvedPaymentPlan === 'personalized_deposit_cod' && !hasPersonalizedItems) {
    throw new PricingError('A deposit is available only when the order includes a personalized product.')
  }
  if (resolvedPaymentPlan === 'cash_on_delivery' && hasPersonalizedItems) {
    throw new PricingError('Personalized products require a deposit or full upfront payment.')
  }

  if (resolvedPaymentPlan === 'cash_on_delivery' && resolvedPaymentMethod !== null && resolvedPaymentMethod !== 'cash_on_delivery') {
    throw new PricingError('Cash on delivery must use the cash-on-delivery payment method.')
  }
  if (
    resolvedPaymentPlan !== 'cash_on_delivery' &&
    resolvedPaymentMethod === 'cash_on_delivery'
  ) {
    throw new PricingError('Cash on delivery cannot be used for this payment plan.')
  }

  return { paymentPlan: resolvedPaymentPlan, paymentMethod: resolvedPaymentMethod }
}

function allocatePromoDiscount({
  promoDiscountAmount,
  subtotalAmount,
  personalizedSubtotalAmount,
}: {
  promoDiscountAmount: number
  subtotalAmount: number
  personalizedSubtotalAmount: number
}) {
  if (promoDiscountAmount === 0 || personalizedSubtotalAmount === 0 || subtotalAmount === 0) return 0

  // Keep all money in integer piastres. The ready-to-ship share receives an
  // unavoidable one-piastre rounding remainder, so the two allocations
  // always sum exactly to the applied fixed promo.
  return Math.floor((promoDiscountAmount * personalizedSubtotalAmount) / subtotalAmount)
}

export function calculateOrderPricing({
  cartItems,
  products,
  promoCode,
  governorateShippingFeeAmount,
  freeShippingThresholdAmount,
  paymentPlan,
  paymentMethod,
  now = new Date(),
}: {
  cartItems: PriceableCartItem[]
  products: PriceableProduct[]
  promoCode: EligiblePromoCode | null
  governorateShippingFeeAmount: number
  freeShippingThresholdAmount: number | null
  paymentPlan?: PaymentPlan
  paymentMethod?: PricingPaymentMethod
  now?: Date
}): OrderPricing {
  if (governorateShippingFeeAmount < 0) {
    throw new PricingError('The shipping fee cannot be negative.')
  }

  const productById = new Map(products.map((product) => [product.id, product]))
  const items = cartItems.map((item) => {
    const product = productById.get(item.productId)
    if (!product) throw new PricingError('One of the selected stories is no longer available.')

    const addonIds = new Set(item.addonIds)
    if (addonIds.size !== item.addonIds.length) {
      throw new PricingError('An add-on cannot be selected more than once.')
    }

    const selectedAddons = item.addonIds.map((addonId) => {
      const addon = product.addons.find((candidate) => candidate.id === addonId)
      if (!addon) throw new PricingError('One of the selected add-ons is no longer available.')
      return addon
    })

    const baseUnitPriceAmount = product.basePriceAmount
    const saleUnitPriceAmount = product.salePriceAmount
    const finalUnitPriceAmount = effectiveProductPrice(product)
    const addonsTotal = selectedAddons.reduce((total, addon) => total + addon.priceAmount, 0)

    return {
      product,
      selectedAddons,
      baseUnitPriceAmount,
      saleUnitPriceAmount,
      finalUnitPriceAmount,
      lineTotalAmount: (finalUnitPriceAmount + addonsTotal) * item.quantity,
      isPersonalized: product.isPersonalized === true,
    }
  })

  const subtotalAmount = items.reduce((total, item) => total + item.lineTotalAmount, 0)
  const promo = assertPromoIsEligible(promoCode, subtotalAmount, now)
  const promoDiscountAmount = promo === null ? 0 : Math.min(promo.fixedDiscountAmount, subtotalAmount)
  const discountedSubtotalAmount = subtotalAmount - promoDiscountAmount
  const personalizedSubtotalAmount = items
    .filter((item) => item.isPersonalized)
    .reduce((total, item) => total + item.lineTotalAmount, 0)
  const readyToShipSubtotalAmount = subtotalAmount - personalizedSubtotalAmount
  const personalizedPromoDiscountAmount = allocatePromoDiscount({
    promoDiscountAmount,
    subtotalAmount,
    personalizedSubtotalAmount,
  })
  const readyToShipPromoDiscountAmount = promoDiscountAmount - personalizedPromoDiscountAmount
  const personalizedDiscountedSubtotalAmount = personalizedSubtotalAmount - personalizedPromoDiscountAmount
  const readyToShipDiscountedSubtotalAmount = readyToShipSubtotalAmount - readyToShipPromoDiscountAmount
  const freeShippingApplied =
    freeShippingThresholdAmount !== null && discountedSubtotalAmount >= freeShippingThresholdAmount
  const shippingFeeAmount = freeShippingApplied ? 0 : governorateShippingFeeAmount
  const totalBeforePaymentDiscountAmount = discountedSubtotalAmount + shippingFeeAmount
  const paymentEligibility: PaymentEligibility = {
    hasPersonalizedItems: items.some((item) => item.isPersonalized),
    hasReadyToShipItems: items.some((item) => !item.isPersonalized),
    fullUpfront: true,
    personalizedDepositCod: items.some((item) => item.isPersonalized),
    cashOnDelivery: !items.some((item) => item.isPersonalized),
  }
  const payment = resolvePaymentChoice({
    paymentPlan,
    paymentMethod,
    hasPersonalizedItems: paymentEligibility.hasPersonalizedItems,
  })
  const instapayDiscountAmount =
    payment.paymentPlan === 'full_upfront' && payment.paymentMethod === 'instapay'
      ? Math.min(Math.floor(discountedSubtotalAmount / 20), INSTAPAY_DISCOUNT_CAP_AMOUNT)
      : 0
  const totalAmount = totalBeforePaymentDiscountAmount - instapayDiscountAmount
  const amountDueNow =
    payment.paymentPlan === 'personalized_deposit_cod'
      ? Math.ceil(personalizedDiscountedSubtotalAmount / 2)
      : payment.paymentPlan === 'cash_on_delivery'
        ? 0
        : totalAmount
  const amountDueOnDelivery = totalAmount - amountDueNow

  return {
    items,
    subtotalAmount,
    promoDiscountAmount,
    discountedSubtotalAmount,
    shippingFeeAmount,
    totalBeforePaymentDiscountAmount,
    instapayDiscountAmount,
    totalAmount,
    freeShippingApplied,
    personalizedSubtotalAmount,
    readyToShipSubtotalAmount,
    personalizedPromoDiscountAmount,
    readyToShipPromoDiscountAmount,
    personalizedDiscountedSubtotalAmount,
    readyToShipDiscountedSubtotalAmount,
    paymentPlan: payment.paymentPlan,
    paymentMethod: payment.paymentMethod,
    amountDueNow,
    amountDueOnDelivery,
    paymentEligibility,
  }
}
