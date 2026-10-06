import { and, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { dispatchNotifications, notificationInsert, orderEmail } from '../services/notifications'
import { ORDER_STATUSES, type OrderStatus } from '@shared/constants'
import {
  addOrderInternalNoteSchema,
  orderNumberSchema,
  updateOrderStatusSchema,
} from '@shared/contracts/orders'
import { createDb } from '../db'
import {
  orderInternalNotesTable,
  orderItemAddonsTable,
  orderItemsTable,
  orderSensitiveAssetsTable,
  orderStatusHistoryTable,
  ordersTable,
} from '../db/schema'
import { errorResponse, hasTrustedOrigin, parseJson } from '../lib/http'
import { canTransitionOrderStatus, isTerminalOrderStatus, paymentUpdatesForStatus, purchasedItemIsPersonalized } from '../services/order-status'
import { parsePersonalizationSnapshot } from '../services/personalization'
import { fetchAuthenticatedCloudinaryAsset, PrivateUploadError } from '../services/private-uploads'
import { requireAdmin } from './auth'
import type { Bindings } from '../types'

const RETENTION_AFTER_TERMINAL_MS = 30 * 24 * 60 * 60 * 1000
type AppEnvironment = { Bindings: Bindings }

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
}

function serializePersonalizationForAdmin(item: {
  personalizationSnapshot: string | null
  sensitivePersonalization: string | null
  sensitivePersonalizationPurgedAt: Date | null
}) {
  const nonSensitive = parsePersonalizationSnapshot(item.personalizationSnapshot)
  const sensitive = parsePersonalizationSnapshot(item.sensitivePersonalization)
  const fields = new Map<string, { key: string; label: string; value: string | number | null; sensitive: boolean; purgedAt?: string | null }>()
  for (const field of nonSensitive?.fields ?? []) {
    if (field.type === 'photo' || field.sensitive) continue
    const answer = nonSensitive?.answers[field.key]
    if (answer !== undefined) {
      fields.set(field.key, { key: field.key, label: field.label.en, value: answer, sensitive: false })
    }
  }
  for (const field of sensitive?.fields ?? []) {
    if (field.type === 'photo') continue
    const answer = sensitive?.answers[field.key]
    if (answer !== undefined) {
      fields.set(field.key, { key: field.key, label: field.label.en, value: answer, sensitive: true })
    }
  }
  if (item.sensitivePersonalizationPurgedAt) {
    for (const field of nonSensitive?.fields.filter((candidate) => candidate.sensitive) ?? []) {
      if (field.type === 'photo' || fields.has(field.key)) continue
      fields.set(field.key, {
        key: field.key,
        label: field.label.en,
        value: null,
        sensitive: true,
        purgedAt: item.sensitivePersonalizationPurgedAt.toISOString(),
      })
    }
  }
  // Once cleared, retain only a visible audit marker; the former value is not
  // recoverable through this API or any order snapshot.
  if (item.sensitivePersonalizationPurgedAt) {
    for (const [key, value] of fields) {
      if (value.sensitive) fields.set(key, { ...value, value: null, purgedAt: item.sensitivePersonalizationPurgedAt.toISOString() })
    }
  }
  return [...fields.values()]
}

async function findOrderByNumber(db: ReturnType<typeof createDb>, rawOrderNumber: string) {
  const parsed = orderNumberSchema.safeParse(rawOrderNumber)
  if (!parsed.success) return null

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.orderNumber, parsed.data.toUpperCase()))
    .limit(1)
  return order ?? null
}

export const adminOrderRoutes = new Hono<AppEnvironment>()

adminOrderRoutes.get('/admin/orders', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')

  const statusParam = context.req.query('status')
  if (statusParam && !isOrderStatus(statusParam)) {
    return errorResponse(context, 422, 'invalid_status', 'The requested status is invalid.')
  }
  const requestedLimit = Number.parseInt(context.req.query('limit') ?? '50', 10)
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50
  const db = createDb(context.env)
  const baseQuery = db
    .select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      status: ordersTable.status,
      customerName: ordersTable.customerName,
      email: ordersTable.email,
      phone: ordersTable.phone,
      paymentPlan: ordersTable.paymentPlan,
      paymentStatus: ordersTable.paymentStatus,
      totalAmount: ordersTable.totalAmount,
      amountDueNow: ordersTable.amountDueNow,
      amountPaid: ordersTable.amountPaid,
      amountDueOnDelivery: ordersTable.amountDueOnDelivery,
      currency: ordersTable.currency,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit)
  const orders = statusParam
    ? await baseQuery.where(eq(ordersTable.status, statusParam))
    : await baseQuery

  const itemRows =
    orders.length === 0
      ? []
      : await db
          .select({ orderId: orderItemsTable.orderId, productTitle: orderItemsTable.productTitle })
          .from(orderItemsTable)
          .where(inArray(orderItemsTable.orderId, orders.map((order) => order.id)))
  const itemTitlesByOrder = new Map<string, string[]>()
  for (const item of itemRows) {
    const titles = itemTitlesByOrder.get(item.orderId) ?? []
    titles.push(item.productTitle)
    itemTitlesByOrder.set(item.orderId, titles)
  }

  return context.json({
    orders: orders.map((order) => ({
      ...order,
      createdAt: order.createdAt.toISOString(),
      itemTitles: itemTitlesByOrder.get(order.id) ?? [],
    })),
  })
})

adminOrderRoutes.get('/admin/orders/:orderNumber', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')

  const db = createDb(context.env)
  const order = await findOrderByNumber(db, context.req.param('orderNumber'))
  if (!order) return errorResponse(context, 404, 'order_not_found', 'The order was not found.')

  const [items, itemAddons, statusHistory, internalNotes, sensitiveAssets] = await Promise.all([
    db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id)),
    db
      .select({
        id: orderItemAddonsTable.id,
        orderItemId: orderItemAddonsTable.orderItemId,
        addonName: orderItemAddonsTable.addonName,
        unitPriceAmount: orderItemAddonsTable.unitPriceAmount,
        quantity: orderItemAddonsTable.quantity,
        lineTotalAmount: orderItemAddonsTable.lineTotalAmount,
      })
      .from(orderItemAddonsTable)
      .innerJoin(orderItemsTable, eq(orderItemAddonsTable.orderItemId, orderItemsTable.id))
      .where(eq(orderItemsTable.orderId, order.id)),
    db
      .select()
      .from(orderStatusHistoryTable)
      .where(eq(orderStatusHistoryTable.orderId, order.id))
      .orderBy(desc(orderStatusHistoryTable.createdAt)),
    db
      .select()
      .from(orderInternalNotesTable)
      .where(eq(orderInternalNotesTable.orderId, order.id))
      .orderBy(desc(orderInternalNotesTable.createdAt)),
    db
      .select({
        id: orderSensitiveAssetsTable.id,
        orderItemId: orderSensitiveAssetsTable.orderItemId,
        kind: orderSensitiveAssetsTable.kind,
        deletedAt: orderSensitiveAssetsTable.deletedAt,
      })
      .from(orderSensitiveAssetsTable)
      .where(eq(orderSensitiveAssetsTable.orderId, order.id)),
  ])

  const currentOrderStatus = isOrderStatus(order.status) ? order.status : null
  return context.json({
    allowedNextStatuses: currentOrderStatus
      ? ORDER_STATUSES.filter((candidate) => canTransitionOrderStatus(currentOrderStatus, candidate, items.some(purchasedItemIsPersonalized)))
      : [],
    order: {
      ...order,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      sensitiveDataPurgeAt: order.sensitiveDataPurgeAt?.toISOString() ?? null,
      sensitiveDataPurgedAt: order.sensitiveDataPurgedAt?.toISOString() ?? null,
    },
    items: items.map((item) => ({
      ...item,
      personalizationSnapshot: serializePersonalizationForAdmin(item),
      addons: itemAddons.filter((addon) => addon.orderItemId === item.id),
    })),
    statusHistory: statusHistory.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
    internalNotes: internalNotes.map((note) => ({ ...note, createdAt: note.createdAt.toISOString() })),
    sensitiveAssets: sensitiveAssets.map((asset) => ({
      ...asset,
      deletedAt: asset.deletedAt?.toISOString() ?? null,
      // The Worker proxy, added with the private-media service, verifies the
      // admin session before it ever fetches a Cloudinary source.
      downloadPath: `/api/admin/orders/${order.orderNumber}/assets/${asset.id}`,
    })),
  })
})

/** Streams private Cloudinary media only after the server verifies the admin session. */
adminOrderRoutes.get('/admin/orders/:orderNumber/assets/:assetId', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')

  const db = createDb(context.env)
  const order = await findOrderByNumber(db, context.req.param('orderNumber'))
  if (!order) return errorResponse(context, 404, 'order_not_found', 'The order was not found.')
  const [asset] = await db
    .select({
      cloudinaryPublicId: orderSensitiveAssetsTable.cloudinaryPublicId,
      deletedAt: orderSensitiveAssetsTable.deletedAt,
    })
    .from(orderSensitiveAssetsTable)
    .where(and(eq(orderSensitiveAssetsTable.id, context.req.param('assetId')), eq(orderSensitiveAssetsTable.orderId, order.id)))
    .limit(1)
  if (!asset || asset.deletedAt) return errorResponse(context, 404, 'asset_not_found', 'This private asset is no longer available.')

  try {
    const source = await fetchAuthenticatedCloudinaryAsset(context.env, asset.cloudinaryPublicId)
    if (!source.ok || !source.body) return errorResponse(context, 404, 'asset_not_found', 'This private asset is no longer available.')
    return new Response(source.body, {
      headers: {
        'Content-Type': source.headers.get('content-type') ?? 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof PrivateUploadError) {
      return errorResponse(context, 404, 'asset_not_found', 'This private asset is no longer available.')
    }
    return errorResponse(context, 500, 'asset_unavailable', 'This private asset is temporarily unavailable.')
  }
})

adminOrderRoutes.post('/admin/orders/:orderNumber/status', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'Use this storefront.')
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Sign in first.')
  const parsed = await parseJson(context, updateOrderStatusSchema)
  if (!parsed.success) return parsed.response
  const db = createDb(context.env)
  const order = await findOrderByNumber(db, context.req.param('orderNumber'))
  if (!order) return errorResponse(context, 404, 'order_not_found', 'Order not found.')
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id))
  if (!isOrderStatus(order.status) || !canTransitionOrderStatus(order.status, parsed.data.status, items.some(purchasedItemIsPersonalized))) return errorResponse(context, 409, 'invalid_status_transition', 'That status change is not allowed.')
  const now = new Date()
  const purgeAt = isTerminalOrderStatus(parsed.data.status) ? new Date(now.getTime() + RETENTION_AFTER_TERMINAL_MS) : order.sensitiveDataPurgeAt
  const payment = paymentUpdatesForStatus(order, parsed.data.status)
  const historyId = crypto.randomUUID()
  const reviewEmail = parsed.data.status === 'delivered' ? orderEmail(context.env, order, 'review_invitation') : null
  const job = reviewEmail ? await notificationInsert(db, context.env, `review:${order.id}`, 'review_invitation', reviewEmail) : null
  // D1 serializes the batch. changes() binds history to a successful CAS
  // update, and the unique history ID gates every subsequent side effect.
  const statements = [
    context.env.DB.prepare('UPDATE orders SET status = ?, payment_status = ?, amount_paid = ?, amount_due_on_delivery = ?, updated_at = ?, sensitive_data_purge_at = ? WHERE id = ? AND status = ? RETURNING id')
      .bind(parsed.data.status, payment.paymentStatus, payment.amountPaid, payment.amountDueOnDelivery, now.getTime(), purgeAt?.getTime() ?? null, order.id, order.status),
    context.env.DB.prepare('INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_admin_id, customer_visible_note, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1')
      .bind(historyId, order.id, order.status, parsed.data.status, admin.id, parsed.data.customerVisibleNote || null, now.getTime()),
  ]
  if (purgeAt) statements.push(context.env.DB.prepare('UPDATE order_sensitive_assets SET delete_after = ? WHERE order_id = ? AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM order_status_history WHERE id = ?)').bind(purgeAt.getTime(), order.id, historyId))
  if (job) statements.push(context.env.DB.prepare('INSERT INTO notification_jobs (id, dedupe_key, kind, payload, next_attempt_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM order_status_history WHERE id = ?) ON CONFLICT(dedupe_key) DO NOTHING').bind(job.id, job.dedupeKey, job.kind, job.payload, job.nextAttemptAt.getTime(), historyId))
  const result = await context.env.DB.batch(statements)
  if (!result[0].results.length) return errorResponse(context, 409, 'invalid_status_transition', 'Another administrator updated this order. Refresh and try again.')
  context.executionCtx.waitUntil(dispatchNotifications(db, context.env))
  return context.json({ status: parsed.data.status, ...payment, sensitiveDataPurgeAt: purgeAt?.toISOString() ?? null })
})

adminOrderRoutes.post('/admin/orders/:orderNumber/payment-review', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'Use this storefront.')
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Sign in first.')
  const parsed = await parseJson(context, z.object({ decision: z.enum(['action_required', 'payment_rejected', 'resubmitted']), customerVisibleNote: z.string().trim().min(1).max(500) }))
  if (!parsed.success) return parsed.response
  const db = createDb(context.env)
  const order = await findOrderByNumber(db, context.req.param('orderNumber'))
  if (!order || order.status !== 'in_review' || order.paymentPlan === 'cash_on_delivery') return errorResponse(context, 409, 'invalid_status_transition', 'Only transfers awaiting review can be reviewed.')
  const paymentStatus = parsed.data.decision === 'resubmitted' ? (order.paymentPlan === 'personalized_deposit_cod' ? 'deposit_submitted' : 'payment_submitted') : parsed.data.decision
  const now = Date.now()
  const result = await context.env.DB.batch([
    context.env.DB.prepare('UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ? AND status = ? AND payment_status = ? RETURNING id').bind(paymentStatus, now, order.id, order.status, order.paymentStatus),
    context.env.DB.prepare('INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_admin_id, customer_visible_note, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1').bind(crypto.randomUUID(), order.id, order.status, order.status, admin.id, parsed.data.customerVisibleNote, now),
  ])
  if (!result[0].results.length) return errorResponse(context, 409, 'invalid_status_transition', 'This order changed. Refresh and try again.')
  return context.json({ paymentStatus })
})

adminOrderRoutes.post('/admin/orders/:orderNumber/notes', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const parsed = await parseJson(context, addOrderInternalNoteSchema)
  if (!parsed.success) return parsed.response

  const db = createDb(context.env)
  const order = await findOrderByNumber(db, context.req.param('orderNumber'))
  if (!order) return errorResponse(context, 404, 'order_not_found', 'The order was not found.')

  await db.insert(orderInternalNotesTable).values({
    orderId: order.id,
    authorAdminId: admin.id,
    body: parsed.data.body,
  })
  return context.json({ added: true }, 201)
})
