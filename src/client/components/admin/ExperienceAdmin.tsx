import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAdminReviews, moderateReview, reviewAdminPayment, uploadCatalogImage, type BannerMedia } from '../../lib/api'
import { RatingStars } from '../Reviews'

const inputClass = 'mt-2 w-full rounded-xl border border-[#2c1c14]/20 bg-white p-3 text-sm'
export function ReviewModerationPanel() {
  const [status, setStatus] = useState('pending')
  const [working, setWorking] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['admin-reviews', status], queryFn: () => getAdminReviews(status) })
  const moderate = async (id: string, next: 'published' | 'rejected') => {
    setWorking(id); setMessage('')
    try { await moderateReview(id, next, reasons[id] ?? ''); await client.invalidateQueries({ queryKey: ['admin-reviews'] }); await client.invalidateQueries({ queryKey: ['reviews'] }) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update review.') }
    finally { setWorking(null) }
  }
  return <section className="mt-7 rounded-3xl bg-white p-6"><h3 className="font-serif text-2xl">Customer reviews</h3><p className="mt-2 text-sm text-[#624b40]">Check for spam, personal information, and abuse. Publish genuine reviews regardless of rating. Customer ratings and words cannot be edited here.</p><label className="mt-4 block text-sm font-bold">Review status<select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>{['pending', 'published', 'rejected'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    {query.isLoading ? <p className="mt-4">Loading reviews…</p> : null}{query.isError ? <p role="alert" className="mt-4 text-red-700">Could not load reviews. <button type="button" onClick={() => void query.refetch()} className="underline">Retry</button></p> : null}
    <div className="mt-5 space-y-4">{query.data?.reviews.map((review) => <article key={review.id} className="rounded-2xl border p-5"><div className="flex flex-wrap justify-between gap-3"><strong>{review.displayName}</strong><span className="text-xs">{review.orderNumber} · {new Date(review.createdAt).toLocaleDateString()}</span></div><div className="mt-3"><RatingStars rating={review.rating} /></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7" dir="auto">{review.comment}</p>{review.moderationReason ? <p className="mt-3 text-xs">Previous moderation note: {review.moderationReason}</p> : null}<label className="mt-3 block text-sm">Moderation note<input maxLength={500} value={reasons[review.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [review.id]: event.target.value }))} className={inputClass} /></label><div className="mt-3 flex gap-3">{review.status !== 'published' ? <button type="button" disabled={working !== null} onClick={() => void moderate(review.id, 'published')} className="rounded-xl bg-[#0D7D78] px-4 py-2 font-bold text-white disabled:opacity-50">Publish</button> : null}{review.status !== 'rejected' ? <button type="button" disabled={working !== null} onClick={() => void moderate(review.id, 'rejected')} className="rounded-xl border px-4 py-2 font-bold disabled:opacity-50">{review.status === 'published' ? 'Unpublish' : 'Reject'}</button> : null}</div></article>)}</div>
    {query.isSuccess && !query.data.reviews.length ? <p className="mt-4 text-sm">No {status} reviews.</p> : null}<p role="status" className="mt-3 text-sm">{message}</p>
  </section>
}

export function PaymentReviewPanel({ orderNumber, onChanged }: { orderNumber: string; onChanged: () => void }) {
  const client = useQueryClient()
  const [decision, setDecision] = useState('action_required')
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  return <form className="mb-6 rounded-2xl border border-[#0D7D78]/20 bg-white p-5" onSubmit={async (event) => { event.preventDefault(); setWorking(true); setMessage(''); try { await reviewAdminPayment(orderNumber, decision, note); setNote(''); await client.invalidateQueries({ queryKey: ['admin-order', orderNumber] }); onChanged() } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update payment review.') } finally { setWorking(false) } }}><h4 className="font-bold">Payment needs attention</h4><p className="mt-2 text-sm">The order stays In review. Once you have verified the transfer or deposit, move the order to Confirmed below.</p><label className="mt-3 block text-sm">Payment review<select className={inputClass} value={decision} onChange={(event) => setDecision(event.target.value)}><option value="action_required">Request correction</option><option value="payment_rejected">Reject payment proof</option><option value="resubmitted">Proof resubmitted for review</option></select></label><label className="mt-3 block text-sm">Message visible to the customer<textarea className={inputClass} required maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label><button disabled={working} className="mt-3 rounded-xl border px-4 py-2 font-bold disabled:opacity-50">Save payment review</button><p role="status" className="mt-2 text-sm text-red-700">{message}</p></form>
}

export function BannerMediaEditor({ value, onChange }: { value: BannerMedia | null | undefined; onChange: (value: BannerMedia) => void }) {
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const update = (locale: 'ar' | 'en', key: 'desktop' | 'mobile', url: string) => {
    const next = { ...value, [locale]: { ...value?.[locale], desktop: value?.[locale]?.desktop ?? '', [key]: url.trim() } }
    const entry = next[locale]
    if (entry && !entry.desktop && !entry.mobile) delete next[locale]
    else if (entry && !entry.mobile) delete entry.mobile
    onChange(next)
  }
  return <fieldset className="mt-6 rounded-2xl border p-4"><legend className="px-1 font-bold">Category banners</legend><p className="text-xs leading-5">Desktop artwork is required for each language you configure. Mobile artwork is optional. Missing languages use the available artwork. Images display full width without cropping.</p>{(['en', 'ar'] as const).map((locale) => <div key={locale} className="mt-4"><h4 className="font-bold">{locale === 'en' ? 'English' : 'Arabic'}</h4>{(['desktop', 'mobile'] as const).map((kind) => <label key={kind} className="mt-3 block text-sm">{kind === 'desktop' ? 'Desktop banner' : 'Mobile banner (optional)'}<input aria-label={`${locale} ${kind} banner URL`} className={inputClass} value={value?.[locale]?.[kind] ?? ''} onChange={(event) => update(locale, kind, event.target.value)} placeholder="https://… or /brand/…" /><input type="file" className="mt-2 block w-full text-xs" accept="image/jpeg,image/png,image/webp" disabled={working} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setWorking(true); setMessage(''); try { const image = await uploadCatalogImage('category', file); update(locale, kind, image.url) } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed.') } finally { setWorking(false) } }} /></label>)}</div>)}<p role="status" className="mt-2 text-sm text-red-700">{message}</p></fieldset>
}
