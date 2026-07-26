import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { MintCompanion } from '../components/MintCompanion'
import { getContentPage, getFaqs } from '../lib/api'
import { useStoreLocale } from '../lib/locale'

export function HowItWorksPage() {
  const { text } = useStoreLocale()
  const steps = [
    [text('اختر ما يحبونه', 'Choose what they love'), text('تصفّح المنتجات واختر المغامرة أو اللعبة الأقرب لقلب طفلك.', 'Browse the collection and choose the adventure or playtime pick that fits your child.')],
    [text('الخطوة ١: تفاصيل المنتج', 'Step 1: Product details'), text('أضف بيانات الطفل المطلوبة للمنتج، إن وجدت، واختر أي إضافات.', 'Add the child details requested for that product, if any, and choose any extras.')],
    [text('الخطوة ٢: التوصيل والدفع', 'Step 2: Delivery & payment'), text('اختر المحافظة لمراجعة الإجمالي الدقيق، ثم أرسل إثبات التحويل. نراجع الطلب قبل بدء التجهيز.', 'Choose a governorate to review the exact total, then upload your transfer proof. We review the order before production begins.')],
  ]

  return (
    <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="grid gap-6 overflow-hidden rounded-[2rem] bg-[#0D7D78] p-7 text-[#FAF8F3] sm:p-10 md:grid-cols-[1fr_250px] md:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-[.14em] text-[#FFD14D]">{text('ببساطة مع مِنت', 'Simple with Mint')}</p>
          <h1 className="mint-heading mt-3 text-4xl leading-tight sm:text-5xl">{text('كيف تصنع هديتك الخاصة؟', 'How your special gift is made')}</h1>
          <p className="mt-4 max-w-2xl leading-7 text-[#FAF8F3]/80">{text('مِنت ترافقك من أول اختيار إلى أن يصبح المنتج جاهزًا للفرح.', 'Mint stays with you from the first pick until your little moment is ready.')}</p>
        </div>
        <MintCompanion pose="reading" tone="cream" className="max-w-sm self-end text-start" eyebrow={text('مِنت تشرح', 'Mint explains')} message={text('هذه مغامرتنا في خطوتين فقط!', 'Our adventure takes just two easy steps!')} />
      </div>

      <div className="mt-9 grid gap-5 md:grid-cols-3">
        {steps.map(([title, body], index) => (
          <article key={title} className="rounded-3xl border border-[#0D7D78]/12 bg-white p-7 shadow-sm">
            <span className="mint-heading text-5xl text-[#0D7D78]">{index + 1}</span>
            <h2 className="mint-heading mt-5 text-2xl text-[#075f5b]">{title}</h2>
            <p className="mt-3 leading-7 text-[#47716e]">{body}</p>
          </article>
        ))}
      </div>

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
    </main>
  )
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
