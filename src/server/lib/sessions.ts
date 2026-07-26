import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createDb } from '../db'
import {
  adminsTable,
  adminSessionsTable,
  customerAccountsTable,
  customerSessionsTable,
} from '../db/schema'
import { createOpaqueToken, hashToken } from './crypto'

type Database = ReturnType<typeof createDb>
type CookieContext = Context

const ADMIN_COOKIE = 'storybook_admin_session'
const CUSTOMER_COOKIE = 'storybook_customer_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function cookieOptions(requestUrl: string) {
  return {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax' as const,
    secure: new URL(requestUrl).protocol === 'https:',
  }
}

async function createSession(
  db: Database,
  kind: 'admin' | 'customer',
  subjectId: string,
) {
  const token = createOpaqueToken()
  const tokenHash = await hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)

  if (kind === 'admin') {
    await db.insert(adminSessionsTable).values({ adminId: subjectId, tokenHash, expiresAt })
  } else {
    await db.insert(customerSessionsTable).values({ customerAccountId: subjectId, tokenHash, expiresAt })
  }

  return token
}

export async function startAdminSession(context: CookieContext, db: Database, adminId: string) {
  const token = await createSession(db, 'admin', adminId)
  setCookie(context, ADMIN_COOKIE, token, cookieOptions(context.req.url))
}

export async function startCustomerSession(context: CookieContext, db: Database, customerAccountId: string) {
  const token = await createSession(db, 'customer', customerAccountId)
  setCookie(context, CUSTOMER_COOKIE, token, cookieOptions(context.req.url))
}

async function revokeSession(db: Database, kind: 'admin' | 'customer', token: string) {
  const tokenHash = await hashToken(token)
  const revokedAt = new Date()

  if (kind === 'admin') {
    await db
      .update(adminSessionsTable)
      .set({ revokedAt })
      .where(and(eq(adminSessionsTable.tokenHash, tokenHash), isNull(adminSessionsTable.revokedAt)))
  } else {
    await db
      .update(customerSessionsTable)
      .set({ revokedAt })
      .where(and(eq(customerSessionsTable.tokenHash, tokenHash), isNull(customerSessionsTable.revokedAt)))
  }
}

export async function endAdminSession(context: CookieContext, db: Database) {
  const token = getCookie(context, ADMIN_COOKIE)
  if (token) await revokeSession(db, 'admin', token)
  deleteCookie(context, ADMIN_COOKIE, { path: '/' })
}

export async function endCustomerSession(context: CookieContext, db: Database) {
  const token = getCookie(context, CUSTOMER_COOKIE)
  if (token) await revokeSession(db, 'customer', token)
  deleteCookie(context, CUSTOMER_COOKIE, { path: '/' })
}

export async function getCurrentAdmin(context: CookieContext, db: Database) {
  const token = getCookie(context, ADMIN_COOKIE)
  if (!token) return null

  const tokenHash = await hashToken(token)
  const [row] = await db
    .select({ id: adminsTable.id, email: adminsTable.email })
    .from(adminSessionsTable)
    .innerJoin(adminsTable, eq(adminSessionsTable.adminId, adminsTable.id))
    .where(
      and(
        eq(adminSessionsTable.tokenHash, tokenHash),
        isNull(adminSessionsTable.revokedAt),
        gt(adminSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1)

  return row ?? null
}

export async function getCurrentCustomer(context: CookieContext, db: Database) {
  const token = getCookie(context, CUSTOMER_COOKIE)
  if (!token) return null

  const tokenHash = await hashToken(token)
  const [row] = await db
    .select({
      id: customerAccountsTable.id,
      email: customerAccountsTable.email,
      phone: customerAccountsTable.phone,
      displayName: customerAccountsTable.displayName,
    })
    .from(customerSessionsTable)
    .innerJoin(customerAccountsTable, eq(customerSessionsTable.customerAccountId, customerAccountsTable.id))
    .where(
      and(
        eq(customerSessionsTable.tokenHash, tokenHash),
        isNull(customerSessionsTable.revokedAt),
        gt(customerSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1)

  return row ?? null
}
