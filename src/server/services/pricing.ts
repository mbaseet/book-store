import type { OrderItemInput } from '@shared/contracts/checkout'

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
}

export type OrderPricing = {
  items: PricedCartItem[]
  subtotalAmount: number
  promoDiscountAmount: number
  discountedSubtotalAmount: number
  shippingFeeAmount: number
  totalAmount: number
  freeShippingApplied: boolean
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

export function calculateOrderPricing({
  cartItems,
  products,
  promoCode,
  governorateShippingFeeAmount,
  freeShippingThresholdAmount,
  now = new Date(),
}: {
  cartItems: PriceableCartItem[]
  products: PriceableProduct[]
  promoCode: EligiblePromoCode | null
  governorateShippingFeeAmount: number
  freeShippingThresholdAmount: number | null
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
    }
  })

  const subtotalAmount = items.reduce((total, item) => total + item.lineTotalAmount, 0)
  const promo = assertPromoIsEligible(promoCode, subtotalAmount, now)
  const promoDiscountAmount = promo === null ? 0 : Math.min(promo.fixedDiscountAmount, subtotalAmount)
  const discountedSubtotalAmount = subtotalAmount - promoDiscountAmount
  const freeShippingApplied =
    freeShippingThresholdAmount !== null && discountedSubtotalAmount >= freeShippingThresholdAmount
  const shippingFeeAmount = freeShippingApplied ? 0 : governorateShippingFeeAmount

  return {
    items,
    subtotalAmount,
    promoDiscountAmount,
    discountedSubtotalAmount,
    shippingFeeAmount,
    totalAmount: discountedSubtotalAmount + shippingFeeAmount,
    freeShippingApplied,
  }
}
