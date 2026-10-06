import { and, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { reviewModerationSchema, reviewSubmissionSchema } from '@shared/contracts/reviews'
import { createDb, ordersTable, reviewsTable } from '../db'
import { errorResponse, hasTrustedOrigin, parseJson } from '../lib/http'
import { canonicalPhone } from '../lib/order-identifiers'
import { checkRateLimit, requestSubject } from '../lib/rate-limit'
import { getCurrentCustomer } from '../lib/sessions'
import { requireAdmin } from './auth'
import type { Bindings } from '../types'

export const reviewRoutes = new Hono<{ Bindings: Bindings }>()
reviewRoutes.get('/storefront/reviews', async (context) => {
  const db = createDb(context.env)
  const [reviews, aggregate] = await Promise.all([
    db.select({ id: reviewsTable.id, displayName: reviewsTable.displayName, rating: reviewsTable.rating, comment: reviewsTable.comment, locale: reviewsTable.locale, createdAt: reviewsTable.createdAt }).from(reviewsTable).where(eq(reviewsTable.status, 'published')).orderBy(desc(reviewsTable.createdAt)).limit(6),
    db.select({ count: sql<number>`count(*)`, average: sql<number | null>`avg(${reviewsTable.rating})` }).from(reviewsTable).where(eq(reviewsTable.status, 'published')),
  ])
  return context.json({ reviews: reviews.map((row) => ({ ...row, verifiedPurchase: true, createdAt: row.createdAt.toISOString() })), count: aggregate[0]?.count ?? 0, average: aggregate[0]?.average ?? null })
})
reviewRoutes.post('/orders/review', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'Use this storefront.')
  const db = createDb(context.env)
  if (!(await checkRateLimit(db, requestSubject(context.req.raw), 'submit_review', { maxAttempts: 10, windowMs: 15 * 60_000 }))) return errorResponse(context, 429, 'rate_limited', 'Try again later.')
  const parsed = await parseJson(context, reviewSubmissionSchema)
  if (!parsed.success) return parsed.response
  const [customer, orders] = await Promise.all([
    getCurrentCustomer(context, db),
    db.select().from(ordersTable).where(eq(ordersTable.orderNumber, parsed.data.orderNumber.toUpperCase())).limit(1),
  ])
  const order = orders[0]
  const ownsOrder = order && ((customer?.emailVerifiedAt && order.customerAccountId === customer.id) || (parsed.data.phone && canonicalPhone(parsed.data.phone) === order.phone))
  if (!ownsOrder) return errorResponse(context, 404, 'order_not_found', 'No matching order was found.')
  if (order.status !== 'delivered') return errorResponse(context, 409, 'review_not_eligible', 'Reviews open after delivery.')
  const inserted = await db.insert(reviewsTable).values({ orderId: order.id, displayName: parsed.data.displayName, rating: parsed.data.rating, comment: parsed.data.comment, locale: context.req.header('Accept-Language')?.startsWith('ar') ? 'ar' : 'en', publicationConsentAt: new Date() }).onConflictDoNothing({ target: reviewsTable.orderId }).returning({ id: reviewsTable.id })
  if (!inserted.length) return errorResponse(context, 409, 'review_already_submitted', 'A review was already submitted for this order.')
  return context.json({ submitted: true }, 201)
})
reviewRoutes.get('/admin/reviews', async (context) => {
  if (!(await requireAdmin(context))) return errorResponse(context, 401, 'not_authenticated', 'Sign in first.')
  const status = context.req.query('status') ?? 'pending'
  if (!['pending', 'published', 'rejected'].includes(status)) return errorResponse(context, 422, 'invalid_input', 'Choose a review status.')
  const reviews = await createDb(context.env).select({ id: reviewsTable.id, orderNumber: ordersTable.orderNumber, displayName: reviewsTable.displayName, rating: reviewsTable.rating, comment: reviewsTable.comment, status: reviewsTable.status, createdAt: reviewsTable.createdAt, moderationReason: reviewsTable.moderationReason }).from(reviewsTable).innerJoin(ordersTable, eq(ordersTable.id, reviewsTable.orderId)).where(eq(reviewsTable.status, status)).orderBy(desc(reviewsTable.createdAt)).limit(100)
  return context.json({ reviews: reviews.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) })
})
reviewRoutes.post('/admin/reviews/:id/moderate', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'Use this storefront.')
  if (!(await requireAdmin(context))) return errorResponse(context, 401, 'not_authenticated', 'Sign in first.')
  const parsed = await parseJson(context, reviewModerationSchema)
  if (!parsed.success) return parsed.response
  const rows = await createDb(context.env).update(reviewsTable).set({ status: parsed.data.status, moderationReason: parsed.data.reason || null, moderatedAt: new Date() }).where(and(eq(reviewsTable.id, context.req.param('id')))).returning({ id: reviewsTable.id })
  if (!rows.length) return errorResponse(context, 404, 'review_not_found', 'Review not found.')
  return context.json({ status: parsed.data.status })
})
