import { describe, expect, it } from 'vitest'
import {
  isAdminPath,
  isTrackingEligiblePath,
  forceCleanDocumentForSensitiveRoute,
  sanitizeCommerceEvent,
  trackingPagePath,
} from './tracking'

describe('tracking route safeguards', () => {
  it('never enables tracking on admin or sensitive account/order routes', () => {
    expect(isAdminPath('/admin/orders')).toBe(true)
    expect(isAdminPath('/ar/admin/settings')).toBe(true)
    expect(isTrackingEligiblePath('/admin')).toBe(false)
    expect(isTrackingEligiblePath('/reset-password')).toBe(false)
    expect(isTrackingEligiblePath('/track-order')).toBe(false)
    expect(isTrackingEligiblePath('/order-confirmation/MM-123')).toBe(false)
    expect(isTrackingEligiblePath('/stories')).toBe(true)
  })

  it('uses route templates instead of customer-specific paths', () => {
    expect(trackingPagePath('/ar/stories/my-story')).toBe('/stories/:product')
    expect(trackingPagePath('/order-confirmation/MM-123')).toBe('/order-confirmation')
    expect(trackingPagePath('/ar/checkout')).toBe('/checkout')
    expect(trackingPagePath('/someone@example.com')).toBe('/other')
  })

  it('forces one clean document before sensitive routes only if a vendor loader exists', () => {
    const sensitivePaths = ['/admin', '/account', '/reset-password', '/track-order', '/order-confirmation/MM-123']
    for (const pathname of sensitivePaths) {
      let reloads = 0
      expect(forceCleanDocumentForSensitiveRoute(pathname, true, () => { reloads += 1 })).toBe(true)
      expect(reloads).toBe(1)
    }

    let reloads = 0
    expect(forceCleanDocumentForSensitiveRoute('/admin', false, () => { reloads += 1 })).toBe(false)
    expect(forceCleanDocumentForSensitiveRoute('/stories', true, () => { reloads += 1 })).toBe(false)
    expect(reloads).toBe(0)
  })
})

describe('commerce tracking payloads', () => {
  it('keeps only anonymous catalog and amount data', () => {
    expect(sanitizeCommerceEvent('add_to_cart', {
      items: [{ itemId: 'story-123', quantity: 2, priceAmount: 12500 }],
      valueAmount: 25000,
    })).toEqual({
      name: 'add_to_cart',
      items: [{ itemId: 'story-123', quantity: 2, priceAmount: 12500 }],
      valueAmount: 25000,
    })
  })

  it('allows only a fixed payment-method enum for payment selection', () => {
    expect(sanitizeCommerceEvent('add_payment_info', {
      paymentMethod: 'cash_on_delivery',
      items: [{ itemId: 'story-123', quantity: 1, priceAmount: 12500 }],
    })).toEqual({
      name: 'add_payment_info',
      paymentMethod: 'cash_on_delivery',
      items: [{ itemId: 'story-123', quantity: 1, priceAmount: 12500 }],
      valueAmount: 12500,
    })
    expect(sanitizeCommerceEvent('add_payment_info', {
      paymentMethod: 'bank-transfer' as never,
    })).toBeNull()
  })

  it('rejects malformed catalog data rather than forwarding arbitrary fields', () => {
    expect(sanitizeCommerceEvent('purchase', {
      items: [{ itemId: 'customer@example.com', quantity: 1, priceAmount: 100 }],
    })).toBeNull()
    expect(sanitizeCommerceEvent('view_item', {
      items: [{ itemId: 'story-1', quantity: 0 }],
    })).toBeNull()
  })
})
