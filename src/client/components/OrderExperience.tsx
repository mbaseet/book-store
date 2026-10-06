import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Copy, Download, Share2 } from 'lucide-react'
import { claimPostOrder, confirmEmailVerification, customerRegister, getCurrentCustomer, getPostOrderCustomer, requestEmailVerification } from '../lib/api'
import { requestErrorMessage } from '../lib/form-errors'
import { useStoreLocale } from '../lib/locale'

export function OrderSavePanel({ orderNumber }: { orderNumber: string }) {
  const { localizedPath, text } = useStoreLocale()
  const [message, setMessage] = useState('')
  const path = localizedPath(`/track-order?orderNumber=${encodeURIComponent(orderNumber)}`)
  const url = new URL(path, window.location.origin).toString()
  const details = `Mint Meow\n${text('رقم الطلب', 'Order number')}: ${orderNumber}\n${text('متابعة الطلب', 'Track your order')}: ${url}\n${text('استخدم هاتف الطلب لعرض الحالة.', 'Use your order phone number to view its status.')}`
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setMessage(text('تم النسخ', 'Copied')) }
    catch { setMessage(text('تعذر النسخ التلقائي. يمكنك تحديد الرقم ونسخه أو تنزيله.', 'Automatic copying is unavailable. Select the number to copy it, or download it.')) }
  }
  return <section className="mt-7 rounded-2xl border border-[#0D7D78]/15 bg-white p-6" aria-labelledby="save-order-heading">
    <h2 id="save-order-heading" className="mint-heading text-2xl">{text('احتفظ برقم طلبك', 'Keep your order number')}</h2><p className="my-4 break-all text-2xl font-black" dir="ltr">{orderNumber}</p>
    <div className="flex flex-wrap justify-center gap-3"><button type="button" className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold" onClick={() => void copy(orderNumber)}><Copy size={16} />{text('نسخ', 'Copy')}</button><button type="button" className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold" onClick={() => {
      const href = URL.createObjectURL(new Blob([details], { type: 'text/plain;charset=utf-8' }))
      const anchor = document.createElement('a'); anchor.href = href; anchor.download = `Mint-Meow-${orderNumber.replace(/[^a-zA-Z0-9-]/g, '')}.txt`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    }}><Download size={16} />{text('حفظ التفاصيل', 'Save details')}</button><button type="button" className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold" onClick={async () => {
      if (!navigator.share) { await copy(url); return }
      try { await navigator.share({ title: 'Mint Meow', text: `${text('رقم الطلب', 'Order number')}: ${orderNumber}`, url }) }
      catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) await copy(url) }
    }}><Share2 size={16} />{text('مشاركة', 'Share')}</button></div>
    <p role="status" className="mt-3 text-sm text-[#47716e]">{message}</p><Link to={path} className="mint-cta mt-3 inline-block rounded-xl px-6 py-3">{text('تتبّع الطلب', 'Track order')}</Link>
  </section>
}

export function EmailVerificationPanel() {
  const { locale, text } = useStoreLocale()
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  return <section className="mt-6 rounded-2xl border border-[#0D7D78]/20 bg-white p-5"><h2 className="font-black">{text('أكد بريدك لعرض طلباتك', 'Verify your email to see your orders')}</h2><p className="mt-2 text-sm leading-6">{text('افتح رابط التأكيد في بريدك، ثم عد إلى حسابك. تحقق أيضًا من البريد غير المرغوب فيه.', 'Open the verification link in your email, then return to your account. Check your spam folder too.')}</p><button className="mt-3 font-bold text-[#0D7D78] underline disabled:opacity-50" disabled={working} type="button" onClick={async () => { setWorking(true); try { await requestEmailVerification(locale); setMessage(text('تم طلب رابط تأكيد جديد.', 'A new verification email has been requested.')) } catch (error) { setMessage(requestErrorMessage(locale, error)) } finally { setWorking(false) } }}>{text('إرسال رابط تأكيد جديد', 'Send a new verification link')}</button><p className="mt-2 text-sm" role="status">{message}</p></section>
}

export function ClaimOrderButton({ orderNumber }: { orderNumber: string }) {
  const { locale, text } = useStoreLocale()
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)
  return <div className="mt-5"><button disabled={working} type="button" className="mint-cta rounded-xl px-5 py-3" onClick={async () => { setWorking(true); try { await claimPostOrder(locale, orderNumber); await client.invalidateQueries({ queryKey: ['customer-orders'] }); setMessage(text('تمت إضافة طلبك إلى حسابك.', 'Your order is now in your account.')) } catch (error) { setMessage(requestErrorMessage(locale, error)) } finally { setWorking(false) } }}>{text('إضافة هذا الطلب إلى حسابي', 'Add this order to my account')}</button><p role="status" className="mt-2 text-sm">{message}</p></div>
}

export function PostOrderAccount({ orderNumber }: { orderNumber: string }) {
  const { locale, localizedPath, text } = useStoreLocale()
  const client = useQueryClient()
  const context = useQuery({ queryKey: ['post-order', locale, orderNumber], queryFn: () => getPostOrderCustomer(locale, orderNumber), retry: false })
  const me = useQuery({ queryKey: ['customer', locale], queryFn: () => getCurrentCustomer(locale), retry: false })
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const customer = context.data?.customer
  if (me.data?.customer) return <div className="mt-6 text-start">{!me.data.customer.emailVerified ? <EmailVerificationPanel /> : !context.data?.claimed && customer ? <ClaimOrderButton orderNumber={orderNumber} /> : null}<Link className="mt-4 inline-block font-bold underline" to={localizedPath('/account')}>{text('عرض حسابي', 'View my account')}</Link></div>
  if (!customer || context.data?.claimed) return <Link className="mt-6 inline-block font-bold underline" to={localizedPath('/account')}>{text('حسابي وطلباتي', 'My account and orders')}</Link>
  return <section className="mt-7 rounded-2xl bg-[#9FD9C2]/20 p-6 text-start"><h2 className="mint-heading text-2xl">{text('كل مغامراتك في مكان واحد', 'Keep your adventures in one place')}</h2><p className="mt-2 text-sm leading-6">{text('أنشئ حسابًا اختياريًا لمتابعة طلباتك. بياناتك جاهزة.', 'Create an optional account to follow your orders. Your details are ready.')}</p>
    {!open ? <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-xl bg-white px-5 py-3 font-bold">{text('إنشاء حسابي', 'Create my account')}</button> : <form className="mt-4 space-y-4" onSubmit={async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setWorking(true); setError(null)
      try { await customerRegister(locale, { ...customer, orderNumber, email: String(data.get('email')), password: String(data.get('password')) }); await client.invalidateQueries({ queryKey: ['customer'] }) }
      catch (failure) { setError(requestErrorMessage(locale, failure)) }
      finally { setWorking(false) }
    }}><p className="text-sm">{customer.displayName} · <span dir="ltr">{customer.phone}</span></p><label className="block text-sm font-bold">{text('البريد الإلكتروني', 'Email')}<input type="email" name="email" autoComplete="email" defaultValue={customer.email} required maxLength={254} className="mt-2 w-full rounded-xl border p-3 font-normal" /></label><label className="block text-sm font-bold">{text('كلمة المرور', 'Password')}<input type="password" name="password" autoComplete="new-password" required minLength={8} maxLength={128} className="mt-2 w-full rounded-xl border p-3 font-normal" /></label><label className="flex items-start gap-2 text-sm"><input required type="checkbox" name="accountConsent" className="mt-1" /><span>{text('أوافق على إنشاء حساب باستخدام بيانات هذا الطلب.', 'I agree to create an account using this order’s details.')}</span></label>{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<button disabled={working} className="mint-cta rounded-xl px-5 py-3 disabled:opacity-50">{text('إنشاء حسابي وإرسال رابط التأكيد', 'Create my account and send verification')}</button></form>}
    <Link className="mt-4 block text-sm font-bold underline" to={localizedPath(`/account?claimOrder=${encodeURIComponent(orderNumber)}`)}>{text('لديك حساب؟ سجل الدخول', 'Already have an account? Sign in')}</Link>
  </section>
}

export function VerifyEmailPage() {
  const { locale, localizedPath, text } = useStoreLocale()
  const [params] = useSearchParams()
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)
  const [verified, setVerified] = useState(false)
  return <main className="mx-auto max-w-xl px-5 py-16"><h1 className="mint-heading text-4xl">{text('تأكيد بريدك الإلكتروني', 'Verify your email')}</h1><p className="mt-4 leading-7">{text('أكد أن هذا البريد يخصك لعرض طلباتك بأمان.', 'Confirm this email belongs to you to access your orders.')}</p>{!verified ? <button disabled={working || !params.get('token')} className="mint-cta mt-6 rounded-xl px-5 py-3 disabled:opacity-50" onClick={async () => {
    setWorking(true); try { await confirmEmailVerification(locale, params.get('token') ?? ''); setVerified(true); setMessage(text('تم تأكيد بريدك. يمكنك الآن عرض طلباتك.', 'Your email is verified. You can now view your orders.')); await client.invalidateQueries({ queryKey: ['customer'] }); await client.invalidateQueries({ queryKey: ['customer-orders'] }) } catch (error) { setMessage(requestErrorMessage(locale, error)) } finally { setWorking(false) }
  }}>{text('تأكيد البريد', 'Verify email')}</button> : null}<p role="status" className="mt-4 text-sm">{message || (!params.get('token') ? text('افتح الرابط المرسل لبريدك أو اطلب رابطًا جديدًا من حسابك.', 'Open the link from your email or request a new one from your account.') : '')}</p><Link to={localizedPath('/account')} className="mt-6 inline-block font-bold underline">{text('العودة إلى حسابي', 'Return to my account')}</Link></main>
}
