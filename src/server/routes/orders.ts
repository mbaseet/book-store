import { and, desc, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { checkRateLimit, requestSubject } from '../lib/rate-limit'
import { guestOrderTrackingSchema } from '@shared/contracts/orders'
import { createDb } from '../db'
import { orderItemsTable, ordersTable, orderStatusHistoryTable, reviewsTable } from '../db/schema'
import { errorResponse } from '../lib/http'
import { canonicalPhone } from '../lib/order-identifiers'
import { getCurrentCustomer } from '../lib/sessions'
import type { Bindings } from '../types'

type AppEnvironment = { Bindings: Bindings }

function customerOrderSummary(order: {
  orderNumber: string
  status: string
  totalAmount: number
  currency: string
  createdAt: Date
}) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    totalAmount: order.totalAmount,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
  }
}

export const orderRoutes = new Hono<AppEnvironment>()

/**
 * A guest must supply both their order number and phone. Deliberately return
 * only the order status so this lookup cannot disclose delivery or child data.
 */
async function trackOrder(context: Context<AppEnvironment>) {
  context.header('Cache-Control', 'private, no-store')
  const db = createDb(context.env)
  if (!(await checkRateLimit(db, requestSubject(context.req.raw), 'track_order', { maxAttempts: 20, windowMs: 15 * 60_000 }))) return errorResponse(context, 429, 'rate_limited', 'Try again later.')
  const input = context.req.method === 'POST' ? await context.req.json().catch(() => null) : { orderNumber: context.req.query('orderNumber'), phone: context.req.query('phone') }
  const parsed = guestOrderTrackingSchema.safeParse(input)
  if (!parsed.success) return errorResponse(context, 422, 'invalid_input', 'Enter a valid order number and phone.')
  const [order] = await db.select({ id: ordersTable.id, orderNumber: ordersTable.orderNumber, status: ordersTable.status, paymentStatus: ordersTable.paymentStatus }).from(ordersTable).where(and(eq(ordersTable.orderNumber, parsed.data.orderNumber.toUpperCase()), eq(ordersTable.phone, canonicalPhone(parsed.data.phone)))).limit(1)
  if (!order) return errorResponse(context, 404, 'order_not_found', 'No matching order was found.')
  const [notes, reviews] = await Promise.all([
    db.select({ note: orderStatusHistoryTable.customerVisibleNote }).from(orderStatusHistoryTable).where(eq(orderStatusHistoryTable.orderId, order.id)).orderBy(desc(orderStatusHistoryTable.createdAt)).limit(1),
    db.select({ id: reviewsTable.id }).from(reviewsTable).where(eq(reviewsTable.orderId, order.id)).limit(1),
  ])
  return context.json({ order: { orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus, customerVisibleNote: notes[0]?.note ?? null, reviewSubmitted: Boolean(reviews.length) } })
}
orderRoutes.get('/orders/track', trackOrder)
orderRoutes.post('/orders/track', trackOrder)

/** Optional customer accounts are intentionally read-only in phase one. */
orderRoutes.get('/customer/orders', async (context) => {
  const db = createDb(context.env)
  const customer = await getCurrentCustomer(context, db)
  if (!customer) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to view your orders.')
  if (!customer.emailVerifiedAt) return errorResponse(context, 403, 'email_verification_required', 'Verify your email to view your orders.')

  const rows = await db
    .select({
      orderNumber: ordersTable.orderNumber,
      status: ordersTable.status,
      totalAmount: ordersTable.totalAmount,
      currency: ordersTable.currency,
      createdAt: ordersTable.createdAt,
      productTitle: orderItemsTable.productTitle,
      reviewId: reviewsTable.id,
    })
    .from(ordersTable)
    .leftJoin(orderItemsTable, eq(orderItemsTable.orderId, ordersTable.id))
    .leftJoin(reviewsTable, eq(reviewsTable.orderId, ordersTable.id))
    .where(eq(ordersTable.customerAccountId, customer.id))
    .orderBy(desc(ordersTable.createdAt))

  const ordersByNumber = new Map<
    string,
    ReturnType<typeof customerOrderSummary> & { itemTitles: string[]; reviewSubmitted: boolean }
  >()
  for (const row of rows) {
    const current = ordersByNumber.get(row.orderNumber)
    if (current) {
      if (row.productTitle) current.itemTitles.push(row.productTitle)
      continue
    }
    ordersByNumber.set(row.orderNumber, {
      ...customerOrderSummary(row),
      reviewSubmitted: Boolean(row.reviewId),
      itemTitles: row.productTitle ? [row.productTitle] : [],
    })
  }

  return context.json({ orders: [...ordersByNumber.values()] })
})
