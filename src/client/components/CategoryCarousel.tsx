import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Category } from '../lib/api'
import { useStoreLocale } from '../lib/locale'

export function CategoryCarousel({ categories }: { categories: Category[] }) {
  const { locale, text, localizedPath } = useStoreLocale()
  const rail = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(0)
  const [atEnd, setAtEnd] = useState(false)
  const move = (direction: number) => {
    const children = rail.current?.children
    if (!children?.length) return
    const next = Math.max(0, Math.min(children.length - 1, position + direction))
    const card = children[next] as HTMLElement
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    rail.current?.scrollTo({ left: locale === 'ar' ? -next * (card.offsetWidth + 20) : next * (card.offsetWidth + 20), behavior: reduced ? 'instant' : 'smooth' })
    setPosition(next)
  }
  if (!categories.length) return null
  return <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8" aria-labelledby="category-heading">
    <div className="mb-7 flex items-end justify-between gap-4"><div><p className="text-sm font-bold text-[#0D7D78]">{text('لكل طفل عالم', 'A world for every child')}</p><h2 id="category-heading" className="mint-heading mt-2 text-3xl sm:text-4xl">{text('تصفّح القصص حسب الفئة', 'Browse stories by category')}</h2></div><div className="flex gap-2"><button type="button" onClick={() => move(-1)} disabled={position === 0} aria-label={text('الفئة السابقة', 'Previous category')} className="rounded-full border border-[#0D7D78]/20 p-2 disabled:opacity-30">{locale === 'ar' ? <ChevronRight /> : <ChevronLeft />}</button><button type="button" onClick={() => move(1)} disabled={atEnd || categories.length <= 1} aria-label={text('الفئة التالية', 'Next category')} className="rounded-full border border-[#0D7D78]/20 p-2 disabled:opacity-30">{locale === 'ar' ? <ChevronLeft /> : <ChevronRight />}</button></div></div>
    <div ref={rail} onScroll={() => { const el = rail.current; const card = el?.firstElementChild as HTMLElement | null; if (el && card) { setPosition(Math.round(Math.abs(el.scrollLeft) / (card.offsetWidth + 20))); setAtEnd(Math.abs(el.scrollLeft) + el.clientWidth >= el.scrollWidth - 2) } }} className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4" aria-label={text('فئات القصص', 'Story categories')}>
      {categories.map((category) => <Link key={category.id} to={localizedPath(`/stories?category=${encodeURIComponent(category.slug)}`)} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-3xl bg-white shadow-sm transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-[#0D7D78] sm:w-[calc((100%_-_20px)/2)] lg:w-[calc((100%_-_60px)/4)]">
        {category.imageUrl ? <img src={category.imageUrl} alt="" width="1254" height="1254" loading="lazy" className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-[#9FD9C2]/30" />}
        <h3 className="px-4 py-4 text-center text-lg font-black">{category.name}</h3>
      </Link>)}
    </div>
  </section>
}
