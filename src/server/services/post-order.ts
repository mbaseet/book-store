import type { Context } from 'hono'
import { getSignedCookie, setSignedCookie } from 'hono/cookie'
import { and, eq } from 'drizzle-orm'
import { createDb, ordersTable } from '../db'
import type { Bindings } from '../types'
const COOKIE = 'mint_post_order'
export async function setPostOrderContext(context: Context, env: Bindings, orderId: string) {
  await setSignedCookie(context, COOKIE, JSON.stringify({ orderId, expiresAt: Date.now() + 60 * 60_000 }), env.SESSION_SECRET, { httpOnly: true, secure: new URL(context.req.url).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 3600 })
}
export async function getPostOrderContext(context: Context, env: Bindings, orderNumber: string) {
  const signed = await getSignedCookie(context, env.SESSION_SECRET, COOKIE)
  if (!signed) return null
  try {
    const data = JSON.parse(signed) as { orderId: string; expiresAt: number }
    if (!data.orderId || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) return null
    const [order] = await createDb(env).select().from(ordersTable).where(and(eq(ordersTable.id, data.orderId), eq(ordersTable.orderNumber, orderNumber))).limit(1)
    return order ?? null
  } catch { return null }
}
