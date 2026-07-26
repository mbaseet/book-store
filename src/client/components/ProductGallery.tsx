import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react'

type Media = { id: string; url: string; altText: string | null }
type Text = (arabic: string, english: string) => string

export function ProductGallery({ media, productTitle, text }: { media: Media[]; productTitle: string; text: Text }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const touchStart = useRef<number | null>(null)
  const safeSelectedIndex = Math.min(selectedIndex, Math.max(0, media.length - 1))
  const selected = media[safeSelectedIndex]

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
      if (event.key === 'ArrowRight') setSelectedIndex((current) => Math.min(current + 1, media.length - 1))
      if (event.key === 'ArrowLeft') setSelectedIndex((current) => Math.max(current - 1, 0))
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isOpen, media.length])

  useEffect(() => {
    if (media.length > 0) setSelectedIndex((current) => Math.min(current, media.length - 1))
  }, [media.length])

  if (media.length === 0) {
    return <div className="mint-dot-grid flex aspect-square items-center justify-center rounded-[2rem] bg-[#9FD9C2]/35 p-8 text-center text-3xl font-black text-[#075f5b]">{productTitle}</div>
  }

  const prev = () => setSelectedIndex((current) => {
    const safeIndex = Math.min(current, media.length - 1)
    return safeIndex === 0 ? media.length - 1 : safeIndex - 1
  })
  const next = () => setSelectedIndex((current) => {
    const safeIndex = Math.min(current, media.length - 1)
    return safeIndex === media.length - 1 ? 0 : safeIndex + 1
  })
  const rememberTouch = (x: number) => { touchStart.current = x }
  const finishTouch = (x: number) => {
    if (touchStart.current === null) return
    const distance = x - touchStart.current
    touchStart.current = null
    if (Math.abs(distance) < 44 || media.length < 2) return
    if (distance > 0) prev()
    else next()
  }
  const alt = selected.altText ?? productTitle

  return <>
    <div className="relative overflow-hidden rounded-[2rem] bg-[#9FD9C2]/35 shadow-[0_16px_40px_rgba(7,95,91,.12)]">
      <button type="button" onClick={() => setIsOpen(true)} onTouchStart={(event) => rememberTouch(event.touches[0]?.clientX ?? 0)} onTouchEnd={(event) => finishTouch(event.changedTouches[0]?.clientX ?? 0)} className="group block w-full text-start focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FFD14D]/70" aria-label={text(`تكبير صورة ${safeSelectedIndex + 1} من ${media.length}`, `Open image ${safeSelectedIndex + 1} of ${media.length}`)}>
        <img src={selected.url} alt={alt} className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        <span className="absolute bottom-4 end-4 inline-flex items-center gap-2 rounded-xl bg-[#0D7D78]/90 px-3 py-2 text-xs font-black text-[#FAF8F3] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><Expand size={15} />{text('تكبير', 'View')}</span>
      </button>
    </div>
    {media.length > 1 ? <div className="mt-3 flex gap-3 overflow-x-auto pb-1" aria-label={text('صور القصة', 'Story images')}>
      {media.map((item, index) => <button key={item.id} type="button" onClick={() => setSelectedIndex(index)} aria-current={index === safeSelectedIndex ? 'true' : undefined} aria-label={text(`عرض الصورة ${index + 1}`, `Show image ${index + 1}`)} className={`shrink-0 overflow-hidden rounded-xl border-2 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FFD14D]/70 ${index === safeSelectedIndex ? 'border-[#0D7D78]' : 'border-transparent opacity-70 hover:opacity-100'}`}><img src={item.url} alt="" className="size-16 object-cover sm:size-20" /></button>)}
    </div> : null}
    {isOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-[#075f5b]/92 p-4" role="dialog" aria-modal="true" aria-label={text('معرض صور المنتج', 'Product image gallery')}>
      <div className="relative flex max-h-full w-full max-w-5xl flex-col items-center">
        <button type="button" autoFocus onClick={() => setIsOpen(false)} className="absolute end-0 top-0 z-10 grid size-11 place-items-center rounded-full bg-white/15 text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" aria-label={text('إغلاق المعرض', 'Close gallery')}><X size={22} /></button>
        <img src={selected.url} alt={alt} onTouchStart={(event) => rememberTouch(event.touches[0]?.clientX ?? 0)} onTouchEnd={(event) => finishTouch(event.changedTouches[0]?.clientX ?? 0)} className="max-h-[78vh] max-w-full rounded-2xl object-contain" />
        {media.length > 1 ? <div className="mt-4 flex items-center gap-4 text-white"><button type="button" onClick={prev} className="grid size-10 place-items-center rounded-full bg-white/15 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" aria-label={text('الصورة السابقة', 'Previous image')}><ChevronRight className="rtl:rotate-0 ltr:rotate-180" size={21} /></button><span className="text-sm font-bold" aria-live="polite">{safeSelectedIndex + 1} / {media.length}</span><button type="button" onClick={next} className="grid size-10 place-items-center rounded-full bg-white/15 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" aria-label={text('الصورة التالية', 'Next image')}><ChevronLeft className="rtl:rotate-0 ltr:rotate-180" size={21} /></button></div> : null}
      </div>
    </div> : null}
  </>
}
