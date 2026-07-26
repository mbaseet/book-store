import type {
  CheckoutDraftDeliveryInput,
  CheckoutDraftItemInput,
  CheckoutInput,
  CheckoutQuoteInput,
  CheckoutUploadReference,
  PrivateUploadRequest,
} from '@shared/contracts/checkout'

export type Locale = 'ar' | 'en'

export type ProductCard = {
  id: string
  slug: string
  title: string
  shortDescription: string | null
  basePriceAmount: number
  salePriceAmount: number | null
  isFeatured: boolean
  isPersonalized: boolean
  imageUrl: string | null
}

export type LocalizedValue = { en: string; ar: string }

export type PersonalizationField = {
  key: string
  type: 'short_text' | 'long_text' | 'whole_number' | 'single_select' | 'photo' | 'story_language'
  required: boolean
  label: LocalizedValue
  help?: LocalizedValue | null
  min?: number | null
  max?: number | null
  options?: Array<{ value: string; label: LocalizedValue }> | null
  sensitive?: boolean
}

export type PersonalizationDefinition = {
  version: number
  fields: PersonalizationField[]
}

export type Product = ProductCard & {
  description: string | null
  media: Array<{ id: string; kind: string; url: string; altText: string | null }>
  addons: Array<{ id: string; name: string; description: string | null; priceAmount: number }>
  categories: Array<{ slug: string; name: string }>
  personalizationDefinition?: PersonalizationDefinition | null
}

export type Governorate = { code: string; name: string; shippingFeeAmount: number }
export type StorefrontSettings = {
  brandName: string | null
  whatsappUrl: string | null
  freeShippingThresholdAmount: number | null
  paymentDetails: { instapay: string | null; mobileWallet: string | null }
  supportPhone?: string | null
  supportEmail?: string | null
  businessHours?: string | null
  deliveryGuidance?: string | null
  paymentGuidance?: string | null
  announcementBar?: {
    isEnabled: boolean
    translations: Array<{ locale: Locale; text: string; href: string | null }>
  } | null
  seoDefaults?: {
    title: string | null
    description: string | null
    ogImageUrl: string | null
  } | null
}

export type StorefrontFaq = { id: string; question: string; answer: string }
export type StorefrontTestimonial = { id: string; displayName: string; quote: string }

export type CartCheckoutResult = {
  order: {
    orderNumber: string
    status: string
    subtotalAmount: number
    promoDiscountAmount: number
    shippingFeeAmount: number
    totalAmount: number
    currency: string
  }
}

export type CheckoutQuote = {
  subtotalAmount: number
  promoDiscountAmount: number
  shippingFeeAmount: number
  totalAmount: number
  freeShippingApplied: boolean
  currency: string
}

export type CheckoutDraftItem = {
  id: string
  productId: string
  productSlug: string
  productTitle: string
  productImageUrl: string | null
  basePriceAmount: number
  salePriceAmount: number | null
  quantity: number
  // These fields are retained for legacy storybook drafts only. A controlled
  // product definition may intentionally have none of them.
  childName?: string
  storyLanguage?: 'ar_msa' | 'ar_eg' | 'en'
  note?: string
  personalization: Record<string, string | number>
  personalizationDefinition: PersonalizationDefinition | null
  addons: Array<{ id: string; name: string; priceAmount: number }>
}

export type CheckoutDraft = {
  expiresAt: string
  revision: number
  items: CheckoutDraftItem[]
  delivery: CheckoutDraftDeliveryInput
}

export type Customer = { id: string; email: string; phone: string | null; displayName: string | null }
export type CustomerOrder = {
  orderNumber: string
  status: string
  totalAmount: number
  currency: string
  createdAt: string
  itemTitles: string[]
}

export type Admin = { id: string; email: string }

export type LocalizedText = {
  locale: Locale
  title?: string
  name?: string
  description?: string | null
  shortDescription?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  question?: string
  answer?: string
  quote?: string
}

export type AdminCategory = {
  id: string
  slug: string
  isFeatured: boolean
  sortOrder: number
  imageUrl: string | null
  cloudinaryPublicId: string | null
  translations: Array<{ locale: Locale; name: string; description: string | null }>
}

export type AdminProduct = {
  id: string
  slug: string
  status: 'draft' | 'published' | 'archived'
  basePriceAmount: number
  salePriceAmount: number | null
  isFeatured: boolean
  sortOrder: number
  updatedAt?: string
  coverImageUrl?: string | null
  translations: Array<{
    locale: Locale
    title: string
    shortDescription: string | null
    description: string | null
    metaTitle: string | null
    metaDescription: string | null
  }>
  media: Array<{
    id?: string
    kind: 'cover' | 'gallery'
    url: string
    cloudinaryPublicId: string | null
    altText: string | null
    sortOrder: number
  }>
  categoryIds: string[]
  addons: Array<{
    id?: string
    priceAmount: number
    isActive: boolean
    sortOrder: number
    translations: Array<{ locale: Locale; name: string; description: string | null }>
  }>
  personalizationDefinition?: PersonalizationDefinition | null
}

export type AdminProductListItem = Omit<AdminProduct, 'media' | 'categoryIds' | 'addons' | 'personalizationDefinition'> & {
  createdAt?: string
  categoryIds: string[]
  categories: Array<{ id: string; slug: string; name: string }>
}

export type AdminProductListResponse = {
  products: AdminProductListItem[]
  total?: number
  page?: number
  pageSize?: number
}

export type AdminProductListOptions = {
  q?: string
  status?: 'draft' | 'published' | 'archived'
  categoryId?: string
  page?: number
  pageSize?: number
  sort?: 'updated_desc' | 'created_desc' | 'title_asc' | 'price_asc' | 'price_desc'
}

export type AdminOrderSummary = {
  orderNumber: string
  status: string
  customerName: string
  email: string
  phone: string
  totalAmount: number
  currency: string
  createdAt: string
  itemTitles: string[]
}

export type AdminReportRange = 'today' | '7d' | '30d' | '90d' | 'custom'

export type AdminReport = {
  range: {
    preset: AdminReportRange
    from: string
    to: string
    timezone: string
    startsAt: string
    endsAt: string
  }
  summary: {
    submittedOrderCount: number
    confirmedRevenueAmount: number
    pendingPaymentValueAmount: number
    rejectedCancelledValueAmount: number
    averageOrderValueAmount: number
    shippingFeeAmount: number
    promoDiscountAmount: number
    currency: string
  }
  statusMix: Array<{ status: string; orderCount: number; totalAmount: number }>
  dailyTrend: Array<{ date: string; orderCount: number; totalAmount: number; confirmedRevenueAmount: number }>
  topStories: Array<{
    productId: string | null
    productTitle: string
    quantity: number
    orderCount: number
    confirmedRevenueAmount: number
  }>
  promoPerformance: Array<{ code: string; redemptions: number; discountAmount: number; orderValueAmount: number }>
  governorates: Array<{ governorateName: string; orderCount: number; totalAmount: number; shippingFeeAmount: number }>
}

export type AdminOrderDetail = {
  order: {
    orderNumber: string
    status: string
    customerName: string
    email: string
    phone: string
    governorateName: string
    city: string
    addressLine1: string
    addressLine2: string | null
    addressNote: string | null
    paymentMethod: string
    subtotalAmount: number
    promoCode: string | null
    promoDiscountAmount: number
    shippingFeeAmount: number
    totalAmount: number
    currency: string
    createdAt: string
    sensitiveDataPurgeAt: string | null
  }
  items: Array<{
    id: string
    productTitle: string
    quantity: number
    childName: string
    storyLanguage: string
    customerNote: string | null
    personalizationSnapshot?: Array<{
      key: string
      label: string
      value: string | number | string[] | null
      sensitive: boolean
      purgedAt?: string | null
    }>
    lineTotalAmount: number
    addons: Array<{ addonName: string; lineTotalAmount: number }>
  }>
  statusHistory: Array<{ id: string; fromStatus: string | null; toStatus: string; customerVisibleNote: string | null; createdAt: string }>
  internalNotes: Array<{ id: string; body: string; createdAt: string }>
  sensitiveAssets: Array<{ id: string; orderItemId: string | null; kind: string; deletedAt: string | null; downloadPath: string }>
}

export type AdminGovernorate = {
  id: string
  code: string
  nameEn: string
  nameAr: string
  shippingFeeAmount: number
  isActive: boolean
  sortOrder: number
}

export type AdminPromoCode = {
  id: string
  code: string
  fixedDiscountAmount: number
  minimumSubtotalAmount: number | null
  startsAt: string | null
  endsAt: string | null
  maxRedemptions: number | null
  redemptionCount: number
  isActive: boolean
}

export type AdminContentPage = {
  key: 'how-it-works' | 'terms' | 'returns' | 'privacy' | 'contact'
  isPublished: boolean
  translations: Array<{ locale: Locale; title: string; content: string }>
}

export type AdminFaq = {
  id: string
  isPublished: boolean
  sortOrder: number
  translations: Array<{ locale: Locale; question: string; answer: string }>
}

export type AdminTestimonial = {
  id: string
  displayName: string
  isPublished: boolean
  sortOrder: number
  translations: Array<{ locale: Locale; quote: string }>
}

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: ApiFieldError[]

  constructor(status: number, message: string, options?: { code?: string; fieldErrors?: ApiFieldError[] }) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = options?.code ?? 'request_failed'
    this.fieldErrors = options?.fieldErrors ?? []
  }
}

export type ApiFieldError = {
  path: string[]
  code: string
  message?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readFieldErrors(value: unknown): ApiFieldError[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.path) || !entry.path.every((part) => typeof part === 'string')) return []
    return [{
      path: entry.path,
      code: typeof entry.code === 'string' ? entry.code : 'invalid',
      ...(typeof entry.message === 'string' ? { message: entry.message } : {}),
    }]
  })
}

async function apiFetch<T>(path: string, locale: Locale, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept-Language', locale)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null
    const message = error && typeof error.message === 'string'
      ? error.message
      : 'Something went wrong. Please try again.'
    throw new ApiClientError(response.status, message, {
      ...(error && typeof error.code === 'string' ? { code: error.code } : {}),
      fieldErrors: error ? readFieldErrors(error.fieldErrors) : [],
    })
  }
  return payload as T
}

export function getProducts(locale: Locale, options?: { category?: string; featured?: boolean; search?: string }) {
  const parameters = new URLSearchParams({ locale })
  if (options?.category) parameters.set('category', options.category)
  if (options?.featured !== undefined) parameters.set('featured', String(options.featured))
  if (options?.search) parameters.set('search', options.search)
  return apiFetch<{ products: ProductCard[] }>(`/api/storefront/products?${parameters}`, locale)
}

export function getProduct(locale: Locale, slug: string) {
  return apiFetch<{ product: Product }>(`/api/storefront/products/${encodeURIComponent(slug)}?locale=${locale}`, locale)
}

export function getCategories(locale: Locale) {
  return apiFetch<{ categories: Array<{ id: string; slug: string; name: string; description: string | null; imageUrl: string | null; isFeatured: boolean }> }>(
    `/api/storefront/categories?locale=${locale}`,
    locale,
  )
}

export function getGovernorates(locale: Locale) {
  return apiFetch<{ governorates: Governorate[] }>(`/api/storefront/governorates?locale=${locale}`, locale)
}

export function getSettings(locale: Locale) {
  return apiFetch<{ settings: StorefrontSettings }>(`/api/storefront/settings?locale=${locale}`, locale)
}

export function getContentPage(locale: Locale, key: string) {
  return apiFetch<{ page: { key: string; title: string; content: string } }>(
    `/api/storefront/pages/${encodeURIComponent(key)}?locale=${locale}`,
    locale,
  )
}

export function getFaqs(locale: Locale) {
  return apiFetch<{ faqs: StorefrontFaq[] }>('/api/storefront/faqs', locale)
}

export function getTestimonials(locale: Locale) {
  return apiFetch<{ testimonials: StorefrontTestimonial[] }>('/api/storefront/testimonials', locale)
}

export async function uploadPrivateFile(locale: Locale, kind: PrivateUploadRequest['kind'], file: File) {
  const signed = await apiFetch<{
    upload: {
      uploadId: string
      claimToken: string
      upload: { endpoint: string; fields: Record<string, string> }
    }
  }>('/api/uploads/sign', locale, {
    method: 'POST',
    body: JSON.stringify({ kind, mimeType: file.type, byteSize: file.size }),
  })
  const formData = new FormData()
  for (const [key, value] of Object.entries(signed.upload.upload.fields)) formData.set(key, value)
  formData.set('file', file)
  const uploadResponse = await fetch(signed.upload.upload.endpoint, { method: 'POST', body: formData })
  if (!uploadResponse.ok) throw new ApiClientError(uploadResponse.status, 'The image could not be uploaded. Please try again.')
  return {
    uploadId: signed.upload.uploadId,
    claimToken: signed.upload.claimToken,
  } satisfies CheckoutUploadReference
}

export function createCheckout(locale: Locale, payload: CheckoutInput) {
  return apiFetch<CartCheckoutResult>('/api/checkout', locale, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getCheckoutQuote(locale: Locale, payload: CheckoutQuoteInput) {
  return apiFetch<{ quote: CheckoutQuote }>('/api/checkout/quote', locale, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getCheckoutDraft(locale: Locale) {
  return apiFetch<{ draft: CheckoutDraft | null }>('/api/checkout/draft', locale)
}

export function addCheckoutDraftItem(locale: Locale, payload: CheckoutDraftItemInput) {
  return apiFetch<{ draft: CheckoutDraft }>('/api/checkout/draft/items', locale, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function saveCheckoutDraftDelivery(locale: Locale, payload: CheckoutDraftDeliveryInput, expectedRevision: number) {
  return apiFetch<{ draft: CheckoutDraft }>('/api/checkout/draft/delivery', locale, {
    method: 'PUT',
    body: JSON.stringify({ ...payload, expectedRevision }),
  })
}

export function removeCheckoutDraftItem(locale: Locale, itemId: string, expectedRevision: number) {
  const query = new URLSearchParams({ revision: String(expectedRevision) })
  return apiFetch<{ draft: CheckoutDraft | null }>(`/api/checkout/draft/items/${encodeURIComponent(itemId)}?${query}`, locale, {
    method: 'DELETE',
  })
}

export function trackOrder(locale: Locale, orderNumber: string, phone: string) {
  const parameters = new URLSearchParams({ orderNumber, phone })
  return apiFetch<{ order: { orderNumber: string; status: string } }>(`/api/orders/track?${parameters}`, locale)
}

export function getCurrentCustomer(locale: Locale) {
  return apiFetch<{ customer: Customer }>('/api/customer/me', locale)
}

export function getCustomerOrders(locale: Locale) {
  return apiFetch<{ orders: CustomerOrder[] }>('/api/customer/orders', locale)
}

export function customerLogin(locale: Locale, email: string, password: string) {
  return apiFetch<{ customer: Customer }>('/api/customer/login', locale, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function customerRegister(
  locale: Locale,
  input: { email: string; password: string; phone?: string; displayName?: string },
) {
  return apiFetch<{ customer: Customer }>('/api/customer/register', locale, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function customerLogout(locale: Locale) {
  return apiFetch<null>('/api/customer/logout', locale, { method: 'POST' })
}

export function requestPasswordReset(locale: Locale, email: string) {
  return apiFetch<{ accepted: boolean }>('/api/customer/password-reset/request', locale, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function confirmPasswordReset(locale: Locale, token: string, password: string) {
  return apiFetch<{ reset: boolean }>('/api/customer/password-reset/confirm', locale, {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

const ADMIN_LOCALE: Locale = 'en'

export function getCurrentAdmin() {
  return apiFetch<{ admin: Admin }>('/api/admin/me', ADMIN_LOCALE)
}

export function adminLogin(email: string, password: string) {
  return apiFetch<{ admin: Admin }>('/api/admin/login', ADMIN_LOCALE, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function bootstrapAdmin(email: string, password: string, bootstrapToken: string) {
  return apiFetch<{ admin: Admin }>('/api/admin/bootstrap', ADMIN_LOCALE, {
    method: 'POST',
    headers: { 'X-Admin-Bootstrap-Token': bootstrapToken },
    body: JSON.stringify({ email, password }),
  })
}

export function adminLogout() {
  return apiFetch<null>('/api/admin/logout', ADMIN_LOCALE, { method: 'POST' })
}

export function getAdminCategories() {
  return apiFetch<{ categories: AdminCategory[] }>('/api/admin/categories', ADMIN_LOCALE)
}

export function saveAdminCategory(
  input: Omit<AdminCategory, 'id'>,
  id?: string,
) {
  return apiFetch<{ id: string }>(id ? `/api/admin/categories/${id}` : '/api/admin/categories', ADMIN_LOCALE, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteAdminCategory(id: string) {
  return apiFetch<null>(`/api/admin/categories/${id}`, ADMIN_LOCALE, { method: 'DELETE' })
}

export function getAdminProducts(options: AdminProductListOptions = {}) {
  const parameters = new URLSearchParams()
  if (options.q) parameters.set('q', options.q)
  if (options.status) parameters.set('status', options.status)
  if (options.categoryId) parameters.set('categoryId', options.categoryId)
  if (options.page) parameters.set('page', String(options.page))
  if (options.pageSize) parameters.set('pageSize', String(options.pageSize))
  if (options.sort) parameters.set('sort', options.sort)
  const suffix = parameters.size > 0 ? `?${parameters}` : ''
  return apiFetch<AdminProductListResponse>(`/api/admin/products${suffix}`, ADMIN_LOCALE)
}

export function getAdminProduct(id: string) {
  return apiFetch<{ product: AdminProduct }>(`/api/admin/products/${id}`, ADMIN_LOCALE)
}

export function saveAdminProduct(input: Omit<AdminProduct, 'id'>, id?: string) {
  return apiFetch<{ id: string }>(id ? `/api/admin/products/${id}` : '/api/admin/products', ADMIN_LOCALE, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteAdminProduct(id: string) {
  return apiFetch<null>(`/api/admin/products/${id}?confirm=delete-draft`, ADMIN_LOCALE, { method: 'DELETE' })
}

export function archiveAdminProduct(id: string) {
  return apiFetch<{ status: 'archived' }>(`/api/admin/products/${id}/archive`, ADMIN_LOCALE, { method: 'POST' })
}

export function restoreAdminProduct(id: string, status: 'draft' | 'published' = 'draft') {
  return apiFetch<{ status: 'draft' | 'published' }>(`/api/admin/products/${id}/restore`, ADMIN_LOCALE, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

export async function uploadCatalogImage(kind: 'product' | 'category', file: File) {
  const signed = await apiFetch<{
    upload: { publicId: string; endpoint: string; fields: Record<string, string> }
  }>('/api/admin/media/sign', ADMIN_LOCALE, {
    method: 'POST',
    body: JSON.stringify({ kind, mimeType: file.type, byteSize: file.size }),
  })
  const formData = new FormData()
  for (const [key, value] of Object.entries(signed.upload.fields)) formData.set(key, value)
  formData.set('file', file)
  const response = await fetch(signed.upload.endpoint, { method: 'POST', body: formData })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok || !isRecord(payload) || typeof payload.secure_url !== 'string' || typeof payload.public_id !== 'string') {
    throw new ApiClientError(response.status || 500, 'The catalog image could not be uploaded. Please try again.')
  }
  return { url: payload.secure_url, cloudinaryPublicId: payload.public_id }
}

export function getAdminOrders(status?: string) {
  const parameters = new URLSearchParams({ limit: '100' })
  if (status) parameters.set('status', status)
  return apiFetch<{ orders: AdminOrderSummary[] }>(`/api/admin/orders?${parameters}`, ADMIN_LOCALE)
}

export function getAdminReport(options: { range?: AdminReportRange; from?: string; to?: string } = {}) {
  const parameters = new URLSearchParams({ range: options.range ?? '30d' })
  if (options.from) parameters.set('from', options.from)
  if (options.to) parameters.set('to', options.to)
  return apiFetch<AdminReport>(`/api/admin/reports?${parameters}`, ADMIN_LOCALE)
}

export function getAdminOrder(orderNumber: string) {
  return apiFetch<AdminOrderDetail>(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, ADMIN_LOCALE)
}

export function updateAdminOrderStatus(orderNumber: string, status: string, customerVisibleNote?: string) {
  return apiFetch<{ status: string }>(`/api/admin/orders/${encodeURIComponent(orderNumber)}/status`, ADMIN_LOCALE, {
    method: 'POST',
    body: JSON.stringify({ status, customerVisibleNote: customerVisibleNote || undefined }),
  })
}

export function addAdminOrderNote(orderNumber: string, body: string) {
  return apiFetch<{ added: boolean }>(`/api/admin/orders/${encodeURIComponent(orderNumber)}/notes`, ADMIN_LOCALE, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export function getAdminSettings() {
  return apiFetch<{ settings: StorefrontSettings }>('/api/admin/settings', ADMIN_LOCALE)
}

export function saveAdminSettings(input: Partial<StorefrontSettings>) {
  return apiFetch<{ saved: boolean }>('/api/admin/settings', ADMIN_LOCALE, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function getAdminContentPages() {
  return apiFetch<{ pages: AdminContentPage[] }>('/api/admin/content/pages', ADMIN_LOCALE)
}

export function saveAdminContentPage(key: AdminContentPage['key'], input: Omit<AdminContentPage, 'key'>) {
  return apiFetch<{ saved: boolean }>(`/api/admin/content/pages/${key}`, ADMIN_LOCALE, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function getAdminGovernorates() {
  return apiFetch<{ governorates: AdminGovernorate[] }>('/api/admin/governorates', ADMIN_LOCALE)
}

export function saveAdminGovernorate(id: string, input: Pick<AdminGovernorate, 'shippingFeeAmount' | 'isActive' | 'sortOrder'>) {
  return apiFetch<{ saved: boolean }>(`/api/admin/governorates/${id}`, ADMIN_LOCALE, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function getAdminPromoCodes() {
  return apiFetch<{ promoCodes: AdminPromoCode[] }>('/api/admin/promo-codes', ADMIN_LOCALE)
}

export type AdminPromoCodeInput = Omit<AdminPromoCode, 'id' | 'redemptionCount'>

export function saveAdminPromoCode(input: AdminPromoCodeInput, id?: string) {
  return apiFetch<{ id: string }>(id ? `/api/admin/promo-codes/${id}` : '/api/admin/promo-codes', ADMIN_LOCALE, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  })
}

export function deactivateAdminPromoCode(id: string) {
  return apiFetch<null>(`/api/admin/promo-codes/${id}`, ADMIN_LOCALE, { method: 'DELETE' })
}

export function getAdminFaqs() {
  return apiFetch<{ faqs: AdminFaq[] }>('/api/admin/faqs', ADMIN_LOCALE)
}

export function saveAdminFaq(input: Omit<AdminFaq, 'id'>, id?: string) {
  return apiFetch<{ id: string }>(id ? `/api/admin/faqs/${id}` : '/api/admin/faqs', ADMIN_LOCALE, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteAdminFaq(id: string) {
  return apiFetch<null>(`/api/admin/faqs/${id}`, ADMIN_LOCALE, { method: 'DELETE' })
}

export function getAdminTestimonials() {
  return apiFetch<{ testimonials: AdminTestimonial[] }>('/api/admin/testimonials', ADMIN_LOCALE)
}

export function saveAdminTestimonial(input: Omit<AdminTestimonial, 'id'>, id?: string) {
  return apiFetch<{ id: string }>(id ? `/api/admin/testimonials/${id}` : '/api/admin/testimonials', ADMIN_LOCALE, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteAdminTestimonial(id: string) {
  return apiFetch<null>(`/api/admin/testimonials/${id}`, ADMIN_LOCALE, { method: 'DELETE' })
}
