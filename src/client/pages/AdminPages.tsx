import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronLeft,
  ClipboardList,
  CircleAlert,
  Check,
  Eye,
  FileText,
  FilePenLine,
  GripVertical,
  ImagePlus,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  PackageSearch,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Tag,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react'
import { Link, Navigate, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { ORDER_STATUSES } from '@shared/constants'
import { DEFAULT_PERSONALIZED_PRODUCT_DEFINITION } from '@shared/contracts/personalization'
import {
  type Admin,
  type AdminCategory,
  type AdminContentPage,
  type AdminFaq,
  type AdminGovernorate,
  type AdminOrderDetail,
  type AdminProduct,
  type AdminProductListItem,
  type AdminPromoCode,
  type AdminReportRange,
  type AdminTestimonial,
  type PersonalizationDefinition,
  type StorefrontSettings,
  addAdminOrderNote,
  adminLogin,
  adminLogout,
  archiveAdminProduct,
  bootstrapAdmin,
  deactivateAdminPromoCode,
  deleteAdminCategory,
  deleteAdminFaq,
  deleteAdminProduct,
  deleteAdminTestimonial,
  getAdminCategories,
  getAdminContentPages,
  getAdminFaqs,
  getAdminGovernorates,
  getCurrentAdmin,
  getAdminOrder,
  getAdminOrders,
  getAdminProduct,
  getAdminProducts,
  getAdminReport,
  getAdminPromoCodes,
  getAdminSettings,
  getAdminTestimonials,
  restoreAdminProduct,
  saveAdminCategory,
  saveAdminContentPage,
  saveAdminFaq,
  saveAdminGovernorate,
  saveAdminProduct,
  saveAdminPromoCode,
  saveAdminSettings,
  saveAdminTestimonial,
  updateAdminOrderStatus,
  uploadCatalogImage,
} from '../lib/api'
import { formatDate, formatMoney, orderStatusLabel } from '../lib/format'
import { fieldErrorsByPath, requestErrorMessage } from '../lib/form-errors'
import { MarkdownEditor } from '../components/admin/MarkdownEditor'

type AdminTab = 'overview' | 'orders' | 'catalog' | 'operations' | 'content'
type AdminAccessMode = 'login' | 'bootstrap'
type CategoryDraft = Omit<AdminCategory, 'id'>
type ProductDraft = Omit<AdminProduct, 'id'>
type PromoDraft = Omit<AdminPromoCode, 'id' | 'redemptionCount'>
type FieldErrors = Map<string, string>

const PAGE_KEYS = ['how-it-works', 'terms', 'returns', 'privacy', 'contact'] as const

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message && error.message !== 'Please check the submitted information.') return error.message
  return requestErrorMessage('en', error)
}

function formErrors(error: unknown) {
  return fieldErrorsByPath('en', error)
}

function focusFirstInvalidField() {
  requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}

function fieldError(errors: FieldErrors, ...paths: string[]) {
  for (const path of paths) {
    const message = errors.get(path)
    if (message) return message
  }
  return undefined
}

function FormErrorSummary({ errors }: { errors: FieldErrors }) {
  if (!errors.size) return null
  return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><div className="flex items-center gap-2 font-bold"><CircleAlert size={17} />Review the highlighted fields</div><ul className="mt-2 list-disc space-y-1 ps-5">{[...new Set(errors.values())].slice(0, 5).map((message) => <li key={message}>{message}</li>)}</ul></div>
}

function FieldMessage({ children }: { children?: string }) {
  return children ? <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{children}</p> : null
}

function moneyToInput(amount: number | null) {
  return amount === null ? '' : (amount / 100).toFixed(2)
}

function inputToMoney(value: string) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0
}

function personalizedProductTemplate(): PersonalizationDefinition {
  return {
    version: 1,
    fields: structuredClone(DEFAULT_PERSONALIZED_PRODUCT_DEFINITION.fields),
  }
}

function emptyCategory(): CategoryDraft {
  return {
    slug: '',
    isFeatured: false,
    sortOrder: 0,
    imageUrl: null,
    cloudinaryPublicId: null,
    translations: [
      { locale: 'en', name: '', description: null },
      { locale: 'ar', name: '', description: null },
    ],
  }
}

function emptyProduct(): ProductDraft {
  return {
    slug: '',
    status: 'draft',
    basePriceAmount: 0,
    salePriceAmount: null,
    isFeatured: false,
    sortOrder: 0,
    translations: [
      { locale: 'en', title: '', shortDescription: null, description: null, metaTitle: null, metaDescription: null },
      { locale: 'ar', title: '', shortDescription: null, description: null, metaTitle: null, metaDescription: null },
    ],
    media: [],
    categoryIds: [],
    addons: [],
    personalizationDefinition: null,
  }
}

function emptyPromo(): PromoDraft {
  return {
    code: '',
    fixedDiscountAmount: 0,
    minimumSubtotalAmount: null,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    isActive: true,
  }
}

function promoDraft(promo: AdminPromoCode | null): PromoDraft {
  if (!promo) return emptyPromo()
  return {
    code: promo.code,
    fixedDiscountAmount: promo.fixedDiscountAmount,
    minimumSubtotalAmount: promo.minimumSubtotalAmount,
    startsAt: promo.startsAt,
    endsAt: promo.endsAt,
    maxRedemptions: promo.maxRedemptions,
    isActive: promo.isActive,
  }
}

function categoryDraft(category: AdminCategory | null): CategoryDraft {
  if (!category) return emptyCategory()
  const { id: _id, ...draft } = category
  return structuredClone(draft)
}

function productDraft(product: AdminProduct | null): ProductDraft {
  if (!product) return emptyProduct()
  const { id: _id, ...draft } = product
  return structuredClone(draft)
}

function titleForProduct(product: { slug: string; translations: Array<{ locale: string; title: string }> }) {
  return product.translations.find((translation) => translation.locale === 'en')?.title
    ?? product.translations.find((translation) => translation.locale === 'ar')?.title
    ?? product.slug
}

function nameForCategory(category: { slug: string; translations: Array<{ locale: string; name: string }> }) {
  return category.translations.find((translation) => translation.locale === 'en')?.name
    ?? category.translations.find((translation) => translation.locale === 'ar')?.name
    ?? category.slug
}

function FormMessage({ children, kind = 'error' }: { children: React.ReactNode; kind?: 'error' | 'success' }) {
  return <p className={`rounded-xl p-3 text-sm ${kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{children}</p>
}

function AdminButton({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = variant === 'primary'
    ? 'bg-[#2c1c14] text-white hover:bg-[#4a3024]'
    : variant === 'danger'
      ? 'border border-red-200 bg-white text-red-700 hover:bg-red-50'
      : 'border border-[#2c1c14]/15 bg-white text-[#2c1c14] hover:border-[#2c1c14]/35'
  return <button type="button" {...props} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}>{children}</button>
}

function AdminInput({ className = '', error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return <input {...props} aria-invalid={props['aria-invalid'] ?? Boolean(error)} className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#a95a39] ${error ? 'border-red-500' : 'border-[#2c1c14]/15'} ${className}`} />
}

function AdminTextarea({ className = '', error, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }) {
  return <textarea {...props} aria-invalid={props['aria-invalid'] ?? Boolean(error)} className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#a95a39] ${error ? 'border-red-500' : 'border-[#2c1c14]/15'} ${className}`} />
}

function WorkspaceDialog({ title, onRequestClose, children }: { title: string; onRequestClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onRequestClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onRequestClose])

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2c1c14]/45 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onRequestClose() }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="mx-auto min-h-full max-w-7xl rounded-[2rem] bg-[#fffaf4] shadow-2xl">
      {children}
    </section>
  </div>
}

function workspaceClose(onClose: () => void, dirty: boolean) {
  if (dirty && !window.confirm('Discard unsaved changes?')) return
  onClose()
}

export function AdminPage() {
  const client = useQueryClient()
  const adminQuery = useQuery({ queryKey: ['admin-me'], queryFn: getCurrentAdmin, retry: false })

  if (adminQuery.isLoading) return <AdminLoading />
  if (!adminQuery.data?.admin) return <AdminAccess onAuthenticated={() => void client.invalidateQueries({ queryKey: ['admin-me'] })} />
  return <AdminDashboard admin={adminQuery.data.admin} />
}

function AdminLoading() {
  return <main className="grid min-h-dvh place-items-center bg-[#fffaf4] text-[#2c1c14]"><LoaderCircle className="animate-spin text-[#a95a39]" size={30} /></main>
}

function AdminAccess({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AdminAccessMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)
    setIsSubmitting(true)
    try {
      if (mode === 'bootstrap') await bootstrapAdmin(email, password, token)
      else await adminLogin(email, password)
      onAuthenticated()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return <main className="grid min-h-dvh place-items-center bg-[#f8ecdf] px-5 py-10 text-[#2c1c14]">
    <section className="w-full max-w-md rounded-[2rem] border border-[#2c1c14]/10 bg-[#fffaf4] p-7 shadow-[0_20px_60px_rgba(92,52,33,.12)] sm:p-9">
      <Link className="inline-flex items-center gap-1 text-sm font-bold text-[#a95a39]" to="/"><ChevronLeft size={16} /> Back to storefront</Link>
      <div className="mt-8 grid size-12 place-items-center rounded-2xl bg-[#2c1c14] text-white"><ShieldCheck size={23} /></div>
      <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-[#a95a39]">Private workspace</p>
      <h1 className="mt-2 font-serif text-4xl">{mode === 'login' ? 'Admin sign in' : 'Set up the first admin'}</h1>
      <p className="mt-3 leading-6 text-[#624b40]">{mode === 'login' ? 'Manage catalog, payments, order statuses, shipping fees, and store content.' : 'This is available only once on a new database. The bootstrap token is never saved in this browser.'}</p>
      <form className="mt-7 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-bold">Email<AdminInput className="mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="block text-sm font-bold">Password<AdminInput className="mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
        {mode === 'bootstrap' ? <label className="block text-sm font-bold">Deployment bootstrap token<AdminInput className="mt-2" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} required /></label> : null}
        {message ? <FormMessage>{message}</FormMessage> : null}
        <AdminButton className="w-full" disabled={isSubmitting} type="submit">{isSubmitting ? <LoaderCircle className="animate-spin" size={17} /> : <ShieldCheck size={17} />}{mode === 'login' ? 'Sign in' : 'Create the first admin'}</AdminButton>
      </form>
      <button type="button" className="mt-5 text-sm font-bold text-[#a95a39]" onClick={() => { setMode(mode === 'login' ? 'bootstrap' : 'login'); setMessage(null); setToken('') }}>
        {mode === 'login' ? 'First-time setup?' : 'Already set up? Sign in'}
      </button>
    </section>
  </main>
}

function AdminDashboard({ admin }: { admin: Admin }) {
  const client = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/admin'
  const tab: AdminTab = normalizedPath.startsWith('/admin/orders')
    ? 'orders'
    : normalizedPath.startsWith('/admin/catalog')
      ? 'catalog'
      : normalizedPath.startsWith('/admin/operations')
        ? 'operations'
        : normalizedPath.startsWith('/admin/content')
          ? 'content'
          : 'overview'
  const logout = async () => {
    await adminLogout()
    await client.invalidateQueries({ queryKey: ['admin-me'] })
    client.removeQueries({ queryKey: ['admin'] })
  }
  const tabs: Array<{ id: AdminTab; label: string; path: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', path: '/admin/overview', icon: <LayoutDashboard size={17} /> },
    { id: 'orders', label: 'Orders', path: '/admin/orders', icon: <ClipboardList size={17} /> },
    { id: 'catalog', label: 'Catalog', path: '/admin/catalog', icon: <BookOpen size={17} /> },
    { id: 'operations', label: 'Shipping & promos', path: '/admin/operations', icon: <Truck size={17} /> },
    { id: 'content', label: 'Store content', path: '/admin/content', icon: <Settings2 size={17} /> },
  ]
  if (normalizedPath === '/admin') return <Navigate to="/admin/overview" replace />
  return <div className="min-h-dvh bg-[#fffaf4] text-[#2c1c14]" dir="ltr">
    <header className="border-b border-[#2c1c14]/10 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#2c1c14] text-white"><BookOpen size={20} /></span><div><strong className="block font-serif text-xl">Storybook admin</strong><span className="text-xs text-[#80695c]">{admin.email}</span></div></div>
        <div className="flex items-center gap-2"><Link className="rounded-xl border border-[#2c1c14]/15 px-3 py-2 text-sm font-bold" to="/">View store</Link><AdminButton variant="secondary" onClick={() => void logout()}><LogOut size={16} /> Sign out</AdminButton></div>
      </div>
      <nav aria-label="Admin sections" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-5 pb-3 sm:px-8">{tabs.map((item) => <button key={item.id} type="button" onClick={() => navigate(item.path)} aria-current={tab === item.id ? 'page' : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${tab === item.id ? 'bg-[#2c1c14] text-white' : 'text-[#624b40] hover:bg-[#f8ecdf]'}`}>{item.icon}{item.label}</button>)}</nav>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      {tab === 'overview' ? <OverviewPanel /> : null}
      {tab === 'orders' ? <OrdersPanel /> : null}
      {tab === 'catalog' ? <CatalogPanel /> : null}
      {tab === 'operations' ? <OperationsPanel /> : null}
      {tab === 'content' ? <ContentPanel /> : null}
    </main>
  </div>
}

function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a95a39]">{eyebrow}</p><h2 className="mt-1 font-serif text-3xl">{title}</h2></div>{action}</div>
}

function MetricCard({ label, value, note, tone = 'warm' }: { label: string; value: string; note: string; tone?: 'warm' | 'green' | 'blue' | 'plain' }) {
  const colors = {
    warm: 'bg-[#f8ecdf] text-[#a95a39]',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-sky-50 text-sky-700',
    plain: 'bg-white text-[#2c1c14]',
  }
  return <section className={`rounded-3xl border border-[#2c1c14]/10 p-5 ${colors[tone]}`}><p className="text-xs font-bold uppercase tracking-[.13em] opacity-75">{label}</p><strong className="mt-3 block font-serif text-3xl">{value}</strong><p className="mt-2 text-xs leading-5 opacity-75">{note}</p></section>
}

function OverviewPanel() {
  const [range, setRange] = useState<AdminReportRange>('30d')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const reportQuery = useQuery({
    queryKey: ['admin-report', range, from, to],
    queryFn: () => getAdminReport({ range, from: range === 'custom' ? from : undefined, to: range === 'custom' ? to : undefined }),
    enabled: range !== 'custom' || Boolean(from && to),
  })
  const report = reportQuery.data
  const maxOrders = Math.max(1, ...(report?.dailyTrend.map((item) => item.orderCount) ?? []))
  const maxStatus = Math.max(1, ...(report?.statusMix.map((item) => item.orderCount) ?? []))
  const rangeOptions: Array<[AdminReportRange, string]> = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['custom', 'Custom']]

  return <section><PanelHeading eyebrow="Sales and operations" title="Overview" action={<div className="flex flex-wrap gap-2">{rangeOptions.map(([value, label]) => <button key={value} type="button" onClick={() => setRange(value)} className={`rounded-xl px-3 py-2 text-sm font-bold ${range === value ? 'bg-[#2c1c14] text-white' : 'border border-[#2c1c14]/15 bg-white text-[#624b40]'}`}>{label}</button>)}</div>} />
    {range === 'custom' ? <section className="mb-6 flex flex-wrap items-end gap-3 rounded-3xl border border-[#2c1c14]/10 bg-white p-4"><label className="block text-sm font-bold">From<AdminInput className="mt-2" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label><label className="block text-sm font-bold">To<AdminInput className="mt-2" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label><p className="pb-2 text-sm text-[#624b40]">Choose both dates to load a privacy-safe report.</p></section> : null}
    {reportQuery.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-36 animate-pulse rounded-3xl bg-[#f2e4d6]" />)}</div> : null}
    {reportQuery.isError ? <FormMessage>{errorMessage(reportQuery.error)}</FormMessage> : null}
    {!reportQuery.isLoading && !reportQuery.isError && !report && range === 'custom' ? <div className="rounded-3xl bg-[#f8ecdf] p-7 text-center text-sm text-[#624b40]">Select both a start and end date to view the report.</div> : null}
    {report ? <><div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-[#624b40]"><span>Reporting period: <strong>{report.range.from}</strong> to <strong>{report.range.to}</strong></span><span className="rounded-full bg-[#f8ecdf] px-3 py-1 text-xs font-bold">{report.range.timezone}</span></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><MetricCard label="Submitted orders" value={String(report.summary.submittedOrderCount)} note="Orders placed in this reporting period." /><MetricCard label="Confirmed revenue" value={formatMoney(report.summary.confirmedRevenueAmount, 'en')} note="Payment confirmed, in production, shipped, or delivered." tone="green" /><MetricCard label="Awaiting review" value={formatMoney(report.summary.pendingPaymentValueAmount, 'en')} note="Payment submitted or action required; not counted as revenue." tone="blue" /><MetricCard label="Average order" value={formatMoney(report.summary.averageOrderValueAmount, 'en')} note={`${formatMoney(report.summary.rejectedCancelledValueAmount, 'en')} rejected or cancelled.`} tone="plain" /></div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_.75fr]"><section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-serif text-2xl">Daily order activity</h3><p className="mt-1 text-sm text-[#624b40]">Orders placed in the selected reporting period.</p></div><ClipboardList size={20} className="text-[#a95a39]" /></div>{report.dailyTrend.length ? <div className="mt-7 flex h-52 items-end gap-2 overflow-x-auto pb-1">{report.dailyTrend.map((item) => <div key={item.date} className="flex min-w-10 flex-1 flex-col items-center gap-2"><span className="text-xs font-bold text-[#624b40]">{item.orderCount || ''}</span><div className="w-full min-w-6 rounded-t-xl bg-[#a95a39] transition-all" style={{ height: `${Math.max(item.orderCount ? 18 : 4, (item.orderCount / maxOrders) * 155)}px` }} title={`${item.date}: ${item.orderCount} orders`} /><span className="text-[10px] font-bold text-[#80695c]">{item.date.slice(5)}</span></div>)}</div> : <p className="mt-5 rounded-2xl bg-[#f8ecdf] p-4 text-sm text-[#624b40]">No orders in this period yet.</p>}</section><section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-center gap-2"><Check size={18} className="text-[#a95a39]" /><h3 className="font-serif text-2xl">Order status mix</h3></div><div className="mt-5 space-y-3">{report.statusMix.length ? report.statusMix.map((item) => <div key={item.status}><div className="flex justify-between gap-3 text-sm"><span>{orderStatusLabel(item.status, 'en')}</span><strong>{item.orderCount}</strong></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#f8ecdf]"><div className="h-full rounded-full bg-[#a95a39]" style={{ width: `${(item.orderCount / maxStatus) * 100}%` }} /></div></div>) : <p className="rounded-2xl bg-[#f8ecdf] p-4 text-sm text-[#624b40]">No statuses to show yet.</p>}</div></section></div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3"><section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-center gap-2"><BookOpen size={18} className="text-[#a95a39]" /><h3 className="font-serif text-2xl">Top stories</h3></div><div className="mt-4 space-y-3">{report.topStories.length ? report.topStories.slice(0, 5).map((story, index) => <div key={`${story.productId ?? story.productTitle}-${index}`} className="flex items-start justify-between gap-3 rounded-2xl bg-[#f8ecdf] p-3"><div className="min-w-0"><span className="text-xs font-bold text-[#a95a39]">#{index + 1}</span><strong className="mt-1 block truncate text-sm">{story.productTitle}</strong><span className="mt-1 block text-xs text-[#80695c]">{story.quantity} books · {story.orderCount} orders</span></div><strong className="shrink-0 text-xs text-[#624b40]">{formatMoney(story.confirmedRevenueAmount, 'en')}</strong></div>) : <p className="rounded-2xl bg-[#f8ecdf] p-4 text-sm text-[#624b40]">No story sales yet.</p>}</div></section><section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-center gap-2"><Tag size={18} className="text-[#a95a39]" /><h3 className="font-serif text-2xl">Promo results</h3></div><div className="mt-4 space-y-3">{report.promoPerformance.length ? report.promoPerformance.slice(0, 5).map((promo) => <div key={promo.code} className="rounded-2xl bg-[#f8ecdf] p-3"><div className="flex justify-between gap-3"><strong>{promo.code}</strong><span className="text-xs font-bold text-[#624b40]">{promo.redemptions} uses</span></div><p className="mt-2 text-xs text-[#80695c]">{formatMoney(promo.discountAmount, 'en')} discounted · {formatMoney(promo.orderValueAmount, 'en')} order value</p></div>) : <p className="rounded-2xl bg-[#f8ecdf] p-4 text-sm text-[#624b40]">No promo redemptions in this period.</p>}</div></section><section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-center gap-2"><Truck size={18} className="text-[#a95a39]" /><h3 className="font-serif text-2xl">Governorates</h3></div><div className="mt-4 space-y-3">{report.governorates.length ? report.governorates.slice(0, 5).map((governorate) => <div key={governorate.governorateName} className="rounded-2xl bg-[#f8ecdf] p-3"><div className="flex justify-between gap-3"><strong>{governorate.governorateName}</strong><span className="text-xs font-bold text-[#624b40]">{governorate.orderCount} orders</span></div><p className="mt-2 text-xs text-[#80695c]">{formatMoney(governorate.totalAmount, 'en')} value · {formatMoney(governorate.shippingFeeAmount, 'en')} shipping</p></div>) : <p className="rounded-2xl bg-[#f8ecdf] p-4 text-sm text-[#624b40]">No delivery data in this period.</p>}</div></section></div>
      <p className="mt-4 text-xs leading-5 text-[#80695c]">Reports intentionally exclude customer contact details and private media. Confirmed revenue includes only payment-confirmed, production, shipped, and delivered orders.</p></> : null}
  </section>
}

function OrdersPanel() {
  const client = useQueryClient()
  const [status, setStatus] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const ordersQuery = useQuery({ queryKey: ['admin-orders', status], queryFn: () => getAdminOrders(status || undefined) })
  return <section>
    <PanelHeading eyebrow="Payment review and fulfillment" title="Orders" />
    <div className="mb-5 flex flex-wrap gap-2">{['', ...ORDER_STATUSES].map((value) => <button key={value || 'all'} type="button" onClick={() => setStatus(value)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${status === value ? 'bg-[#a95a39] text-white' : 'bg-white ring-1 ring-[#2c1c14]/10'}`}>{value ? orderStatusLabel(value, 'en') : 'All statuses'}</button>)}</div>
    {ordersQuery.isLoading ? <div className="h-64 animate-pulse rounded-3xl bg-[#f2e4d6]" /> : null}
    {ordersQuery.data ? <div className="overflow-hidden rounded-3xl border border-[#2c1c14]/10 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#f8ecdf] text-xs uppercase tracking-wide text-[#624b40]"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Stories</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead><tbody>{ordersQuery.data.orders.map((order) => <tr key={order.orderNumber} className="border-t border-[#2c1c14]/8"><td className="px-5 py-4"><strong>{order.orderNumber}</strong><span className="mt-1 block text-xs text-[#80695c]">{formatDate(order.createdAt, 'en')}</span></td><td className="px-5 py-4"><strong>{order.customerName}</strong><span className="mt-1 block text-xs text-[#80695c]">{order.phone}</span></td><td className="max-w-52 px-5 py-4 text-[#624b40]">{order.itemTitles.join(' · ')}</td><td className="px-5 py-4 font-bold text-[#a95a39]">{formatMoney(order.totalAmount, 'en')}</td><td className="px-5 py-4"><span className="rounded-full bg-[#f8ecdf] px-3 py-1 text-xs font-bold">{orderStatusLabel(order.status, 'en')}</span></td><td className="px-5 py-4"><AdminButton variant="secondary" className="px-3 py-2" onClick={() => setSelectedOrder(order.orderNumber)}>Review</AdminButton></td></tr>)}</tbody></table></div>{ordersQuery.data.orders.length === 0 ? <p className="p-8 text-center text-[#624b40]">No orders match this view yet.</p> : null}</div> : null}
    {selectedOrder ? <OrderDetail orderNumber={selectedOrder} onClose={() => setSelectedOrder(null)} onChanged={() => void client.invalidateQueries({ queryKey: ['admin-orders'] })} /> : null}
  </section>
}

function OrderDetail({ orderNumber, onClose, onChanged }: { orderNumber: string; onClose: () => void; onChanged: () => void }) {
  const client = useQueryClient()
  const detailQuery = useQuery({ queryKey: ['admin-order', orderNumber], queryFn: () => getAdminOrder(orderNumber) })
  const detail = detailQuery.data
  const [nextStatus, setNextStatus] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  useEffect(() => { if (detail) setNextStatus(detail.order.status) }, [detail])
  const changeStatus = async () => {
    if (!detail || nextStatus === detail.order.status) return
    setWorking(true); setMessage(null)
    try { await updateAdminOrderStatus(orderNumber, nextStatus, customerNote); setCustomerNote(''); await client.invalidateQueries({ queryKey: ['admin-order', orderNumber] }); onChanged() } catch (error) { setMessage(errorMessage(error)) } finally { setWorking(false) }
  }
  const addNote = async () => {
    if (!internalNote.trim()) return
    setWorking(true); setMessage(null)
    try { await addAdminOrderNote(orderNumber, internalNote.trim()); setInternalNote(''); await client.invalidateQueries({ queryKey: ['admin-order', orderNumber] }) } catch (error) { setMessage(errorMessage(error)) } finally { setWorking(false) }
  }
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2c1c14]/35 p-4 sm:p-8"><section className="mx-auto max-w-5xl rounded-[2rem] bg-[#fffaf4] p-6 shadow-2xl sm:p-8">{detailQuery.isLoading ? <AdminLoading /> : null}{detail ? <OrderDetailBody detail={detail} nextStatus={nextStatus} setNextStatus={setNextStatus} customerNote={customerNote} setCustomerNote={setCustomerNote} internalNote={internalNote} setInternalNote={setInternalNote} working={working} message={message} onClose={onClose} onChangeStatus={() => void changeStatus()} onAddNote={() => void addNote()} /> : null}</section></div>
}

/** @deprecated Kept as an exported fallback while order-review sections are migrated. */
export function LegacyOrderDetailBody({ detail, nextStatus, setNextStatus, customerNote, setCustomerNote, internalNote, setInternalNote, working, message, onClose, onChangeStatus, onAddNote }: { detail: AdminOrderDetail; nextStatus: string; setNextStatus: (value: string) => void; customerNote: string; setCustomerNote: (value: string) => void; internalNote: string; setInternalNote: (value: string) => void; working: boolean; message: string | null; onClose: () => void; onChangeStatus: () => void; onAddNote: () => void }) {
  const { order } = detail
  return <div><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a95a39]">Order review</p><h3 className="mt-1 font-serif text-3xl">{order.orderNumber}</h3><p className="mt-2 text-sm text-[#624b40]">Placed {formatDate(order.createdAt, 'en')} · {orderStatusLabel(order.status, 'en')}</p></div><AdminButton variant="secondary" onClick={onClose}>Close</AdminButton></div><div className="mt-7 grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><div className="space-y-5"><section className="rounded-2xl border border-[#2c1c14]/10 bg-white p-5"><h4 className="font-serif text-xl">Customer and delivery</h4><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><p><strong>Customer</strong><br />{order.customerName}<br />{order.email}<br />{order.phone}</p><p><strong>Address</strong><br />{order.governorateName}, {order.city}<br />{order.addressLine1}{order.addressLine2 ? <><br />{order.addressLine2}</> : null}{order.addressNote ? <><br /><span className="text-[#624b40]">{order.addressNote}</span></> : null}</p></div></section><section className="rounded-2xl border border-[#2c1c14]/10 bg-white p-5"><h4 className="font-serif text-xl">Personalized books</h4><div className="mt-4 space-y-3">{detail.items.map((item) => <div key={item.id} className="rounded-xl bg-[#fffaf4] p-4 text-sm"><div className="flex justify-between gap-3"><strong>{item.productTitle} × {item.quantity}</strong><strong className="text-[#a95a39]">{formatMoney(item.lineTotalAmount, 'en')}</strong></div><p className="mt-2 text-[#624b40]">Hero: {item.childName} · Story language: {item.storyLanguage}</p>{item.customerNote ? <p className="mt-1 text-[#624b40]">Note: {item.customerNote}</p> : null}{item.addons.length ? <p className="mt-1 text-[#80695c]">Add-ons: {item.addons.map((addon) => addon.addonName).join(', ')}</p> : null}</div>)}</div></section><section className="rounded-2xl border border-[#2c1c14]/10 bg-white p-5"><h4 className="font-serif text-xl">Private order media</h4><p className="mt-2 text-sm leading-6 text-[#624b40]">These links are streamed only to this authenticated admin session and are never public Cloudinary URLs.</p><div className="mt-4 flex flex-wrap gap-2">{detail.sensitiveAssets.filter((asset) => !asset.deletedAt).map((asset) => <a key={asset.id} href={asset.downloadPath} target="_blank" rel="noreferrer" className="rounded-xl border border-[#a95a39]/30 bg-[#fffaf4] px-3 py-2 text-sm font-bold text-[#a95a39]">View {asset.kind === 'payment_proof' ? 'payment proof' : 'child photo'}</a>)}</div>{detail.sensitiveAssets.every((asset) => asset.deletedAt) ? <p className="mt-3 text-sm text-[#80695c]">Private media has been removed.</p> : null}</section></div><aside className="space-y-5"><section className="rounded-2xl bg-[#f8ecdf] p-5"><h4 className="font-serif text-xl">Payment and totals</h4><div className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><span>Method</span><strong>{order.paymentMethod.replaceAll('_', ' ')}</strong></div><div className="flex justify-between"><span>Subtotal</span><strong>{formatMoney(order.subtotalAmount, 'en')}</strong></div><div className="flex justify-between"><span>Promo</span><strong>−{formatMoney(order.promoDiscountAmount, 'en')}</strong></div><div className="flex justify-between"><span>Shipping</span><strong>{formatMoney(order.shippingFeeAmount, 'en')}</strong></div><div className="flex justify-between border-t border-[#2c1c14]/10 pt-2 text-base"><span>Total</span><strong className="text-[#a95a39]">{formatMoney(order.totalAmount, 'en')}</strong></div></div></section><section className="rounded-2xl border border-[#2c1c14]/10 bg-white p-5"><h4 className="font-serif text-xl">Update status</h4><select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} className="mt-4 w-full rounded-xl border border-[#2c1c14]/15 bg-white px-3 py-2.5 text-sm">{ORDER_STATUSES.map((status) => <option key={status} value={status}>{orderStatusLabel(status, 'en')}</option>)}</select><AdminTextarea className="mt-3" rows={3} placeholder="Optional customer-visible note" value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} /><AdminButton className="mt-3 w-full" disabled={working || nextStatus === order.status} onClick={onChangeStatus}><Save size={16} /> Save status</AdminButton>{order.sensitiveDataPurgeAt ? <p className="mt-3 text-xs leading-5 text-[#80695c]">Private media purge is scheduled for {formatDate(order.sensitiveDataPurgeAt, 'en')}.</p> : null}</section><section className="rounded-2xl border border-[#2c1c14]/10 bg-white p-5"><h4 className="font-serif text-xl">Internal notes</h4><AdminTextarea className="mt-3" rows={3} placeholder="Visible only to admin" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} /><AdminButton className="mt-3 w-full" variant="secondary" disabled={working || !internalNote.trim()} onClick={onAddNote}><Plus size={16} /> Add note</AdminButton><div className="mt-4 space-y-3">{detail.internalNotes.map((note) => <div key={note.id} className="rounded-xl bg-[#f8ecdf] p-3 text-sm"><p>{note.body}</p><span className="mt-2 block text-xs text-[#80695c]">{formatDate(note.createdAt, 'en')}</span></div>)}</div></section>{message ? <FormMessage>{message}</FormMessage> : null}</aside></div></div>
}

function PersonalizationValue({ value, purgedAt }: { value: string | number | string[] | null; purgedAt?: string | null }) {
  if (purgedAt || value === null) return <span className="font-medium text-[#80695c]">Removed{purgedAt ? ` on ${formatDate(purgedAt, 'en')}` : ''}</span>
  return <span>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
}

function OrderDetailBody(props: React.ComponentProps<typeof LegacyOrderDetailBody>) {
  const personalizedItems = props.detail.items.filter((item) => item.personalizationSnapshot?.length)
  return <div className="space-y-5"><LegacyOrderDetailBody {...props} />{personalizedItems.length ? <section className="rounded-2xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-start gap-3"><ShieldCheck size={19} className="mt-0.5 text-[#a95a39]" /><div><h4 className="font-serif text-xl">Customization snapshot</h4><p className="mt-1 text-sm leading-6 text-[#624b40]">These are the product-specific production instructions captured when the order was placed. Sensitive values are removed after the retention period.</p></div></div><div className="mt-4 space-y-3">{personalizedItems.map((item) => <div key={item.id} className="rounded-xl bg-[#fffaf4] p-4"><strong>{item.productTitle} × {item.quantity}</strong><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{item.personalizationSnapshot?.map((field) => <div key={field.key} className="rounded-lg bg-white p-3"><dt className="text-xs font-bold uppercase tracking-wide text-[#80695c]">{field.label}{field.sensitive ? <span className="ms-1 text-[#a95a39]">• retained temporarily</span> : null}</dt><dd className="mt-1 break-words text-[#2c1c14]"><PersonalizationValue value={field.value} purgedAt={field.purgedAt} /></dd></div>)}</dl></div>)}</div></section> : null}</div>
}

function CatalogPanel() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const productEditorMatch = useMatch('/admin/catalog/products/:productId')
  const collectionEditorMatch = useMatch('/admin/catalog/collections/:collectionId')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'draft' | 'published' | 'archived'>('all')
  const [categoryId, setCategoryId] = useState('')
  const [sort, setSort] = useState<'updated_desc' | 'created_desc' | 'title_asc' | 'price_asc' | 'price_desc'>('updated_desc')
  const [page, setPage] = useState(1)
  const [workingProductId, setWorkingProductId] = useState<string | null>(null)
  const categoriesQuery = useQuery({ queryKey: ['admin-categories'], queryFn: getAdminCategories })
  const productsQuery = useQuery({
    queryKey: ['admin-products', query, status, categoryId, page, sort],
    queryFn: () => getAdminProducts({ q: query.trim() || undefined, status: status === 'all' ? undefined : status, categoryId: categoryId || undefined, page, pageSize: 12, sort }),
  })
  const categories = categoriesQuery.data?.categories ?? []
  const products = productsQuery.data?.products ?? []
  const productEditorId = productEditorMatch?.params.productId
  const collectionEditorId = collectionEditorMatch?.params.collectionId
  const selectedCategory = collectionEditorId && collectionEditorId !== 'new' ? categories.find((category) => category.id === collectionEditorId) ?? null : null
  const total = productsQuery.data?.total ?? products.length
  const pageSize = productsQuery.data?.pageSize ?? 12
  const currentPage = productsQuery.data?.page ?? page
  const pages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search); setPage(1) }, 260)
    return () => window.clearTimeout(timer)
  }, [search])

  const refreshCatalog = () => {
    void client.invalidateQueries({ queryKey: ['admin-categories'] })
    void client.invalidateQueries({ queryKey: ['admin-products'] })
  }
  const openProductEditor = (productId?: string) => navigate(`/admin/catalog/products/${productId ?? 'new'}`)
  const openCollectionEditor = (collectionId?: string) => navigate(`/admin/catalog/collections/${collectionId ?? 'new'}`)
  const closeEditor = () => navigate('/admin/catalog')
  const archive = async (product: AdminProductListItem) => {
    if (!window.confirm(`Archive “${titleForProduct(product)}”? Customers will no longer see it, but it can be restored later.`)) return
    setWorkingProductId(product.id)
    try { await archiveAdminProduct(product.id); refreshCatalog() } catch (error) { window.alert(errorMessage(error)) } finally { setWorkingProductId(null) }
  }
  const restore = async (product: AdminProductListItem) => {
    setWorkingProductId(product.id)
    try { await restoreAdminProduct(product.id); refreshCatalog() } catch (error) { window.alert(errorMessage(error)) } finally { setWorkingProductId(null) }
  }

  return <section>
    <PanelHeading eyebrow="Stories, collections, photos, prices" title="Catalog" action={<div className="flex gap-2"><AdminButton variant="secondary" onClick={() => openCollectionEditor()}><Plus size={16} /> Collection</AdminButton><AdminButton onClick={() => openProductEditor()}><Plus size={16} /> Story</AdminButton></div>} />
    <div className="grid gap-6 xl:grid-cols-[.74fr_1.26fr]">
      <section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Tag size={17} className="text-[#a95a39]" /><h3 className="font-serif text-2xl">Collections</h3></div><span className="rounded-full bg-[#f8ecdf] px-2.5 py-1 text-xs font-bold text-[#624b40]">{categories.length}</span></div><p className="mt-2 text-sm leading-6 text-[#624b40]">Group stories and feature important collections on the storefront.</p><div className="mt-5 space-y-2">{categoriesQuery.isLoading ? <div className="h-32 animate-pulse rounded-2xl bg-[#f2e4d6]" /> : categories.map((category) => <div key={category.id} className="flex gap-3 rounded-2xl border border-[#2c1c14]/8 p-2.5 transition hover:border-[#a95a39]/40">{category.imageUrl ? <img className="size-12 rounded-xl object-cover" src={category.imageUrl} alt="" /> : <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#f8ecdf] text-[#a95a39]"><Tag size={17} /></span>}<button type="button" onClick={() => openCollectionEditor(category.id)} className="min-w-0 flex-1 text-left"><strong className="block truncate">{nameForCategory(category)}</strong><small className="block truncate text-[#80695c]">/{category.slug}{category.isFeatured ? ' · Featured' : ''}</small></button><button type="button" onClick={() => openCollectionEditor(category.id)} className="rounded-xl p-2 text-[#80695c] hover:bg-[#f8ecdf] hover:text-[#a95a39]" aria-label={`Edit ${nameForCategory(category)}`}><FilePenLine size={16} /></button></div>)}{!categoriesQuery.isLoading && categories.length === 0 ? <p className="rounded-2xl bg-[#f8ecdf] p-4 text-sm text-[#624b40]">Create your first collection to organize stories on the storefront.</p> : null}</div>
        <AdminButton className="mt-5 w-full" variant="secondary" onClick={() => openCollectionEditor()}><Plus size={16} /> New collection</AdminButton>
      </section>
      <section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-2"><PackageSearch size={18} className="text-[#a95a39]" /><div><h3 className="font-serif text-2xl">Stories</h3><p className="mt-1 text-sm text-[#624b40]">{total} result{total === 1 ? '' : 's'}</p></div></div><AdminButton onClick={() => openProductEditor()}><Plus size={16} /> New story</AdminButton></div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_150px_150px]"><label className="relative block"><span className="sr-only">Search stories</span><Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[#80695c]" size={17} /><AdminInput className="ps-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or slug…" /></label><select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1) }} className="rounded-xl border border-[#2c1c14]/15 bg-white px-3 py-2.5 text-sm"><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select><select aria-label="Filter by collection" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1) }} className="rounded-xl border border-[#2c1c14]/15 bg-white px-3 py-2.5 text-sm"><option value="">All collections</option>{categories.map((category) => <option key={category.id} value={category.id}>{nameForCategory(category)}</option>)}</select><select aria-label="Sort stories" value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(1) }} className="rounded-xl border border-[#2c1c14]/15 bg-white px-3 py-2.5 text-sm"><option value="updated_desc">Recently updated</option><option value="created_desc">Recently added</option><option value="title_asc">Title A–Z</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{productsQuery.isLoading ? [1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-72 animate-pulse rounded-2xl bg-[#f2e4d6]" />) : products.map((product) => <article key={product.id} className="group overflow-hidden rounded-2xl border border-[#2c1c14]/10 bg-[#fffdfa] transition hover:-translate-y-0.5 hover:border-[#a95a39]/45 hover:shadow-lg"><div className="relative aspect-[4/3] bg-[#f8ecdf]">{product.coverImageUrl ? <img className="size-full object-cover" src={product.coverImageUrl} alt="" /> : <div className="grid size-full place-items-center text-[#a95a39]/65"><ImagePlus size={30} /></div>}<div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${product.status === 'published' ? 'bg-emerald-50 text-emerald-800' : product.status === 'archived' ? 'bg-slate-100 text-slate-700' : 'bg-white/95 text-[#624b40]'}`}>{product.status}</span>{product.isFeatured ? <span className="rounded-full bg-[#2c1c14]/90 px-2.5 py-1 text-[10px] font-bold text-white">Featured</span> : null}</div></div><div className="p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="truncate font-serif text-lg">{titleForProduct(product)}</h4><p className="mt-1 truncate text-xs text-[#80695c]">/{product.slug}</p></div><strong className="shrink-0 text-sm text-[#a95a39]">{formatMoney(product.salePriceAmount ?? product.basePriceAmount, 'en')}</strong></div><p className="mt-3 line-clamp-2 min-h-10 text-sm text-[#624b40]">{product.translations.find((translation) => translation.locale === 'en')?.shortDescription || 'No short description yet.'}</p><div className="mt-3 flex flex-wrap gap-1.5">{product.categories.slice(0, 2).map((category) => <span key={category.id} className="rounded-full bg-[#f8ecdf] px-2 py-1 text-[10px] font-bold text-[#624b40]">{category.name}</span>)}{product.categories.length > 2 ? <span className="rounded-full bg-[#f8ecdf] px-2 py-1 text-[10px] font-bold text-[#624b40]">+{product.categories.length - 2}</span> : null}</div><div className="mt-4 flex items-center gap-2 border-t border-[#2c1c14]/8 pt-3"><Link className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-[#624b40] hover:bg-[#f8ecdf]" to={`/stories/${product.slug}`} target="_blank"><Eye size={14} /> Preview</Link><button type="button" onClick={() => openProductEditor(product.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-[#624b40] hover:bg-[#f8ecdf]"><FilePenLine size={14} /> Edit</button><span className="flex-1" />{product.status === 'archived' ? <button type="button" disabled={workingProductId === product.id} onClick={() => void restore(product)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><RotateCcw size={14} /> Restore</button> : <button type="button" disabled={workingProductId === product.id} onClick={() => void archive(product)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-[#80695c] hover:bg-slate-100"><Archive size={14} /> Archive</button>}</div>{product.updatedAt ? <p className="mt-3 text-[11px] text-[#80695c]">Updated {formatDate(product.updatedAt, 'en')}</p> : null}</div></article>)}{!productsQuery.isLoading && products.length === 0 ? <div className="col-span-full rounded-2xl bg-[#f8ecdf] p-8 text-center text-sm leading-6 text-[#624b40]"><PackageSearch className="mx-auto mb-3 text-[#a95a39]" size={25} />No stories match these filters. Clear a filter or create a new story.</div> : null}</div>
        {pages > 1 ? <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#2c1c14]/8 pt-4"><span className="text-sm text-[#624b40]">Page {currentPage} of {pages}</span><div className="flex gap-2"><AdminButton variant="secondary" className="px-3 py-2" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</AdminButton><AdminButton variant="secondary" className="px-3 py-2" disabled={currentPage >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next</AdminButton></div></div> : null}
      </section>
    </div>
    {collectionEditorMatch ? <CategoryEditor key={collectionEditorId ?? 'new'} category={selectedCategory} onClose={closeEditor} onSaved={refreshCatalog} /> : null}
    {productEditorMatch ? <ProductEditor key={productEditorId ?? 'new'} productId={productEditorId === 'new' ? null : productEditorId ?? null} categories={categories} onClose={closeEditor} onSaved={refreshCatalog} /> : null}
  </section>
}

function CategoryEditor({ category, onClose, onSaved }: { category: AdminCategory | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<CategoryDraft>(() => categoryDraft(category))
  const [baseline, setBaseline] = useState(() => JSON.stringify(categoryDraft(category)))
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  useEffect(() => {
    const nextDraft = categoryDraft(category)
    setDraft(nextDraft)
    setBaseline(JSON.stringify(nextDraft))
    setMessage(null)
  }, [category])
  const dirty = JSON.stringify(draft) !== baseline
  const requestClose = () => workspaceClose(onClose, dirty)
  const updateTranslation = (locale: 'ar' | 'en', changes: Partial<CategoryDraft['translations'][number]>) => {
    setDraft((current) => ({ ...current, translations: current.translations.map((translation) => translation.locale === locale ? { ...translation, ...changes } : translation) }))
  }
  const uploadImage = async (file: File) => {
    setUploading(true); setMessage(null)
    try { const image = await uploadCatalogImage('category', file); setDraft((current) => ({ ...current, imageUrl: image.url, cloudinaryPublicId: image.cloudinaryPublicId })) } catch (error) { setMessage(errorMessage(error)) } finally { setUploading(false) }
  }
  const save = async () => {
    setSaving(true); setMessage(null)
    try { await saveAdminCategory(draft, category?.id); onSaved(); onClose() } catch (error) { setMessage(errorMessage(error)) } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!category || !window.confirm('Delete this collection? Products will remain, but lose this collection assignment.')) return
    setSaving(true); setMessage(null)
    try { await deleteAdminCategory(category.id); onSaved(); onClose() } catch (error) { setMessage(errorMessage(error)) } finally { setSaving(false) }
  }
  return <WorkspaceDialog title={category ? `Edit ${nameForCategory(category)}` : 'New collection'} onRequestClose={requestClose}><section className="min-h-full rounded-[2rem] border border-[#2c1c14]/10 bg-white p-6"><div className="sticky top-0 z-10 -mx-6 -mt-6 flex flex-wrap items-start justify-between gap-4 border-b border-[#2c1c14]/10 bg-white px-6 py-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a95a39]">Collection editor</p><h3 className="mt-1 font-serif text-3xl">{category ? `Edit ${nameForCategory(category)}` : 'New collection'}</h3></div><div className="flex gap-2"><AdminButton variant="secondary" onClick={requestClose}>Cancel</AdminButton>{category ? <AdminButton variant="danger" disabled={saving} onClick={() => void remove()}><Trash2 size={16} /> Delete</AdminButton> : null}<AdminButton disabled={saving} onClick={() => void save()}><Save size={16} /> Save collection</AdminButton></div></div><div className="mt-6 grid gap-5 lg:grid-cols-[1fr_.75fr]"><div className="space-y-5"><label className="block text-sm font-bold">Slug<AdminInput className="mt-2" value={draft.slug} onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value.toLowerCase().replace(/\s+/g, '-') }))} placeholder="bestsellers" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">Sort order<AdminInput className="mt-2" type="number" min="0" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} /></label><label className="mt-7 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.isFeatured} onChange={(event) => setDraft((current) => ({ ...current, isFeatured: event.target.checked }))} /> Feature on home page</label></div><TranslationBlock title="English" direction="ltr"><label className="block text-sm font-bold">Collection name<AdminInput className="mt-2" value={draft.translations.find((item) => item.locale === 'en')?.name ?? ''} onChange={(event) => updateTranslation('en', { name: event.target.value })} /></label><label className="mt-3 block text-sm font-bold">Description<AdminTextarea className="mt-2" rows={3} value={draft.translations.find((item) => item.locale === 'en')?.description ?? ''} onChange={(event) => updateTranslation('en', { description: event.target.value || null })} /></label></TranslationBlock><TranslationBlock title="Arabic" direction="rtl"><label className="block text-sm font-bold">اسم المجموعة<AdminInput className="mt-2" value={draft.translations.find((item) => item.locale === 'ar')?.name ?? ''} onChange={(event) => updateTranslation('ar', { name: event.target.value })} /></label><label className="mt-3 block text-sm font-bold">الوصف<AdminTextarea className="mt-2" rows={3} value={draft.translations.find((item) => item.locale === 'ar')?.description ?? ''} onChange={(event) => updateTranslation('ar', { description: event.target.value || null })} /></label></TranslationBlock></div><aside className="rounded-2xl bg-[#f8ecdf] p-5"><h4 className="font-serif text-xl">Collection image</h4><p className="mt-2 text-sm leading-6 text-[#624b40]">Optional public artwork for this collection. Customer photos never use this media area.</p>{draft.imageUrl ? <img className="mt-4 aspect-square w-full rounded-2xl object-cover" src={draft.imageUrl} alt="" /> : <div className="mt-4 grid aspect-square place-items-center rounded-2xl border border-dashed border-[#a95a39]/40 bg-white text-[#a95a39]"><ImagePlus size={28} /></div>}<label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#a95a39]/30 bg-white px-4 py-3 text-sm font-bold text-[#a95a39]"><Upload size={16} />{uploading ? 'Uploading…' : 'Upload image'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file) }} /></label></aside></div>{message ? <FormMessage>{message}</FormMessage> : null}</section></WorkspaceDialog>
}

function TranslationBlock({ title, direction, children }: { title: string; direction: 'ltr' | 'rtl'; children: React.ReactNode }) {
  return <fieldset dir={direction} className="rounded-2xl border border-[#2c1c14]/10 p-4"><legend className="px-1 font-serif text-lg">{title}</legend>{children}</fieldset>
}


function normalizeProductMedia(media: ProductDraft['media']) {
  const coverIndex = media.findIndex((item) => item.kind === 'cover')
  const selectedCover = coverIndex >= 0 ? coverIndex : 0
  return media.map((item, index) => ({ ...item, kind: index === selectedCover ? 'cover' as const : 'gallery' as const, sortOrder: index }))
}

function normalizePersonalizationDefinition(definition: PersonalizationDefinition | null | undefined) {
  if (!definition) return null
  // Saving through the simplified editor deliberately replaces any older
  // custom field definition with the enabled subset of the fixed product
  // fields. Historical order snapshots are unaffected.
  const enabledKeys = new Set(definition.fields.map((field) => field.key))
  const template = personalizedProductTemplate()
  return {
    version: definition.version,
    fields: template.fields.filter((field) => enabledKeys.has(field.key)),
  }
}

function ProductEditor({ productId, categories, onClose, onSaved }: { productId: string | null; categories: AdminCategory[]; onClose: () => void; onSaved: () => void }) {
  const productQuery = useQuery({ queryKey: ['admin-product', productId], queryFn: () => getAdminProduct(productId ?? ''), enabled: Boolean(productId) })
  const [draft, setDraft] = useState<ProductDraft>(() => emptyProduct())
  const [baseline, setBaseline] = useState(() => JSON.stringify(emptyProduct()))
  const [message, setMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(new Map())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!productId || !productQuery.data?.product) return
    const nextDraft = productDraft(productQuery.data.product)
    setDraft(nextDraft)
    setBaseline(JSON.stringify(nextDraft))
    setMessage(null)
    setFieldErrors(new Map())
  }, [productId, productQuery.data?.product])

  const dirty = JSON.stringify(draft) !== baseline
  const requestClose = () => workspaceClose(onClose, dirty)
  const updateTranslation = (locale: 'ar' | 'en', changes: Partial<ProductDraft['translations'][number]>) => {
    setDraft((current) => ({ ...current, translations: current.translations.map((translation) => translation.locale === locale ? { ...translation, ...changes } : translation) }))
  }
  const translationError = (locale: 'ar' | 'en', name: string) => {
    const index = draft.translations.findIndex((translation) => translation.locale === locale)
    return fieldError(fieldErrors, `translations.${index}.${name}`, `translations.${locale}.${name}`)
  }
  const toggleCategory = (categoryId: string) => setDraft((current) => ({ ...current, categoryIds: current.categoryIds.includes(categoryId) ? current.categoryIds.filter((id) => id !== categoryId) : [...current.categoryIds, categoryId] }))
  const setCover = (index: number) => setDraft((current) => ({ ...current, media: normalizeProductMedia(current.media.map((item, itemIndex) => ({ ...item, kind: itemIndex === index ? 'cover' : 'gallery' }))) }))
  const moveMedia = (index: number, direction: -1 | 1) => setDraft((current) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= current.media.length) return current
    const media = [...current.media]
    const [moved] = media.splice(index, 1)
    media.splice(nextIndex, 0, moved)
    return { ...current, media: normalizeProductMedia(media) }
  })
  const removeMedia = (index: number) => setDraft((current) => ({ ...current, media: normalizeProductMedia(current.media.filter((_, itemIndex) => itemIndex !== index)) }))
  const updateMediaAlt = (index: number, altText: string) => setDraft((current) => ({ ...current, media: current.media.map((media, itemIndex) => itemIndex === index ? { ...media, altText: altText || null } : media) }))
  const uploadImages = async (fileList: FileList | null) => {
    const selected = Array.from(fileList ?? [])
    if (!selected.length) return
    const slots = 12 - draft.media.length
    const unsuitable = selected.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)
    if (unsuitable) {
      setMessage('Use JPEG, PNG, or WebP images up to 10 MB each. The files were not uploaded.')
      return
    }
    if (slots <= 0) {
      setMessage('A product gallery can contain up to 12 images. Remove an image before uploading another.')
      return
    }
    const files = selected.slice(0, slots)
    if (selected.length > slots) setMessage(`Only ${slots} image${slots === 1 ? '' : 's'} can be added; a gallery is limited to 12 images.`)
    setUploading(true)
    try {
      const additions: ProductDraft['media'] = []
      for (const file of files) {
        const image = await uploadCatalogImage('product', file)
        additions.push({ kind: 'gallery', url: image.url, cloudinaryPublicId: image.cloudinaryPublicId, altText: null, sortOrder: 0 })
      }
      setDraft((current) => ({ ...current, media: normalizeProductMedia([...current.media, ...additions]) }))
      if (additions.length) setMessage(null)
    } catch (error) {
      setMessage(`${errorMessage(error)} Choose the image again to retry.`)
    } finally {
      setUploading(false)
    }
  }
  const save = async () => {
    setSaving(true)
    setMessage(null)
    setFieldErrors(new Map())
    try {
      await saveAdminProduct({ ...draft, personalizationDefinition: normalizePersonalizationDefinition(draft.personalizationDefinition) }, productId ?? undefined)
      onSaved()
      onClose()
    } catch (error) {
      const errors = formErrors(error)
      setFieldErrors(errors)
      setMessage(errorMessage(error))
      if (errors.size) focusFirstInvalidField()
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    if (!productId || !window.confirm('Permanently delete this unused draft? This cannot be undone. Existing order snapshots are preserved.')) return
    setSaving(true)
    setMessage(null)
    try {
      await deleteAdminProduct(productId)
      onSaved()
      onClose()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  const addAddon = () => setDraft((current) => ({ ...current, addons: [...current.addons, { priceAmount: 0, isActive: true, sortOrder: current.addons.length, translations: [{ locale: 'en', name: '', description: null }, { locale: 'ar', name: '', description: null }] }] }))
  const updateAddon = (index: number, changes: Partial<ProductDraft['addons'][number]>) => setDraft((current) => ({ ...current, addons: current.addons.map((addon, currentIndex) => currentIndex === index ? { ...addon, ...changes } : addon) }))
  const updateAddonTranslation = (index: number, locale: 'ar' | 'en', changes: { name?: string; description?: string | null }) => setDraft((current) => ({ ...current, addons: current.addons.map((addon, currentIndex) => currentIndex === index ? { ...addon, translations: addon.translations.map((translation) => translation.locale === locale ? { ...translation, ...changes } : translation) } : addon) }))

  if (productQuery.isLoading) return <WorkspaceDialog title="Loading story editor" onRequestClose={onClose}><div className="grid min-h-96 place-items-center"><LoaderCircle className="animate-spin text-[#a95a39]" size={28} /></div></WorkspaceDialog>

  return <WorkspaceDialog title={productId ? 'Edit story' : 'New story'} onRequestClose={requestClose}>
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-[#2c1c14]/10 bg-[#fffaf4]/95 px-5 py-4 backdrop-blur sm:px-7"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a95a39]">Story workspace</p><h3 className="mt-1 truncate font-serif text-2xl sm:text-3xl">{productId ? titleForProduct(draft) || 'Edit story' : 'Create a new story'}</h3>{dirty ? <p className="mt-1 text-xs font-bold text-[#a95a39]">Unsaved changes</p> : null}</div><div className="flex flex-wrap items-center gap-2"><AdminButton variant="secondary" onClick={requestClose}><X size={16} /> Close</AdminButton>{productId && draft.status === 'draft' ? <AdminButton variant="danger" disabled={saving} onClick={() => void remove()}><Trash2 size={16} /> Delete draft</AdminButton> : null}<AdminButton disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />} Save story</AdminButton></div></div>
    <div className="p-5 sm:p-7"><FormErrorSummary errors={fieldErrors} />{message ? <div className="mb-5"><FormMessage>{message}</FormMessage></div> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]"><div className="space-y-6"><section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-center gap-2"><FilePenLine size={18} className="text-[#a95a39]" /><h4 className="font-serif text-2xl">Story details</h4></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">Slug<AdminInput className="mt-2" error={fieldError(fieldErrors, 'slug')} value={draft.slug} onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value.toLowerCase().replace(/\s+/g, '-') }))} placeholder="the-little-explorer" /><FieldMessage>{fieldError(fieldErrors, 'slug')}</FieldMessage></label><label className="block text-sm font-bold">Status<select aria-invalid={Boolean(fieldError(fieldErrors, 'status'))} className={`mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-sm ${fieldError(fieldErrors, 'status') ? 'border-red-500' : 'border-[#2c1c14]/15'}`} value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as ProductDraft['status'] }))}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select><FieldMessage>{fieldError(fieldErrors, 'status')}</FieldMessage></label><label className="block text-sm font-bold">Regular price (EGP)<AdminInput className="mt-2" error={fieldError(fieldErrors, 'basePriceAmount')} type="number" min="0" step="0.01" value={moneyToInput(draft.basePriceAmount)} onChange={(event) => setDraft((current) => ({ ...current, basePriceAmount: inputToMoney(event.target.value) }))} /><FieldMessage>{fieldError(fieldErrors, 'basePriceAmount')}</FieldMessage></label><label className="block text-sm font-bold">Sale price (optional EGP)<AdminInput className="mt-2" error={fieldError(fieldErrors, 'salePriceAmount')} type="number" min="0" step="0.01" value={moneyToInput(draft.salePriceAmount)} onChange={(event) => setDraft((current) => ({ ...current, salePriceAmount: event.target.value.trim() ? inputToMoney(event.target.value) : null }))} /><FieldMessage>{fieldError(fieldErrors, 'salePriceAmount')}</FieldMessage></label><label className="block text-sm font-bold">Sort order<AdminInput className="mt-2" type="number" min="0" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} /></label><label className="mt-7 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.isFeatured} onChange={(event) => setDraft((current) => ({ ...current, isFeatured: event.target.checked }))} /> Feature on home page</label></div></section>
        <section className="space-y-5 rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div><h4 className="font-serif text-2xl">Bilingual product copy</h4><p className="mt-1 text-sm text-[#624b40]">Full descriptions use safe Markdown with a live preview.</p></div><TranslationBlock title="English" direction="ltr"><label className="block text-sm font-bold">Title<AdminInput className="mt-2" error={translationError('en', 'title')} value={draft.translations.find((item) => item.locale === 'en')?.title ?? ''} onChange={(event) => updateTranslation('en', { title: event.target.value })} /><FieldMessage>{translationError('en', 'title')}</FieldMessage></label><label className="mt-4 block text-sm font-bold">Short description<AdminTextarea className="mt-2" rows={3} value={draft.translations.find((item) => item.locale === 'en')?.shortDescription ?? ''} onChange={(event) => updateTranslation('en', { shortDescription: event.target.value || null })} /></label><div className="mt-4"><MarkdownEditor label="Full description" value={draft.translations.find((item) => item.locale === 'en')?.description ?? ''} error={translationError('en', 'description')} onChange={(value) => updateTranslation('en', { description: value || null })} /></div></TranslationBlock><TranslationBlock title="Arabic" direction="rtl"><label className="block text-sm font-bold">العنوان<AdminInput className="mt-2" error={translationError('ar', 'title')} value={draft.translations.find((item) => item.locale === 'ar')?.title ?? ''} onChange={(event) => updateTranslation('ar', { title: event.target.value })} /><FieldMessage>{translationError('ar', 'title')}</FieldMessage></label><label className="mt-4 block text-sm font-bold">وصف قصير<AdminTextarea className="mt-2" rows={3} value={draft.translations.find((item) => item.locale === 'ar')?.shortDescription ?? ''} onChange={(event) => updateTranslation('ar', { shortDescription: event.target.value || null })} /></label><div className="mt-4"><MarkdownEditor direction="rtl" label="الوصف الكامل" value={draft.translations.find((item) => item.locale === 'ar')?.description ?? ''} error={translationError('ar', 'description')} onChange={(value) => updateTranslation('ar', { description: value || null })} /></div></TranslationBlock><details className="rounded-2xl bg-[#f8ecdf] p-4"><summary className="cursor-pointer font-bold">Search metadata (optional)</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">English meta title<AdminInput className="mt-2" value={draft.translations.find((item) => item.locale === 'en')?.metaTitle ?? ''} onChange={(event) => updateTranslation('en', { metaTitle: event.target.value || null })} /></label><label className="block text-sm font-bold">English meta description<AdminTextarea className="mt-2" rows={2} value={draft.translations.find((item) => item.locale === 'en')?.metaDescription ?? ''} onChange={(event) => updateTranslation('en', { metaDescription: event.target.value || null })} /></label></div></details></section>
        <SimplePersonalizationEditor definition={draft.personalizationDefinition ?? null} onChange={(personalizationDefinition) => setDraft((current) => ({ ...current, personalizationDefinition }))} />
      </div><aside className="space-y-6"><section className="rounded-3xl bg-[#f8ecdf] p-5"><h4 className="font-serif text-2xl">Collections</h4><p className="mt-2 text-sm leading-6 text-[#624b40]">Choose every collection where this story should appear.</p><div className="mt-4 space-y-2">{categories.map((category) => <label key={category.id} className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm font-bold"><input type="checkbox" checked={draft.categoryIds.includes(category.id)} onChange={() => toggleCategory(category.id)} />{nameForCategory(category)}</label>)}{categories.length === 0 ? <p className="rounded-xl bg-white p-3 text-sm text-[#624b40]">Create collections first if you want to group this story.</p> : null}</div></section>
        <section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-start justify-between gap-4"><div><h4 className="font-serif text-2xl">Public gallery</h4><p className="mt-2 text-sm leading-6 text-[#624b40]">Up to 12 storefront images. Choose one cover, add helpful alt text, and set the display order.</p></div><span className="rounded-full bg-[#f8ecdf] px-2.5 py-1 text-xs font-bold">{draft.media.length}/12</span></div><div className="mt-5 space-y-3">{draft.media.map((media, index) => <div key={`${media.url}-${index}`} className="overflow-hidden rounded-2xl border border-[#2c1c14]/10"><div className="flex gap-3 p-3"><div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-[#f8ecdf]"><img className="size-full object-cover" src={media.url} alt="" />{media.kind === 'cover' ? <span className="absolute inset-x-1 bottom-1 rounded-md bg-[#2c1c14]/90 px-1.5 py-1 text-center text-[10px] font-bold text-white">Cover</span> : null}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 text-xs font-bold text-[#80695c]"><GripVertical size={14} /> Image {index + 1}</span><button type="button" onClick={() => removeMedia(index)} className="rounded-lg p-1.5 text-red-700 hover:bg-red-50" aria-label="Remove image"><Trash2 size={15} /></button></div><AdminInput className="mt-2" value={media.altText ?? ''} onChange={(event) => updateMediaAlt(index, event.target.value)} placeholder="Alt text (optional)" /></div></div><div className="flex flex-wrap gap-2 border-t border-[#2c1c14]/8 bg-[#fffdfa] p-2"><button type="button" disabled={media.kind === 'cover'} onClick={() => setCover(index)} className="rounded-lg px-2 py-1.5 text-xs font-bold text-[#a95a39] hover:bg-[#f8ecdf] disabled:opacity-40">Set as cover</button><button type="button" disabled={index === 0} onClick={() => moveMedia(index, -1)} className="rounded-lg p-1.5 text-[#624b40] hover:bg-[#f8ecdf] disabled:opacity-35" aria-label="Move image earlier"><ArrowUp size={14} /></button><button type="button" disabled={index === draft.media.length - 1} onClick={() => moveMedia(index, 1)} className="rounded-lg p-1.5 text-[#624b40] hover:bg-[#f8ecdf] disabled:opacity-35" aria-label="Move image later"><ArrowDown size={14} /></button></div></div>)}{draft.media.length === 0 ? <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-[#a95a39]/35 bg-[#fffaf4] text-center text-sm text-[#80695c]"><span><ImagePlus className="mx-auto mb-2 text-[#a95a39]" size={24} />Add cover artwork to make this story shine.</span></div> : null}</div><label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#a95a39]/50 bg-[#fffaf4] px-4 py-3 text-sm font-bold text-[#a95a39]"><Upload size={17} />{uploading ? 'Uploading artwork…' : 'Upload artwork'}<input className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploading || draft.media.length >= 12} onChange={(event) => { void uploadImages(event.target.files); event.currentTarget.value = '' }} /></label></section>
        <section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h4 className="font-serif text-2xl">Optional add-ons</h4><p className="mt-1 text-sm text-[#624b40]">Extras customers can choose with this story.</p></div><AdminButton variant="secondary" className="px-3 py-2" onClick={addAddon}><Plus size={15} /> Add</AdminButton></div><div className="mt-4 space-y-4">{draft.addons.map((addon, index) => <div key={index} className="rounded-2xl bg-[#f8ecdf] p-4"><div className="flex items-center justify-between gap-3"><strong className="text-sm">Add-on {index + 1}</strong><button type="button" onClick={() => setDraft((current) => ({ ...current, addons: current.addons.filter((_, addonIndex) => addonIndex !== index).map((item, addonIndex) => ({ ...item, sortOrder: addonIndex })) }))} className="rounded-lg p-1.5 text-red-700 hover:bg-red-50" aria-label="Remove add-on"><Trash2 size={15} /></button></div><label className="mt-3 block text-xs font-bold">Price (EGP)<AdminInput className="mt-1" type="number" min="0" step="0.01" value={moneyToInput(addon.priceAmount)} onChange={(event) => updateAddon(index, { priceAmount: inputToMoney(event.target.value) })} /></label><label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={addon.isActive} onChange={(event) => updateAddon(index, { isActive: event.target.checked })} /> Active</label><AdminInput className="mt-3" placeholder="English name" value={addon.translations.find((item) => item.locale === 'en')?.name ?? ''} onChange={(event) => updateAddonTranslation(index, 'en', { name: event.target.value })} /><AdminInput className="mt-2" dir="rtl" placeholder="الاسم بالعربية" value={addon.translations.find((item) => item.locale === 'ar')?.name ?? ''} onChange={(event) => updateAddonTranslation(index, 'ar', { name: event.target.value })} /></div>)}{draft.addons.length === 0 ? <p className="rounded-2xl bg-[#f8ecdf] p-4 text-sm text-[#624b40]">No add-ons yet.</p> : null}</div></section></aside></div>
    </div>
  </WorkspaceDialog>
}

function SimplePersonalizationEditor({ definition, onChange }: { definition: PersonalizationDefinition | null; onChange: (definition: PersonalizationDefinition | null) => void }) {
  const template = personalizedProductTemplate()
  const enabledKeys = new Set(definition?.fields.map((field) => field.key) ?? [])
  const setFieldEnabled = (key: string, enabled: boolean) => {
    const nextKeys = new Set(enabledKeys)
    if (enabled) nextKeys.add(key)
    else nextKeys.delete(key)
    onChange({
      version: definition?.version ?? 1,
      fields: template.fields.filter((field) => nextKeys.has(field.key)),
    })
  }
  const fieldDescription = (key: string) => {
    if (key === 'childName') return 'Required · up to 80 characters'
    if (key === 'age') return 'Required · whole years from 0 to 18 · deleted after retention'
    if (key === 'gender') return 'Required · Boy or Girl · deleted after retention'
    if (key === 'childPhotos') return 'Required · one or two photos · deleted after retention'
    return 'Optional · up to 500 characters'
  }
  return <section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h4 className="font-serif text-2xl">Product personalization</h4><p className="mt-2 max-w-2xl text-sm leading-6 text-[#624b40]">Turn this on only when customers need to provide details before buying this product. Ready products continue straight to delivery and payment.</p></div><label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-[#f8ecdf] px-4 py-3 text-sm font-bold text-[#2c1c14]"><input type="checkbox" role="switch" checked={Boolean(definition)} onChange={(event) => onChange(event.target.checked ? personalizedProductTemplate() : null)} /> Personalized product</label></div>{definition ? <div className="mt-5"><p className="text-sm font-bold text-[#624b40]">Include in this product form</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{template.fields.map((field) => <label key={field.key} className={`flex cursor-pointer items-start justify-between gap-4 rounded-2xl border p-4 transition ${enabledKeys.has(field.key) ? 'border-[#a95a39]/45 bg-[#fffaf4]' : 'border-[#2c1c14]/10 bg-white'}`}><span><strong className="block text-sm">{field.label.en}</strong><small className="mt-1 block leading-5 text-[#80695c]">{fieldDescription(field.key)}</small></span><input className="mt-1 size-4" type="checkbox" checked={enabledKeys.has(field.key)} onChange={(event) => setFieldEnabled(field.key, event.target.checked)} aria-label={`Include ${field.label.en}`} /></label>)}</div><p className="mt-4 text-xs leading-5 text-[#80695c]">The field names, validation, and Boy/Girl choices are fixed. Saved orders retain their own snapshot, so later changes here never alter production instructions already received.</p></div> : null}</section>
}

function OperationsPanel() {
  const navigate = useNavigate()
  const promoEditorMatch = useMatch('/admin/operations/promos/:promoId')
  const governoratesQuery = useQuery({ queryKey: ['admin-governorates'], queryFn: getAdminGovernorates })
  const promosQuery = useQuery({ queryKey: ['admin-promo-codes'], queryFn: getAdminPromoCodes })
  const promoEditorId = promoEditorMatch?.params.promoId
  const selectedPromo = promoEditorId && promoEditorId !== 'new' ? promosQuery.data?.promoCodes.find((promo) => promo.id === promoEditorId) ?? null : null
  const openPromoEditor = (promoId?: string) => navigate(`/admin/operations/promos/${promoId ?? 'new'}`)
  const closePromoEditor = () => navigate('/admin/operations')
  const activeGovernorates = useMemo(
    () => (governoratesQuery.data?.governorates ?? []).filter((governorate) => governorate.isActive).length,
    [governoratesQuery.data?.governorates],
  )
  return <section>
    <PanelHeading eyebrow="Egypt delivery and discounts" title="Shipping & promos" />
    <div className="grid gap-7 xl:grid-cols-[1.05fr_.95fr]"><section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Truck size={18} className="text-[#a95a39]" /><h3 className="font-serif text-2xl">Governorate delivery fees</h3></div><p className="mt-2 text-sm leading-6 text-[#624b40]">{activeGovernorates} active governorates. The initial table is 85 EGP for every governorate; edit each fee manually as needed.</p></div></div><div className="mt-5 space-y-2">{governoratesQuery.isLoading ? <div className="h-52 animate-pulse rounded-2xl bg-[#f2e4d6]" /> : governoratesQuery.data?.governorates.map((governorate) => <GovernorateRow key={governorate.id} governorate={governorate} />)}</div></section><section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-center gap-2"><Tag size={18} className="text-[#a95a39]" /><h3 className="font-serif text-2xl">Fixed-value promo codes</h3></div><p className="mt-2 text-sm leading-6 text-[#624b40]">One code per order. It can stack with a story sale price, then free shipping is evaluated after that promo.</p><div className="mt-5 space-y-2">{promosQuery.isLoading ? <div className="h-32 animate-pulse rounded-2xl bg-[#f2e4d6]" /> : promosQuery.data?.promoCodes.map((promo) => <button key={promo.id} type="button" onClick={() => openPromoEditor(promo.id)} className="flex w-full items-center justify-between rounded-2xl border border-[#2c1c14]/10 p-3 text-left hover:border-[#a95a39]/40"><span><strong>{promo.code}</strong><small className="mt-1 block text-[#80695c]">{formatMoney(promo.fixedDiscountAmount, 'en')} off · {promo.redemptionCount}{promo.maxRedemptions ? `/${promo.maxRedemptions}` : ''} uses</small></span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${promo.isActive ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{promo.isActive ? 'Active' : 'Inactive'}</span></button>)}{!promosQuery.isLoading && (promosQuery.data?.promoCodes.length ?? 0) === 0 ? <p className="rounded-2xl bg-[#f8ecdf] p-4 text-sm text-[#624b40]">No promotion codes yet.</p> : null}</div><AdminButton className="mt-5" onClick={() => openPromoEditor()}><Plus size={16} /> New promo code</AdminButton></section></div>
    {promoEditorMatch ? <PromoEditor key={promoEditorId ?? 'new'} promo={selectedPromo} onClose={closePromoEditor} /> : null}
  </section>
}

function GovernorateRow({ governorate }: { governorate: AdminGovernorate }) {
  const client = useQueryClient()
  const [fee, setFee] = useState(moneyToInput(governorate.shippingFeeAmount))
  const [active, setActive] = useState(governorate.isActive)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setFee(moneyToInput(governorate.shippingFeeAmount)); setActive(governorate.isActive) }, [governorate])
  const changed = inputToMoney(fee) !== governorate.shippingFeeAmount || active !== governorate.isActive
  const save = async () => {
    setSaving(true); setMessage(null)
    try { await saveAdminGovernorate(governorate.id, { shippingFeeAmount: inputToMoney(fee), isActive: active, sortOrder: governorate.sortOrder }); await client.invalidateQueries({ queryKey: ['admin-governorates'] }) } catch (error) { setMessage(errorMessage(error)) } finally { setSaving(false) }
  }
  return <div className="rounded-2xl border border-[#2c1c14]/8 p-3"><div className="grid items-center gap-3 sm:grid-cols-[1fr_120px_auto_auto]"><div><strong>{governorate.nameEn}</strong><span className="ms-2 text-xs text-[#80695c]" dir="rtl">{governorate.nameAr}</span></div><label className="text-sm font-bold">EGP<AdminInput className="mt-1" type="number" min="0" step="0.01" value={fee} onChange={(event) => setFee(event.target.value)} /></label><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label><AdminButton className="px-3 py-2" variant="secondary" disabled={!changed || saving} onClick={() => void save()}>{saving ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />} Save</AdminButton></div>{message ? <p className="mt-2 text-xs text-red-700">{message}</p> : null}</div>
}

function datetimeInput(value: string | null) {
  return value ? value.slice(0, 16) : ''
}

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null
}

function PromoEditor({ promo, onClose }: { promo: AdminPromoCode | null; onClose: () => void }) {
  const client = useQueryClient()
  const [draft, setDraft] = useState<PromoDraft>(() => promoDraft(promo))
  const [baseline, setBaseline] = useState(() => JSON.stringify(promoDraft(promo)))
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const nextDraft = promoDraft(promo)
    setDraft(nextDraft)
    setBaseline(JSON.stringify(nextDraft))
    setMessage(null)
  }, [promo])
  const dirty = JSON.stringify(draft) !== baseline
  const requestClose = () => workspaceClose(onClose, dirty)
  const save = async () => {
    setSaving(true); setMessage(null)
    try { await saveAdminPromoCode(draft, promo?.id); await client.invalidateQueries({ queryKey: ['admin-promo-codes'] }); onClose() } catch (error) { setMessage(errorMessage(error)) } finally { setSaving(false) }
  }
  const deactivate = async () => {
    if (!promo || !window.confirm('Deactivate this promo code? Redemption history will be retained.')) return
    setSaving(true); setMessage(null)
    try { await deactivateAdminPromoCode(promo.id); await client.invalidateQueries({ queryKey: ['admin-promo-codes'] }); onClose() } catch (error) { setMessage(errorMessage(error)) } finally { setSaving(false) }
  }
  return <WorkspaceDialog title={promo ? `Edit ${promo.code}` : 'New promo code'} onRequestClose={requestClose}><section className="min-h-full rounded-[2rem] border border-[#2c1c14]/10 bg-white p-6"><div className="sticky top-0 z-10 -mx-6 -mt-6 flex flex-wrap items-start justify-between gap-4 border-b border-[#2c1c14]/10 bg-white px-6 py-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a95a39]">Promotion editor</p><h3 className="mt-1 font-serif text-3xl">{promo ? `Edit ${promo.code}` : 'New promo code'}</h3></div><div className="flex gap-2"><AdminButton variant="secondary" onClick={requestClose}>Cancel</AdminButton>{promo?.isActive ? <AdminButton variant="danger" disabled={saving} onClick={() => void deactivate()}>Deactivate</AdminButton> : null}<AdminButton disabled={saving} onClick={() => void save()}><Save size={16} /> Save promo</AdminButton></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="block text-sm font-bold">Code<AdminInput className="mt-2" dir="ltr" value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="WELCOME100" /></label><label className="block text-sm font-bold">Discount (EGP)<AdminInput className="mt-2" type="number" min="0" step="0.01" value={moneyToInput(draft.fixedDiscountAmount)} onChange={(event) => setDraft((current) => ({ ...current, fixedDiscountAmount: inputToMoney(event.target.value) }))} /></label><label className="block text-sm font-bold">Minimum subtotal (optional EGP)<AdminInput className="mt-2" type="number" min="0" step="0.01" value={moneyToInput(draft.minimumSubtotalAmount)} onChange={(event) => setDraft((current) => ({ ...current, minimumSubtotalAmount: event.target.value.trim() ? inputToMoney(event.target.value) : null }))} /></label><label className="block text-sm font-bold">Starts (optional)<AdminInput className="mt-2" type="datetime-local" value={datetimeInput(draft.startsAt)} onChange={(event) => setDraft((current) => ({ ...current, startsAt: toIsoOrNull(event.target.value) }))} /></label><label className="block text-sm font-bold">Ends (optional)<AdminInput className="mt-2" type="datetime-local" value={datetimeInput(draft.endsAt)} onChange={(event) => setDraft((current) => ({ ...current, endsAt: toIsoOrNull(event.target.value) }))} /></label><label className="block text-sm font-bold">Maximum uses (optional)<AdminInput className="mt-2" type="number" min="1" value={draft.maxRedemptions ?? ''} onChange={(event) => setDraft((current) => ({ ...current, maxRedemptions: event.target.value.trim() ? Number(event.target.value) : null }))} /></label></div><label className="mt-5 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>{message ? <div className="mt-5"><FormMessage>{message}</FormMessage></div> : null}</section></WorkspaceDialog>
}

function ContentPanel() {
  return <section>
    <PanelHeading eyebrow="Customer-facing details" title="Store content" />
    <div className="grid gap-7 xl:grid-cols-[.8fr_1.2fr]"><StoreSettingsEditor /><ContentPagesEditor /></div>
    <CommunityContentEditor />
  </section>
}


type StoreSettingsDraft = Omit<StorefrontSettings, 'announcementBar' | 'seoDefaults'> & {
  announcementBar: NonNullable<StorefrontSettings['announcementBar']>
  seoDefaults: NonNullable<StorefrontSettings['seoDefaults']>
}

function normalizeSettings(settings: StorefrontSettings): StoreSettingsDraft {
  const announcementByLocale = new Map((settings.announcementBar?.translations ?? []).map((translation) => [translation.locale, translation]))
  return {
    ...settings,
    announcementBar: {
      isEnabled: settings.announcementBar?.isEnabled ?? false,
      translations: [
        announcementByLocale.get('en') ?? { locale: 'en', text: '', href: null },
        announcementByLocale.get('ar') ?? { locale: 'ar', text: '', href: null },
      ],
    },
    seoDefaults: settings.seoDefaults ?? { title: null, description: null, ogImageUrl: null },
  }
}

function StoreSettingsEditor() {
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: getAdminSettings })
  const client = useQueryClient()
  const [draft, setDraft] = useState<StoreSettingsDraft | null>(null)
  const [threshold, setThreshold] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(new Map())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!settingsQuery.data?.settings) return
    setDraft(normalizeSettings(settingsQuery.data.settings))
    setThreshold(moneyToInput(settingsQuery.data.settings.freeShippingThresholdAmount))
    setMessage(null)
    setFieldErrors(new Map())
  }, [settingsQuery.data?.settings])

  const updateAnnouncement = (locale: 'ar' | 'en', changes: Partial<StoreSettingsDraft['announcementBar']['translations'][number]>) => {
    setDraft((current) => current ? { ...current, announcementBar: { ...current.announcementBar, translations: current.announcementBar.translations.map((translation) => translation.locale === locale ? { ...translation, ...changes } : translation) } } : current)
  }
  const save = async () => {
    if (!draft) return
    setSaving(true)
    setMessage(null)
    setFieldErrors(new Map())
    try {
      await saveAdminSettings({ ...draft, freeShippingThresholdAmount: threshold.trim() ? inputToMoney(threshold) : null })
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-settings'] }),
        client.invalidateQueries({ queryKey: ['settings'] }),
      ])
      setMessage('Settings saved.')
    } catch (error) {
      const errors = formErrors(error)
      setFieldErrors(errors)
      setMessage(errorMessage(error))
      if (errors.size) focusFirstInvalidField()
    } finally {
      setSaving(false)
    }
  }

  return <section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-2"><Settings2 size={18} className="text-[#a95a39]" /><div><h3 className="font-serif text-2xl">Store settings</h3><p className="mt-1 text-sm text-[#624b40]">Customer support, checkout guidance, announcements, and search defaults.</p></div></div></div>{settingsQuery.isLoading || !draft ? <div className="mt-5 h-96 animate-pulse rounded-2xl bg-[#f2e4d6]" /> : <div className="mt-5 space-y-5"><FormErrorSummary errors={fieldErrors} /><section className="rounded-2xl bg-[#f8ecdf] p-4"><h4 className="font-serif text-xl">Brand and customer support</h4><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">Brand name<AdminInput className="mt-2" error={fieldError(fieldErrors, 'brandName')} value={draft.brandName ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, brandName: event.target.value || null } : current)} placeholder="Leave blank until branding is supplied" /><FieldMessage>{fieldError(fieldErrors, 'brandName')}</FieldMessage></label><label className="block text-sm font-bold">Support phone<AdminInput className="mt-2" error={fieldError(fieldErrors, 'supportPhone')} dir="ltr" value={draft.supportPhone ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, supportPhone: event.target.value || null } : current)} placeholder="010…" /><FieldMessage>{fieldError(fieldErrors, 'supportPhone')}</FieldMessage></label><label className="block text-sm font-bold">Support email<AdminInput className="mt-2" error={fieldError(fieldErrors, 'supportEmail')} type="email" dir="ltr" value={draft.supportEmail ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, supportEmail: event.target.value || null } : current)} placeholder="hello@example.com" /><FieldMessage>{fieldError(fieldErrors, 'supportEmail')}</FieldMessage></label><label className="block text-sm font-bold">WhatsApp URL<AdminInput className="mt-2" error={fieldError(fieldErrors, 'whatsappUrl')} dir="ltr" value={draft.whatsappUrl ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, whatsappUrl: event.target.value || null } : current)} placeholder="https://wa.me/…" /><FieldMessage>{fieldError(fieldErrors, 'whatsappUrl')}</FieldMessage></label></div><label className="mt-4 block text-sm font-bold">Business hours<AdminTextarea className="mt-2" rows={2} value={draft.businessHours ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, businessHours: event.target.value || null } : current)} placeholder="Sun–Thu, 10:00–18:00" /></label></section>
      <section className="rounded-2xl border border-[#2c1c14]/10 p-4"><h4 className="font-serif text-xl">Checkout and manual payment</h4><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">Free shipping threshold (EGP)<AdminInput className="mt-2" type="number" min="1" step="0.01" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder="Leave blank to disable" /><span className="mt-1 block text-xs text-[#80695c]">Displayed prices already include VAT.</span></label><label className="block text-sm font-bold">Delivery guidance<AdminTextarea className="mt-2" rows={4} value={draft.deliveryGuidance ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, deliveryGuidance: event.target.value || null } : current)} placeholder="What happens after the order is submitted?" /></label></div><label className="mt-4 block text-sm font-bold">Payment guidance<AdminTextarea className="mt-2" rows={3} value={draft.paymentGuidance ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, paymentGuidance: event.target.value || null } : current)} placeholder="Instructions shown before the customer uploads proof." /></label><fieldset className="mt-4 rounded-2xl bg-[#f8ecdf] p-4"><legend className="px-1 font-serif text-lg">Manual transfer details</legend><p className="mb-3 text-xs leading-5 text-[#624b40]">These details appear at checkout. They do not create a payment-gateway connection.</p><label className="block text-sm font-bold">InstaPay<AdminTextarea className="mt-2" rows={3} value={draft.paymentDetails.instapay ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, paymentDetails: { ...current.paymentDetails, instapay: event.target.value || null } } : current)} /></label><label className="mt-3 block text-sm font-bold">Mobile wallet (Vodafone Cash, Orange Money, WE Pay, or Etisalat Cash)<AdminTextarea className="mt-2" rows={3} value={draft.paymentDetails.mobileWallet ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, paymentDetails: { ...current.paymentDetails, mobileWallet: event.target.value || null } } : current)} /></label></fieldset></section>
      <section className="rounded-2xl border border-[#2c1c14]/10 p-4"><div className="flex items-center justify-between gap-4"><div><h4 className="font-serif text-xl">Announcement bar</h4><p className="mt-1 text-sm text-[#624b40]">A short optional message at the top of the storefront.</p></div><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.announcementBar.isEnabled} onChange={(event) => setDraft((current) => current ? { ...current, announcementBar: { ...current.announcementBar, isEnabled: event.target.checked } } : current)} /> Enabled</label></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">English message<AdminInput className="mt-2" value={draft.announcementBar.translations.find((translation) => translation.locale === 'en')?.text ?? ''} onChange={(event) => updateAnnouncement('en', { text: event.target.value })} /></label><label className="block text-sm font-bold">Arabic message<AdminInput className="mt-2" dir="rtl" value={draft.announcementBar.translations.find((translation) => translation.locale === 'ar')?.text ?? ''} onChange={(event) => updateAnnouncement('ar', { text: event.target.value })} /></label><label className="block text-sm font-bold">English link (optional)<AdminInput className="mt-2" dir="ltr" value={draft.announcementBar.translations.find((translation) => translation.locale === 'en')?.href ?? ''} onChange={(event) => updateAnnouncement('en', { href: event.target.value || null })} placeholder="/stories" /></label><label className="block text-sm font-bold">Arabic link (optional)<AdminInput className="mt-2" dir="ltr" value={draft.announcementBar.translations.find((translation) => translation.locale === 'ar')?.href ?? ''} onChange={(event) => updateAnnouncement('ar', { href: event.target.value || null })} placeholder="/ar/stories" /></label></div></section>
      <section className="rounded-2xl border border-[#2c1c14]/10 p-4"><h4 className="font-serif text-xl">Search and social defaults</h4><p className="mt-1 text-sm text-[#624b40]">Used when a page does not provide its own metadata.</p><div className="mt-4 grid gap-4"><label className="block text-sm font-bold">Default title<AdminInput className="mt-2" value={draft.seoDefaults.title ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, seoDefaults: { ...current.seoDefaults, title: event.target.value || null } } : current)} /></label><label className="block text-sm font-bold">Default description<AdminTextarea className="mt-2" rows={3} value={draft.seoDefaults.description ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, seoDefaults: { ...current.seoDefaults, description: event.target.value || null } } : current)} /></label><label className="block text-sm font-bold">Social image URL<AdminInput className="mt-2" dir="ltr" value={draft.seoDefaults.ogImageUrl ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, seoDefaults: { ...current.seoDefaults, ogImageUrl: event.target.value || null } } : current)} placeholder="https://…" /></label></div></section>
      <AdminButton className="w-full" disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />} Save settings</AdminButton>{message ? <FormMessage kind={message === 'Settings saved.' ? 'success' : 'error'}>{message}</FormMessage> : null}</div>}</section>
}

function emptyPage(key: AdminContentPage['key']): AdminContentPage {
  return { key, isPublished: false, translations: [{ locale: 'en', title: '', content: '' }, { locale: 'ar', title: '', content: '' }] }
}

function ContentPagesEditor() {
  const pagesQuery = useQuery({ queryKey: ['admin-content-pages'], queryFn: getAdminContentPages })
  const client = useQueryClient()
  const [key, setKey] = useState<AdminContentPage['key']>('terms')
  const selectedPage = pagesQuery.data?.pages.find((page) => page.key === key) ?? null
  const [draft, setDraft] = useState<AdminContentPage>(() => emptyPage('terms'))
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDraft(selectedPage ? structuredClone(selectedPage) : emptyPage(key)); setMessage(null) }, [key, selectedPage])
  const updateTranslation = (locale: 'ar' | 'en', changes: Partial<AdminContentPage['translations'][number]>) => setDraft((current) => ({ ...current, translations: current.translations.map((translation) => translation.locale === locale ? { ...translation, ...changes } : translation) }))
  const save = async () => {
    setSaving(true); setMessage(null)
    try { await saveAdminContentPage(key, { isPublished: draft.isPublished, translations: draft.translations }); await client.invalidateQueries({ queryKey: ['admin-content-pages'] }); setMessage('Page saved.') } catch (error) { setMessage(errorMessage(error)) } finally { setSaving(false) }
  }
  return <section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-center gap-2"><FileText size={18} className="text-[#a95a39]" /><h3 className="font-serif text-2xl">Policies and static pages</h3></div><p className="mt-2 text-sm leading-6 text-[#624b40]">Page content is plain text. It is not rendered as raw HTML, so policy edits cannot inject scripts into the storefront.</p><label className="mt-5 block text-sm font-bold">Page<select className="mt-2 w-full rounded-xl border border-[#2c1c14]/15 bg-white px-3 py-2.5 text-sm" value={key} onChange={(event) => setKey(event.target.value as AdminContentPage['key'])}>{PAGE_KEYS.map((pageKey) => <option key={pageKey} value={pageKey}>{pageKey}</option>)}</select></label>{pagesQuery.isLoading ? <div className="mt-5 h-60 animate-pulse rounded-2xl bg-[#f2e4d6]" /> : <div className="mt-5 space-y-4"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.isPublished} onChange={(event) => setDraft((current) => ({ ...current, isPublished: event.target.checked }))} /> Published</label><TranslationBlock title="English" direction="ltr"><label className="block text-sm font-bold">Title<AdminInput className="mt-2" value={draft.translations.find((item) => item.locale === 'en')?.title ?? ''} onChange={(event) => updateTranslation('en', { title: event.target.value })} /></label><label className="mt-3 block text-sm font-bold">Content<AdminTextarea className="mt-2" rows={9} value={draft.translations.find((item) => item.locale === 'en')?.content ?? ''} onChange={(event) => updateTranslation('en', { content: event.target.value })} /></label></TranslationBlock><TranslationBlock title="Arabic" direction="rtl"><label className="block text-sm font-bold">العنوان<AdminInput className="mt-2" value={draft.translations.find((item) => item.locale === 'ar')?.title ?? ''} onChange={(event) => updateTranslation('ar', { title: event.target.value })} /></label><label className="mt-3 block text-sm font-bold">المحتوى<AdminTextarea className="mt-2" rows={9} value={draft.translations.find((item) => item.locale === 'ar')?.content ?? ''} onChange={(event) => updateTranslation('ar', { content: event.target.value })} /></label></TranslationBlock><AdminButton className="w-full" disabled={saving} onClick={() => void save()}><Save size={16} /> Save {key}</AdminButton>{message ? <FormMessage kind={message === 'Page saved.' ? 'success' : 'error'}>{message}</FormMessage> : null}</div>}</section>
}

function CommunityContentEditor() {
  const faqsQuery = useQuery({ queryKey: ['admin-faqs'], queryFn: getAdminFaqs })
  const testimonialsQuery = useQuery({ queryKey: ['admin-testimonials'], queryFn: getAdminTestimonials })
  const [faqEditor, setFaqEditor] = useState<{ open: boolean; item: AdminFaq | null }>({ open: false, item: null })
  const [testimonialEditor, setTestimonialEditor] = useState<{ open: boolean; item: AdminTestimonial | null }>({ open: false, item: null })
  return <section className="mt-7 grid gap-7 xl:grid-cols-2"><section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="font-serif text-2xl">FAQ</h3><p className="mt-2 text-sm text-[#624b40]">Shown on the public FAQ page in the matching storefront language.</p></div><AdminButton variant="secondary" className="px-3 py-2" onClick={() => setFaqEditor({ open: true, item: null })}><Plus size={15} /> Add</AdminButton></div><div className="mt-5 space-y-2">{faqsQuery.isLoading ? <div className="h-28 animate-pulse rounded-2xl bg-[#f2e4d6]" /> : faqsQuery.data?.faqs.map((faq) => <button key={faq.id} type="button" onClick={() => setFaqEditor({ open: true, item: faq })} className="w-full rounded-2xl border border-[#2c1c14]/8 p-3 text-left hover:border-[#a95a39]/40"><strong>{faq.translations.find((translation) => translation.locale === 'en')?.question ?? faq.translations.find((translation) => translation.locale === 'ar')?.question}</strong><span className={`ms-2 rounded-full px-2 py-1 text-[10px] font-bold ${faq.isPublished ? 'bg-emerald-50 text-emerald-800' : 'bg-[#f8ecdf] text-[#624b40]'}`}>{faq.isPublished ? 'Published' : 'Hidden'}</span></button>)}{!faqsQuery.isLoading && (faqsQuery.data?.faqs.length ?? 0) === 0 ? <p className="rounded-2xl bg-[#f8ecdf] p-4 text-sm text-[#624b40]">No FAQs yet.</p> : null}</div></section><section className="rounded-3xl border border-[#2c1c14]/10 bg-white p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="font-serif text-2xl">Testimonials</h3><p className="mt-2 text-sm text-[#624b40]">Published testimonials appear on the home page when present.</p></div><AdminButton variant="secondary" className="px-3 py-2" onClick={() => setTestimonialEditor({ open: true, item: null })}><Plus size={15} /> Add</AdminButton></div><div className="mt-5 space-y-2">{testimonialsQuery.isLoading ? <div className="h-28 animate-pulse rounded-2xl bg-[#f2e4d6]" /> : testimonialsQuery.data?.testimonials.map((testimonial) => <button key={testimonial.id} type="button" onClick={() => setTestimonialEditor({ open: true, item: testimonial })} className="w-full rounded-2xl border border-[#2c1c14]/8 p-3 text-left hover:border-[#a95a39]/40"><strong>{testimonial.displayName}</strong><span className="mt-1 block truncate text-sm text-[#624b40]">{testimonial.translations.find((translation) => translation.locale === 'en')?.quote ?? testimonial.translations.find((translation) => translation.locale === 'ar')?.quote}</span></button>)}{!testimonialsQuery.isLoading && (testimonialsQuery.data?.testimonials.length ?? 0) === 0 ? <p className="rounded-2xl bg-[#f8ecdf] p-4 text-sm text-[#624b40]">No testimonials yet.</p> : null}</div></section>{faqEditor.open ? <FaqEditor key={faqEditor.item?.id ?? 'new'} faq={faqEditor.item} onClose={() => setFaqEditor({ open: false, item: null })} /> : null}{testimonialEditor.open ? <TestimonialEditor key={testimonialEditor.item?.id ?? 'new'} testimonial={testimonialEditor.item} onClose={() => setTestimonialEditor({ open: false, item: null })} /> : null}</section>
}

function FaqEditor({ faq, onClose }: { faq: AdminFaq | null; onClose: () => void }) {
  const client = useQueryClient()
  const [draft, setDraft] = useState<Omit<AdminFaq, 'id'>>(() => faq ? { isPublished: faq.isPublished, sortOrder: faq.sortOrder, translations: structuredClone(faq.translations) } : { isPublished: true, sortOrder: 0, translations: [{ locale: 'en', question: '', answer: '' }, { locale: 'ar', question: '', answer: '' }] })
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const updateTranslation = (locale: 'ar' | 'en', changes: Partial<AdminFaq['translations'][number]>) => setDraft((current) => ({ ...current, translations: current.translations.map((translation) => translation.locale === locale ? { ...translation, ...changes } : translation) }))
  const save = async () => {
    setSaving(true); setMessage(null)
    try { await saveAdminFaq(draft, faq?.id); await client.invalidateQueries({ queryKey: ['admin-faqs'] }); onClose() } catch (error) { setMessage(errorMessage(error)) } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!faq || !window.confirm('Delete this FAQ?')) return
    setSaving(true); setMessage(null)
    try { await deleteAdminFaq(faq.id); await client.invalidateQueries({ queryKey: ['admin-faqs'] }); onClose() } catch (error) { setMessage(errorMessage(error)) } finally { setSaving(false) }
  }
  return <section className="xl:col-span-2 rounded-[2rem] border border-[#2c1c14]/10 bg-[#fffaf4] p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a95a39]">FAQ editor</p><h3 className="mt-1 font-serif text-3xl">{faq ? 'Edit FAQ' : 'New FAQ'}</h3></div><div className="flex gap-2"><AdminButton variant="secondary" onClick={onClose}>Cancel</AdminButton>{faq ? <AdminButton variant="danger" disabled={saving} onClick={() => void remove()}><Trash2 size={16} /> Delete</AdminButton> : null}<AdminButton disabled={saving} onClick={() => void save()}><Save size={16} /> Save FAQ</AdminButton></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">Sort order<AdminInput className="mt-2" type="number" min="0" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} /></label><label className="mt-7 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.isPublished} onChange={(event) => setDraft((current) => ({ ...current, isPublished: event.target.checked }))} /> Published</label></div><div className="mt-5 grid gap-4 lg:grid-cols-2"><TranslationBlock title="English" direction="ltr"><label className="block text-sm font-bold">Question<AdminInput className="mt-2" value={draft.translations.find((item) => item.locale === 'en')?.question ?? ''} onChange={(event) => updateTranslation('en', { question: event.target.value })} /></label><label className="mt-3 block text-sm font-bold">Answer<AdminTextarea className="mt-2" rows={6} value={draft.translations.find((item) => item.locale === 'en')?.answer ?? ''} onChange={(event) => updateTranslation('en', { answer: event.target.value })} /></label></TranslationBlock><TranslationBlock title="Arabic" direction="rtl"><label className="block text-sm font-bold">السؤال<AdminInput className="mt-2" value={draft.translations.find((item) => item.locale === 'ar')?.question ?? ''} onChange={(event) => updateTranslation('ar', { question: event.target.value })} /></label><label className="mt-3 block text-sm font-bold">الإجابة<AdminTextarea className="mt-2" rows={6} value={draft.translations.find((item) => item.locale === 'ar')?.answer ?? ''} onChange={(event) => updateTranslation('ar', { answer: event.target.value })} /></label></TranslationBlock></div>{message ? <div className="mt-5"><FormMessage>{message}</FormMessage></div> : null}</section>
}

function TestimonialEditor({ testimonial, onClose }: { testimonial: AdminTestimonial | null; onClose: () => void }) {
  const client = useQueryClient()
  const [draft, setDraft] = useState<Omit<AdminTestimonial, 'id'>>(() => testimonial ? { displayName: testimonial.displayName, isPublished: testimonial.isPublished, sortOrder: testimonial.sortOrder, translations: structuredClone(testimonial.translations) } : { displayName: '', isPublished: true, sortOrder: 0, translations: [{ locale: 'en', quote: '' }, { locale: 'ar', quote: '' }] })
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const updateTranslation = (locale: 'ar' | 'en', changes: Partial<AdminTestimonial['translations'][number]>) => setDraft((current) => ({ ...current, translations: current.translations.map((translation) => translation.locale === locale ? { ...translation, ...changes } : translation) }))
  const save = async () => {
    setSaving(true); setMessage(null)
    try { await saveAdminTestimonial(draft, testimonial?.id); await client.invalidateQueries({ queryKey: ['admin-testimonials'] }); onClose() } catch (error) { setMessage(errorMessage(error)) } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!testimonial || !window.confirm('Delete this testimonial?')) return
    setSaving(true); setMessage(null)
    try { await deleteAdminTestimonial(testimonial.id); await client.invalidateQueries({ queryKey: ['admin-testimonials'] }); onClose() } catch (error) { setMessage(errorMessage(error)) } finally { setSaving(false) }
  }
  return <section className="xl:col-span-2 rounded-[2rem] border border-[#2c1c14]/10 bg-[#fffaf4] p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a95a39]">Testimonial editor</p><h3 className="mt-1 font-serif text-3xl">{testimonial ? 'Edit testimonial' : 'New testimonial'}</h3></div><div className="flex gap-2"><AdminButton variant="secondary" onClick={onClose}>Cancel</AdminButton>{testimonial ? <AdminButton variant="danger" disabled={saving} onClick={() => void remove()}><Trash2 size={16} /> Delete</AdminButton> : null}<AdminButton disabled={saving} onClick={() => void save()}><Save size={16} /> Save testimonial</AdminButton></div></div><div className="mt-5 grid gap-4 sm:grid-cols-3"><label className="block text-sm font-bold">Display name<AdminInput className="mt-2" value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} /></label><label className="block text-sm font-bold">Sort order<AdminInput className="mt-2" type="number" min="0" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} /></label><label className="mt-7 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.isPublished} onChange={(event) => setDraft((current) => ({ ...current, isPublished: event.target.checked }))} /> Published</label></div><div className="mt-5 grid gap-4 lg:grid-cols-2"><TranslationBlock title="English" direction="ltr"><label className="block text-sm font-bold">Quote<AdminTextarea className="mt-2" rows={6} value={draft.translations.find((item) => item.locale === 'en')?.quote ?? ''} onChange={(event) => updateTranslation('en', { quote: event.target.value })} /></label></TranslationBlock><TranslationBlock title="Arabic" direction="rtl"><label className="block text-sm font-bold">النص<AdminTextarea className="mt-2" rows={6} value={draft.translations.find((item) => item.locale === 'ar')?.quote ?? ''} onChange={(event) => updateTranslation('ar', { quote: event.target.value })} /></label></TranslationBlock></div>{message ? <div className="mt-5"><FormMessage>{message}</FormMessage></div> : null}</section>
}
