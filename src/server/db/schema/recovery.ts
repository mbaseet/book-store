import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { createdAtColumn, idColumn, updatedAtColumn } from './base'
import { ordersTable } from './orders'

/**
 * A short-lived automatic recovery record. The customer-facing contact and
 * cart snapshot are AES-GCM encrypted; only keyed hashes and lifecycle data
 * remain queryable in D1.
 */
export const abandonedCheckoutRecoveryLeadsTable = sqliteTable(
  'abandoned_checkout_recovery_leads',
  {
    id: idColumn(),
    // HMAC of the checkout draft ID. This prevents duplicate promotion while
    // ensuring no browser draft token or reusable identifier is retained.
    sourceDraftHash: text('source_draft_hash').notNull(),
    // HMAC of a normalized phone number. It supports conversion matching
    // without retaining a plaintext phone outside the encrypted snapshot.
    phoneHash: text('phone_hash').notNull(),
    encryptedPayload: text('encrypted_payload').notNull(),
    state: text('state').notNull().default('open'),
    convertedOrderId: text('converted_order_id').references(() => ordersTable.id, { onDelete: 'set null' }),
    convertedAt: integer('converted_at', { mode: 'timestamp_ms' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('abandoned_checkout_recovery_source_draft_hash_idx').on(table.sourceDraftHash),
    index('abandoned_checkout_recovery_phone_state_idx').on(table.phoneHash, table.state),
    index('abandoned_checkout_recovery_state_created_idx').on(table.state, table.createdAt),
    index('abandoned_checkout_recovery_expiry_idx').on(table.expiresAt),
  ],
)
