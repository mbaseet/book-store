import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { createdAtColumn, idColumn, updatedAtColumn } from './base'

export const adminsTable = sqliteTable('admins', {
  id: idColumn(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
})

export const customerAccountsTable = sqliteTable(
  'customer_accounts',
  {
    id: idColumn(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    phone: text('phone'),
    displayName: text('display_name'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index('customer_accounts_phone_idx').on(table.phone)],
)

export const passwordResetTokensTable = sqliteTable(
  'password_reset_tokens',
  {
    id: idColumn(),
    customerAccountId: text('customer_account_id')
      .notNull()
      .references(() => customerAccountsTable.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex('password_reset_tokens_hash_idx').on(table.tokenHash),
    index('password_reset_tokens_account_idx').on(table.customerAccountId),
  ],
)

export const adminSessionsTable = sqliteTable(
  'admin_sessions',
  {
    id: idColumn(),
    adminId: text('admin_id')
      .notNull()
      .references(() => adminsTable.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex('admin_sessions_token_hash_idx').on(table.tokenHash),
    index('admin_sessions_admin_idx').on(table.adminId),
  ],
)

export const customerSessionsTable = sqliteTable(
  'customer_sessions',
  {
    id: idColumn(),
    customerAccountId: text('customer_account_id')
      .notNull()
      .references(() => customerAccountsTable.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex('customer_sessions_token_hash_idx').on(table.tokenHash),
    index('customer_sessions_customer_idx').on(table.customerAccountId),
  ],
)

export const rateLimitsTable = sqliteTable(
  'rate_limits',
  {
    id: idColumn(),
    subject: text('subject').notNull(),
    action: text('action').notNull(),
    attemptedAt: integer('attempted_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('rate_limits_subject_action_time_idx').on(table.subject, table.action, table.attemptedAt)],
)
