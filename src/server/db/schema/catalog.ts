import { relations } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { createdAtColumn, idColumn, updatedAtColumn } from './base'

export const productsTable = sqliteTable(
  'products',
  {
    id: idColumn(),
    slug: text('slug').notNull().unique(),
    status: text('status').notNull().default('draft'),
    basePriceAmount: integer('base_price_amount').notNull(),
    salePriceAmount: integer('sale_price_amount'),
    isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    // JSON for the controlled customer personalization form. Keeping the
    // definition on the product makes it versionable without a general-purpose
    // form-builder table or executable business logic in the database.
    personalizationDefinition: text('personalization_definition'),
    personalizationVersion: integer('personalization_version').notNull().default(1),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index('products_status_featured_sort_idx').on(table.status, table.isFeatured, table.sortOrder),
  ],
)

export const productTranslationsTable = sqliteTable(
  'product_translations',
  {
    id: idColumn(),
    productId: text('product_id')
      .notNull()
      .references(() => productsTable.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    shortDescription: text('short_description'),
    description: text('description'),
    metaTitle: text('meta_title'),
    metaDescription: text('meta_description'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [uniqueIndex('product_translations_product_locale_idx').on(table.productId, table.locale)],
)

export const productMediaTable = sqliteTable(
  'product_media',
  {
    id: idColumn(),
    productId: text('product_id')
      .notNull()
      .references(() => productsTable.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('gallery'),
    url: text('url').notNull(),
    cloudinaryPublicId: text('cloudinary_public_id'),
    altText: text('alt_text'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAtColumn(),
  },
  (table) => [index('product_media_product_sort_idx').on(table.productId, table.sortOrder)],
)

export const categoriesTable = sqliteTable(
  'categories',
  {
    id: idColumn(),
    slug: text('slug').notNull().unique(),
    isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    imageUrl: text('image_url'),
    cloudinaryPublicId: text('cloudinary_public_id'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index('categories_featured_sort_idx').on(table.isFeatured, table.sortOrder)],
)

export const categoryTranslationsTable = sqliteTable(
  'category_translations',
  {
    id: idColumn(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categoriesTable.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [uniqueIndex('category_translations_category_locale_idx').on(table.categoryId, table.locale)],
)

export const productCategoriesTable = sqliteTable(
  'product_categories',
  {
    productId: text('product_id')
      .notNull()
      .references(() => productsTable.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categoriesTable.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAtColumn(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.categoryId] }),
    index('product_categories_category_idx').on(table.categoryId),
  ],
)

export const productAddonsTable = sqliteTable(
  'product_addons',
  {
    id: idColumn(),
    productId: text('product_id')
      .notNull()
      .references(() => productsTable.id, { onDelete: 'cascade' }),
    priceAmount: integer('price_amount').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index('product_addons_product_active_sort_idx').on(table.productId, table.isActive, table.sortOrder)],
)

export const productAddonTranslationsTable = sqliteTable(
  'product_addon_translations',
  {
    id: idColumn(),
    productAddonId: text('product_addon_id')
      .notNull()
      .references(() => productAddonsTable.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('product_addon_translations_addon_locale_idx').on(table.productAddonId, table.locale),
  ],
)

export const productsRelations = relations(productsTable, ({ many }) => ({
  translations: many(productTranslationsTable),
  media: many(productMediaTable),
  categoryLinks: many(productCategoriesTable),
  addons: many(productAddonsTable),
}))

export const categoriesRelations = relations(categoriesTable, ({ many }) => ({
  translations: many(categoryTranslationsTable),
  productLinks: many(productCategoriesTable),
}))
