import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock3, Leaf, Mail, Menu, MessageCircle, Phone, ShoppingBag, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useCart } from '../features/cart/CartContext'
import { getSettings } from '../lib/api'
import { useStoreLocale } from '../lib/locale'

type SafeLink =
  | { kind: 'internal'; href: string }
  | { kind: 'external'; href: string }

function safePublicLink(value: string | null | undefined): SafeLink | null {
  const href = value?.trim()
  if (!href) return null

  // Internal paths are intentionally relative to this storefront. Reject
  // protocol-relative URLs and backslashes so an editor cannot turn one into
  // an unexpected external destination.
  if (href.startsWith('/') && !href.startsWith('//') && !href.includes('\\')) {
    try {
      const parsed = new URL(href, 'https://storefront.invalid')
      if (parsed.origin !== 'https://storefront.invalid') return null
      return { kind: 'internal', href: `${parsed.pathname}${parsed.search}${parsed.hash}` }
    } catch {
      return null
    }
  }

  try {
    const parsed = new URL(href)
    return parsed.protocol === 'https:' ? { kind: 'external', href: parsed.toString() } : null
  } catch {
    return null
  }
}

function safePhoneLink(value: string | null | undefined) {
  const normalized = value?.replace(/[^\d+]/g, '') ?? ''
  return /^\+?\d{6,20}$/.test(normalized) ? `tel:${normalized}` : null
}

function safeEmailLink(value: string | null | undefined) {
  const email = value?.trim() ?? ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${encodeURIComponent(email)}` : null
}

function localizedInternalPath(path: string, localizedPath: (path: string) => string) {
  return /^\/(?:ar|en)(?:\/|$)/.test(path) ? path : localizedPath(path)
}

export function LocaleSynchronizer() {
  const { locale } = useParams()
  const navigate = useNavigate()
  const { i18n } = useTranslation()

  useEffect(() => {
    if (locale === 'ar' || locale === 'en') {
      void i18n.changeLanguage(locale)
      return
    }
    navigate('/', { replace: true })
  }, [i18n, locale, navigate])
  return <Outlet />
}

export function StorefrontShell() {
  const { locale, localizedPath, switchLanguage, text } = useStoreLocale()
  const { itemCount } = useCart()
  const settingsQuery = useQuery({ queryKey: ['settings', locale], queryFn: () => getSettings(locale) })
  const settings = settingsQuery.data?.settings
  const brandName = 'Mint Meow'
  const whatsappLink = safePublicLink(settings?.whatsappUrl)
  const supportPhoneLink = safePhoneLink(settings?.supportPhone)
  const supportEmailLink = safeEmailLink(settings?.supportEmail)
  const announcement = settings?.announcementBar?.isEnabled
    ? settings.announcementBar.translations.find((translation) => translation.locale === locale)
      ?? settings.announcementBar.translations[0]
    : null
  const announcementLink = safePublicLink(announcement?.href)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  }, [locale])

  return (
    <div className="min-h-dvh bg-[#FAF8F3] text-[#123f3c]">
      <header className="sticky top-0 z-20 border-b border-[#0D7D78]/10 bg-[#FAF8F3]/92 backdrop-blur-xl">
        {announcement?.text ? <div className="border-b border-[#0D7D78]/10 bg-[#0D7D78] px-5 py-2 text-center text-sm font-bold text-[#FAF8F3]">
          <div className="mx-auto max-w-6xl">
            {announcementLink?.kind === 'internal' ? <Link className="underline decoration-white/50 underline-offset-4 hover:decoration-white" to={localizedInternalPath(announcementLink.href, localizedPath)}>{announcement.text}</Link>
              : announcementLink?.kind === 'external' ? <a className="underline decoration-white/50 underline-offset-4 hover:decoration-white" href={announcementLink.href} target="_blank" rel="noreferrer">{announcement.text}</a>
                : announcement.text}
          </div>
        </div> : null}
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link to={localizedPath('/')} className="flex items-center gap-2" aria-label={brandName}>
            <img src="/brand/mint-meow-logo-mint.png" alt="Mint Meow" className="h-10 w-12 object-contain sm:h-12 sm:w-14" />
            <span className="hidden text-sm font-black tracking-[.08em] text-[#075f5b] sm:block">MINT MEOW</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-extrabold text-[#075f5b] lg:flex">
            <Link className="transition hover:text-[#0D7D78]" to={localizedPath('/stories')}>{text('تسوّق الكل', 'Shop all')}</Link>
            <Link className="transition hover:text-[#0D7D78]" to={localizedPath('/stories')}>{text('هدايا مخصّصة', 'Personalized gifts')}</Link>
            <Link className="transition hover:text-[#0D7D78]" to={localizedPath('/stories')}>{text('تعلّم والعب', 'Learn & play')}</Link>
            <Link className="transition hover:text-[#0D7D78]" to={localizedPath('/how-it-works')}>{text('كيف تعمل', 'How it works')}</Link>
            <Link className="transition hover:text-[#0D7D78]" to={localizedPath('/track-order')}>{text('تتبّع الطلب', 'Track order')}</Link>
          </nav>
          <div className="flex items-center gap-2">
            <button className="grid size-10 place-items-center rounded-2xl border border-[#0D7D78]/15 bg-white text-[#075f5b] lg:hidden" type="button" onClick={() => setMenuOpen((current) => !current)} aria-label={text('القائمة', 'Menu')}>
              {menuOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
            <button
              className="hidden rounded-xl border border-[#0D7D78]/15 bg-white px-3 py-2 text-xs font-extrabold text-[#075f5b] transition hover:border-[#0D7D78]/45 sm:block"
              type="button"
              onClick={() => switchLanguage(locale === 'ar' ? 'en' : 'ar')}
            >
              {locale === 'ar' ? 'English' : 'العربية'}
            </button>
            <Link
              to={localizedPath('/checkout')}
              className="relative grid size-10 place-items-center rounded-2xl bg-[#0D7D78] text-[#FAF8F3] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#075f5b]"
              aria-label={text('طلبك', 'Your order')}
            >
              <ShoppingBag size={17} />
              {itemCount > 0 ? <span className="absolute -end-1 -top-1 grid size-4 place-items-center rounded-full bg-[#FFD14D] text-[10px] font-black text-[#075f5b]">{itemCount}</span> : null}
            </Link>
          </div>
        </div>
        {menuOpen ? <nav className="border-t border-[#0D7D78]/10 bg-[#FAF8F3] px-5 py-3 lg:hidden"><div className="mx-auto grid max-w-7xl gap-1 text-sm font-extrabold text-[#075f5b]"><Link onClick={() => setMenuOpen(false)} className="rounded-2xl px-4 py-3 hover:bg-[#9FD9C2]/30" to={localizedPath('/stories')}>{text('تسوّق الكل', 'Shop all')}</Link><Link onClick={() => setMenuOpen(false)} className="rounded-2xl px-4 py-3 hover:bg-[#9FD9C2]/30" to={localizedPath('/stories')}>{text('هدايا مخصّصة', 'Personalized gifts')}</Link><Link onClick={() => setMenuOpen(false)} className="rounded-2xl px-4 py-3 hover:bg-[#9FD9C2]/30" to={localizedPath('/stories')}>{text('تعلّم والعب', 'Learn & play')}</Link><Link onClick={() => setMenuOpen(false)} className="rounded-2xl px-4 py-3 hover:bg-[#9FD9C2]/30" to={localizedPath('/how-it-works')}>{text('كيف تعمل', 'How it works')}</Link><Link onClick={() => setMenuOpen(false)} className="rounded-2xl px-4 py-3 hover:bg-[#9FD9C2]/30" to={localizedPath('/track-order')}>{text('تتبّع الطلب', 'Track order')}</Link></div></nav> : null}
      </header>
      <Outlet />
      <footer className="mt-16 overflow-hidden border-t border-[#0D7D78]/10 bg-[#0D7D78] text-[#FAF8F3]">
        <div className="mx-auto grid max-w-7xl gap-7 px-5 py-10 text-sm sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2"><Leaf size={17} className="text-[#FFD14D]" aria-hidden="true" /><p className="font-black tracking-wide">MINT MEOW</p></div>
            <p className="mt-3 max-w-md text-[#FAF8F3]/75">{text('منتجات صغيرة تصنع لحظات كبيرة — للقراءة، اللعب، والتعلّم.', 'Little things that create big moments — made for reading, playing, and growing.')}</p>
            {settings?.businessHours ? <p className="mt-3 inline-flex items-start gap-2 text-xs leading-5 text-[#FAF8F3]/70"><Clock3 className="mt-0.5 shrink-0" size={15} aria-hidden="true" /> <span className="whitespace-pre-line">{settings.businessHours}</span></p> : null}
          </div>
          <div className="flex flex-col gap-4 lg:items-end">
            {(settings?.supportPhone || settings?.supportEmail || whatsappLink) ? <div className="flex flex-wrap gap-x-4 gap-y-2">
              {settings?.supportPhone ? supportPhoneLink ? <a className="inline-flex items-center gap-1 text-[#FAF8F3]/80 transition hover:text-[#FFD14D]" href={supportPhoneLink}><Phone size={15} aria-hidden="true" /> <span dir="ltr">{settings.supportPhone}</span></a> : <span className="inline-flex items-center gap-1 text-[#FAF8F3]/80"><Phone size={15} aria-hidden="true" /> <span dir="ltr">{settings.supportPhone}</span></span> : null}
              {settings?.supportEmail ? supportEmailLink ? <a className="inline-flex items-center gap-1 text-[#FAF8F3]/80 transition hover:text-[#FFD14D]" href={supportEmailLink}><Mail size={15} aria-hidden="true" /> {settings.supportEmail}</a> : <span className="inline-flex items-center gap-1 text-[#FAF8F3]/80"><Mail size={15} aria-hidden="true" /> {settings.supportEmail}</span> : null}
              {whatsappLink?.kind === 'external' ? <a className="inline-flex items-center gap-1 text-[#FAF8F3]/80 transition hover:text-[#FFD14D]" href={whatsappLink.href} target="_blank" rel="noreferrer"><MessageCircle size={15} aria-hidden="true" /> WhatsApp</a> : null}
              {whatsappLink?.kind === 'internal' ? <Link className="inline-flex items-center gap-1 text-[#FAF8F3]/80 transition hover:text-[#FFD14D]" to={localizedInternalPath(whatsappLink.href, localizedPath)}><MessageCircle size={15} aria-hidden="true" /> WhatsApp</Link> : null}
            </div> : null}
            <div className="flex flex-wrap gap-4">
              <Link to={localizedPath('/privacy')}>{text('الخصوصية', 'Privacy')}</Link>
              <Link to={localizedPath('/terms')}>{text('الشروط', 'Terms')}</Link>
              <Link to={localizedPath('/returns')}>{text('الاستبدال والاسترجاع', 'Returns')}</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
