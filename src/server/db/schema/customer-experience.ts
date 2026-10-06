import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { createdAtColumn, idColumn } from './base'
import { customerAccountsTable } from './auth'
import { ordersTable } from './orders'

export const reviewsTable = sqliteTable('customer_reviews', {
  id: idColumn(),
  orderId: text('order_id').notNull().references(() => ordersTable.id),
  displayName: text('display_name').notNull(),
  locale: text('locale').notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment').notNull(),
  status: text('status').notNull().default('pending'),
  publicationConsentAt: integer('publication_consent_at', { mode: 'timestamp_ms' }).notNull(),
  moderatedAt: integer('moderated_at', { mode: 'timestamp_ms' }),
  moderationReason: text('moderation_reason'),
  createdAt: createdAtColumn(),
}, (table) => [uniqueIndex('customer_reviews_order_idx').on(table.orderId), index('customer_reviews_status_created_idx').on(table.status, table.createdAt)])

export const emailVerificationTokensTable = sqliteTable('email_verification_tokens', {
  id: idColumn(),
  customerAccountId: text('customer_account_id').notNull().references(() => customerAccountsTable.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp_ms' }),
  createdAt: createdAtColumn(),
}, (table) => [uniqueIndex('email_verification_hash_idx').on(table.tokenHash), index('email_verification_account_idx').on(table.customerAccountId)])

export const notificationJobsTable = sqliteTable('notification_jobs', {
  id: idColumn(),
  dedupeKey: text('dedupe_key').notNull(),
  kind: text('kind').notNull(),
  // Encrypted delivery payload; cleared after delivery or permanent failure.
  payload: text('payload'),
  attempts: integer('attempts').notNull().default(0),
  status: text('status').notNull().default('pending'),
  nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }).notNull(),
  sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
  createdAt: createdAtColumn(),
}, (table) => [uniqueIndex('notification_jobs_dedupe_idx').on(table.dedupeKey), index('notification_jobs_due_idx').on(table.status, table.nextAttemptAt)])
