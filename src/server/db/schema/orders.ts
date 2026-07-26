import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { adminsTable, customerAccountsTable } from './auth'
import { createdAtColumn, idColumn, updatedAtColumn } from './base'
import { productAddonsTable, productsTable } from './catalog'

export const governoratesTable = sqliteTable(
  'governorates',
  {
    id: idColumn(),
    code: text('code').notNull().unique(),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),
    shippingFeeAmount: integer('shipping_fee_amount').notNull().default(8500),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index('governorates_active_sort_idx').on(table.isActive, table.sortOrder)],
)

export const promoCodesTable = sqliteTable(
  'promo_codes',
  {
    id: idColumn(),
    code: text('code').notNull().unique(),
    fixedDiscountAmount: integer('fixed_discount_amount').notNull(),
    minimumSubtotalAmount: integer('minimum_subtotal_amount'),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
    maxRedemptions: integer('max_redemptions'),
    redemptionCount: integer('redemption_count').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index('promo_codes_active_dates_idx').on(table.isActive, table.startsAt, table.endsAt)],
)

export const ordersTable = sqliteTable(
  'orders',
  {
    id: idColumn(),
    orderNumber: text('order_number').notNull().unique(),
    customerAccountId: text('customer_account_id').references(() => customerAccountsTable.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('payment_submitted'),
    customerName: text('customer_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    governorateId: text('governorate_id').references(() => governoratesTable.id, { onDelete: 'set null' }),
    governorateName: text('governorate_name').notNull(),
    city: text('city').notNull(),
    addressLine1: text('address_line_1').notNull(),
    addressLine2: text('address_line_2'),
    addressNote: text('address_note'),
    paymentMethod: text('payment_method').notNull(),
    subtotalAmount: integer('subtotal_amount').notNull(),
    promoCodeId: text('promo_code_id').references(() => promoCodesTable.id, { onDelete: 'set null' }),
    promoCode: text('promo_code'),
    promoDiscountAmount: integer('promo_discount_amount').notNull().default(0),
    shippingFeeAmount: integer('shipping_fee_amount').notNull(),
    freeShippingThresholdAmount: integer('free_shipping_threshold_amount'),
    totalAmount: integer('total_amount').notNull(),
    currency: text('currency').notNull().default('EGP'),
    sensitiveDataPurgeAt: integer('sensitive_data_purge_at', { mode: 'timestamp_ms' }),
    sensitiveDataPurgedAt: integer('sensitive_data_purged_at', { mode: 'timestamp_ms' }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index('orders_status_created_idx').on(table.status, table.createdAt),
    index('orders_created_status_idx').on(table.createdAt, table.status),
    index('orders_phone_created_idx').on(table.phone, table.createdAt),
    index('orders_customer_created_idx').on(table.customerAccountId, table.createdAt),
  ],
)

export const orderItemsTable = sqliteTable(
  'order_items',
  {
    id: idColumn(),
    orderId: text('order_id')
      .notNull()
      .references(() => ordersTable.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => productsTable.id, { onDelete: 'set null' }),
    productSlug: text('product_slug').notNull(),
    productTitle: text('product_title').notNull(),
    productImageUrl: text('product_image_url'),
    baseUnitPriceAmount: integer('base_unit_price_amount').notNull(),
    saleUnitPriceAmount: integer('sale_unit_price_amount'),
    finalUnitPriceAmount: integer('final_unit_price_amount').notNull(),
    quantity: integer('quantity').notNull().default(1),
    // Older storybook orders populate these legacy summary columns. New
    // controlled product definitions may not ask either question, so their
    // authoritative instructions are the immutable personalization snapshot.
    childName: text('child_name'),
    storyLanguage: text('story_language'),
    customerNote: text('customer_note'),
    // Immutable product-specific answers at the time of checkout. Sensitive
    // answers live separately so the scheduled retention job can erase them
    // without rewriting a non-sensitive production/audit snapshot.
    personalizationSnapshot: text('personalization_snapshot'),
    sensitivePersonalization: text('sensitive_personalization'),
    sensitivePersonalizationPurgedAt: integer('sensitive_personalization_purged_at', {
      mode: 'timestamp_ms',
    }),
    lineTotalAmount: integer('line_total_amount').notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('order_items_order_idx').on(table.orderId),
    index('order_items_product_order_idx').on(table.productId, table.orderId),
    index('order_items_sensitive_personalization_idx').on(table.sensitivePersonalizationPurgedAt),
  ],
)

export const orderItemAddonsTable = sqliteTable(
  'order_item_addons',
  {
    id: idColumn(),
    orderItemId: text('order_item_id')
      .notNull()
      .references(() => orderItemsTable.id, { onDelete: 'cascade' }),
    productAddonId: text('product_addon_id').references(() => productAddonsTable.id, { onDelete: 'set null' }),
    addonName: text('addon_name').notNull(),
    unitPriceAmount: integer('unit_price_amount').notNull(),
    quantity: integer('quantity').notNull().default(1),
    lineTotalAmount: integer('line_total_amount').notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [index('order_item_addons_item_idx').on(table.orderItemId)],
)

export const orderStatusHistoryTable = sqliteTable(
  'order_status_history',
  {
    id: idColumn(),
    orderId: text('order_id')
      .notNull()
      .references(() => ordersTable.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    changedByAdminId: text('changed_by_admin_id').references(() => adminsTable.id, { onDelete: 'set null' }),
    customerVisibleNote: text('customer_visible_note'),
    createdAt: createdAtColumn(),
  },
  (table) => [index('order_status_history_order_created_idx').on(table.orderId, table.createdAt)],
)

export const orderInternalNotesTable = sqliteTable(
  'order_internal_notes',
  {
    id: idColumn(),
    orderId: text('order_id')
      .notNull()
      .references(() => ordersTable.id, { onDelete: 'cascade' }),
    authorAdminId: text('author_admin_id').references(() => adminsTable.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [index('order_internal_notes_order_created_idx').on(table.orderId, table.createdAt)],
)

export const orderSensitiveAssetsTable = sqliteTable(
  'order_sensitive_assets',
  {
    id: idColumn(),
    orderId: text('order_id')
      .notNull()
      .references(() => ordersTable.id, { onDelete: 'cascade' }),
    orderItemId: text('order_item_id').references(() => orderItemsTable.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    url: text('url').notNull(),
    cloudinaryPublicId: text('cloudinary_public_id').notNull(),
    // A retention deadline is assigned only after delivery or cancellation.
    // This prevents normal production timelines from being treated as stale.
    deleteAfter: integer('delete_after', { mode: 'timestamp_ms' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('order_sensitive_assets_order_idx').on(table.orderId),
    index('order_sensitive_assets_due_for_deletion_idx').on(table.deletedAt, table.deleteAfter),
  ],
)

export const promoCodeRedemptionsTable = sqliteTable(
  'promo_code_redemptions',
  {
    promoCodeId: text('promo_code_id')
      .notNull()
      .references(() => promoCodesTable.id, { onDelete: 'cascade' }),
    orderId: text('order_id')
      .notNull()
      .references(() => ordersTable.id, { onDelete: 'cascade' }),
    discountAmount: integer('discount_amount').notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    primaryKey({ columns: [table.promoCodeId, table.orderId] }),
    uniqueIndex('promo_code_redemptions_order_idx').on(table.orderId),
  ],
)
