import { describe, expect, it } from 'vitest'
import { calculateOrderPricing } from './pricing'

const product = {
  id: 'cc5e8156-62c7-4ab8-bf3e-319b2d6ec4de',
  slug: 'the-little-explorer',
  title: 'The Little Explorer',
  imageUrl: null,
  basePriceAmount: 50000,
  salePriceAmount: 45000,
  addons: [{ id: 'b80a08cc-d41f-4561-b61a-4b2542fb0ee4', name: 'Gift wrap', priceAmount: 5000 }],
}

describe('calculateOrderPricing', () => {
  it('evaluates the free-shipping threshold after the fixed promo discount', () => {
    const result = calculateOrderPricing({
      cartItems: [
        {
          productId: product.id,
          quantity: 2,
          addonIds: [product.addons[0].id],
        },
      ],
      products: [product],
      promoCode: {
        id: 'a1111111-1111-4111-a111-111111111111',
        code: 'WELCOME100',
        fixedDiscountAmount: 10000,
        minimumSubtotalAmount: null,
        startsAt: null,
        endsAt: null,
        maxRedemptions: null,
        redemptionCount: 0,
        isActive: true,
      },
      governorateShippingFeeAmount: 8500,
      freeShippingThresholdAmount: 95000,
    })

    expect(result.subtotalAmount).toBe(100000)
    expect(result.discountedSubtotalAmount).toBe(90000)
    expect(result.freeShippingApplied).toBe(false)
    expect(result.shippingFeeAmount).toBe(8500)
    expect(result.totalAmount).toBe(98500)
  })
})
