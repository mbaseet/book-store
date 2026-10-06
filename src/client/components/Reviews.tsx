import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Star, BadgeCheck } from 'lucide-react'
import { getReviews, getTestimonials, submitReview } from '../lib/api'
import { useStoreLocale } from '../lib/locale'
import { formatDate } from '../lib/format'
import { requestErrorMessage } from '../lib/form-errors'

export function RatingStars({ rating }: { rating: number }) {
  const { text } = useStoreLocale()
  return <span className="inline-flex gap-0.5 text-[#b77a00]" role="img" aria-label={text(`${rating} من ٥ نجوم`, `${rating} out of 5 stars`)}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={17} fill={rating >= star ? 'currentColor' : 'none'} aria-hidden="true" />)}</span>
}
export function HomeReviews() {
  const { locale, text } = useStoreLocale()
  const query = useQuery({ queryKey: ['reviews', locale], queryFn: () => getReviews(locale) })
  const legacy = useQuery({ queryKey: ['testimonials', locale], queryFn: () => getTestimonials(locale) })
  const reviews = query.data?.reviews ?? []
  const quotes = legacy.data?.testimonials ?? []
  if (!reviews.length && !quotes.length) return null
  return <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8" aria-labelledby="reviews-heading">
    <h2 id="reviews-heading" className="mint-heading text-3xl sm:text-4xl">{text('من عائلات مِنت', 'From Mint families')}</h2>
    {query.data?.count && query.data.average !== null ? <p className="mt-3 flex items-center gap-2"><strong>{query.data.average.toFixed(1)}</strong><RatingStars rating={Math.round(query.data.average)} /><span className="text-sm text-[#47716e]">{text(`${query.data.count} تقييمات`, `${query.data.count} reviews`)}</span></p> : null}
    <div className="mt-7 grid gap-4 md:grid-cols-3">{reviews.map((review) => <article key={review.id} className="rounded-2xl border border-[#0D7D78]/10 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3"><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#9FD9C2]/40 font-black">{review.displayName.slice(0, 1)}</span><div><p className="font-bold" dir="auto">{review.displayName}</p><p className="text-xs text-[#47716e]">{formatDate(review.createdAt, locale)}</p></div></div>
      <div className="mt-4"><RatingStars rating={review.rating} /></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7" dir="auto">{review.comment.length > 260 ? review.comment.slice(0, 260) + '…' : review.comment}</p>{review.comment.length > 260 ? <details className="mt-2 text-sm"><summary className="cursor-pointer font-bold text-[#0D7D78]">{text('قراءة التقييم كاملًا', 'Read full review')}</summary><p className="mt-2 whitespace-pre-wrap break-words leading-7" dir="auto">{review.comment}</p></details> : null}
      <p className="mt-4 flex items-center gap-1 text-xs font-semibold text-[#47716e]"><BadgeCheck size={15} />{text('شراء مؤكد', 'Verified purchase')}</p>
    </article>)}</div>
    {quotes.length ? <div className="mt-6 grid gap-4 md:grid-cols-3">{quotes.slice(0, 3).map((quote) => <figure key={quote.id} className="rounded-2xl border border-[#0D7D78]/10 bg-white p-6"><blockquote dir="auto" className="text-sm leading-7">“{quote.quote}”</blockquote><figcaption className="mt-4 font-bold" dir="auto">{quote.displayName}</figcaption><p className="mt-1 text-xs text-[#47716e]">{text('كلمات من عملائنا', 'Customer testimonial')}</p></figure>)}</div> : null}
  </section>
}

export function ReviewForm({ orderNumber, phone }: { orderNumber: string; phone?: string }) {
  const { locale, text } = useStoreLocale()
  const [rating, setRating] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (submitted) return <p role="status" className="mt-5 rounded-2xl bg-[#9FD9C2]/30 p-5">{text('شكرًا! وصل تقييمك للمراجعة قبل النشر.', 'Thank you! Your review has been submitted for moderation.')}</p>
  return <form className="mt-5 space-y-4 rounded-2xl border border-[#0D7D78]/15 bg-white p-5 text-start" onSubmit={async (event) => {
    event.preventDefault()
    if (!rating) { setError(text('اختر تقييمًا من ١ إلى ٥ نجوم.', 'Choose a rating from 1 to 5 stars.')); return }
    const data = new FormData(event.currentTarget)
    setWorking(true); setError(null)
    try { await submitReview(locale, { orderNumber, phone, rating, displayName: String(data.get('displayName') ?? ''), comment: String(data.get('comment') ?? ''), publicationConsent: data.get('consent') === 'on' }); setSubmitted(true) }
    catch (failure) { setError(requestErrorMessage(locale, failure)) }
    finally { setWorking(false) }
  }}>
    <h3 className="mint-heading text-2xl">{text('شاركنا تجربتك', 'Share your experience')}</h3>
    <fieldset><legend className="mb-2 text-sm font-bold">{text('تقييمك', 'Your rating')}</legend><div className="flex gap-2" dir="ltr">{[1, 2, 3, 4, 5].map((value) => <label key={value} className="cursor-pointer rounded-lg p-1 text-[#b77a00] focus-within:ring-2 focus-within:ring-[#0D7D78]"><input className="sr-only" type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={text(`${value} نجوم`, `${value} stars`)} /><Star size={28} fill={rating >= value ? 'currentColor' : 'none'} aria-hidden="true" /></label>)}</div></fieldset>
    <label className="block text-sm font-bold">{text('الاسم الظاهر للجميع', 'Public display name')}<input required name="displayName" minLength={2} maxLength={80} className="mt-2 w-full rounded-xl border border-[#0D7D78]/25 p-3 font-normal" autoComplete="off" /></label>
    <label className="block text-sm font-bold">{text('تقييمك الصادق', 'Your honest review')}<textarea required name="comment" minLength={3} maxLength={2000} rows={4} className="mt-2 w-full rounded-xl border border-[#0D7D78]/25 p-3 font-normal" /></label>
    <label className="flex items-start gap-2 text-sm"><input required type="checkbox" name="consent" className="mt-1" /><span>{text('أوافق على نشر تقييمي والاسم الظاهر. لن يتم نشر بيانات طلبي.', 'I agree to publish my review and display name. My order details will stay private.')}</span></label>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<button disabled={working} className="mint-cta rounded-xl px-5 py-3 disabled:opacity-50">{working ? text('جارٍ الإرسال…', 'Submitting…') : text('إرسال التقييم', 'Submit review')}</button>
  </form>
}
