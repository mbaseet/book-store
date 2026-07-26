import { and, asc, eq, inArray } from 'drizzle-orm'
import type { StorefrontLocale } from '@shared/constants'
import { createDb } from '../db'
import {
  governoratesTable,
  productAddonTranslationsTable,
  productAddonsTable,
  productMediaTable,
  productTranslationsTable,
  productsTable,
  promoCodesTable,
  siteSettingsTable,
} from '../db/schema'
import type { EligiblePromoCode, PriceableProduct } from './pricing'

type Database = ReturnType<typeof createDb>
export type ConfiguredPaymentMethod = 'instapay' | 'mobile_wallet'
export type CheckoutProduct = PriceableProduct & {
  personalizationDefinition: string | null
  personalizationVersion: number
}

type LocalizedRow = { locale: string }

function resolveLocalized<T extends LocalizedRow>(rows: T[], locale: StorefrontLocale) {
  return rows.find((row) => row.locale === locale) ?? rows.find((row) => row.locale === 'en') ?? rows.find((row) => row.locale === 'ar') ?? null
}

export function localeFromRequest(request: Request): StorefrontLocale {
  const firstLanguage = request.headers
    .get('accept-language')
    ?.split(',')[0]
    ?.trim()
    .toLocaleLowerCase('en-US')

  return firstLanguage?.startsWith('en') ? 'en' : 'ar'
}

export async function loadCheckoutProducts(
  db: Database,
  productIds: string[],
  locale: StorefrontLocale,
): Promise<CheckoutProduct[]> {
  const uniqueProductIds = [...new Set(productIds)]
  if (uniqueProductIds.length === 0) return []

  const products = await db
    .select({
      id: productsTable.id,
      slug: productsTable.slug,
      basePriceAmount: productsTable.basePriceAmount,
      salePriceAmount: productsTable.salePriceAmount,
      personalizationDefinition: productsTable.personalizationDefinition,
      personalizationVersion: productsTable.personalizationVersion,
    })
    .from(productsTable)
    .where(and(inArray(productsTable.id, uniqueProductIds), eq(productsTable.status, 'published')))

  const translations = await db
    .select({
      productId: productTranslationsTable.productId,
      locale: productTranslationsTable.locale,
      title: productTranslationsTable.title,
    })
    .from(productTranslationsTable)
    .where(inArray(productTranslationsTable.productId, uniqueProductIds))

  const media = await db
    .select({
      productId: productMediaTable.productId,
      url: productMediaTable.url,
    })
    .from(productMediaTable)
    .where(inArray(productMediaTable.productId, uniqueProductIds))
    .orderBy(asc(productMediaTable.sortOrder), asc(productMediaTable.createdAt))

  const addons = await db
    .select({
      id: productAddonsTable.id,
      productId: productAddonsTable.productId,
      priceAmount: productAddonsTable.priceAmount,
    })
    .from(productAddonsTable)
    .where(and(inArray(productAddonsTable.productId, uniqueProductIds), eq(productAddonsTable.isActive, true)))
    .orderBy(asc(productAddonsTable.sortOrder))

  const addonIds = addons.map((addon) => addon.id)
  const addonTranslations =
    addonIds.length === 0
      ? []
      : await db
          .select({
            productAddonId: productAddonTranslationsTable.productAddonId,
            locale: productAddonTranslationsTable.locale,
            name: productAddonTranslationsTable.name,
          })
          .from(productAddonTranslationsTable)
          .where(inArray(productAddonTranslationsTable.productAddonId, addonIds))

  const translationsByProduct = new Map<string, typeof translations>()
  for (const translation of translations) {
    const rows = translationsByProduct.get(translation.productId) ?? []
    rows.push(translation)
    translationsByProduct.set(translation.productId, rows)
  }
  const imageByProduct = new Map<string, string>()
  for (const image of media) {
    if (!imageByProduct.has(image.productId)) imageByProduct.set(image.productId, image.url)
  }
  const addonTranslationsByAddon = new Map<string, typeof addonTranslations>()
  for (const translation of addonTranslations) {
    const rows = addonTranslationsByAddon.get(translation.productAddonId) ?? []
    rows.push(translation)
    addonTranslationsByAddon.set(translation.productAddonId, rows)
  }
  const addonsByProduct = new Map<string, typeof addons>()
  for (const addon of addons) {
    const rows = addonsByProduct.get(addon.productId) ?? []
    rows.push(addon)
    addonsByProduct.set(addon.productId, rows)
  }

  return products.flatMap((product) => {
    const translation = resolveLocalized(translationsByProduct.get(product.id) ?? [], locale)
    if (!translation) return []

    return [
      {
        ...product,
        title: translation.title,
        imageUrl: imageByProduct.get(product.id) ?? null,
        addons: (addonsByProduct.get(product.id) ?? []).flatMap((addon) => {
          const addonTranslation = resolveLocalized(addonTranslationsByAddon.get(addon.id) ?? [], locale)
          return addonTranslation
            ? [{ id: addon.id, name: addonTranslation.name, priceAmount: addon.priceAmount }]
            : []
        }),
      },
    ]
  })
}

export async function loadActiveGovernorate(db: Database, code: string) {
  const [governorate] = await db
    .select()
    .from(governoratesTable)
    .where(and(eq(governoratesTable.code, code.trim().toLocaleLowerCase('en-US')), eq(governoratesTable.isActive, true)))
    .limit(1)
  return governorate ?? null
}

export async function loadPromoCode(db: Database, rawCode: string | undefined): Promise<EligiblePromoCode | null> {
  if (!rawCode) return null

  const [promoCode] = await db
    .select()
    .from(promoCodesTable)
    .where(eq(promoCodesTable.code, rawCode.trim().toLocaleUpperCase('en-US')))
    .limit(1)
  return promoCode ?? null
}

export async function loadFreeShippingThresholdAmount(db: Database) {
  const [setting] = await db
    .select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, 'free_shipping_threshold_amount'))
    .limit(1)
  if (!setting?.value) return null

  const amount = Number.parseInt(setting.value, 10)
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null
}

/**
 * Checkout must validate the same payment rails shown to the customer. This
 * prevents a forged request from recording an order against an empty or
 * disabled transfer method.
 */
export async function loadConfiguredPaymentMethods(db: Database): Promise<Set<ConfiguredPaymentMethod>> {
  const [setting] = await db
    .select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, 'payment_details'))
    .limit(1)
  if (!setting?.value) return new Set()

  try {
    const parsed: unknown = JSON.parse(setting.value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Set()
    const details = parsed as Record<string, unknown>
    const methods = new Set<ConfiguredPaymentMethod>()
    if (typeof details.instapay === 'string' && details.instapay.trim()) methods.add('instapay')
    if (typeof details.mobileWallet === 'string' && details.mobileWallet.trim()) methods.add('mobile_wallet')
    return methods
  } catch {
    return new Set()
  }
}
