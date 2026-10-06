import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { testDatabase } from '../test/d1'

const databases: ReturnType<typeof testDatabase>[] = []
afterEach(() => { for (const database of databases.splice(0)) database.sqlite.close() })

describe('UX order experience migration', () => {
  it('preserves related rows while mapping legacy states and adding category media', () => {
    const database = testDatabase(6)
    databases.push(database)
    const insertOrder = database.sqlite.prepare(`
      INSERT INTO orders (
        id, order_number, status, customer_name, email, phone, governorate_name,
        city, address_line_1, payment_method, payment_status, subtotal_amount,
        shipping_fee_amount, total_amount, amount_due_now
      ) VALUES (?, ?, ?, 'Parent', 'parent@example.test', '01012345678', 'Cairo',
        'Cairo', 'Test address', 'instapay', ?, 10000, 1000, 11000, 11000)
    `)
    insertOrder.run('review-order', 'SB-LEGACY-01', 'payment_rejected', 'payment_submitted')
    insertOrder.run('ready-order', 'SB-LEGACY-02', 'in_production', 'paid')
    database.sqlite.prepare(`
      INSERT INTO order_items (
        id, order_id, product_slug, product_title, base_unit_price_amount,
        final_unit_price_amount, quantity, line_total_amount
      ) VALUES ('ready-item', 'ready-order', 'ready-book', 'Ready book', 10000, 10000, 1, 10000)
    `).run()
    database.sqlite.prepare(`
      INSERT INTO categories (id, slug, is_featured, sort_order)
      VALUES ('hero-category', 'hero-worlds', 1, 1)
    `).run()

    database.sqlite.exec(readFileSync('drizzle/0007_ux_order_experience.sql', 'utf8'))

    expect(database.sqlite.prepare("SELECT status, payment_status, locale FROM orders WHERE id='review-order'").get())
      .toMatchObject({ status: 'in_review', payment_status: 'payment_rejected', locale: 'en' })
    expect(database.sqlite.prepare("SELECT status FROM orders WHERE id='ready-order'").get()?.status)
      .toBe('preparing_order')
    expect(database.sqlite.prepare("SELECT order_id FROM order_items WHERE id='ready-item'").get()?.order_id)
      .toBe('ready-order')
    expect(database.sqlite.prepare("SELECT image_url, banner_media FROM categories WHERE id='hero-category'").get())
      .toMatchObject({
        image_url: '/brand/ux-refresh/hero-worlds-card.webp',
        banner_media: '{"en":{"desktop":"/brand/ux-refresh/hero-worlds-banner.webp"}}',
      })
  })

  it('adds bilingual home FAQs without overwriting an existing translation', () => {
    const database = testDatabase(7)
    databases.push(database)
    const migration = readFileSync('drizzle/0008_home_faqs.sql', 'utf8')
    database.sqlite.exec(migration)
    database.sqlite.prepare("UPDATE faq_translations SET answer='Admin copy' WHERE faq_id='0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa01' AND locale='en'").run()
    database.sqlite.exec(migration)

    expect(database.sqlite.prepare('SELECT count(*) AS count FROM faqs').get()?.count).toBe(4)
    expect(database.sqlite.prepare('SELECT count(*) AS count FROM faq_translations').get()?.count).toBe(8)
    expect(database.sqlite.prepare("SELECT answer FROM faq_translations WHERE faq_id='0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa01' AND locale='en'").get()?.answer).toBe('Admin copy')
  })
})
