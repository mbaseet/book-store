import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { createdAtColumn, idColumn, updatedAtColumn } from './base'

export const siteSettingsTable = sqliteTable('site_settings', {
  id: idColumn(),
  key: text('key').notNull().unique(),
  value: text('value'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(true),
  updatedAt: updatedAtColumn(),
})

export const contentPagesTable = sqliteTable(
  'content_pages',
  {
    id: idColumn(),
    key: text('key').notNull().unique(),
    isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index('content_pages_published_idx').on(table.isPublished)],
)

export const contentPageTranslationsTable = sqliteTable(
  'content_page_translations',
  {
    id: idColumn(),
    contentPageId: text('content_page_id')
      .notNull()
      .references(() => contentPagesTable.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [uniqueIndex('content_page_translations_page_locale_idx').on(table.contentPageId, table.locale)],
)

export const faqsTable = sqliteTable(
  'faqs',
  {
    id: idColumn(),
    isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index('faqs_published_sort_idx').on(table.isPublished, table.sortOrder)],
)

export const faqTranslationsTable = sqliteTable(
  'faq_translations',
  {
    id: idColumn(),
    faqId: text('faq_id')
      .notNull()
      .references(() => faqsTable.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [uniqueIndex('faq_translations_faq_locale_idx').on(table.faqId, table.locale)],
)

export const testimonialsTable = sqliteTable(
  'testimonials',
  {
    id: idColumn(),
    displayName: text('display_name').notNull(),
    isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index('testimonials_published_sort_idx').on(table.isPublished, table.sortOrder)],
)

export const testimonialTranslationsTable = sqliteTable(
  'testimonial_translations',
  {
    id: idColumn(),
    testimonialId: text('testimonial_id')
      .notNull()
      .references(() => testimonialsTable.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    quote: text('quote').notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('testimonial_translations_testimonial_locale_idx').on(table.testimonialId, table.locale),
  ],
)
