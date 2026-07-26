import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { categoryWriteSchema, productWriteSchema, type CategoryWriteInput, type ProductWriteInput } from '@shared/contracts/admin-catalog'
import { parsePersonalizationDefinition, serializePersonalizationDefinition } from '../services/personalization'
import { createDb } from '../db'
import {
  categoriesTable,
  categoryTranslationsTable,
  productAddonTranslationsTable,
  productAddonsTable,
  productCategoriesTable,
  productMediaTable,
  productTranslationsTable,
  productsTable,
  orderItemsTable,
} from '../db/schema'
import { errorResponse, hasTrustedOrigin, parseJson } from '../lib/http'
import { requireAdmin } from './auth'
import { CatalogMediaError, destroyCatalogMediaAssets } from '../services/catalog-media'
import type { Bindings } from '../types'

type AppEnvironment = { Bindings: Bindings }
type Translation = { locale: string }

const PRODUCT_LIST_PAGE_SIZE = 20
const MAX_PRODUCT_LIST_PAGE_SIZE = 100

function localizationPair<T extends Translation>(translations: T[]) {
  const ar = translations.find((translation) => translation.locale === 'ar')
  const en = translations.find((translation) => translation.locale === 'en')
  if (!ar || !en) throw new Error('Both Arabic and English translations are required.')
  return { ar, en }
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

function productListQuery(context: { req: { query(name: string): string | undefined } }) {
  const rawQuery = context.req.query('q')?.trim() ?? ''
  if (rawQuery.length > 100) return { error: 'The search text is too long.' } as const
  const status = context.req.query('status')?.trim() ?? ''
  if (status && !['draft', 'published', 'archived'].includes(status)) {
    return { error: 'The selected product status is invalid.' } as const
  }
  const categoryId = context.req.query('categoryId')?.trim() ?? ''
  if (categoryId && !validUuid(categoryId)) return { error: 'The selected category is invalid.' } as const
  const rawPage = Number.parseInt(context.req.query('page') ?? '1', 10)
  const page = Number.isSafeInteger(rawPage) ? Math.min(Math.max(rawPage, 1), 100_000) : 1
  const rawPageSize = Number.parseInt(context.req.query('pageSize') ?? String(PRODUCT_LIST_PAGE_SIZE), 10)
  const pageSize = Number.isSafeInteger(rawPageSize)
    ? Math.min(Math.max(rawPageSize, 1), MAX_PRODUCT_LIST_PAGE_SIZE)
    : PRODUCT_LIST_PAGE_SIZE
  const sort = context.req.query('sort') ?? 'updated_desc'
  if (!['updated_desc', 'created_desc', 'title_asc', 'price_asc', 'price_desc'].includes(sort)) {
    return { error: 'The selected product sort is invalid.' } as const
  }
  return { rawQuery, status, categoryId, page, pageSize, sort } as const
}

function productListOrder(sort: string) {
  // A product without a sale uses its base price at checkout. Sorting on the
  // nullable sale column would put those products in the wrong position in
  // SQLite, so use the same effective price that pricing uses.
  const effectivePrice = sql<number>`coalesce(${productsTable.salePriceAmount}, ${productsTable.basePriceAmount})`
  switch (sort) {
    case 'created_desc':
      return [desc(productsTable.createdAt)] as const
    case 'price_asc':
      return [asc(effectivePrice), asc(productsTable.slug)] as const
    case 'price_desc':
      return [desc(effectivePrice), asc(productsTable.slug)] as const
    case 'title_asc':
      // List titles are localized separately; slug is deterministic and is a
      // stable admin fallback when both locale titles are available.
      return [asc(productsTable.slug)] as const
    default:
      return [desc(productsTable.updatedAt), desc(productsTable.createdAt)] as const
  }
}

async function categoryIdsExist(db: ReturnType<typeof createDb>, categoryIds: string[]) {
  if (categoryIds.length === 0) return true
  const found = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(inArray(categoriesTable.id, [...new Set(categoryIds)]))
  return found.length === new Set(categoryIds).size
}

async function replaceProductRelations(
  db: ReturnType<typeof createDb>,
  productId: string,
  input: ProductWriteInput,
) {
  const categoryRows = input.categoryIds.map((categoryId, index) => ({ productId, categoryId, sortOrder: index }))
  const mediaRows = input.media.map((media) => ({
    id: crypto.randomUUID(),
    productId,
    kind: media.kind,
    url: media.url,
    cloudinaryPublicId: media.cloudinaryPublicId ?? null,
    altText: media.altText ?? null,
    sortOrder: media.sortOrder,
  }))
  const addonRows = input.addons.map((addon) => ({
    id: crypto.randomUUID(),
    productId,
    priceAmount: addon.priceAmount,
    isActive: addon.isActive,
    sortOrder: addon.sortOrder,
  }))
  const addonTranslationRows = input.addons.flatMap((addon, index) => {
    const pair = localizationPair(addon.translations)
    return [
      {
        id: crypto.randomUUID(),
        productAddonId: addonRows[index].id,
        locale: pair.ar.locale,
        name: pair.ar.name,
        description: pair.ar.description ?? null,
      },
      {
        id: crypto.randomUUID(),
        productAddonId: addonRows[index].id,
        locale: pair.en.locale,
        name: pair.en.name,
        description: pair.en.description ?? null,
      },
    ]
  })

  // Clearing a changed add-on only nulls a historical foreign key; the order
  // snapshot keeps its own name, price, and total for audit accuracy.
  await db.batch([
    db.delete(productCategoriesTable).where(eq(productCategoriesTable.productId, productId)),
    db.delete(productMediaTable).where(eq(productMediaTable.productId, productId)),
    db.delete(productAddonsTable).where(eq(productAddonsTable.productId, productId)),
  ])
  if (categoryRows.length > 0) await db.insert(productCategoriesTable).values(categoryRows)
  if (mediaRows.length > 0) await db.insert(productMediaTable).values(mediaRows)
  if (addonRows.length > 0) {
    await db.batch([
      db.insert(productAddonsTable).values(addonRows),
      db.insert(productAddonTranslationsTable).values(addonTranslationRows),
    ])
  }
}

async function saveProduct(
  db: ReturnType<typeof createDb>,
  input: ProductWriteInput,
  productId?: string,
) {
  if (!(await categoryIdsExist(db, input.categoryIds))) throw new Error('One or more selected categories do not exist.')
  const pair = localizationPair(input.translations)
  const id = productId ?? crypto.randomUUID()
  const now = new Date()
  const [existingPersonalization] = productId
    ? await db
        .select({
          personalizationDefinition: productsTable.personalizationDefinition,
          personalizationVersion: productsTable.personalizationVersion,
        })
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1)
    : []
  const requestedDefinition = input.personalizationDefinition === undefined
    ? existingPersonalization
      ? {
          serialized: existingPersonalization.personalizationDefinition,
          version: existingPersonalization.personalizationVersion,
        }
      : { serialized: null, version: 1 }
    : (() => {
        const serialized = serializePersonalizationDefinition(input.personalizationDefinition)
        const changed = serialized !== (existingPersonalization?.personalizationDefinition ?? null)
        return {
          serialized,
          version: existingPersonalization ? existingPersonalization.personalizationVersion + (changed ? 1 : 0) : 1,
        }
      })()
  const writeProduct = productId
    ? db
        .update(productsTable)
        .set({
          slug: input.slug,
          status: input.status,
          basePriceAmount: input.basePriceAmount,
          salePriceAmount: input.salePriceAmount ?? null,
          isFeatured: input.isFeatured,
          sortOrder: input.sortOrder,
          personalizationDefinition: requestedDefinition.serialized,
          personalizationVersion: requestedDefinition.version,
          updatedAt: now,
        })
        .where(eq(productsTable.id, id))
    : db.insert(productsTable).values({
        id,
        slug: input.slug,
        status: input.status,
        basePriceAmount: input.basePriceAmount,
        salePriceAmount: input.salePriceAmount ?? null,
        isFeatured: input.isFeatured,
        sortOrder: input.sortOrder,
        personalizationDefinition: requestedDefinition.serialized,
        personalizationVersion: requestedDefinition.version,
      })
  const upsertTranslation = (translation: typeof pair.ar) =>
    db
      .insert(productTranslationsTable)
      .values({
        productId: id,
        locale: translation.locale,
        title: translation.title,
        shortDescription: translation.shortDescription ?? null,
        description: translation.description ?? null,
        metaTitle: translation.metaTitle ?? null,
        metaDescription: translation.metaDescription ?? null,
      })
      .onConflictDoUpdate({
        target: [productTranslationsTable.productId, productTranslationsTable.locale],
        set: {
          title: translation.title,
          shortDescription: translation.shortDescription ?? null,
          description: translation.description ?? null,
          metaTitle: translation.metaTitle ?? null,
          metaDescription: translation.metaDescription ?? null,
          updatedAt: now,
        },
      })
  await db.batch([writeProduct, upsertTranslation(pair.ar), upsertTranslation(pair.en)])
  await replaceProductRelations(db, id, input)
  return id
}

async function saveCategory(
  db: ReturnType<typeof createDb>,
  input: CategoryWriteInput,
  categoryId?: string,
) {
  const id = categoryId ?? crypto.randomUUID()
  const pair = localizationPair(input.translations)
  const now = new Date()
  const writeCategory = categoryId
    ? db
        .update(categoriesTable)
        .set({
          slug: input.slug,
          isFeatured: input.isFeatured,
          sortOrder: input.sortOrder,
          imageUrl: input.imageUrl ?? null,
          cloudinaryPublicId: input.cloudinaryPublicId ?? null,
          updatedAt: now,
        })
        .where(eq(categoriesTable.id, id))
    : db.insert(categoriesTable).values({
        id,
        slug: input.slug,
        isFeatured: input.isFeatured,
        sortOrder: input.sortOrder,
        imageUrl: input.imageUrl ?? null,
        cloudinaryPublicId: input.cloudinaryPublicId ?? null,
      })
  const upsertTranslation = (translation: typeof pair.ar) =>
    db
      .insert(categoryTranslationsTable)
      .values({
        categoryId: id,
        locale: translation.locale,
        name: translation.name,
        description: translation.description ?? null,
      })
      .onConflictDoUpdate({
        target: [categoryTranslationsTable.categoryId, categoryTranslationsTable.locale],
        set: { name: translation.name, description: translation.description ?? null, updatedAt: now },
      })
  await db.batch([writeCategory, upsertTranslation(pair.ar), upsertTranslation(pair.en)])
  return id
}

export const adminCatalogRoutes = new Hono<AppEnvironment>()

adminCatalogRoutes.get('/admin/categories', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const db = createDb(context.env)
  const [categories, translations] = await Promise.all([
    db.select().from(categoriesTable).orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.createdAt)),
    db.select().from(categoryTranslationsTable),
  ])
  return context.json({
    categories: categories.map((category) => ({
      ...category,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
      translations: translations
        .filter((translation) => translation.categoryId === category.id)
        .map((translation) => ({ locale: translation.locale, name: translation.name, description: translation.description })),
    })),
  })
})

adminCatalogRoutes.post('/admin/categories', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const parsed = await parseJson(context, categoryWriteSchema)
  if (!parsed.success) return parsed.response
  try {
    const id = await saveCategory(createDb(context.env), parsed.data)
    return context.json({ id }, 201)
  } catch {
    return errorResponse(context, 409, 'category_conflict', 'This category could not be saved. Its slug may already be in use.')
  }
})

adminCatalogRoutes.put('/admin/categories/:id', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!validUuid(id)) return errorResponse(context, 404, 'category_not_found', 'The category was not found.')
  const parsed = await parseJson(context, categoryWriteSchema)
  if (!parsed.success) return parsed.response
  const db = createDb(context.env)
  const [existing] = await db.select({ id: categoriesTable.id }).from(categoriesTable).where(eq(categoriesTable.id, id)).limit(1)
  if (!existing) return errorResponse(context, 404, 'category_not_found', 'The category was not found.')
  try {
    await saveCategory(db, parsed.data, id)
    return context.json({ id })
  } catch {
    return errorResponse(context, 409, 'category_conflict', 'This category could not be saved. Its slug may already be in use.')
  }
})

adminCatalogRoutes.delete('/admin/categories/:id', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!validUuid(id)) return errorResponse(context, 404, 'category_not_found', 'The category was not found.')
  await createDb(context.env).delete(categoriesTable).where(eq(categoriesTable.id, id))
  return context.body(null, 204)
})

adminCatalogRoutes.get('/admin/products', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const query = productListQuery(context)
  if ('error' in query && typeof query.error === 'string') {
    return errorResponse(context, 422, 'invalid_product_list_query', query.error)
  }

  const db = createDb(context.env)
  const conditions = []
  if (query.status) conditions.push(eq(productsTable.status, query.status))
  if (query.categoryId) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM product_categories
        WHERE product_categories.product_id = ${productsTable.id}
          AND product_categories.category_id = ${query.categoryId}
      )`,
    )
  }
  if (query.rawQuery) {
    const pattern = `%${escapeLike(query.rawQuery)}%`
    conditions.push(
      sql`(
        lower(${productsTable.slug}) LIKE lower(${pattern}) ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM product_translations
          WHERE product_translations.product_id = ${productsTable.id}
            AND lower(product_translations.title) LIKE lower(${pattern}) ESCAPE '\\'
        )
      )`,
    )
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined
  const [{ total }] = await db.select({ total: count() }).from(productsTable).where(where)
  const products = await db
    .select()
    .from(productsTable)
    .where(where)
    .orderBy(...productListOrder(query.sort))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
  const productIds = products.map((product) => product.id)
  const [translations, media, categoryLinks] = productIds.length === 0
    ? [[], [], []] as const
    : await Promise.all([
        db.select().from(productTranslationsTable).where(inArray(productTranslationsTable.productId, productIds)),
        db
          .select()
          .from(productMediaTable)
          .where(inArray(productMediaTable.productId, productIds))
          .orderBy(asc(productMediaTable.sortOrder), asc(productMediaTable.createdAt)),
        db
          .select({
            productId: productCategoriesTable.productId,
            categoryId: categoriesTable.id,
            slug: categoriesTable.slug,
          })
          .from(productCategoriesTable)
          .innerJoin(categoriesTable, eq(categoriesTable.id, productCategoriesTable.categoryId))
          .where(inArray(productCategoriesTable.productId, productIds)),
      ])
  const categoryIds = categoryLinks.map((link) => link.categoryId)
  const categoryTranslations = categoryIds.length === 0
    ? []
    : await db.select().from(categoryTranslationsTable).where(inArray(categoryTranslationsTable.categoryId, categoryIds))

  return context.json({
    total,
    page: query.page,
    pageSize: query.pageSize,
    products: products.map((product) => ({
      ...product,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      coverImageUrl:
        media.find((item) => item.productId === product.id && item.kind === 'cover')?.url ??
        media.find((item) => item.productId === product.id)?.url ??
        null,
      categoryIds: categoryLinks.filter((link) => link.productId === product.id).map((link) => link.categoryId),
      categories: categoryLinks
        .filter((link) => link.productId === product.id)
        .map((link) => {
          const names = categoryTranslations.filter((translation) => translation.categoryId === link.categoryId)
          const english = names.find((translation) => translation.locale === 'en') ?? names.find((translation) => translation.locale === 'ar')
          return { id: link.categoryId, slug: link.slug, name: english?.name ?? link.slug }
        }),
      translations: translations
        .filter((translation) => translation.productId === product.id)
        .map((translation) => ({
          locale: translation.locale,
          title: translation.title,
          shortDescription: translation.shortDescription,
          description: translation.description,
          metaTitle: translation.metaTitle,
          metaDescription: translation.metaDescription,
        })),
    })),
  })
})

adminCatalogRoutes.get('/admin/products/:id', async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!validUuid(id)) return errorResponse(context, 404, 'product_not_found', 'The product was not found.')
  const db = createDb(context.env)
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1)
  if (!product) return errorResponse(context, 404, 'product_not_found', 'The product was not found.')
  const [translations, media, categories, addons] = await Promise.all([
    db.select().from(productTranslationsTable).where(eq(productTranslationsTable.productId, id)),
    db.select().from(productMediaTable).where(eq(productMediaTable.productId, id)).orderBy(asc(productMediaTable.sortOrder)),
    db.select().from(productCategoriesTable).where(eq(productCategoriesTable.productId, id)).orderBy(asc(productCategoriesTable.sortOrder)),
    db.select().from(productAddonsTable).where(eq(productAddonsTable.productId, id)).orderBy(asc(productAddonsTable.sortOrder)),
  ])
  const addonTranslations = addons.length === 0 ? [] : await db.select().from(productAddonTranslationsTable).where(inArray(productAddonTranslationsTable.productAddonId, addons.map((addon) => addon.id)))
  return context.json({
    product: {
      ...product,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      personalizationDefinition: parsePersonalizationDefinition(
        product.personalizationDefinition,
        product.personalizationVersion,
      ),
      translations,
      media,
      categoryIds: categories.map((category) => category.categoryId),
      addons: addons.map((addon) => ({
        ...addon,
        translations: addonTranslations.filter((translation) => translation.productAddonId === addon.id),
      })),
    },
  })
})

adminCatalogRoutes.post('/admin/products', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const parsed = await parseJson(context, productWriteSchema)
  if (!parsed.success) return parsed.response
  try {
    const id = await saveProduct(createDb(context.env), parsed.data)
    return context.json({ id }, 201)
  } catch (error) {
    const message = error instanceof Error && error.message.includes('categories') ? error.message : 'This product could not be saved. Its slug may already be in use.'
    return errorResponse(context, 409, 'product_conflict', message)
  }
})

adminCatalogRoutes.put('/admin/products/:id', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!validUuid(id)) return errorResponse(context, 404, 'product_not_found', 'The product was not found.')
  const parsed = await parseJson(context, productWriteSchema)
  if (!parsed.success) return parsed.response
  const db = createDb(context.env)
  const [existing] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, id)).limit(1)
  if (!existing) return errorResponse(context, 404, 'product_not_found', 'The product was not found.')
  try {
    await saveProduct(db, parsed.data, id)
    return context.json({ id })
  } catch (error) {
    const message = error instanceof Error && error.message.includes('categories') ? error.message : 'This product could not be saved. Its slug may already be in use.'
    return errorResponse(context, 409, 'product_conflict', message)
  }
})

adminCatalogRoutes.delete('/admin/products/:id', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!validUuid(id)) return errorResponse(context, 404, 'product_not_found', 'The product was not found.')
  if (context.req.query('confirm') !== 'delete-draft') {
    return errorResponse(context, 422, 'delete_confirmation_required', 'Type the permanent deletion confirmation before removing this draft.')
  }
  const db = createDb(context.env)
  const [product] = await db
    .select({ id: productsTable.id, status: productsTable.status })
    .from(productsTable)
    .where(eq(productsTable.id, id))
    .limit(1)
  if (!product) return errorResponse(context, 404, 'product_not_found', 'The product was not found.')
  if (product.status !== 'draft') {
    return errorResponse(context, 409, 'product_not_deletable', 'Only an unused draft can be permanently deleted. Archive published products instead.')
  }
  const [usedOrderItem] = await db
    .select({ id: orderItemsTable.id })
    .from(orderItemsTable)
    .where(eq(orderItemsTable.productId, id))
    .limit(1)
  if (usedOrderItem) {
    return errorResponse(context, 409, 'product_not_deletable', 'This draft is referenced by an order and must be archived instead.')
  }
  const media = await db
    .select({ cloudinaryPublicId: productMediaTable.cloudinaryPublicId })
    .from(productMediaTable)
    .where(eq(productMediaTable.productId, id))
  try {
    await destroyCatalogMediaAssets(context.env, media.map((item) => item.cloudinaryPublicId))
  } catch (error) {
    if (error instanceof CatalogMediaError) {
      return errorResponse(context, 500, 'catalog_media_cleanup_failed', 'Catalog media cleanup failed. Please try again before deleting this draft.')
    }
    return errorResponse(context, 500, 'catalog_media_cleanup_failed', 'Catalog media cleanup failed. Please try again before deleting this draft.')
  }
  await db.delete(productsTable).where(eq(productsTable.id, id))
  return context.body(null, 204)
})

adminCatalogRoutes.post('/admin/products/:id/archive', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!validUuid(id)) return errorResponse(context, 404, 'product_not_found', 'The product was not found.')
  const result = await createDb(context.env)
    .update(productsTable)
    .set({ status: 'archived', isFeatured: false, updatedAt: new Date() })
    .where(eq(productsTable.id, id))
    .run()
  if (Number(result.meta.changes ?? 0) !== 1) return errorResponse(context, 404, 'product_not_found', 'The product was not found.')
  return context.json({ id, status: 'archived' })
})

adminCatalogRoutes.post('/admin/products/:id/restore', async (context) => {
  if (!hasTrustedOrigin(context)) return errorResponse(context, 403, 'untrusted_origin', 'This request must come from this storefront.')
  const admin = await requireAdmin(context)
  if (!admin) return errorResponse(context, 401, 'not_authenticated', 'Please sign in to continue.')
  const id = context.req.param('id')
  if (!validUuid(id)) return errorResponse(context, 404, 'product_not_found', 'The product was not found.')
  let payload: unknown = {}
  try {
    payload = await context.req.json<unknown>()
  } catch {
    // A no-body restore intentionally returns the product to draft.
  }
  const requestedStatus = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as { status?: unknown }).status
    : undefined
  if (requestedStatus !== undefined && requestedStatus !== 'draft' && requestedStatus !== 'published') {
    return errorResponse(context, 422, 'invalid_restore_status', 'Choose draft or published when restoring a product.')
  }
  const status = requestedStatus === 'published' ? 'published' : 'draft'
  const result = await createDb(context.env)
    .update(productsTable)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(productsTable.id, id), eq(productsTable.status, 'archived')))
    .run()
  if (Number(result.meta.changes ?? 0) !== 1) {
    return errorResponse(context, 409, 'product_not_archived', 'Only an archived product can be restored.')
  }
  return context.json({ id, status })
})
