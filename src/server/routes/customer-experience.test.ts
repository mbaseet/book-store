import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import worker from '../worker'
import { createDb, notificationJobsTable } from '../db'
import { hashToken } from '../lib/crypto'
import { openPayload } from '../lib/private-payload'
import { dispatchNotifications, notificationInsert } from '../services/notifications'
import { testDatabase } from '../test/d1'
import type { Bindings } from '../types'

const productId = 'cc5e8156-62c7-4ab8-bf3e-319b2d6ec4de'
const databases: ReturnType<typeof testDatabase>[] = []
afterEach(() => { vi.unstubAllGlobals(); for (const database of databases.splice(0)) database.sqlite.close() })
async function json(response: Response): Promise<Record<string, any>> {
  return response.json() as Promise<Record<string, any>>
}
async function fixture() {
  const database = testDatabase(); databases.push(database)
  database.sqlite.exec(readFileSync('seed.sql', 'utf8'))
  database.sqlite.prepare("INSERT INTO products(id,slug,status,base_price_amount,is_featured) VALUES (?, 'test-story', 'published', 10000, 1)").run(productId)
  for (const locale of ['en', 'ar']) database.sqlite.prepare('INSERT INTO product_translations(id,product_id,locale,title) VALUES (?,?,?,?)').run(crypto.randomUUID(), productId, locale, locale === 'ar' ? 'قصة تجريبية' : 'Test Story')
  const env: Bindings = { DB: database.db, SESSION_SECRET: 'test-only-session-secret-for-local-integration', ABANDONED_CART_ENCRYPTION_SECRET: 'test-only-recovery-secret', APP_BASE_URL: 'https://store.test', ENVIRONMENT: 'development', PASSWORD_HASH_ITERATIONS: '5000', RESEND_API_KEY: '', EMAIL_FROM: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '', CLOUDINARY_CLOUD_NAME: '', ADMIN_BOOTSTRAP_TOKEN: '', ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } }
  const waits: Promise<unknown>[] = []
  const ctx = { waitUntil: (promise: Promise<unknown>) => waits.push(promise), passThroughOnException() {} } as unknown as ExecutionContext
  const cookies = new Map<string, string>()
  async function request(path: string, body?: unknown, cookieOverride?: string) {
    const response = await worker.fetch(new Request(`https://store.test/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'https://store.test', 'Content-Type': 'application/json', 'Accept-Language': 'en', 'CF-Connecting-IP': '127.0.0.1', Cookie: cookieOverride ?? [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, ctx)
    for (const value of response.headers.getSetCookie()) { const pair = value.split(';')[0]; const index = pair.indexOf('='); cookies.set(pair.slice(0, index), pair.slice(index + 1)) }
    await Promise.all(waits.splice(0))
    return response
  }
  const adminToken = 'test-admin-session'
  database.sqlite.prepare('INSERT INTO admins(id,email,password_hash) VALUES (?,?,?)').run('admin-test', 'admin@example.test', 'unused')
  database.sqlite.prepare('INSERT INTO admin_sessions(id,admin_id,token_hash,expires_at) VALUES (?,?,?,?)').run('admin-session-test', 'admin-test', await hashToken(adminToken), Date.now() + 86400_000)
  const adminCookie = `storybook_admin_session=${adminToken}`
  async function checkout(email = '') {
    const draft = await request('/checkout/draft/items', { productId, quantity: 1, addonIds: [], personalization: {}, childUploads: [] })
    expect(draft.status, await draft.clone().text()).toBe(201)
    return request('/checkout', { customerName: 'Test Parent', email, phone: '01012345678', governorateCode: 'cairo', city: 'Cairo', addressLine1: 'Test address only', paymentPlan: 'cash_on_delivery', paymentMethod: 'cash_on_delivery' })
  }
  return { ...database, env, request, checkout, adminCookie, cookies }
}

describe('purchase-to-review integration', () => {
  it('quotes, applies and removes a coupon, then completes guest checkout without it', async () => {
    const f = await fixture()
    f.sqlite.prepare("INSERT INTO promo_codes(id,code,fixed_discount_amount,is_active) VALUES ('promo','SAVE',1000,1)").run()
    const quote = { governorateCode: 'cairo', items: [{ productId, quantity: 1, addonIds: [] }], paymentPlan: 'cash_on_delivery', paymentMethod: 'cash_on_delivery' }
    expect((await json(await f.request('/checkout/quote', { ...quote, promoCode: 'SAVE' }))).quote.promoDiscountAmount).toBe(1000)
    const invalid = await f.request('/checkout/quote', { ...quote, promoCode: 'TYPO' })
    expect(invalid.status).toBe(422)
    expect((await json(invalid)).error.code).toBe('promo_not_found')
    expect((await json(await f.request('/checkout/quote', quote))).quote.promoDiscountAmount).toBe(0)
    const response = await f.checkout()
    expect(response.status, await response.clone().text()).toBe(201)
    const result = await json(response)
    expect(result.order.status).toBe('cod_pending_confirmation')
    expect(result.order.promoDiscountAmount).toBe(0)
    expect(f.sqlite.prepare('SELECT redemption_count FROM promo_codes').get()?.redemption_count).toBe(0)
  })
  it('uses specific eligibility errors on both quote and final checkout', async () => {
    const f = await fixture()
    f.sqlite.prepare("INSERT INTO promo_codes(id,code,fixed_discount_amount,minimum_subtotal_amount,is_active) VALUES ('promo','MINIMUM',1000,20000,1)").run()
    const quote = await f.request('/checkout/quote', { governorateCode: 'cairo', items: [{ productId, quantity: 1, addonIds: [] }], promoCode: 'MINIMUM' })
    expect((await json(quote)).error).toMatchObject({ code: 'promo_minimum_not_met', details: { minimumSubtotalAmount: 20000, shortfallAmount: 10000 } })
    await f.request('/checkout/draft/items', { productId, personalization: {}, quantity: 1 })
    const response = await f.request('/checkout', { customerName: 'Test Parent', email: '', phone: '01012345678', governorateCode: 'cairo', city: 'Cairo', addressLine1: 'Test address only', paymentPlan: 'cash_on_delivery', paymentMethod: 'cash_on_delivery', promoCode: 'MINIMUM' })
    expect(response.status).toBe(422)
    expect((await json(response)).error.code).toBe('promo_minimum_not_met')
  })
  it('requires COD confirmation, gates preparation, and moderates one review per delivered purchase', async () => {
    const f = await fixture()
    const response = await f.checkout('parent@example.test')
    expect(response.status, await response.clone().text()).toBe(201)
    const { order } = await json(response)
    const status = (value: string) => f.request(`/admin/orders/${order.orderNumber}/status`, { status: value }, f.adminCookie)
    const review = { orderNumber: order.orderNumber, phone: '01012345678', rating: 2, displayName: 'A Parent', comment: 'An honest review with useful feedback.', publicationConsent: true }
    expect((await f.request('/orders/review', review)).status).toBe(409)
    expect((await status('shipped')).status).toBe(409)
    expect((await status('confirmed')).status).toBe(200)
    expect((await status('in_production')).status).toBe(409)
    expect((await status('preparing_order')).status).toBe(200)
    expect((await status('ready_to_ship')).status).toBe(200)
    expect((await status('shipped')).status).toBe(200)
    expect((await status('delivered')).status).toBe(200)
    expect((await status('delivered')).status).toBe(409)
    expect(f.sqlite.prepare('SELECT amount_paid, total_amount, amount_due_on_delivery FROM orders').get()).toMatchObject({ amount_paid: order.totalAmount, amount_due_on_delivery: 0 })
    expect(f.sqlite.prepare("SELECT count(*) AS count FROM notification_jobs WHERE kind = 'review_invitation'").get()?.count).toBe(1)
    expect((await f.request('/orders/review', { ...review, phone: '01000000000' })).status).toBe(404)
    expect((await f.request('/orders/review', review)).status).toBe(201)
    expect((await f.request('/orders/review', review)).status).toBe(409)
    expect((await json(await f.request('/storefront/reviews'))).count).toBe(0)
    const pending = await json(await f.request('/admin/reviews', undefined, f.adminCookie))
    expect(pending.reviews[0].rating).toBe(2)
    expect((await f.request(`/admin/reviews/${pending.reviews[0].id}/moderate`, { status: 'published' }, f.adminCookie)).status).toBe(200)
    const publicReviews = await json(await f.request('/storefront/reviews'))
    expect(publicReviews).toMatchObject({ count: 1, average: 2 })
    expect(publicReviews.reviews[0]).not.toHaveProperty('orderNumber')
    const tracking = await json(await f.request('/orders/track', { orderNumber: order.orderNumber, phone: review.phone }))
    expect(tracking.order).toMatchObject({ status: 'delivered', reviewSubmitted: true })
    expect(tracking.order).not.toHaveProperty('email')
  })
  it('protects previous orders until email verification and reuses the secure post-order context', async () => {
    const f = await fixture()
    const { order } = await json(await f.checkout())
    const context = await json(await f.request(`/customer/post-order/${order.orderNumber}`))
    expect(context.customer.displayName).toBe('Test Parent')
    const registered = await f.request('/customer/register', { ...context.customer, email: 'parent@example.test', password: 'Safe-test-password-42', orderNumber: order.orderNumber })
    expect(registered.status, await registered.clone().text()).toBe(201)
    expect((await f.request('/customer/orders')).status).toBe(403)
    const job = f.sqlite.prepare("SELECT payload FROM notification_jobs WHERE kind = 'email_verification'").get()
    const mail = await openPayload(f.env.SESSION_SECRET, String(job?.payload)) as { text: string }
    const token = new URL(mail.text.split('\n').at(-1)!).searchParams.get('token')!
    expect((await f.request('/customer/email-verification/confirm', { token })).status).toBe(200)
    expect((await f.request('/customer/email-verification/confirm', { token })).status).toBe(422)
    const orders = await json(await f.request('/customer/orders'))
    expect(orders.orders[0].orderNumber).toBe(order.orderNumber)
    expect((await f.request(`/customer/post-order/${order.orderNumber}`, undefined, '')).status).toBe(404)
    expect((await f.request('/customer/orders', undefined, '')).status).toBe(401)
  })
  it('ranks only published products purchased in delivered orders', async () => {
    const f = await fixture()
    const { order } = await json(await f.checkout())
    expect((await json(await f.request('/storefront/products?sort=best_selling&limit=6'))).products).toHaveLength(0)
    f.sqlite.prepare("UPDATE orders SET status='delivered' WHERE order_number=?").run(order.orderNumber)
    expect((await json(await f.request('/storefront/products?sort=best_selling&limit=6'))).products[0].id).toBe(productId)
    f.sqlite.prepare("UPDATE orders SET status='cancelled'").run()
    expect((await json(await f.request('/storefront/products?sort=best_selling&limit=6'))).products).toHaveLength(0)
  })
  it('persists email retries without rolling back orders or duplicating successful mail', async () => {
    const f = await fixture()
    const db = createDb(f.env)
    const row = await notificationInsert(db, f.env, 'test-mail', 'order_confirmation', { recipient: 'parent@example.test', subject: 'Test', text: 'Order details' })
    await db.insert(notificationJobsTable).values(row)
    f.env.RESEND_API_KEY = 'test-only-key'; f.env.EMAIL_FROM = 'store@example.test'
    const send = vi.fn().mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', send)
    await dispatchNotifications(db, f.env)
    expect(f.sqlite.prepare('SELECT status,attempts FROM notification_jobs').get()).toMatchObject({ status: 'pending', attempts: 1 })
    f.sqlite.prepare('UPDATE notification_jobs SET next_attempt_at=0').run()
    await dispatchNotifications(db, f.env)
    await dispatchNotifications(db, f.env)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][1].headers['Idempotency-Key']).toBe(send.mock.calls[1][1].headers['Idempotency-Key'])
    expect(f.sqlite.prepare('SELECT status,payload FROM notification_jobs').get()).toMatchObject({ status: 'sent', payload: null })
  })
})
