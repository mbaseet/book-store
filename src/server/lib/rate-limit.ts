import { and, eq, lt, sql } from 'drizzle-orm'
import { createDb } from '../db'
import { rateLimitsTable } from '../db/schema'

type Database = ReturnType<typeof createDb>

export async function checkRateLimit(
  db: Database,
  subject: string,
  action: string,
  { maxAttempts, windowMs }: { maxAttempts: number; windowMs: number },
) {
  const now = new Date()
  const cutoff = new Date(now.getTime() - windowMs)

  await db
    .delete(rateLimitsTable)
    .where(lt(rateLimitsTable.attemptedAt, cutoff))

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(rateLimitsTable)
    .where(
      and(
        eq(rateLimitsTable.subject, subject),
        eq(rateLimitsTable.action, action),
      ),
    )

  if (Number(result?.count ?? 0) >= maxAttempts) return false

  await db.insert(rateLimitsTable).values({
    subject,
    action,
    attemptedAt: now,
  })
  return true
}

export function requestSubject(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  return request.headers.get('cf-connecting-ip') ?? forwarded?.split(',')[0]?.trim() ?? 'unknown'
}
