import { and, asc, gte, inArray, lt } from 'drizzle-orm'
import { Hono } from 'hono'
import { ORDER_STATUSES } from '@shared/constants'
import { createDb } from '../db'
import { orderItemsTable, ordersTable } from '../db/schema'
import { errorResponse } from '../lib/http'
import { requireAdmin } from './auth'
import type { Bindings } from '../types'

type AppEnvironment = { Bindings: Bindings }

const CAIRO_TIME_ZONE = 'Africa/Cairo'
const CONFIRMED_REVENUE_STATUSES = new Set(['payment_confirmed', 'in_production', 'shipped', 'delivered'])
const PENDING_PAYMENT_STATUSES = new Set(['payment_submitted', 'action_required'])
const REJECTED_CANCELLED_STATUSES = new Set(['payment_rejected', 'cancelled'])
const datePattern = /^\d{4}-\d{2}-\d{2}$/

type ReportRange = {
  preset: 'today' | '7d' | '30d' | '90d' | 'custom'
  from: string
  to: string
  startsAt: Date
  endsAt: Date
}

function cairoDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

function formatCairoDate(date: Date) {
  const parts = cairoDateParts(date)
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const moved = new Date(Date.UTC(year, month - 1, day + days))
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, '0')}-${String(moved.getUTCDate()).padStart(2, '0')}`
}

/** Returns the exact instant that a Cairo calendar day begins, including DST. */
function cairoStartOfDay(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  const targetUtc = Date.UTC(year, month - 1, date)
  let candidate = new Date(targetUtc)
  for (let index = 0; index < 3; index += 1) {
    const local = cairoDateParts(candidate)
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second)
    candidate = new Date(targetUtc - (localAsUtc - candidate.getTime()))
  }
  return candidate
}

function isRealDate(value: string) {
  if (!datePattern.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day
}

function readRange(context: { req: { query(name: string): string | undefined } }): ReportRange | { error: string; path: string[] } {
  const rawPreset = context.req.query('range') ?? '30d'
  if (!['today', '7d', '30d', '90d', 'custom'].includes(rawPreset)) {
    return { error: 'Choose a valid report range.', path: ['range'] }
  }
  const preset = rawPreset as ReportRange['preset']
  if (preset === 'custom') {
    const from = context.req.query('from') ?? ''
    const to = context.req.query('to') ?? ''
    if (!isRealDate(from)) return { error: 'Choose a valid start date.', path: ['from'] }
    if (!isRealDate(to)) return { error: 'Choose a valid end date.', path: ['to'] }
    if (from > to) return { error: 'The end date must be on or after the start date.', path: ['to'] }
    if (addCalendarDays(from, 366) < to) return { error: 'Custom reports can cover up to 366 days.', path: ['to'] }
    return { preset, from, to, startsAt: cairoStartOfDay(from), endsAt: cairoStartOfDay(addCalendarDays(to, 1)) }
  }
  const to = formatCairoDate(new Date())
  const days = preset === 'today' ? 1 : Number.parseInt(preset, 10)
  const from = addCalendarDays(to, -(days - 1))
  return { preset, from, to, startsAt: cairoStartOfDay(from), endsAt: cairoStartOfDay(addCalendarDays(to, 1)) }
}

function sum(rows: Array<{ totalAmount: number }>) {
  return rows.reduce((total, row) => total + row.totalAmount, 0)
}

function daysInRange(from: string, to: string) {
  const dates: string[] = []
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) dates.push(date)
  return dates
}

export type ReportOrderRow = {
  id: string
  status: string
  totalAmount: number
  shippingFeeAmount: number
  promoCode: string | null
  promoDiscountAmount: number
  governorateName: string
  createdAt: Date
}

export type ReportItemRow = {
  orderId: string
  productId: string | null
  productTitle: string
  quantity: number
  lineTotalAmount: number
}

/** Pure aggregation used by the route and regression-tested independently. */
export function calculateReportMetrics(
  orders: ReportOrderRow[],
  items: ReportItemRow[],
  range: Pick<ReportRange, 'from' | 'to'>,
) {
  const confirmedOrders = orders.filter((order) => CONFIRMED_REVENUE_STATUSES.has(order.status))
  const pendingOrders = orders.filter((order) => PENDING_PAYMENT_STATUSES.has(order.status))
  const rejectedCancelledOrders = orders.filter((order) => REJECTED_CANCELLED_STATUSES.has(order.status))
  const allOrderValue = sum(orders)

  const statusMix = ORDER_STATUSES.map((status) => {
    const rows = orders.filter((order) => order.status === status)
    return { status, orderCount: rows.length, totalAmount: sum(rows) }
  })

  const dailyTrend = new Map(
    daysInRange(range.from, range.to).map((date) => [date, { date, orderCount: 0, totalAmount: 0, confirmedRevenueAmount: 0 }]),
  )
  for (const order of orders) {
    const date = formatCairoDate(order.createdAt)
    const row = dailyTrend.get(date)
    if (!row) continue
    row.orderCount += 1
    row.totalAmount += order.totalAmount
    if (CONFIRMED_REVENUE_STATUSES.has(order.status)) row.confirmedRevenueAmount += order.totalAmount
  }

  const orderById = new Map(orders.map((order) => [order.id, order]))
  const stories = new Map<string, { productId: string | null; productTitle: string; quantity: number; orderIds: Set<string>; revenueAmount: number }>()
  for (const item of items) {
    const key = item.productId ?? `snapshot:${item.productTitle}`
    const row = stories.get(key) ?? {
      productId: item.productId,
      productTitle: item.productTitle,
      quantity: 0,
      orderIds: new Set<string>(),
      revenueAmount: 0,
    }
    row.quantity += item.quantity
    row.orderIds.add(item.orderId)
    if (CONFIRMED_REVENUE_STATUSES.has(orderById.get(item.orderId)?.status ?? '')) row.revenueAmount += item.lineTotalAmount
    stories.set(key, row)
  }

  const promos = new Map<string, { code: string; redemptions: number; discountAmount: number; orderValueAmount: number }>()
  const governorates = new Map<string, { governorateName: string; orderCount: number; totalAmount: number; shippingFeeAmount: number }>()
  for (const order of orders) {
    if (order.promoCode) {
      const row = promos.get(order.promoCode) ?? { code: order.promoCode, redemptions: 0, discountAmount: 0, orderValueAmount: 0 }
      row.redemptions += 1
      row.discountAmount += order.promoDiscountAmount
      row.orderValueAmount += order.totalAmount
      promos.set(order.promoCode, row)
    }
    const governorate = governorates.get(order.governorateName) ?? {
      governorateName: order.governorateName,
      orderCount: 0,
      totalAmount: 0,
      shippingFeeAmount: 0,
    }
    governorate.orderCount += 1
    governorate.totalAmount += order.totalAmount
    governorate.shippingFeeAmount += order.shippingFeeAmount
    governorates.set(order.governorateName, governorate)
  }

  return {
    summary: {
      submittedOrderCount: orders.length,
      confirmedRevenueAmount: sum(confirmedOrders),
      pendingPaymentValueAmount: sum(pendingOrders),
      rejectedCancelledValueAmount: sum(rejectedCancelledOrders),
      averageOrderValueAmount: orders.length > 0 ? Math.round(allOrderValue / orders.length) : 0,
      shippingFeeAmount: orders.reduce((total, order) => total + order.shippingFeeAmount, 0),
      promoDiscountAmount: orders.reduce((total, order) => total + order.promoDiscountAmount, 0),
      currency: 'EGP',
    },
    statusMix,
    dailyTrend: [...dailyTrend.values()],
    topStories: [...stories.values()]
      .map((story) => ({
        productId: story.productId,
        productTitle: story.productTitle,
        quantity: story.quantity,
        orderCount: story.orderIds.size,
        confirmedRevenueAmount: story.revenueAmount,
      }))
      .sort((left, right) => right.quantity - left.quantity || right.confirmedRevenueAmount - left.confirmedRevenueAmount)
      .slice(0, 10),
    promoPerformance: [...promos.values()]
      .sort((left, right) => right.redemptions - left.redemptions || right.discountAmount - left.discountAmount)
      .slice(0, 10),
    governorates: [...governorates.values()]
      .sort((left, right) => right.orderCount - left.orderCount || right.totalAmount - left.totalAmount),
  }
}

export const adminReportRoutes = new Hono<AppEnvironment>()

adminReportRoutes.get('/admin/reports', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const range = readRange(context)
  if ('error' in range) {
    return errorResponse(context, 422, 'invalid_report_range', range.error, [{ path: range.path, code: 'invalid' }])
  }

  const db = createDb(context.env)
  const orders = await db
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
      totalAmount: ordersTable.totalAmount,
      shippingFeeAmount: ordersTable.shippingFeeAmount,
      promoCode: ordersTable.promoCode,
      promoDiscountAmount: ordersTable.promoDiscountAmount,
      governorateName: ordersTable.governorateName,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, range.startsAt), lt(ordersTable.createdAt, range.endsAt)))
    .orderBy(asc(ordersTable.createdAt))

  const items: ReportItemRow[] = []
  for (let index = 0; index < orders.length; index += 100) {
    const orderIds = orders.slice(index, index + 100).map((order) => order.id)
    if (orderIds.length === 0) continue
    const rows = await db
      .select({
        orderId: orderItemsTable.orderId,
        productId: orderItemsTable.productId,
        productTitle: orderItemsTable.productTitle,
        quantity: orderItemsTable.quantity,
        lineTotalAmount: orderItemsTable.lineTotalAmount,
      })
      .from(orderItemsTable)
      .where(inArray(orderItemsTable.orderId, orderIds))
    items.push(...rows)
  }

  const metrics = calculateReportMetrics(orders, items, range)

  return context.json({
    range: {
      preset: range.preset,
      from: range.from,
      to: range.to,
      timezone: CAIRO_TIME_ZONE,
      startsAt: range.startsAt.toISOString(),
      endsAt: range.endsAt.toISOString(),
    },
    ...metrics,
  })
})
