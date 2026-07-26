import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpRight, BookOpen, Blocks, Gift, Search, Sparkles, Sticker } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { getCategories, getProducts, getSettings, getTestimonials, type ProductCard } from '../lib/api'
import { formatMoney } from '../lib/format'
import { useStoreLocale } from '../lib/locale'
import { MintCompanion } from '../components/MintCompanion'

function ProductCardView({ product }: { product: ProductCard }) {
  const { locale, localizedPath, text } = useStoreLocale()
  const finalPrice = product.salePriceAmount ?? product.basePriceAmount

  return (
    <article className="group overflow-hidden rounded-[1.75rem] border border-[#0D7D78]/10 bg-white shadow-[0_8px_26px_rgba(7,95,91,.08)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_42px_rgba(7,95,91,.15)]">
      <Link to={localizedPath(`/stories/${product.slug}`)} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-[#9FD9C2]/30">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          ) : (
            <div className="mint-dot-grid flex h-full items-center justify-center bg-[#9FD9C2]/35 p-7 text-center font-black text-xl text-[#075f5b]">
              <span className="rounded-2xl bg-[#FAF8F3]/85 px-4 py-3 shadow-sm">{product.title}</span>
            </div>
          )}
          {product.salePriceAmount !== null ? <span className="absolute start-3 top-3 rounded-full bg-[#FFD14D] px-3 py-1.5 text-xs font-black text-[#075f5b] shadow-sm">{text('عرض', 'Sale')}</span> : null}
          <span className={`absolute end-3 top-3 rounded-full px-3 py-1.5 text-xs font-black shadow-sm ${product.isPersonalized ? 'bg-[#0D7D78] text-[#FAF8F3]' : 'bg-[#FAF8F3]/95 text-[#075f5b]'}`}>{product.isPersonalized ? text('مخصّص', 'Personalized') : text('جاهز للشحن', 'Ready to ship')}</span>
          {product.isPersonalized ? <img src="/brand/mint-peek.png" alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-8 -end-6 h-32 w-auto rotate-[-8deg] transition duration-300 group-hover:scale-105" /> : null}
        </div>
        <div className="p-5 sm:p-6">
          <h3 className="text-xl font-black leading-tight text-[#075f5b]">{product.title}</h3>
          {product.shortDescription ? <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-[#47716e]">{product.shortDescription}</p> : null}
          <div className="mt-5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><span className="font-black text-[#0D7D78]">{formatMoney(finalPrice, locale)}</span>{product.salePriceAmount !== null ? <span className="text-sm text-[#7a9693] line-through">{formatMoney(product.basePriceAmount, locale)}</span> : null}</div>
            <span className="rounded-full bg-[#0D7D78]/8 px-3 py-1 text-xs font-black text-[#075f5b]">{product.isPersonalized ? text('هدية خاصة', 'Made for them') : text('اختيار مِنت', 'Mint’s pick')}</span>
          </div>
        </div>
      </Link>
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <Link className="mint-cta flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm transition hover:-translate-y-0.5" to={localizedPath(`/stories/${product.slug}`)}>{product.isPersonalized ? text('خصّص الآن', 'Personalize now') : text('اطلب الآن', 'Order now')} <ArrowUpRight size={16} /></Link>
      </div>
    </article>
  )
}

function EmptyProducts({ error }: { error?: string }) {
  const { text } = useStoreLocale()
  return (
    <div className="rounded-[1.75rem] border border-dashed border-[#0D7D78]/25 bg-white p-10 text-center text-[#47716e]">
      <Sparkles className="mx-auto mb-3 text-[#0D7D78]" />
      <p className="font-semibold">{error ?? text('تُضاف منتجات جديدة قريبًا.', 'New products will appear here soon.')}</p>
    </div>
  )
}

export function HomePage() {
  const { locale, localizedPath, text } = useStoreLocale()
  const productsQuery = useQuery({ queryKey: ['products', locale, 'featured'], queryFn: () => getProducts(locale, { featured: true }) })
  const settingsQuery = useQuery({ queryKey: ['settings', locale], queryFn: () => getSettings(locale) })
  const testimonialsQuery = useQuery({ queryKey: ['testimonials', locale], queryFn: () => getTestimonials(locale) })
  const featuredProducts = productsQuery.data?.products ?? []
  const testimonials = testimonialsQuery.data?.testimonials ?? []

  const families = [
    { title: text('قصص مخصّصة', 'Personalized stories'), copy: text('هم أبطال الحكاية.', 'They become the hero.'), Icon: BookOpen, image: '/brand/mint-reading.png', tone: 'bg-[#0D7D78] text-[#FAF8F3]' },
    { title: text('كتب تلوين', 'Coloring books'), copy: text('خيالهم على الورق.', 'Their imagination on paper.'), Icon: Sparkles, image: '/brand/mint-happy.png', tone: 'bg-[#FAF8F3] text-[#075f5b]' },
    { title: text('استيكرز ولحظات', 'Stickers & moments'), copy: text('تفاصيل يحبونها.', 'Little details they love.'), Icon: Sticker, image: '/brand/mint-loves.png', tone: 'bg-[#FFD14D] text-[#075f5b]' },
    { title: text('تعلّم والعب', 'Learn & play'), copy: text('لعب ذكي وفرح.', 'Smart play, happy days.'), Icon: Blocks, image: '/brand/mint-plays.png', tone: 'bg-[#075f5b] text-[#FAF8F3]' },
  ]

  return (
    <main>
      <section className="relative overflow-hidden bg-[#0D7D78] text-[#FAF8F3]">
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(#9FD9C2_1px,transparent_1px)] [background-size:20px_20px]" />
        <div className="absolute -start-28 top-12 size-72 rounded-full bg-[#9FD9C2]/20 blur-3xl" />
        <div className="absolute -end-24 bottom-0 size-80 rounded-full bg-[#FFD14D]/15 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-20">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#9FD9C2]/35 bg-[#FAF8F3]/10 px-4 py-2 text-xs font-black uppercase tracking-[.16em] text-[#FFD14D]"><Sparkles size={14} /> {text('نلعب، نتعلّم، ونكبر', 'Play. Learn. Grow.')}</div>
            <h1 className="mint-heading text-5xl leading-[.98] tracking-tight sm:text-6xl lg:text-7xl">{text('أشياء صغيرة تصنع لحظات كبيرة.', 'Little things. Big moments.')}</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#FAF8F3]/82">{text('كتب وقصص مخصّصة، ألعاب تعليمية، وقطع لطيفة تشبه طفلكم وذكرياتكم.', 'Personalized stories, playful learning, and little treasures made for their world.')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="mint-cta inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 shadow-lg shadow-[#075f5b]/20 transition hover:-translate-y-0.5" to={localizedPath('/stories')}>{text('تسوّق الآن', 'Shop the collection')} <ArrowUpRight size={18} /></Link>
              <Link className="rounded-2xl border border-[#FAF8F3]/35 bg-[#FAF8F3]/8 px-6 py-3.5 font-black text-[#FAF8F3] transition hover:bg-[#FAF8F3]/15" to={localizedPath('/how-it-works')}>{text('كيف تعمل؟', 'How it works')}</Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-[#FAF8F3]/82"><span>{text('مخصّص أو جاهز للشحن', 'Personalized or ready to ship')}</span><span className="hidden size-1 rounded-full bg-[#FFD14D] sm:block" />{settingsQuery.data?.settings.freeShippingThresholdAmount ? <span>{text('شحن مجاني للطلبات المؤهلة', 'Free shipping on eligible orders')}</span> : <span>{text('صُنع بحب في مصر', 'Made with love in Egypt')}</span>}</div>
          </div>
          <div className="relative mx-auto w-full max-w-[34rem]">
            <div className="absolute inset-x-10 top-4 h-24 rounded-full bg-[#FFD14D]/25 blur-3xl" />
            <div className="relative min-h-[25rem] overflow-hidden rounded-[2.5rem] border border-[#9FD9C2]/35 bg-[#075f5b] p-6 shadow-2xl shadow-[#075f5b]/40 sm:min-h-[31rem]">
              <img src="/brand/mint-meow-logo-mint.png" alt="Mint Meow" className="absolute start-7 top-6 h-16 w-20 object-contain opacity-90 sm:h-20 sm:w-24" />
              <span className="absolute end-7 top-7 grid size-12 place-items-center rounded-2xl bg-[#FFD14D] text-[#075f5b] shadow-lg"><Gift size={22} /></span>
              <img src="/brand/mint-reading.png" alt="Mint reading a book" className="mint-float absolute bottom-[-5%] start-1/2 h-[90%] w-auto max-w-none -translate-x-1/2 object-contain" />
              <div className="absolute bottom-6 start-6 end-6 rounded-2xl bg-[#FAF8F3]/95 p-4 text-[#075f5b] shadow-lg sm:start-auto sm:w-56"><p className="text-xs font-black uppercase tracking-[.12em] text-[#0D7D78]">{text('هدية اليوم', 'Today’s little joy')}</p><p className="mt-1 text-sm font-bold leading-5">{text('اختَر شيئًا سيحبونه ويحتفظون به.', 'Pick something they will love and keep.')}</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="mb-8 flex items-end justify-between gap-4"><div><p className="text-sm font-black uppercase tracking-[.14em] text-[#0D7D78]">{text('أشياء محبوبة', 'Made to be loved')}</p><h2 className="mint-heading mt-2 text-3xl tracking-tight text-[#075f5b] sm:text-4xl">{text('اختيارات صغيرة تفتح عالمًا كبيرًا', 'Small picks, big worlds')}</h2></div><Link className="hidden items-center gap-1 text-sm font-black text-[#0D7D78] sm:inline-flex" to={localizedPath('/stories')}>{text('تسوّق الكل', 'Shop all')} <ArrowLeft size={16} /></Link></div>
        {productsQuery.isLoading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((key) => <div key={key} className="h-72 animate-pulse rounded-[1.75rem] bg-[#9FD9C2]/25" />)}</div> : featuredProducts.length > 0 ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featuredProducts.slice(0, 3).map((product) => <ProductCardView key={product.id} product={product} />)}</div> : <EmptyProducts />}
        <Link className="mt-7 inline-flex items-center gap-1 text-sm font-black text-[#0D7D78] sm:hidden" to={localizedPath('/stories')}>{text('تسوّق الكل', 'Shop all')} <ArrowLeft size={16} /></Link>
      </section>

      <section className="overflow-hidden bg-[#9FD9C2]/38 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="mb-8 max-w-2xl"><p className="text-sm font-black uppercase tracking-[.14em] text-[#0D7D78]">{text('اكتشف عالم مِنت', 'Explore Mint’s world')}</p><h2 className="mint-heading mt-2 text-3xl tracking-tight text-[#075f5b] sm:text-4xl">{text('هناك شيء جديد لكل فضول صغير', 'Something new for every little curiosity')}</h2></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{families.map(({ Icon, ...family }) => <Link key={family.title} to={localizedPath('/stories')} className={`group relative min-h-72 overflow-hidden rounded-[1.75rem] p-6 transition hover:-translate-y-1 ${family.tone}`}><Icon size={22} className="opacity-75" /><h3 className="mt-10 max-w-[10rem] text-2xl font-black leading-tight">{family.title}</h3><p className="mt-2 max-w-[9rem] text-sm font-semibold opacity-75">{family.copy}</p><img src={family.image} alt="" className="absolute -bottom-4 -end-9 h-48 w-auto transition duration-300 group-hover:scale-105" /><ArrowUpRight className="absolute bottom-5 start-6" size={19} /></Link>)}</div><MintCompanion pose="peek" tone="cream" className="mt-6 max-w-md" eyebrow={text('مِنت تقول', 'Mint says')} message={text('اختاري ما يشبه عالمهم — وأنا سأساعدك في الباقي!', 'Choose what feels like their world — I’ll help with the rest!')} /></div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20"><div className="grid gap-8 overflow-hidden rounded-[2rem] bg-[#0D7D78] px-7 py-9 text-[#FAF8F3] sm:px-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><p className="text-sm font-black uppercase tracking-[.14em] text-[#FFD14D]">{text('بسيطة جدًا', 'Made simple')}</p><h2 className="mint-heading mt-3 text-3xl leading-tight sm:text-4xl">{text('هدية لها معنى، في خطوات سهلة.', 'A meaningful gift, in a few easy steps.')}</h2><Link className="mint-cta mt-6 inline-flex rounded-2xl px-5 py-3" to={localizedPath('/how-it-works')}>{text('اعرف المزيد', 'See how it works')}</Link></div><div className="grid gap-3 sm:grid-cols-3">{[[text('اختره', 'Pick it'), text('اختَر منتجًا جاهزًا أو قابلًا للتخصيص.', 'Choose ready-to-ship or personalize it.')], [text('اجعله لهم', 'Make it theirs'), text('أضف التفاصيل عندما يحتاجها المنتج.', 'Add details only when the product asks.')], [text('نصنع فرحتهم', 'Make a moment'), text('سنجهّزه بحب ليصل إلى بابك.', 'We prepare it with love for their door.')]].map(([title, copy], index) => <div key={title} className="rounded-2xl bg-[#FAF8F3]/10 p-5"><span className="grid size-8 place-items-center rounded-xl bg-[#FFD14D] text-sm font-black text-[#075f5b]">{index + 1}</span><h3 className="mt-5 font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-[#FAF8F3]/72">{copy}</p></div>)}</div></div></section>

      {testimonials.length > 0 ? <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8"><div className="mb-7"><p className="text-sm font-black uppercase tracking-[.14em] text-[#0D7D78]">{text('من عائلاتنا', 'From our families')}</p><h2 className="mt-2 text-3xl font-black tracking-tight text-[#075f5b]">{text('لحظات يحبونها', 'Little moments they love')}</h2></div><div className="grid gap-4 md:grid-cols-3">{testimonials.slice(0, 3).map((testimonial) => <figure key={testimonial.id} className="rounded-[1.75rem] border border-[#0D7D78]/10 bg-white p-6 shadow-sm"><blockquote className="text-xl font-bold leading-8 text-[#175451]">“{testimonial.quote}”</blockquote><figcaption className="mt-5 text-sm font-black text-[#0D7D78]">— {testimonial.displayName}</figcaption></figure>)}</div></section> : null}
    </main>
  )
}

export function ShopPage() {
  const { locale, text } = useStoreLocale()
  const [search, setSearch] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const category = searchParams.get('category') ?? undefined
  const setCategory = (nextCategory: string | undefined) => {
    const next = new URLSearchParams(searchParams)
    if (nextCategory) next.set('category', nextCategory)
    else next.delete('category')
    setSearchParams(next)
  }
  const categoriesQuery = useQuery({ queryKey: ['categories', locale], queryFn: () => getCategories(locale) })
  const productsQuery = useQuery({ queryKey: ['products', locale, category, search], queryFn: () => getProducts(locale, { category, search }) })
  const products = productsQuery.data?.products ?? []

  return <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16"><div className="grid gap-7 overflow-hidden rounded-[2rem] bg-[#9FD9C2]/35 p-7 sm:p-10 lg:grid-cols-[1.2fr_.8fr] lg:items-end"><div><p className="text-sm font-black uppercase tracking-[.14em] text-[#0D7D78]">{text('تسوّق عالم مِنت', 'Shop Mint’s world')}</p><h1 className="mint-heading mt-3 text-4xl tracking-tight text-[#075f5b] sm:text-5xl">{text('أشياء للقراءة، اللعب، والتعلّم.', 'Things to read, play, and grow with.')}</h1><p className="mt-4 max-w-2xl leading-7 text-[#47716e]">{text('اختر منتجًا مخصّصًا أو جاهزًا للشحن — وسترى ما يحتاجه كل منتج قبل المتابعة.', 'Choose a personalized or ready-to-ship product — every page makes the next step clear.')}</p></div><div className="relative mx-auto"><img className="h-44 w-auto sm:h-52" src="/brand/mint-exploring.png" alt="Mint exploring" /><p className="absolute bottom-3 -start-6 max-w-36 rounded-2xl bg-[#FAF8F3] p-3 text-xs font-black leading-4 text-[#075f5b] shadow-sm">{text('دعيني أساعدك في الاختيار!', 'Let me help you choose!')}</p></div></div><div className="mt-8 flex flex-col gap-4"><label className="flex max-w-xl items-center gap-2 rounded-2xl border border-[#0D7D78]/15 bg-white px-4 py-3.5 shadow-sm"><Search size={18} className="text-[#0D7D78]" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-transparent text-[#075f5b] outline-none" placeholder={text('ابحث عن منتج', 'Search products')} /></label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setCategory(undefined)} className={`rounded-xl px-4 py-2.5 text-sm font-black ${!category ? 'bg-[#0D7D78] text-white' : 'bg-white text-[#075f5b] ring-1 ring-[#0D7D78]/10'}`}>{text('الكل', 'All')}</button>{(categoriesQuery.data?.categories ?? []).map((item) => <button key={item.id} type="button" onClick={() => setCategory(item.slug)} className={`rounded-xl px-4 py-2.5 text-sm font-black ${category === item.slug ? 'bg-[#0D7D78] text-white' : 'bg-white text-[#075f5b] ring-1 ring-[#0D7D78]/10'}`}>{item.name}</button>)}</div></div><section className="mt-8">{productsQuery.isLoading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((key) => <div key={key} className="h-72 animate-pulse rounded-[1.75rem] bg-[#9FD9C2]/25" />)}</div> : products.length > 0 ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <ProductCardView key={product.id} product={product} />)}</div> : <EmptyProducts error={text('لم نجد منتجًا مطابقًا الآن.', 'No matching product is available right now.')} />}</section></main>
}
