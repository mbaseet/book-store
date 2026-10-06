import { and, eq, lt, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { createDb, notificationJobsTable } from '../db'
import { openPayload, sealPayload } from '../lib/private-payload'
import type { Bindings } from '../types'

type Database = ReturnType<typeof createDb>
const emailPayload = z.object({ recipient: z.string().email(), subject: z.string(), text: z.string() })
export type EmailPayload = z.infer<typeof emailPayload>
export async function notificationInsert(_db: Database, env: Bindings, dedupeKey: string, kind: string, payload: EmailPayload) {
  return { id: crypto.randomUUID(), dedupeKey, kind, payload: await sealPayload(env.SESSION_SECRET, emailPayload.parse(payload)), nextAttemptAt: new Date() }
}

export async function dispatchNotifications(db: Database, env: Bindings) {
  const now = new Date()
  await db.update(notificationJobsTable).set({ status: 'failed', payload: null }).where(and(sql`${notificationJobsTable.status} in ('pending', 'processing')`, lt(notificationJobsTable.createdAt, new Date(now.getTime() - 23 * 60 * 60_000))))
  await db.delete(notificationJobsTable).where(and(sql`${notificationJobsTable.status} in ('sent', 'failed')`, lt(notificationJobsTable.createdAt, new Date(now.getTime() - 30 * 86400_000))))
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return
  // Processing leases are recovered by the cron if a worker terminates.
  const rows = await db.select().from(notificationJobsTable).where(and(lte(notificationJobsTable.nextAttemptAt, now), sql`${notificationJobsTable.status} in ('pending', 'processing')`)).limit(10)
  for (const job of rows) {
    // Resend deduplicates for 24 hours. Stop within that window rather than
    // risking a duplicate delivery after an ambiguous provider response.
    if (now.getTime() - job.createdAt.getTime() >= 23 * 60 * 60 * 1000 || job.attempts >= 8 || !job.payload) {
      await db.update(notificationJobsTable).set({ status: 'failed', payload: null }).where(eq(notificationJobsTable.id, job.id))
      continue
    }
    const lease = new Date(Date.now() + 2 * 60 * 1000)
    const claimed = await db.update(notificationJobsTable).set({ status: 'processing', nextAttemptAt: lease, attempts: sql`${notificationJobsTable.attempts} + 1` })
      .where(and(eq(notificationJobsTable.id, job.id), eq(notificationJobsTable.attempts, job.attempts), lte(notificationJobsTable.nextAttemptAt, now), sql`${notificationJobsTable.status} in ('pending', 'processing')`)).returning({ id: notificationJobsTable.id })
    if (!claimed.length) continue
    try {
      const payload = emailPayload.parse(await openPayload(env.SESSION_SECRET, job.payload))
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': job.id },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [payload.recipient], subject: payload.subject, text: payload.text }),
      })
      if (!response.ok) throw new Error('Email delivery failed.')
      await db.update(notificationJobsTable).set({ status: 'sent', sentAt: new Date(), payload: null }).where(eq(notificationJobsTable.id, job.id))
    } catch {
      await db.update(notificationJobsTable).set({ status: 'pending', nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60_000) }).where(eq(notificationJobsTable.id, job.id))
    }
  }
  await db.delete(notificationJobsTable).where(and(sql`${notificationJobsTable.status} in ('sent', 'failed')`, lt(notificationJobsTable.createdAt, new Date(Date.now() - 30 * 86400_000))))
}

export function orderEmail(env: Bindings, order: { orderNumber: string; email: string | null; locale: string; totalAmount: number; amountDueOnDelivery: number }, kind: 'order_confirmation' | 'review_invitation'): EmailPayload | null {
  if (!order.email) return null
  const ar = order.locale === 'ar'
  const url = new URL(`${ar ? '/ar' : '/en'}/track-order`, env.APP_BASE_URL)
  url.searchParams.set('orderNumber', order.orderNumber)
  if (kind === 'review_invitation') url.searchParams.set('review', '1')
  return {
    recipient: order.email,
    subject: kind === 'review_invitation' ? (ar ? 'كيف كانت تجربة مِنت مياو؟' : 'How was your Mint Meow experience?') : (ar ? `تم استلام طلبك ${order.orderNumber}` : `We received your order ${order.orderNumber}`),
    text: kind === 'review_invitation'
      ? (ar ? `تم تسليم طلبك ${order.orderNumber}. شارك تقييمك الصادق من ١ إلى ٥ نجوم. أدخل هاتف الطلب على الرابط:\n${url}` : `Your order ${order.orderNumber} has been delivered. Share your honest 1–5 star review. Enter your order phone number at:\n${url}`)
      : (ar ? `شكرًا لاختيارك مِنت مياو. رقم طلبك: ${order.orderNumber}\nالإجمالي: ${(order.totalAmount / 100).toFixed(2)} جنيه\nعند الاستلام: ${(order.amountDueOnDelivery / 100).toFixed(2)} جنيه\nاحتفظ بهذا البريد. لمتابعة الحالة أدخل هاتف الطلب على الرابط:\n${url}` : `Thank you for choosing Mint Meow. Your order number: ${order.orderNumber}\nTotal: EGP ${(order.totalAmount / 100).toFixed(2)}\nDue on delivery: EGP ${(order.amountDueOnDelivery / 100).toFixed(2)}\nKeep this email. To track status, enter your order phone number at:\n${url}`),
  }
}
