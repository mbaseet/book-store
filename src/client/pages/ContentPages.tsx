import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { MintCompanion } from '../components/MintCompanion'
import { EyebrowBanner } from '../components/EyebrowBanner'
import { getContentPage, getFaqs, getSettings } from '../lib/api'
import { useStoreLocale } from '../lib/locale'
import {
  TRACKING_CONSENT_CHANGE_EVENT,
  clearTrackingConsent,
  deactivateTracking,
  readTrackingConsent,
  writeTrackingConsent,
} from '../lib/tracking'

export function HowItWorksPage() {
  const { text } = useStoreLocale()
  const steps = [
    {
      title: text('اختر ما يحبونه', 'Choose what they love'),
      body: text('تصفّح المنتجات واختر المغامرة أو اللعبة الأقرب لقلب طفلك.', 'Browse the collection and choose the adventure or playtime pick that fits your child.'),
      image: '/brand/how-it-works-choose.png',
      imageAlt: text('ثلاثة عوالم من مِنت للاختيار بينها', 'Three Mint worlds to choose from'),
    },
    {
      title: text('الخطوة ١: تفاصيل المنتج', 'Step 1: Product details'),
      body: text('أضف بيانات الطفل المطلوبة للمنتج، إن وجدت، واختر أي إضافات.', 'Add the child details requested for that product, if any, and choose any extras.'),
      image: '/brand/how-it-works-personalize.png',
      imageAlt: text('ارفع صورة وابدأ تخصيص هديتك', 'Upload a photo to personalize your gift'),
    },
    {
      title: text('الخطوة ٢: التوصيل والدفع', 'Step 2: Delivery & payment'),
      body: text('اختر المحافظة لمراجعة الإجمالي الدقيق، ثم أرسل إثبات التحويل. نراجع الطلب قبل بدء التجهيز.', 'Choose a governorate to review the exact total, then upload your transfer proof. We review the order before production begins.'),
      image: '/brand/how-it-works-finish.png',
      imageAlt: text('كتاب مِنت جاهز ليصنع لحظة جميلة', 'A Mint storybook ready to make a beautiful moment'),
    },
  ]

  return (
    <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="grid gap-6 overflow-hidden rounded-[2rem] bg-[#0D7D78] p-7 text-[#FAF8F3] sm:p-10 md:grid-cols-[1fr_250px] md:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-[.14em] text-[#FFD14D]">{text('ببساطة مع مِنت', 'Simple with Mint')}</p>
          <h1 className="mint-heading mt-3 text-4xl leading-tight sm:text-5xl">{text('كيف تصنع هديتك الخاصة؟', 'How your special gift is made')}</h1>
          <p className="mt-4 max-w-2xl leading-7 text-[#FAF8F3]/80">{text('مِنت ترافقك من أول اختيار إلى أن يصبح المنتج جاهزًا للفرح.', 'Mint stays with you from the first pick until your little moment is ready.')}</p>
        </div>
        <MintCompanion pose="reading" tone="cream" className="max-w-sm self-end text-start" eyebrow={text('مِنت تشرح', 'Mint explains')} message={text('هذه مغامرتنا في ثلاث خطوات سهلة!', 'Our adventure takes just three easy steps!')} />
      </div>

      <div className="mt-9 grid gap-5 md:grid-cols-3">
        {steps.map((step, index) => (
          <article key={step.title} className="rounded-3xl border border-[#0D7D78]/12 bg-white p-5 shadow-sm sm:p-7">
            <div className="rounded-2xl bg-[#FAF8F3] p-2">
              <img src={step.image} alt={step.imageAlt} className="mx-auto h-40 w-full object-contain sm:h-44" loading="lazy" />
            </div>
            <span className="mint-heading mt-5 block text-5xl text-[#0D7D78]">{index + 1}</span>
            <h2 className="mint-heading mt-3 text-2xl text-[#075f5b]">{step.title}</h2>
            <p className="mt-3 leading-7 text-[#47716e]">{step.body}</p>
          </article>
        ))}
      </div>

      <EyebrowBanner className="mt-9 px-0 sm:px-0" />

      <div className="mt-8 rounded-3xl bg-[#9FD9C2]/30 p-6 leading-7 text-[#175451]">
        {text('ننقل تفاصيل الطلب إلى فريق التنفيذ خارج المنصة. لا يوجد تتبع شركة شحن في المرحلة الأولى؛ ستظهر حالة طلبك فقط هنا.', 'Your order details are passed to the production team outside the platform. In phase one, there is no courier integration; you will see only the order status here.')}
      </div>
    </main>
  )
}

export function ContentPage({ pageKey: fixedPageKey }: { pageKey?: string }) {
  const { pageKey: routePageKey = '' } = useParams()
  const pageKey = fixedPageKey ?? routePageKey
  const { locale, text } = useStoreLocale()
  const pageQuery = useQuery({ queryKey: ['content-page', locale, pageKey], queryFn: () => getContentPage(locale, pageKey), retry: false })

  if (pageQuery.isLoading) {
    return <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8"><div className="h-64 animate-pulse rounded-3xl bg-[#9FD9C2]/25" /></main>
  }

  if (!pageQuery.data?.page) {
    if (pageKey === 'privacy') {
      return <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8"><PrivacyPhaseTwoDisclosure /></main>
    }
    return (
      <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <MintCompanion pose="sleeping" tone="cream" className="max-w-md" message={text('هذه الصفحة تستعد للظهور قريبًا.', 'This page is getting ready to appear soon.')} />
        <h1 className="mint-heading mt-7 text-4xl text-[#075f5b]">{text('هذه الصفحة قيد الإعداد', 'This page is being prepared')}</h1>
        <p className="mt-4 leading-7 text-[#47716e]">{text('سيضيفها فريق المتجر ويحدّثها من لوحة الإدارة.', 'The store team will add and update it from the admin area.')}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
      <h1 className="mint-heading text-4xl text-[#075f5b]">{pageQuery.data.page.title}</h1>
      <article className="mt-7 whitespace-pre-wrap rounded-3xl border border-[#0D7D78]/12 bg-white p-7 leading-8 text-[#175451] shadow-sm">{pageQuery.data.page.content}</article>
      {pageKey === 'privacy' ? <PrivacyPhaseTwoDisclosure /> : null}
    </main>
  )
}

/**
 * System-managed disclosure: the editable policy remains useful for the
 * store's general terms, while this section cannot accidentally become stale
 * when an administrator enables an optional tracking provider.
 */
function PrivacyPhaseTwoDisclosure() {
  const { locale, text } = useStoreLocale()
  const [consent, setConsent] = useState(readTrackingConsent)
  const settingsQuery = useQuery({ queryKey: ['settings', locale], queryFn: () => getSettings(locale) })
  const tracking = settingsQuery.data?.settings.tracking
  const matchingConsent = tracking ? readTrackingConsent(tracking) : consent
  const configuredProviders = [
    tracking?.gtmContainerId ? 'Google Tag Manager' : null,
    tracking?.ga4MeasurementId ? 'Google Analytics 4' : null,
    tracking?.metaPixelId ? 'Meta Pixel' : null,
    tracking?.tiktokPixelId ? 'TikTok Pixel' : null,
  ].filter((provider): provider is string => Boolean(provider))

  useEffect(() => {
    const sync = () => setConsent(readTrackingConsent())
    window.addEventListener(TRACKING_CONSENT_CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(TRACKING_CONSENT_CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const reloadWithoutLoadedVendors = (next: 'granted' | 'denied' | 'clear') => {
    deactivateTracking()
    if (next === 'clear') clearTrackingConsent()
    else writeTrackingConsent(next, tracking)
    // Removing an injected script does not reliably stop a loaded vendor SDK
    // or its third-party cookies. A fresh document is the safe boundary.
    window.location.reload()
  }

  return <section id="privacy-choices" className="mt-7 space-y-5 rounded-3xl border border-[#0D7D78]/18 bg-[#FAF8F3] p-6 text-[#175451] shadow-sm">
    <div>
      <p className="text-xs font-black uppercase tracking-[.14em] text-[#0D7D78]">{text('خيارات خصوصية إضافية', 'Additional privacy choices')}</p>
      <h2 className="mint-heading mt-2 text-2xl text-[#075f5b]">{text('التذكير بالطلب والتحليلات الاختيارية', 'Saved-cart reminders and optional analytics')}</h2>
    </div>
    <div className="space-y-2 text-sm leading-7 text-[#47716e]">
      <p>{text('عند إدخال بيانات التواصل والتوصيل ثم عدم إكمال الطلب لمدة ٦٠ دقيقة، نحتفظ لمدة ٣٠ يومًا فقط برقم الهاتف، والبريد إن وُجد، والمحافظة/المنطقة، وخيار الدفع، وملخص المنتجات. قد يتواصل فريق مِنت يدويًا بتذكير أو عرض. لا نحتفظ باسم الطفل أو تفاصيل التخصيص أو الصور أو العنوان الكامل أو الملاحظات أو إثبات الدفع.', 'When you enter delivery contact details and do not complete the order for 60 minutes, we retain only your phone, optional email, governorate/city, payment choice, and product summary for 30 days. Mint Meow’s team may contact you manually with a reminder or offer. We do not retain a child’s name, personalization details, photos, full address, notes, or payment proof.')}</p>
      <p>{text('التحليلات والإعلانات اختيارية أيضًا. بعد السماح، قد تعمل أدوات Google Tag Manager وGoogle Analytics 4 وMeta Pixel وTikTok Pixel التي يفعّلها المتجر أثناء التصفح والدفع، وتعالج بيانات تقنية مثل المتصفح أو الجهاز أو عنوان IP بموجب سياسات تلك الجهات. ترسل مِنت أحداثًا محدودة للتصفح والكتالوج والسلة والدفع والشراء، ولا تضع بيانات التواصل أو العنوان أو بيانات الطفل أو التخصيص أو إثبات الدفع في تلك الأحداث.', 'Analytics and advertising are optional too. After you allow them, the Google Tag Manager, Google Analytics 4, Meta Pixel, and TikTok Pixel tools enabled by the store may run while you browse and check out, and may process technical data such as browser, device, or IP address under their own policies. Mint Meow sends limited browsing, catalog, cart, checkout, and purchase events; it does not put contact, address, child, personalization, or payment-proof data into those events.')}</p>
    </div>
    <section className="rounded-2xl border border-[#0D7D78]/14 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-[#075f5b]">{text('تفضيلات التحليلات', 'Analytics preference')}</h3><p className="mt-1 text-xs leading-5 text-[#47716e]">{configuredProviders.length ? text(`الأدوات المهيأة حاليًا: ${configuredProviders.join('، ')}.`, `Currently configured: ${configuredProviders.join(', ')}.`) : text('لا توجد أدوات تحليل أو إعلان مهيأة حاليًا.', 'No analytics or ad tools are currently configured.')}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${matchingConsent === 'granted' ? 'bg-emerald-50 text-emerald-800' : 'bg-[#f8ecdf] text-[#624b40]'}`}>{matchingConsent === 'granted' ? text('مسموح', 'Allowed') : matchingConsent === 'denied' ? text('مرفوض', 'Declined') : text('لم يُحسم', 'Not decided')}</span></div>
      {configuredProviders.length ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => reloadWithoutLoadedVendors('granted')} className="mint-cta rounded-xl px-3.5 py-2 text-xs">{text('السماح بالتحليلات الاختيارية', 'Allow optional analytics')}</button><button type="button" onClick={() => reloadWithoutLoadedVendors('denied')} className="rounded-xl border border-[#0D7D78]/20 bg-white px-3.5 py-2 text-xs font-black text-[#075f5b]">{text('إيقاف التحليلات الاختيارية', 'Turn off optional analytics')}</button><button type="button" onClick={() => reloadWithoutLoadedVendors('clear')} className="px-2 py-2 text-xs font-bold text-[#0D7D78] underline decoration-[#0D7D78]/35 underline-offset-4">{text('إعادة الاختيار', 'Choose again')}</button></div> : null}
    </section>
  </section>
}

export function FaqPage() {
  const { locale, text } = useStoreLocale()
  const faqsQuery = useQuery({ queryKey: ['faqs', locale], queryFn: () => getFaqs(locale) })
  const faqs = faqsQuery.data?.faqs ?? []

  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
      <div className="grid gap-5 sm:grid-cols-[1fr_180px] sm:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-[.14em] text-[#0D7D78]">{text('مساعدة مِنت', 'Mint can help')}</p>
          <h1 className="mint-heading mt-2 text-4xl text-[#075f5b] sm:text-5xl">{text('أسئلة شائعة', 'Frequently asked questions')}</h1>
          <p className="mt-4 leading-7 text-[#47716e]">{text('كل ما تحتاجه قبل اختيار منتج طفلك وطلبه.', 'Everything you need before choosing and ordering your child’s pick.')}</p>
        </div>
        <MintCompanion pose="exploring" tone="sunshine" className="max-w-xs text-start" message={text('دعيني أساعدك!', 'Let me help!')} />
      </div>

      {faqsQuery.isLoading ? <div className="mt-8 h-64 animate-pulse rounded-3xl bg-[#9FD9C2]/25" /> : null}
      {faqs.length > 0 ? (
        <div className="mt-8 space-y-3">
          {faqs.map((faq) => (
            <details key={faq.id} className="group rounded-2xl border border-[#0D7D78]/12 bg-white p-5 shadow-sm">
              <summary className="mint-heading cursor-pointer list-none text-xl text-[#075f5b] marker:hidden">
                <span className="flex items-center justify-between gap-4"><span>{faq.question}</span><span className="font-sans text-[#0D7D78] transition group-open:rotate-45">＋</span></span>
              </summary>
              <p className="mt-4 whitespace-pre-wrap leading-7 text-[#47716e]">{faq.answer}</p>
            </details>
          ))}
        </div>
      ) : null}
      {!faqsQuery.isLoading && faqs.length === 0 ? <div className="mt-8 rounded-3xl border border-dashed border-[#0D7D78]/25 bg-white p-7 text-[#47716e]">{text('ستضيف الإدارة الأسئلة الشائعة هنا قريبًا.', 'The store team will add common questions here soon.')}</div> : null}
    </main>
  )
}
