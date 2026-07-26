import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { guestOrderTrackingSchema } from '@shared/contracts/orders'
import { createDb } from '../db'
import { orderItemsTable, ordersTable } from '../db/schema'
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
orderRoutes.get('/orders/track', async (context) => {
  const parsed = guestOrderTrackingSchema.safeParse({
    orderNumber: context.req.query('orderNumber'),
    phone: context.req.query('phone'),
  })
  if (!parsed.success) {
    return errorResponse(context, 422, 'invalid_input', 'Enter a valid order number and phone number.')
  }

  const [order] = await createDb(context.env)
    .select({ orderNumber: ordersTable.orderNumber, status: ordersTable.status })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.orderNumber, parsed.data.orderNumber.toUpperCase()),
        eq(ordersTable.phone, canonicalPhone(parsed.data.phone)),
      ),
    )
    .limit(1)

  if (!order) return errorResponse(context, 404, 'order_not_found', 'No matching order was found.')
  return context.json({ order: { orderNumber: order.orderNumber, status: order.status } })
})

/** Optional customer accounts are intentionally read-only in phase one. */
orderRoutes.get('/customer/orders', async (context) => {
  const db = createDb(context.env)
  const customer = await getCurrentCustomer(context, db)
  if (!customer) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to view your orders.')

  const rows = await db
    .select({
      orderNumber: ordersTable.orderNumber,
      status: ordersTable.status,
      totalAmount: ordersTable.totalAmount,
      currency: ordersTable.currency,
      createdAt: ordersTable.createdAt,
      productTitle: orderItemsTable.productTitle,
    })
    .from(ordersTable)
    .leftJoin(orderItemsTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(eq(ordersTable.customerAccountId, customer.id))
    .orderBy(desc(ordersTable.createdAt))

  const ordersByNumber = new Map<
    string,
    ReturnType<typeof customerOrderSummary> & { itemTitles: string[] }
  >()
  for (const row of rows) {
    const current = ordersByNumber.get(row.orderNumber)
    if (current) {
      if (row.productTitle) current.itemTitles.push(row.productTitle)
      continue
    }
    ordersByNumber.set(row.orderNumber, {
      ...customerOrderSummary(row),
      itemTitles: row.productTitle ? [row.productTitle] : [],
    })
  }

  return context.json({ orders: [...ordersByNumber.values()] })
})
