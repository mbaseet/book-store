import type { TrackingSettings } from './api'

/**
 * Consent is deliberately the only browser-persisted tracking value. It never
 * contains a name, email, phone number, order number, or checkout content.
 */
export const TRACKING_CONSENT_STORAGE_KEY = 'mint-meow.tracking-consent.v1'
export const TRACKING_CONSENT_CHANGE_EVENT = 'mint-meow:tracking-consent-change'

export type TrackingConsent = 'granted' | 'denied'
export type TrackingConsentState = TrackingConsent | null

type StoredTrackingConsent = {
  version: 2
  decision: TrackingConsent
  providerSignature: string | null
}

export type CommerceTrackingEventName = 'view_item' | 'add_to_cart' | 'begin_checkout' | 'add_payment_info' | 'purchase'
export type TrackingPaymentMethod = 'instapay' | 'mobile_wallet' | 'cash_on_delivery'

export type CommerceTrackingItem = {
  /** Public catalog ID or slug only - never a child, customer, or order identifier. */
  itemId: string
  quantity?: number
  /** Integer EGP piastres. */
  priceAmount?: number
}

export type CommerceTrackingPayload = {
  /** Public catalog rows only. Names, personalization, and media URLs are excluded by design. */
  items?: readonly CommerceTrackingItem[]
  /** Integer EGP piastres. Do not pass payment-proof, customer, or order identifiers. */
  valueAmount?: number
  /** Only for add_payment_info. This fixed enum cannot contain payment details. */
  paymentMethod?: TrackingPaymentMethod
}

type SafeCommerceItem = {
  itemId: string
  quantity: number
  priceAmount?: number
}

type SafeCommerceEvent = {
  name: CommerceTrackingEventName
  items: SafeCommerceItem[]
  valueAmount?: number
  paymentMethod?: TrackingPaymentMethod
}

type ActiveTracking = {
  settings: TrackingSettings
}

type TrackingWindow = Window & typeof globalThis & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
  fbq?: MetaPixelQueue
  ttq?: TikTokPixelQueue
}

type MetaPixelQueue = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue?: unknown[][]
  push?: (...args: unknown[]) => void
  loaded?: boolean
  version?: string
}

type TikTokPixelQueue = unknown[] & {
  _i?: Record<string, unknown>
  _t?: Record<string, number>
  _o?: Record<string, unknown>
  methods?: string[]
  setAndDefer?: (target: TikTokPixelQueue, method: string) => void
  load?: (pixelId: string) => void
  page?: () => void
  track?: (event: string, payload?: Record<string, unknown>) => void
}

const commerceEventNames = new Set<CommerceTrackingEventName>([
  'view_item',
  'add_to_cart',
  'begin_checkout',
  'add_payment_info',
  'purchase',
])

const paymentMethods = new Set<TrackingPaymentMethod>(['instapay', 'mobile_wallet', 'cash_on_delivery'])

const scriptLoadKeys = new Set<string>()
const initializedGa4Measurements = new Set<string>()
const initializedMetaPixels = new Set<string>()
const initializedTikTokPixels = new Set<string>()
const sentPageViews = new Set<string>()
let activeTracking: ActiveTracking | null = null

function browserWindow(): TrackingWindow | null {
  return typeof window === 'undefined' ? null : window as TrackingWindow
}

function browserDocument() {
  return typeof document === 'undefined' ? null : document
}

function parseStoredTrackingConsent(value: string | null): StoredTrackingConsent | null {
  if (!value) return null
  // Legacy v1 values deliberately remain readable without settings, but are
  // treated as unmatched once a provider configuration is available. That
  // safely asks for a new choice after this consent model is introduced.
  if (value === 'granted' || value === 'denied') {
    return { version: 2, decision: value, providerSignature: null }
  }
  try {
    const candidate: unknown = JSON.parse(value)
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
    const record = candidate as Record<string, unknown>
    if (record.version !== 2 || (record.decision !== 'granted' && record.decision !== 'denied')) return null
    if (record.providerSignature !== null && typeof record.providerSignature !== 'string') return null
    return { version: 2, decision: record.decision, providerSignature: record.providerSignature }
  } catch {
    return null
  }
}

/**
 * A consent decision is scoped to the configured public provider IDs. Adding
 * or replacing a provider resets an earlier choice instead of silently
 * expanding who receives browser activity.
 */
export function readTrackingConsent(settings?: TrackingSettings): TrackingConsentState {
  const currentWindow = browserWindow()
  if (!currentWindow) return null
  try {
    const record = parseStoredTrackingConsent(currentWindow.localStorage.getItem(TRACKING_CONSENT_STORAGE_KEY))
    if (!record) return null
    if (settings && record.providerSignature !== trackingProviderSignature(settings)) return null
    return record.decision
  } catch {
    // Privacy modes and embedded browsers can block storage. Tracking remains
    // disabled in that case instead of assuming consent.
    return null
  }
}

export function writeTrackingConsent(consent: TrackingConsent, settings?: TrackingSettings): void {
  const currentWindow = browserWindow()
  if (!currentWindow) return
  try {
    currentWindow.localStorage.setItem(
      TRACKING_CONSENT_STORAGE_KEY,
      JSON.stringify({ version: 2, decision: consent, providerSignature: settings ? trackingProviderSignature(settings) : null } satisfies StoredTrackingConsent),
    )
  } catch {
    // A storage failure must never turn into implied consent.
    return
  }
  try {
    currentWindow.dispatchEvent(new CustomEvent(TRACKING_CONSENT_CHANGE_EVENT))
  } catch {
    // The caller still has the stored decision even if an embedded browser
    // cannot dispatch a custom event.
  }
}

export function clearTrackingConsent(): void {
  const currentWindow = browserWindow()
  if (!currentWindow) return
  try {
    currentWindow.localStorage.removeItem(TRACKING_CONSENT_STORAGE_KEY)
  } catch {
    return
  }
  try {
    currentWindow.dispatchEvent(new CustomEvent(TRACKING_CONSENT_CHANGE_EVENT))
  } catch {
    // See writeTrackingConsent: this should not affect the customer flow.
  }
}

function storefrontPath(pathname: string) {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  return path.replace(/^\/(?:ar|en)(?=\/|$)/, '') || '/'
}

export function isAdminPath(pathname: string) {
  const path = storefrontPath(pathname)
  return path === '/admin' || path.startsWith('/admin/')
}

/**
 * Keep third-party code away from routes which may expose account tokens or
 * direct order lookup/confirmation paths. Checkout commerce events should be
 * emitted before navigation to confirmation.
 */
export function isTrackingEligiblePath(pathname: string) {
  const path = storefrontPath(pathname)
  if (path === '/admin' || path.startsWith('/admin/')) return false
  if (path === '/account' || path.startsWith('/account/')) return false
  if (path === '/reset-password' || path.startsWith('/reset-password/')) return false
  if (path === '/track-order' || path.startsWith('/track-order/')) return false
  if (path === '/order-confirmation' || path.startsWith('/order-confirmation/')) return false
  return true
}

/**
 * A vendor SDK loaded in an SPA document cannot be reliably unloaded. This
 * narrow helper gives the router a testable, one-shot clean-document boundary
 * before any route that can display admin or account/order data.
 */
export function forceCleanDocumentForSensitiveRoute(
  pathname: string,
  hasMarkedTrackingScript: boolean,
  reload: () => void,
) {
  if (!hasMarkedTrackingScript || isTrackingEligiblePath(pathname)) return false
  reload()
  return true
}

/**
 * Page events use route templates rather than raw URLs so an order number,
 * token, query string, or hash can never enter an event payload.
 */
export function trackingPagePath(pathname: string) {
  const path = storefrontPath(pathname)
  if (['/', '/stories', '/cart', '/checkout', '/how-it-works', '/faq', '/terms', '/returns', '/privacy', '/contact'].includes(path)) {
    return path
  }
  if (/^\/stories\/[^/]+$/.test(path)) return '/stories/:product'
  if (/^\/order-confirmation\/[^/]+$/.test(path)) return '/order-confirmation'
  return '/other'
}

function hasTrackingProvider(settings: TrackingSettings) {
  return Boolean(
    settings.gtmContainerId
    || settings.ga4MeasurementId
    || settings.metaPixelId
    || settings.tiktokPixelId,
  )
}

function appendExternalScript(key: string, source: string) {
  const currentDocument = browserDocument()
  if (!currentDocument || scriptLoadKeys.has(key)) return
  const alreadyPresent = Array.from(currentDocument.scripts).some(
    (script) => script.dataset.mintMeowTracking === key,
  )
  if (alreadyPresent) {
    scriptLoadKeys.add(key)
    return
  }

  try {
    const script = currentDocument.createElement('script')
    script.async = true
    script.src = source
    script.referrerPolicy = 'strict-origin-when-cross-origin'
    script.dataset.mintMeowTracking = key
    script.onerror = () => {
      // A content blocker should leave the storefront fully functional and
      // allow a later route/configuration change to retry.
      scriptLoadKeys.delete(key)
    }
    scriptLoadKeys.add(key)
    currentDocument.head.appendChild(script)
  } catch {
    // Script injection is strictly best-effort; store functionality never
    // depends on analytics vendor availability.
  }
}

function dataLayer() {
  const currentWindow = browserWindow()
  if (!currentWindow) return null
  currentWindow.dataLayer ??= []
  return currentWindow.dataLayer
}

function ensureGtm(containerId: string) {
  const queue = dataLayer()
  if (!queue) return
  const key = `gtm:${containerId}`
  if (!scriptLoadKeys.has(key)) {
    queue.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
    appendExternalScript(key, `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`)
  }
}

function ensureGa4(measurementId: string) {
  const currentWindow = browserWindow()
  const queue = dataLayer()
  if (!currentWindow || !queue) return
  const key = `ga4:${measurementId}`
  if (!scriptLoadKeys.has(key)) {
    appendExternalScript(key, `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`)
  }
  currentWindow.gtag ??= (...args: unknown[]) => {
    queue.push(args)
  }
  if (!initializedGa4Measurements.has(measurementId)) {
    initializedGa4Measurements.add(measurementId)
    currentWindow.gtag('js', new Date())
    currentWindow.gtag('config', measurementId, { send_page_view: false })
  }
}

function metaPixelQueue() {
  const currentWindow = browserWindow()
  if (!currentWindow) return null
  if (currentWindow.fbq) return currentWindow.fbq

  const queue = ((...args: unknown[]) => {
    if (typeof queue.callMethod === 'function') {
      queue.callMethod(...args)
      return
    }
    queue.queue?.push(args)
  }) as MetaPixelQueue
  queue.queue = []
  queue.push = (...args: unknown[]) => queue(...args)
  queue.loaded = true
  queue.version = '2.0'
  currentWindow.fbq = queue
  return queue
}

function ensureMetaPixel(pixelId: string) {
  const queue = metaPixelQueue()
  if (!queue) return
  if (!initializedMetaPixels.has(pixelId)) {
    initializedMetaPixels.add(pixelId)
    queue('init', pixelId)
  }
  appendExternalScript('meta-pixel', 'https://connect.facebook.net/en_US/fbevents.js')
}

function tikTokPixelQueue() {
  const currentWindow = browserWindow()
  if (!currentWindow) return null
  const existing = currentWindow.ttq
  if (existing && typeof existing.load === 'function' && typeof existing.page === 'function') return existing

  const queue = (existing ?? []) as TikTokPixelQueue
  queue.methods ??= [
    'page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie',
  ]
  queue.setAndDefer ??= (target, method) => {
    const deferredTarget = target as unknown as Record<string, unknown>
    deferredTarget[method] = (...args: unknown[]) => {
      target.push([method, ...args])
    }
  }
  for (const method of queue.methods) queue.setAndDefer(queue, method)
  queue._i ??= {}
  queue._t ??= {}
  queue._o ??= {}
  queue.load ??= (pixelId: string) => {
    queue._i![pixelId] = {}
    queue._t![pixelId] = Date.now()
    queue._o![pixelId] = {}
    appendExternalScript(
      `tiktok:${pixelId}`,
      `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`,
    )
  }
  currentWindow.ttq = queue
  return queue
}

function ensureTikTokPixel(pixelId: string) {
  const queue = tikTokPixelQueue()
  if (!queue || initializedTikTokPixels.has(pixelId)) return
  initializedTikTokPixels.add(pixelId)
  queue.load?.(pixelId)
}

export function trackingProviderSignature(settings: TrackingSettings) {
  return [
    settings.gtmContainerId ?? '',
    settings.ga4MeasurementId ?? '',
    settings.metaPixelId ?? '',
    settings.tiktokPixelId ?? '',
  ].join('|')
}

function emitPageView(settings: TrackingSettings, pathname: string) {
  const safePath = trackingPagePath(pathname)
  const pageKey = `${trackingProviderSignature(settings)}|${safePath}`
  if (sentPageViews.has(pageKey)) return
  sentPageViews.add(pageKey)

  try {
    if (settings.gtmContainerId) {
      dataLayer()?.push({ event: 'page_view', page_path: safePath })
    }
    // When GTM is configured it is the only Google loader. This avoids a
    // second GA4 library/page event when a GA4 tag is managed in GTM.
    if (settings.ga4MeasurementId && !settings.gtmContainerId) {
      browserWindow()?.gtag?.('event', 'page_view', { page_path: safePath })
    }
    if (settings.metaPixelId) metaPixelQueue()?.('track', 'PageView')
    if (settings.tiktokPixelId) tikTokPixelQueue()?.page?.()
  } catch {
    // Vendor queues should never interrupt navigation.
  }
}

export function activateTracking(settings: TrackingSettings, pathname: string) {
  if (readTrackingConsent(settings) !== 'granted' || !isTrackingEligiblePath(pathname) || !hasTrackingProvider(settings)) {
    activeTracking = null
    return
  }

  activeTracking = { settings }
  try {
    if (settings.gtmContainerId) ensureGtm(settings.gtmContainerId)
    if (settings.ga4MeasurementId && !settings.gtmContainerId) ensureGa4(settings.ga4MeasurementId)
    if (settings.metaPixelId) ensureMetaPixel(settings.metaPixelId)
    if (settings.tiktokPixelId) ensureTikTokPixel(settings.tiktokPixelId)
    emitPageView(settings, pathname)
  } catch {
    // Defend the checkout/UI against unusual browser extensions or partial
    // third-party SDK state.
  }
}

export function deactivateTracking() {
  activeTracking = null
}

function safeAmount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000
    ? value
    : null
}

function sanitizeItem(value: unknown): SafeCommerceItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const itemId = typeof candidate.itemId === 'string' ? candidate.itemId.trim() : ''
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(itemId)) return null
  const quantity = candidate.quantity === undefined ? 1 : candidate.quantity
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null
  const priceAmount = candidate.priceAmount === undefined ? null : safeAmount(candidate.priceAmount)
  if (candidate.priceAmount !== undefined && priceAmount === null) return null
  return { itemId, quantity, ...(priceAmount === null ? {} : { priceAmount }) }
}

/**
 * Runtime validation is intentional: this helper can be called from future
 * UI code, but only this narrow event vocabulary and anonymous catalog data
 * can leave the application.
 */
export function sanitizeCommerceEvent(
  name: CommerceTrackingEventName,
  payload: CommerceTrackingPayload = {},
): SafeCommerceEvent | null {
  if (!commerceEventNames.has(name)) return null
  const rawItems = Array.isArray(payload.items) ? payload.items.slice(0, 25) : []
  const items = rawItems.map(sanitizeItem).filter((item): item is SafeCommerceItem => item !== null)
  if (rawItems.length !== items.length) return null

  const explicitValue = payload.valueAmount === undefined ? null : safeAmount(payload.valueAmount)
  if (payload.valueAmount !== undefined && explicitValue === null) return null
  const derivedValue = items.length > 0 && items.every((item) => item.priceAmount !== undefined)
    ? items.reduce((total, item) => total + (item.priceAmount ?? 0) * item.quantity, 0)
    : null
  const valueAmount = explicitValue ?? derivedValue
  const paymentMethod = payload.paymentMethod
  if (name === 'add_payment_info') {
    if (!paymentMethod || !paymentMethods.has(paymentMethod)) return null
  } else if (paymentMethod !== undefined) {
    return null
  }
  return {
    name,
    items,
    ...(valueAmount === null ? {} : { valueAmount }),
    ...(paymentMethod === undefined ? {} : { paymentMethod }),
  }
}

function googleCommercePayload(event: SafeCommerceEvent) {
  return {
    currency: 'EGP',
    ...(event.valueAmount === undefined ? {} : { value: event.valueAmount / 100 }),
    ...(event.paymentMethod === undefined ? {} : { payment_type: event.paymentMethod }),
    ...(event.items.length === 0
      ? {}
      : {
          items: event.items.map((item) => ({
            item_id: item.itemId,
            quantity: item.quantity,
            ...(item.priceAmount === undefined ? {} : { price: item.priceAmount / 100 }),
          })),
        }),
  }
}

function metaEventName(name: CommerceTrackingEventName) {
  return {
    view_item: 'ViewContent',
    add_to_cart: 'AddToCart',
    begin_checkout: 'InitiateCheckout',
    add_payment_info: 'AddPaymentInfo',
    purchase: 'Purchase',
  }[name]
}

function tikTokEventName(name: CommerceTrackingEventName) {
  return {
    view_item: 'ViewContent',
    add_to_cart: 'AddToCart',
    begin_checkout: 'InitiateCheckout',
    add_payment_info: 'AddPaymentInfo',
    purchase: 'CompletePayment',
  }[name]
}

function socialCommercePayload(event: SafeCommerceEvent): Record<string, unknown> {
  return {
    content_type: 'product',
    ...(event.valueAmount === undefined ? {} : { value: event.valueAmount / 100 }),
    ...(event.paymentMethod === undefined ? {} : { payment_method: event.paymentMethod }),
    currency: 'EGP',
    ...(event.items.length === 0
      ? {}
      : {
          content_ids: event.items.map((item) => item.itemId),
          contents: event.items.map((item) => ({
            id: item.itemId,
            quantity: item.quantity,
            ...(item.priceAmount === undefined ? {} : { item_price: item.priceAmount / 100 }),
          })),
        }),
  }
}

/**
 * Emits anonymous commerce events only after explicit consent and activation.
 * It intentionally accepts no customer, child, personalization, media,
 * payment-proof, order-number, email, address, or phone fields.
 */
export function trackCommerceEvent(name: CommerceTrackingEventName, payload: CommerceTrackingPayload = {}) {
  const currentWindow = browserWindow()
  if (!currentWindow || !activeTracking || readTrackingConsent(activeTracking.settings) !== 'granted') return
  if (!isTrackingEligiblePath(currentWindow.location.pathname)) return
  const event = sanitizeCommerceEvent(name, payload)
  if (!event) return

  try {
    const { settings } = activeTracking
    const googlePayload = googleCommercePayload(event)
    if (settings.gtmContainerId) dataLayer()?.push({ event: event.name, ...googlePayload })
    if (settings.ga4MeasurementId && !settings.gtmContainerId) currentWindow.gtag?.('event', event.name, googlePayload)

    const socialPayload = socialCommercePayload(event)
    if (settings.metaPixelId) metaPixelQueue()?.('track', metaEventName(event.name), socialPayload)
    if (settings.tiktokPixelId) tikTokPixelQueue()?.track?.(tikTokEventName(event.name), socialPayload)
  } catch {
    // Tracking cannot affect product, cart, checkout, or order completion.
  }
}
