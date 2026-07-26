import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
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
import { canTransitionOrderStatus, isTerminalOrderStatus } from '../services/order-status'
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
      totalAmount: ordersTable.totalAmount,
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

  return context.json({
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
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const parsed = await parseJson(context, updateOrderStatusSchema)
  if (!parsed.success) return parsed.response

  const db = createDb(context.env)
  const order = await findOrderByNumber(db, context.req.param('orderNumber'))
  if (!order) return errorResponse(context, 404, 'order_not_found', 'The order was not found.')
  if (!isOrderStatus(order.status) || !canTransitionOrderStatus(order.status, parsed.data.status)) {
    return errorResponse(context, 409, 'invalid_status_transition', 'That status change is not allowed.')
  }

  const now = new Date()
  const purgeAt = isTerminalOrderStatus(parsed.data.status)
    ? new Date(now.getTime() + RETENTION_AFTER_TERMINAL_MS)
    : null
  const updates = {
    status: parsed.data.status,
    updatedAt: now,
    ...(purgeAt ? { sensitiveDataPurgeAt: purgeAt } : {}),
  }
  const updateOrder = db.update(ordersTable).set(updates).where(eq(ordersTable.id, order.id))
  const insertHistory = db.insert(orderStatusHistoryTable).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: parsed.data.status,
    changedByAdminId: admin.id,
    customerVisibleNote: parsed.data.customerVisibleNote || null,
  })
  if (purgeAt) {
    await db.batch([
      updateOrder,
      insertHistory,
      db
        .update(orderSensitiveAssetsTable)
        .set({ deleteAfter: purgeAt })
        .where(and(eq(orderSensitiveAssetsTable.orderId, order.id), isNull(orderSensitiveAssetsTable.deletedAt))),
    ])
  } else {
    await db.batch([updateOrder, insertHistory])
  }

  return context.json({
    status: parsed.data.status,
    sensitiveDataPurgeAt: purgeAt?.toISOString() ?? null,
  })
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
