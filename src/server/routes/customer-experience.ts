import { and, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb, ordersTable } from '../db'
import { errorResponse, hasTrustedOrigin, parseJson } from '../lib/http'
import { getCurrentCustomer } from '../lib/sessions'
import { getPostOrderContext } from '../services/post-order'
import type { Bindings } from '../types'
export const customerExperienceRoutes = new Hono<{ Bindings: Bindings }>()
customerExperienceRoutes.get('/customer/post-order/:orderNumber', async (context) => {
  context.header('Cache-Control', 'private, no-store')
  const order = await getPostOrderContext(context, context.env, context.req.param('orderNumber'))
  if (!order) return errorResponse(context, 404, 'post_order_expired', 'This order session has expired.')
  return context.json({ customer: { displayName: order.customerName, phone: order.phone, email: order.email ?? '' }, claimed: Boolean(order.customerAccountId) })
})
customerExperienceRoutes.post('/customer/orders/claim', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'Use this storefront.')
  const parsed = await parseJson(context, z.object({ orderNumber: z.string().min(8).max(64) }))
  if (!parsed.success) return parsed.response
  const db = createDb(context.env)
  const customer = await getCurrentCustomer(context, db)
  if (!customer) return errorResponse(context, 401, 'not_authenticated', 'Sign in first.')
  if (!customer.emailVerifiedAt) return errorResponse(context, 403, 'email_verification_required', 'Verify your email first.')
  const order = await getPostOrderContext(context, context.env, parsed.data.orderNumber)
  if (!order) return errorResponse(context, 404, 'post_order_expired', 'The order session expired.')
  if (order.customerAccountId === customer.id) return context.json({ claimed: true })
  const rows = await db.update(ordersTable).set({ customerAccountId: customer.id }).where(and(eq(ordersTable.id, order.id), isNull(ordersTable.customerAccountId))).returning({ id: ordersTable.id })
  if (!rows.length) return errorResponse(context, 409, 'order_already_claimed', 'This order is linked to another account.')
  return context.json({ claimed: true })
})
