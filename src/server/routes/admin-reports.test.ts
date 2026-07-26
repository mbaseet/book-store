import { describe, expect, it } from 'vitest'
import {
  calculateReportMetrics,
  type ReportItemRow,
  type ReportOrderRow,
} from './admin-reports'

describe('admin report metrics', () => {
  it('separates confirmed, pending, and cancelled values across Cairo calendar days', () => {
    const orders: ReportOrderRow[] = [
      {
        id: 'order-1',
        status: 'payment_confirmed',
        totalAmount: 100,
        shippingFeeAmount: 10,
        promoCode: 'WELCOME',
        promoDiscountAmount: 20,
        governorateName: 'Cairo',
        createdAt: new Date('2026-07-18T12:00:00.000Z'),
      },
      {
        id: 'order-2',
        status: 'payment_submitted',
        totalAmount: 80,
        shippingFeeAmount: 20,
        promoCode: null,
        promoDiscountAmount: 0,
        governorateName: 'Cairo',
        createdAt: new Date('2026-07-18T14:00:00.000Z'),
      },
      {
        id: 'order-3',
        status: 'cancelled',
        totalAmount: 60,
        shippingFeeAmount: 0,
        promoCode: 'WELCOME',
        promoDiscountAmount: 10,
        governorateName: 'Giza',
        createdAt: new Date('2026-07-19T10:00:00.000Z'),
      },
      {
        id: 'order-4',
        status: 'in_production',
        totalAmount: 120,
        shippingFeeAmount: 10,
        promoCode: null,
        promoDiscountAmount: 0,
        governorateName: 'Giza',
        createdAt: new Date('2026-07-19T11:00:00.000Z'),
      },
    ]
    const items: ReportItemRow[] = [
      { orderId: 'order-1', productId: 'story-a', productTitle: 'Story A', quantity: 1, lineTotalAmount: 100 },
      { orderId: 'order-2', productId: 'story-a', productTitle: 'Story A', quantity: 2, lineTotalAmount: 80 },
      { orderId: 'order-3', productId: 'story-b', productTitle: 'Story B', quantity: 1, lineTotalAmount: 60 },
      { orderId: 'order-4', productId: 'story-a', productTitle: 'Story A', quantity: 1, lineTotalAmount: 120 },
    ]

    const report = calculateReportMetrics(orders, items, { from: '2026-07-18', to: '2026-07-19' })

    expect(report.summary).toMatchObject({
      submittedOrderCount: 4,
      confirmedRevenueAmount: 220,
      pendingPaymentValueAmount: 80,
      rejectedCancelledValueAmount: 60,
      averageOrderValueAmount: 90,
      shippingFeeAmount: 40,
      promoDiscountAmount: 30,
    })
    expect(report.dailyTrend).toEqual([
      { date: '2026-07-18', orderCount: 2, totalAmount: 180, confirmedRevenueAmount: 100 },
      { date: '2026-07-19', orderCount: 2, totalAmount: 180, confirmedRevenueAmount: 120 },
    ])
    expect(report.topStories[0]).toEqual({
      productId: 'story-a',
      productTitle: 'Story A',
      quantity: 4,
      orderCount: 3,
      confirmedRevenueAmount: 220,
    })
    expect(report.promoPerformance).toEqual([
      { code: 'WELCOME', redemptions: 2, discountAmount: 30, orderValueAmount: 160 },
    ])
    expect(report.governorates.find((row) => row.governorateName === 'Cairo')).toEqual({
      governorateName: 'Cairo',
      orderCount: 2,
      totalAmount: 180,
      shippingFeeAmount: 30,
    })
  })
})
