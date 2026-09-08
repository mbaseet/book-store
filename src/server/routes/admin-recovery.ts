import { and, desc, eq, gt, gte, lte, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  recoveryLeadIdSchema,
  recoveryLeadListQuerySchema,
  recoveryLeadResponseSchema,
  recoveryLeadStateUpdateSchema,
} from '@shared/contracts/recovery'
import { createDb } from '../db'
import { abandonedCheckoutRecoveryLeadsTable, ordersTable } from '../db/schema'
import { errorResponse, hasTrustedOrigin, parseJson } from '../lib/http'
import {
  AbandonedCheckoutRecoveryError,
  assertAbandonedCheckoutRecoveryAvailable,
  decryptRecoveryPayload,
} from '../services/abandoned-checkout-recovery'
import { requireAdmin } from './auth'
import type { Bindings } from '../types'

type AppEnvironment = { Bindings: Bindings }

function dateBoundary(value: string, endOfDay: boolean) {
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
}

function setPrivateRecoveryResponseHeaders(context: { header(name: string, value: string): void }) {
  context.header('Cache-Control', 'private, no-store')
  context.header('Vary', 'Cookie')
}

function isValidCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day
}

async function serializeRecoveryLead(
  env: Bindings,
  row: {
    id: string
    state: string
    encryptedPayload: string
    createdAt: Date
    updatedAt: Date
    expiresAt: Date
    convertedAt: Date | null
    convertedOrderNumber: string | null
  },
) {
  const recovery = await decryptRecoveryPayload(env, row.encryptedPayload)
  // Parsing the response at this boundary makes it impossible for an
  // accidental database projection to expand the admin API with draft data.
  return recoveryLeadResponseSchema.parse({
    id: row.id,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    convertedAt: row.convertedAt?.toISOString() ?? null,
    convertedOrderNumber: row.convertedOrderNumber,
    recovery,
  })
}

async function findRecoveryLead(
  db: ReturnType<typeof createDb>,
  id: string,
  now = new Date(),
) {
  const [lead] = await db
    .select({
      id: abandonedCheckoutRecoveryLeadsTable.id,
      state: abandonedCheckoutRecoveryLeadsTable.state,
      encryptedPayload: abandonedCheckoutRecoveryLeadsTable.encryptedPayload,
      createdAt: abandonedCheckoutRecoveryLeadsTable.createdAt,
      updatedAt: abandonedCheckoutRecoveryLeadsTable.updatedAt,
      expiresAt: abandonedCheckoutRecoveryLeadsTable.expiresAt,
      convertedAt: abandonedCheckoutRecoveryLeadsTable.convertedAt,
      convertedOrderNumber: ordersTable.orderNumber,
    })
    .from(abandonedCheckoutRecoveryLeadsTable)
    .leftJoin(ordersTable, eq(abandonedCheckoutRecoveryLeadsTable.convertedOrderId, ordersTable.id))
    .where(and(eq(abandonedCheckoutRecoveryLeadsTable.id, id), gt(abandonedCheckoutRecoveryLeadsTable.expiresAt, now)))
    .limit(1)
  return lead ?? null
}

export const adminRecoveryRoutes = new Hono<AppEnvironment>()

/**
 * Read-only recovery queue. `from` and `to` are inclusive UTC calendar dates;
 * this API deliberately returns only the encrypted snapshot's safe fields.
 */
adminRecoveryRoutes.get('/admin/recovery', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')

  const parsed = recoveryLeadListQuerySchema.safeParse({
    state: context.req.query('state'),
    from: context.req.query('from'),
    to: context.req.query('to'),
    limit: context.req.query('limit'),
  })
  if (!parsed.success || (parsed.data.from && !isValidCalendarDate(parsed.data.from)) || (parsed.data.to && !isValidCalendarDate(parsed.data.to))) {
    return errorResponse(context, 422, 'invalid_input', 'Choose a valid recovery lead filter.')
  }

  try {
    assertAbandonedCheckoutRecoveryAvailable(context.env)
    const now = new Date()
    const filters = [gt(abandonedCheckoutRecoveryLeadsTable.expiresAt, now)]
    if (parsed.data.state !== 'all') filters.push(eq(abandonedCheckoutRecoveryLeadsTable.state, parsed.data.state))
    if (parsed.data.from) filters.push(gte(abandonedCheckoutRecoveryLeadsTable.createdAt, dateBoundary(parsed.data.from, false)))
    if (parsed.data.to) filters.push(lte(abandonedCheckoutRecoveryLeadsTable.createdAt, dateBoundary(parsed.data.to, true)))

    const rows = await createDb(context.env)
      .select({
        id: abandonedCheckoutRecoveryLeadsTable.id,
        state: abandonedCheckoutRecoveryLeadsTable.state,
        encryptedPayload: abandonedCheckoutRecoveryLeadsTable.encryptedPayload,
        createdAt: abandonedCheckoutRecoveryLeadsTable.createdAt,
        updatedAt: abandonedCheckoutRecoveryLeadsTable.updatedAt,
        expiresAt: abandonedCheckoutRecoveryLeadsTable.expiresAt,
        convertedAt: abandonedCheckoutRecoveryLeadsTable.convertedAt,
        convertedOrderNumber: ordersTable.orderNumber,
      })
      .from(abandonedCheckoutRecoveryLeadsTable)
      .leftJoin(ordersTable, eq(abandonedCheckoutRecoveryLeadsTable.convertedOrderId, ordersTable.id))
      .where(and(...filters))
      .orderBy(desc(abandonedCheckoutRecoveryLeadsTable.createdAt))
      .limit(parsed.data.limit)

    setPrivateRecoveryResponseHeaders(context)
    return context.json({ leads: await Promise.all(rows.map((row) => serializeRecoveryLead(context.env, row))) })
  } catch (error) {
    if (error instanceof AbandonedCheckoutRecoveryError) {
      return errorResponse(context, 503, 'recovery_unavailable', 'Recovery leads are temporarily unavailable.')
    }
    return errorResponse(context, 500, 'recovery_unavailable', 'Recovery leads are temporarily unavailable.')
  }
})

adminRecoveryRoutes.get('/admin/recovery/:id', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')

  const id = recoveryLeadIdSchema.safeParse(context.req.param('id'))
  if (!id.success) return errorResponse(context, 404, 'recovery_lead_not_found', 'The recovery lead was not found.')

  try {
    assertAbandonedCheckoutRecoveryAvailable(context.env)
    const lead = await findRecoveryLead(createDb(context.env), id.data)
    if (!lead) return errorResponse(context, 404, 'recovery_lead_not_found', 'The recovery lead was not found.')
    setPrivateRecoveryResponseHeaders(context)
    return context.json({ lead: await serializeRecoveryLead(context.env, lead) })
  } catch (error) {
    if (error instanceof AbandonedCheckoutRecoveryError) {
      return errorResponse(context, 503, 'recovery_unavailable', 'Recovery leads are temporarily unavailable.')
    }
    return errorResponse(context, 500, 'recovery_unavailable', 'Recovery leads are temporarily unavailable.')
  }
})

/**
 * A staff workflow marker only. It never triggers messaging and cannot forge a
 * conversion: `converted` is set only by a successful matching checkout.
 */
adminRecoveryRoutes.patch('/admin/recovery/:id', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')

  const id = recoveryLeadIdSchema.safeParse(context.req.param('id'))
  if (!id.success) return errorResponse(context, 404, 'recovery_lead_not_found', 'The recovery lead was not found.')
  const parsed = await parseJson(context, recoveryLeadStateUpdateSchema)
  if (!parsed.success) return parsed.response

  try {
    assertAbandonedCheckoutRecoveryAvailable(context.env)
    const db = createDb(context.env)
    const now = new Date()
    const result = await db
      .update(abandonedCheckoutRecoveryLeadsTable)
      .set({ state: parsed.data.state, updatedAt: now })
      .where(
        and(
          eq(abandonedCheckoutRecoveryLeadsTable.id, id.data),
          ne(abandonedCheckoutRecoveryLeadsTable.state, 'converted'),
          gt(abandonedCheckoutRecoveryLeadsTable.expiresAt, now),
        ),
      )
      .run()
    if (Number(result.meta.changes ?? 0) !== 1) {
      const existing = await findRecoveryLead(db, id.data, now)
      if (existing?.state === 'converted') {
        return errorResponse(context, 409, 'recovery_lead_converted', 'Converted recovery leads cannot be changed.')
      }
      return errorResponse(context, 404, 'recovery_lead_not_found', 'The recovery lead was not found.')
    }
    const lead = await findRecoveryLead(db, id.data, now)
    if (!lead) return errorResponse(context, 404, 'recovery_lead_not_found', 'The recovery lead was not found.')
    setPrivateRecoveryResponseHeaders(context)
    return context.json({ lead: await serializeRecoveryLead(context.env, lead) })
  } catch (error) {
    if (error instanceof AbandonedCheckoutRecoveryError) {
      return errorResponse(context, 503, 'recovery_unavailable', 'Recovery leads are temporarily unavailable.')
    }
    return errorResponse(context, 500, 'recovery_unavailable', 'Recovery leads are temporarily unavailable.')
  }
})
