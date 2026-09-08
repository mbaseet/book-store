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

const personalizedProduct = {
  ...product,
  id: '745b6ca0-09ed-4a8f-9bfb-5f0f607c86c1',
  isPersonalized: true,
}

const readyToShipProduct = {
  ...product,
  id: 'a370ea20-680f-4f6c-a3ce-4e5478dfba96',
  basePriceAmount: 50000,
  salePriceAmount: null,
  addons: [],
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
    expect(result.paymentPlan).toBe('full_upfront')
    expect(result.amountDueNow).toBe(98500)
    expect(result.amountDueOnDelivery).toBe(0)
  })

  it('allocates a fixed promo proportionally before calculating a personalized deposit', () => {
    const result = calculateOrderPricing({
      cartItems: [
        { productId: personalizedProduct.id, quantity: 1, addonIds: [] },
        { productId: readyToShipProduct.id, quantity: 1, addonIds: [] },
      ],
      products: [personalizedProduct, readyToShipProduct],
      promoCode: {
        id: '4eebd9f6-89ec-47c7-9024-e350c6bd54a0',
        code: 'SAVE10001',
        fixedDiscountAmount: 10001,
        minimumSubtotalAmount: null,
        startsAt: null,
        endsAt: null,
        maxRedemptions: null,
        redemptionCount: 0,
        isActive: true,
      },
      governorateShippingFeeAmount: 8500,
      freeShippingThresholdAmount: null,
      paymentPlan: 'personalized_deposit_cod',
      paymentMethod: 'instapay',
    })

    expect(result.personalizedSubtotalAmount).toBe(45000)
    expect(result.readyToShipSubtotalAmount).toBe(50000)
    expect(result.personalizedPromoDiscountAmount).toBe(4737)
    expect(result.readyToShipPromoDiscountAmount).toBe(5264)
    expect(result.personalizedDiscountedSubtotalAmount).toBe(40263)
    expect(result.readyToShipDiscountedSubtotalAmount).toBe(44736)
    expect(result.instapayDiscountAmount).toBe(0)
    expect(result.totalAmount).toBe(93499)
    expect(result.amountDueNow).toBe(20132)
    expect(result.amountDueOnDelivery).toBe(73367)
  })

  it('rounds an odd personalized deposit up to the next piastre', () => {
    const oddPersonalizedProduct = {
      ...personalizedProduct,
      basePriceAmount: 50001,
      salePriceAmount: null,
    }
    const result = calculateOrderPricing({
      cartItems: [{ productId: oddPersonalizedProduct.id, quantity: 1, addonIds: [] }],
      products: [oddPersonalizedProduct],
      promoCode: null,
      governorateShippingFeeAmount: 8500,
      freeShippingThresholdAmount: null,
      paymentPlan: 'personalized_deposit_cod',
      paymentMethod: 'mobile_wallet',
    })

    expect(result.amountDueNow).toBe(25001)
    expect(result.amountDueOnDelivery).toBe(33500)
    expect(result.amountDueNow + result.amountDueOnDelivery).toBe(result.totalAmount)
  })

  it('applies the capped, floor-rounded InstaPay incentive to full upfront merchandise only', () => {
    const instapayProduct = {
      ...readyToShipProduct,
      basePriceAmount: 10019,
    }
    const result = calculateOrderPricing({
      cartItems: [{ productId: instapayProduct.id, quantity: 1, addonIds: [] }],
      products: [instapayProduct],
      promoCode: null,
      governorateShippingFeeAmount: 8500,
      freeShippingThresholdAmount: null,
      paymentPlan: 'full_upfront',
      paymentMethod: 'instapay',
    })

    expect(result.totalBeforePaymentDiscountAmount).toBe(18519)
    expect(result.instapayDiscountAmount).toBe(500)
    expect(result.totalAmount).toBe(18019)
    expect(result.amountDueNow).toBe(18019)
    expect(result.amountDueOnDelivery).toBe(0)

    const cappedResult = calculateOrderPricing({
      cartItems: [{ productId: readyToShipProduct.id, quantity: 2, addonIds: [] }],
      products: [readyToShipProduct],
      promoCode: null,
      governorateShippingFeeAmount: 0,
      freeShippingThresholdAmount: null,
      paymentPlan: 'full_upfront',
      paymentMethod: 'instapay',
    })
    expect(cappedResult.instapayDiscountAmount).toBe(3000)

    const mobileWalletResult = calculateOrderPricing({
      cartItems: [{ productId: instapayProduct.id, quantity: 1, addonIds: [] }],
      products: [instapayProduct],
      promoCode: null,
      governorateShippingFeeAmount: 8500,
      freeShippingThresholdAmount: null,
      paymentPlan: 'full_upfront',
      paymentMethod: 'mobile_wallet',
    })
    expect(mobileWalletResult.instapayDiscountAmount).toBe(0)
    expect(mobileWalletResult.totalAmount).toBe(mobileWalletResult.totalBeforePaymentDiscountAmount)
  })

  it('limits payment plans to the product types they support', () => {
    expect(() =>
      calculateOrderPricing({
        cartItems: [{ productId: personalizedProduct.id, quantity: 1, addonIds: [] }],
        products: [personalizedProduct],
        promoCode: null,
        governorateShippingFeeAmount: 0,
        freeShippingThresholdAmount: null,
        paymentPlan: 'cash_on_delivery',
        paymentMethod: 'cash_on_delivery',
      }),
    ).toThrow('Personalized products require a deposit or full upfront payment.')

    expect(() =>
      calculateOrderPricing({
        cartItems: [{ productId: readyToShipProduct.id, quantity: 1, addonIds: [] }],
        products: [readyToShipProduct],
        promoCode: null,
        governorateShippingFeeAmount: 0,
        freeShippingThresholdAmount: null,
        paymentPlan: 'personalized_deposit_cod',
        paymentMethod: 'instapay',
      }),
    ).toThrow('A deposit is available only when the order includes a personalized product.')
  })
})
