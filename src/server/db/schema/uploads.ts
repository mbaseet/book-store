import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { createdAtColumn, idColumn, updatedAtColumn } from './base'

/**
 * An anonymous, browser-bound draft retains a short checkout session without
 * placing a child photo claim token or personalization data in browser storage.
 * The encrypted payload is readable only after the HTTP-only cookie proves
 * possession of the matching opaque token.
 */
export const checkoutDraftsTable = sqliteTable(
  'checkout_drafts',
  {
    id: idColumn(),
    tokenHash: text('token_hash').notNull().unique(),
    payload: text('payload').notNull(),
    // A small compare-and-swap counter prevents overlapping browser saves or
    // tabs from silently replacing a newer encrypted draft payload.
    revision: integer('revision').notNull().default(0),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index('checkout_drafts_expiry_idx').on(table.expiresAt)],
)

/**
 * Temporary private uploads are claimed by checkout and then moved into the
 * order's retention workflow. A client cannot attach an arbitrary Cloudinary
 * URL because each upload must first be recorded against a short-lived token.
 */
export const checkoutUploadsTable = sqliteTable(
  'checkout_uploads',
  {
    id: idColumn(),
    tokenHash: text('token_hash').notNull(),
    kind: text('kind').notNull(),
    url: text('url').notNull(),
    cloudinaryPublicId: text('cloudinary_public_id').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    claimedAt: integer('claimed_at', { mode: 'timestamp_ms' }),
    draftId: text('draft_id').references(() => checkoutDraftsTable.id, { onDelete: 'set null' }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex('checkout_uploads_token_hash_idx').on(table.tokenHash),
    index('checkout_uploads_expiry_idx').on(table.claimedAt, table.expiresAt),
    index('checkout_uploads_draft_idx').on(table.draftId),
  ],
)
