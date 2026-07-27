import { and, eq, gt, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  adminLoginSchema,
  adminBootstrapSchema,
  customerLoginSchema,
  customerRegistrationSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '@shared/contracts/auth'
import { createDb } from '../db'
import {
  adminsTable,
  customerAccountsTable,
  customerSessionsTable,
  ordersTable,
  passwordResetTokensTable,
} from '../db/schema'
import {
  createOpaqueToken,
  hashPassword,
  hashToken,
  passwordHashIterations,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from '../lib/crypto'
import { sendPasswordResetEmail } from '../lib/email'
import { canonicalEmail, errorResponse, hasTrustedOrigin, parseJson } from '../lib/http'
import { checkRateLimit, requestSubject } from '../lib/rate-limit'
import {
  endAdminSession,
  endCustomerSession,
  getCurrentAdmin,
  getCurrentCustomer,
  startAdminSession,
  startCustomerSession,
} from '../lib/sessions'
import type { Bindings } from '../types'

const CUSTOMER_RESET_LIFETIME_MS = 30 * 60 * 1000

type AppEnvironment = { Bindings: Bindings }

function customerResponse(customer: { id: string; email: string; phone: string | null; displayName: string | null }) {
  return {
    id: customer.id,
    email: customer.email,
    phone: customer.phone,
    displayName: customer.displayName,
  }
}

function configuredPasswordHashIterations(env: Bindings) {
  return passwordHashIterations(env.PASSWORD_HASH_ITERATIONS)
}

async function matchesBootstrapToken(env: Bindings, providedToken: string | undefined) {
  if (!providedToken || !env.ADMIN_BOOTSTRAP_TOKEN) return false
  const [providedHash, expectedHash] = await Promise.all([
    hashToken(providedToken),
    hashToken(env.ADMIN_BOOTSTRAP_TOKEN),
  ])
  if (providedHash.length !== expectedHash.length) return false
  let difference = 0
  for (let index = 0; index < providedHash.length; index += 1) {
    difference |= providedHash.charCodeAt(index) ^ expectedHash.charCodeAt(index)
  }
  return difference === 0
}

async function allowAttempt(
  context: Parameters<typeof getCurrentCustomer>[0],
  action: string,
  maxAttempts: number,
  windowMs: number,
) {
  const db = createDb(context.env)
  return checkRateLimit(db, requestSubject(context.req.raw), action, { maxAttempts, windowMs })
}

export const authRoutes = new Hono<AppEnvironment>()

authRoutes.post('/customer/register', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }

  const parsed = await parseJson(context, customerRegistrationSchema)
  if (!parsed.success) return parsed.response
  if (!(await allowAttempt(context, 'customer_register', 8, 60 * 60 * 1000))) {
    return errorResponse(context, 429, 'rate_limited', 'Please wait before trying again.')
  }

  const db = createDb(context.env)
  const email = canonicalEmail(parsed.data.email)
  const [existing] = await db
    .select({ id: customerAccountsTable.id })
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.email, email))
    .limit(1)
  if (existing) return errorResponse(context, 409, 'email_in_use', 'An account already uses this email address.')

  const passwordHash = await hashPassword(parsed.data.password, configuredPasswordHashIterations(context.env))
  const customer = {
    id: crypto.randomUUID(),
    email,
    passwordHash,
    phone: parsed.data.phone || null,
    displayName: parsed.data.displayName || null,
  }
  await db.insert(customerAccountsTable).values(customer)
  await db
    .update(ordersTable)
    .set({ customerAccountId: customer.id })
    .where(and(eq(ordersTable.email, email), isNull(ordersTable.customerAccountId)))
  await startCustomerSession(context, db, customer.id)

  return context.json({ customer: customerResponse(customer) }, 201)
})

authRoutes.post('/customer/login', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }

  const parsed = await parseJson(context, customerLoginSchema)
  if (!parsed.success) return parsed.response
  if (!(await allowAttempt(context, 'customer_login', 8, 15 * 60 * 1000))) {
    return errorResponse(context, 429, 'rate_limited', 'Please wait before trying again.')
  }

  const db = createDb(context.env)
  const email = canonicalEmail(parsed.data.email)
  const [customer] = await db
    .select()
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.email, email))
    .limit(1)
  if (!customer || !(await verifyPassword(parsed.data.password, customer.passwordHash))) {
    return errorResponse(context, 401, 'invalid_credentials', 'Email or password is incorrect.')
  }

  const targetIterations = configuredPasswordHashIterations(context.env)
  if (passwordHashNeedsUpgrade(customer.passwordHash, targetIterations)) {
    await db
      .update(customerAccountsTable)
      .set({ passwordHash: await hashPassword(parsed.data.password, targetIterations), updatedAt: new Date() })
      .where(eq(customerAccountsTable.id, customer.id))
  }

  await db
    .update(ordersTable)
    .set({ customerAccountId: customer.id })
    .where(and(eq(ordersTable.email, customer.email), isNull(ordersTable.customerAccountId)))
  await startCustomerSession(context, db, customer.id)
  return context.json({ customer: customerResponse(customer) })
})

authRoutes.post('/customer/logout', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }

  await endCustomerSession(context, createDb(context.env))
  return context.body(null, 204)
})

authRoutes.get('/customer/me', async (context) => {
  const customer = await getCurrentCustomer(context, createDb(context.env))
  if (!customer) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  return context.json({ customer: customerResponse(customer) })
})

authRoutes.post('/customer/password-reset/request', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }

  const parsed = await parseJson(context, passwordResetRequestSchema)
  if (!parsed.success) return parsed.response
  if (!(await allowAttempt(context, 'customer_password_reset_request', 4, 60 * 60 * 1000))) {
    return errorResponse(context, 429, 'rate_limited', 'Please wait before requesting another reset link.')
  }

  const db = createDb(context.env)
  const email = canonicalEmail(parsed.data.email)
  const [customer] = await db
    .select({ id: customerAccountsTable.id, email: customerAccountsTable.email })
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.email, email))
    .limit(1)

  // Keep the response indistinguishable for unknown addresses.
  if (!customer) return context.json({ accepted: true })

  const token = createOpaqueToken()
  const tokenHash = await hashToken(token)
  const expiresAt = new Date(Date.now() + CUSTOMER_RESET_LIFETIME_MS)
  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokensTable.customerAccountId, customer.id), isNull(passwordResetTokensTable.usedAt)))
  await db.insert(passwordResetTokensTable).values({
    customerAccountId: customer.id,
    tokenHash,
    expiresAt,
  })

  const baseUrl = context.env.APP_BASE_URL || new URL(context.req.url).origin
  const resetUrl = new URL('/reset-password', baseUrl)
  resetUrl.searchParams.set('token', token)
  await sendPasswordResetEmail(context.env, { recipient: customer.email, resetUrl: resetUrl.toString() })

  return context.json({ accepted: true })
})

authRoutes.post('/customer/password-reset/confirm', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }

  const parsed = await parseJson(context, passwordResetConfirmSchema)
  if (!parsed.success) return parsed.response
  if (!(await allowAttempt(context, 'customer_password_reset_confirm', 8, 30 * 60 * 1000))) {
    return errorResponse(context, 429, 'rate_limited', 'Please wait before trying again.')
  }

  const db = createDb(context.env)
  const tokenHash = await hashToken(parsed.data.token)
  const [resetToken] = await db
    .select({
      id: passwordResetTokensTable.id,
      customerAccountId: passwordResetTokensTable.customerAccountId,
    })
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, tokenHash),
        isNull(passwordResetTokensTable.usedAt),
        gt(passwordResetTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1)
  if (!resetToken) {
    return errorResponse(context, 400, 'invalid_reset_token', 'This reset link is invalid or has expired.')
  }

  const passwordHash = await hashPassword(parsed.data.password, configuredPasswordHashIterations(context.env))
  const now = new Date()
  await db.batch([
    db
      .update(customerAccountsTable)
      .set({ passwordHash, updatedAt: now })
      .where(eq(customerAccountsTable.id, resetToken.customerAccountId)),
    db.update(passwordResetTokensTable).set({ usedAt: now }).where(eq(passwordResetTokensTable.id, resetToken.id)),
    db
      .update(customerSessionsTable)
      .set({ revokedAt: now })
      .where(and(eq(customerSessionsTable.customerAccountId, resetToken.customerAccountId), isNull(customerSessionsTable.revokedAt))),
  ])
  await startCustomerSession(context, db, resetToken.customerAccountId)

  return context.json({ reset: true })
})

authRoutes.post('/admin/login', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }

  const parsed = await parseJson(context, adminLoginSchema)
  if (!parsed.success) return parsed.response
  if (!(await allowAttempt(context, 'admin_login', 5, 15 * 60 * 1000))) {
    return errorResponse(context, 429, 'rate_limited', 'Please wait before trying again.')
  }

  const db = createDb(context.env)
  const [admin] = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.email, canonicalEmail(parsed.data.email)))
    .limit(1)
  if (!admin || !(await verifyPassword(parsed.data.password, admin.passwordHash))) {
    return errorResponse(context, 401, 'invalid_credentials', 'Email or password is incorrect.')
  }

  const targetIterations = configuredPasswordHashIterations(context.env)
  if (passwordHashNeedsUpgrade(admin.passwordHash, targetIterations)) {
    await db
      .update(adminsTable)
      .set({ passwordHash: await hashPassword(parsed.data.password, targetIterations), updatedAt: new Date() })
      .where(eq(adminsTable.id, admin.id))
  }

  await startAdminSession(context, db, admin.id)
  return context.json({ admin: { id: admin.id, email: admin.email } })
})

/**
 * A deployment secret permits creation of exactly one initial admin. The
 * conditional insert means simultaneous bootstrap attempts cannot create a
 * second account, and no default credential is ever stored in source control.
 */
authRoutes.post('/admin/bootstrap', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }
  if (!(await matchesBootstrapToken(context.env, context.req.header('x-admin-bootstrap-token')))) {
    return errorResponse(context, 403, 'bootstrap_unavailable', 'Admin bootstrap is unavailable.')
  }
  const parsed = await parseJson(context, adminBootstrapSchema)
  if (!parsed.success) return parsed.response
  if (!(await allowAttempt(context, 'admin_bootstrap', 5, 15 * 60 * 1000))) {
    return errorResponse(context, 429, 'rate_limited', 'Please wait before trying again.')
  }

  const db = createDb(context.env)
  const id = crypto.randomUUID()
  const email = canonicalEmail(parsed.data.email)
  const passwordHash = await hashPassword(parsed.data.password, configuredPasswordHashIterations(context.env))
  const result = await context.env.DB
    .prepare(
      'INSERT INTO admins (id, email, password_hash) SELECT ?1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM admins)',
    )
    .bind(id, email, passwordHash)
    .run()
  if (Number(result.meta.changes ?? 0) !== 1) {
    return errorResponse(context, 409, 'bootstrap_unavailable', 'Admin bootstrap is unavailable.')
  }

  await startAdminSession(context, db, id)
  return context.json({ admin: { id, email } }, 201)
})

authRoutes.post('/admin/logout', async (context) => {
  if (!hasTrustedOrigin(context)) {
    return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  }

  await endAdminSession(context, createDb(context.env))
  return context.body(null, 204)
})

authRoutes.get('/admin/me', async (context) => {
  const admin = await getCurrentAdmin(context, createDb(context.env))
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  return context.json({ admin })
})

/** Used by admin-only route modules; the database session remains authoritative. */
export async function requireAdmin(context: Parameters<typeof getCurrentAdmin>[0]) {
  return getCurrentAdmin(context, createDb(context.env))
}
