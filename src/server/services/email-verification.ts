import { createDb } from '../db'
import { createOpaqueToken, hashToken } from '../lib/crypto'
import { notificationInsert } from './notifications'
import type { Bindings } from '../types'

export async function prepareEmailVerification(db: ReturnType<typeof createDb>, env: Bindings, accountId: string, email: string, locale: string) {
  const token = createOpaqueToken()
  const id = crypto.randomUUID()
  const url = new URL(`/${locale === 'ar' ? 'ar' : 'en'}/account/verify-email`, env.APP_BASE_URL)
  url.searchParams.set('token', token)
  const ar = locale === 'ar'
  return {
    token: { id, customerAccountId: accountId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) },
    job: await notificationInsert(db, env, `verify:${id}`, 'email_verification', { recipient: email,
      subject: ar ? 'أكد بريدك الإلكتروني — مِنت مياو' : 'Verify your email — Mint Meow',
      text: ar ? `أكد بريدك لعرض طلباتك. هذا الرابط صالح لمدة ٢٤ ساعة:\n${url}` : `Verify your email to view your orders. This link expires in 24 hours:\n${url}` }),
  }
}
