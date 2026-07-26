import { useState, type ReactNode } from 'react'
import { useForm, type FieldError } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  confirmPasswordReset,
  customerLogin,
  customerLogout,
  customerRegister,
  getCurrentCustomer,
  getCustomerOrders,
  requestPasswordReset,
  trackOrder,
} from '../lib/api'
import { formatDate, formatMoney, orderStatusLabel } from '../lib/format'
import { useStoreLocale } from '../lib/locale'
import { fieldErrorsByPath, requestErrorMessage } from '../lib/form-errors'
import { FormErrorSummary, FormNotice, InlineFieldError } from '../components/FormFeedback'
import { MintCompanion } from '../components/MintCompanion'

type Credentials = { email: string; password: string; displayName: string; phone: string }

export function AccountPage() {
  const { locale, localizedPath, text } = useStoreLocale()
  const queryClient = useQueryClient()
  const meQuery = useQuery({ queryKey: ['customer', locale], queryFn: () => getCurrentCustomer(locale), retry: false })
  const ordersQuery = useQuery({
    queryKey: ['customer-orders', locale],
    queryFn: () => getCustomerOrders(locale),
    enabled: Boolean(meQuery.data?.customer),
    retry: false,
  })
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [message, setMessage] = useState<string | null>(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Credentials>({
    mode: 'onBlur',
    reValidateMode: 'onChange',
    shouldFocusError: true,
  })

  const onSubmit = async (values: Credentials) => {
    setMessage(null)
    try {
      if (mode === 'login') await customerLogin(locale, values.email, values.password)
      else await customerRegister(locale, {
        email: values.email,
        password: values.password,
        displayName: values.displayName || undefined,
        phone: values.phone || undefined,
      })
      await queryClient.invalidateQueries({ queryKey: ['customer'] })
    } catch (error) {
      const serverErrors = fieldErrorsByPath(locale, error)
      for (const field of ['email', 'password', 'displayName', 'phone'] as const) {
        const errorMessage = serverErrors.get(field)
        if (errorMessage) setError(field, { type: 'server', message: errorMessage })
      }
      setMessage(requestErrorMessage(locale, error, mode === 'login'
        ? { ar: 'تعذر تسجيل الدخول بالبريد الإلكتروني أو كلمة المرور المقدمة.', en: 'We could not sign in with that email and password.' }
        : { ar: 'تعذر إنشاء الحساب. راجع البيانات وحاول مرة أخرى.', en: 'We could not create the account. Review the details and try again.' }))
    }
  }

  const signOut = async () => {
    await customerLogout(locale)
    await queryClient.invalidateQueries({ queryKey: ['customer'] })
    await queryClient.removeQueries({ queryKey: ['customer-orders'] })
  }

  if (meQuery.data?.customer) {
    const customer = meQuery.data.customer

    return (
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="overflow-hidden rounded-[2rem] bg-[#0D7D78] p-6 text-[#FAF8F3] shadow-[0_18px_44px_rgba(7,95,91,.18)] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-xl">
              <p className="text-sm font-black uppercase tracking-[.14em] text-[#FFD14D]">{text('حسابي', 'My account')}</p>
              <h1 className="mint-heading mt-2 text-4xl leading-none sm:text-5xl">{customer.displayName || customer.email}</h1>
              <p className="mt-4 max-w-lg leading-7 text-[#FAF8F3]/80">{text('يمكنك هنا عرض طلباتك السابقة فقط.', 'You can view your previous orders here.')}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-2xl border border-[#FAF8F3]/35 px-4 py-2.5 text-sm font-black text-[#FAF8F3] transition hover:bg-[#FAF8F3] hover:text-[#075f5b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD14D]"
            >
              {text('تسجيل الخروج', 'Sign out')}
            </button>
          </div>
          <MintCompanion
            pose="happy"
            tone="cream"
            className="mt-6 max-w-xl"
            eyebrow={text('مع Mint', 'With Mint')}
            message={text('سعيدة بعودتك! هذه كل مغامراتك السابقة معنا.', 'Happy to see you again! Here are your previous Mint Meow adventures.')}
          />
        </section>

        <section className="mt-9">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-[.14em] text-[#0D7D78]">{text('سجلّك', 'Your history')}</p>
              <h2 className="mint-heading mt-1 text-3xl text-[#075f5b]">{text('طلباتي السابقة', 'Previous orders')}</h2>
            </div>
          </div>
          {ordersQuery.isLoading ? (
            <div className="mt-5 h-36 animate-pulse rounded-[1.75rem] bg-[#9FD9C2]/55" />
          ) : (ordersQuery.data?.orders ?? []).length > 0 ? (
            <div className="mt-5 grid gap-4">
              {ordersQuery.data?.orders.map((order) => (
                <article key={order.orderNumber} className="rounded-[1.6rem] border border-[#0D7D78]/12 bg-[#FAF8F3] p-5 shadow-[0_10px_26px_rgba(7,95,91,.06)] sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <strong dir="ltr" className="text-[#075f5b]">{order.orderNumber}</strong>
                      <p className="mt-1 text-sm leading-6 text-[#075f5b]/75">{order.itemTitles.join(' · ')}</p>
                      <p className="mt-2 text-xs font-semibold text-[#075f5b]/55">{formatDate(order.createdAt, locale)}</p>
                    </div>
                    <div className="text-end">
                      <strong className="block text-[#0D7D78]">{formatMoney(order.totalAmount, locale)}</strong>
                      <span className="mt-2 inline-block rounded-full bg-[#9FD9C2]/55 px-3 py-1 text-xs font-black text-[#075f5b]">{orderStatusLabel(order.status, locale)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <MintCompanion
              pose="peek"
              tone="cream"
              className="mt-5"
              eyebrow={text('لا توجد طلبات بعد', 'No orders yet')}
              message={text('عندما تطلب من حسابك، ستظهر مغامراتك هنا.', 'When you order with this account, your adventures will appear here.')}
            />
          )}
        </section>
      </main>
    )
  }

  const switchMode = () => {
    setMode((current) => current === 'login' ? 'register' : 'login')
    setMessage(null)
    reset()
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <section className="overflow-hidden rounded-[2rem] border border-[#0D7D78]/12 bg-[#FAF8F3] p-5 shadow-[0_16px_42px_rgba(7,95,91,.08)] sm:p-8">
        <MintCompanion
          pose={mode === 'login' ? 'wave' : 'happy'}
          tone="mint"
          eyebrow={text('حساب اختياري', 'Optional account')}
          message={mode === 'login'
            ? text('أهلًا! لنرتّب مغامراتك في مكان واحد.', 'Hi! Let’s keep your adventures in one happy place.')
            : text('يا لها من بداية جميلة — أنشئ حسابك عندما يناسبك.', 'What a lovely start — create an account whenever it suits you.')}
        />
        <p className="mt-7 text-sm font-black uppercase tracking-[.14em] text-[#0D7D78]">{text('حساب اختياري', 'Optional account')}</p>
        <h1 className="mint-heading mt-2 text-4xl leading-none text-[#075f5b] sm:text-5xl">
          {mode === 'login' ? text('سجّل الدخول', 'Sign in') : text('أنشئ حسابًا', 'Create an account')}
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-[#075f5b]/75">{text('إتمام الطلب كضيف متاح دائمًا. الحساب مخصص لرؤية الطلبات السابقة فقط.', 'Guest checkout is always available. An account is only for viewing previous orders.')}</p>

        <form className="mt-7 space-y-4 rounded-[1.65rem] border border-[#0D7D78]/12 bg-white p-5 sm:p-6" noValidate onSubmit={handleSubmit(onSubmit)}>
          <FormErrorSummary errors={errors} text={text} />
          {mode === 'register' ? (
            <>
              <AccountField label={text('الاسم', 'Name')} name="displayName" error={errors.displayName} text={text}>
                <input id="displayName" aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? 'displayName-error' : undefined} {...register('displayName')} />
              </AccountField>
              <AccountField label={text('الهاتف', 'Phone')} name="phone" error={errors.phone} text={text}>
                <input id="phone" type="tel" dir="ltr" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'phone-error' : undefined} {...register('phone')} />
              </AccountField>
            </>
          ) : null}
          <AccountField label={text('البريد الإلكتروني', 'Email')} name="email" error={errors.email} text={text}>
            <input id="email" type="email" dir="ltr" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} {...register('email', { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })} />
          </AccountField>
          <AccountField label={text('كلمة المرور', 'Password')} name="password" error={errors.password} text={text}>
            <input id="password" type="password" dir="ltr" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} {...register('password', { required: true, minLength: 8 })} />
          </AccountField>
          {message ? <FormNotice>{message}</FormNotice> : null}
          <button disabled={isSubmitting} className="mint-cta w-full rounded-2xl px-5 py-3.5 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60" type="submit">
            {isSubmitting ? text('جارٍ المعالجة…', 'Working…') : mode === 'login' ? text('تسجيل الدخول', 'Sign in') : text('إنشاء حساب', 'Create account')}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
          <button type="button" className="font-black text-[#0D7D78] underline decoration-[#9FD9C2] decoration-2 underline-offset-4 transition hover:text-[#075f5b]" onClick={switchMode}>
            {mode === 'login' ? text('إنشاء حساب', 'Create an account') : text('لديك حساب؟ سجّل الدخول', 'Already have an account?')}
          </button>
          <Link className="font-black text-[#0D7D78] underline decoration-[#9FD9C2] decoration-2 underline-offset-4 transition hover:text-[#075f5b]" to={localizedPath('/reset-password')}>
            {text('نسيت كلمة المرور؟', 'Forgot password?')}
          </Link>
        </div>
      </section>
    </main>
  )
}

function AccountField({ label, name, children, error, text }: { label: string; name: string; children: ReactNode; error?: FieldError; text: (arabic: string, english: string) => string }) {
  return (
    <label className="block text-sm font-black text-[#075f5b]">
      {label}
      <span className={`mt-2 block [&_input]:w-full [&_input]:rounded-2xl [&_input]:border [&_input]:border-[#0D7D78]/20 [&_input]:bg-[#FAF8F3] [&_input]:px-3.5 [&_input]:py-3 [&_input]:font-normal [&_input]:text-[#075f5b] [&_input]:outline-none [&_input]:transition [&_input]:placeholder:text-[#075f5b]/45 [&_input]:focus:border-[#0D7D78] [&_input]:focus:bg-white [&_input]:focus:ring-4 [&_input]:focus:ring-[#9FD9C2]/45 ${error ? '[&_input]:border-red-500 [&_input]:focus:border-red-600 [&_input]:focus:ring-red-100' : ''}`}>
        {children}
      </span>
      <InlineFieldError id={`${name}-error`} error={error} name={name} text={text} />
    </label>
  )
}

export function TrackOrderPage() {
  const { locale, text } = useStoreLocale()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<{ orderNumber: string; phone: string }>({ mode: 'onBlur', reValidateMode: 'onChange', shouldFocusError: true })
  const [message, setMessage] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const onSubmit = async (values: { orderNumber: string; phone: string }) => {
    setMessage(null)
    setStatus(null)
    try {
      const result = await trackOrder(locale, values.orderNumber, values.phone)
      setStatus(result.order.status)
    } catch (error) {
      const serverErrors = fieldErrorsByPath(locale, error)
      for (const field of ['orderNumber', 'phone'] as const) {
        const errorMessage = serverErrors.get(field)
        if (errorMessage) setError(field, { type: 'server', message: errorMessage })
      }
      setMessage(requestErrorMessage(locale, error, { ar: 'لم نجد طلبًا مطابقًا بهذه البيانات.', en: 'We could not find an order with those details.' }))
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <section className="rounded-[2rem] border border-[#0D7D78]/12 bg-[#FAF8F3] p-5 shadow-[0_16px_42px_rgba(7,95,91,.08)] sm:p-8">
        <MintCompanion
          pose="exploring"
          tone="cream"
          eyebrow={text('متابعة بسيطة', 'Simple tracking')}
          message={text('دعني أبحث عن مغامرتك وأخبرك أين وصلت.', 'Let me look up your adventure and tell you where it is.')}
        />
        <p className="mt-7 text-sm font-black uppercase tracking-[.14em] text-[#0D7D78]">{text('متابعة بسيطة', 'Simple tracking')}</p>
        <h1 className="mint-heading mt-2 text-4xl leading-none text-[#075f5b] sm:text-5xl">{text('تتبع حالة طلبك', 'Track your order status')}</h1>
        <p className="mt-4 leading-7 text-[#075f5b]/75">{text('أدخل رقم الطلب ورقم الهاتف. نعرض الحالة فقط للحفاظ على خصوصية التفاصيل.', 'Enter your order number and phone. We show status only to protect your details.')}</p>

        <form className="mt-7 space-y-4 rounded-[1.65rem] border border-[#0D7D78]/12 bg-white p-5 sm:p-6" noValidate onSubmit={handleSubmit(onSubmit)}>
          <FormErrorSummary errors={errors} text={text} />
          <AccountField label={text('رقم الطلب', 'Order number')} name="orderNumber" error={errors.orderNumber} text={text}>
            <input id="orderNumber" dir="ltr" aria-invalid={Boolean(errors.orderNumber)} aria-describedby={errors.orderNumber ? 'orderNumber-error' : undefined} {...register('orderNumber', { required: true })} />
          </AccountField>
          <AccountField label={text('رقم الهاتف', 'Phone')} name="phone" error={errors.phone} text={text}>
            <input id="phone" dir="ltr" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'phone-error' : undefined} {...register('phone', { required: true, minLength: 7 })} />
          </AccountField>
          <button disabled={isSubmitting} className="mint-cta w-full rounded-2xl px-5 py-3.5 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60" type="submit">
            {isSubmitting ? text('جارٍ البحث…', 'Looking up…') : text('عرض الحالة', 'Show status')}
          </button>
        </form>

        {status ? (
          <div className="mt-5 rounded-[1.65rem] bg-[#9FD9C2]/60 p-6 text-center ring-1 ring-[#0D7D78]/10">
            <p className="text-sm font-bold text-[#075f5b]/75">{text('حالة الطلب', 'Order status')}</p>
            <strong className="mint-heading mt-2 block text-3xl text-[#075f5b]">{orderStatusLabel(status, locale)}</strong>
          </div>
        ) : null}
        {message ? <div className="mt-5"><FormNotice>{message}</FormNotice></div> : null}
      </section>
    </main>
  )
}

export function ResetPasswordPage() {
  const { locale, text } = useStoreLocale()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<{ email: string; password: string }>({ mode: 'onBlur', reValidateMode: 'onChange', shouldFocusError: true })
  const [message, setMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const onSubmit = async (values: { email: string; password: string }) => {
    setMessage(null)
    setSuccess(false)
    try {
      if (token) {
        await confirmPasswordReset(locale, token, values.password)
        setMessage(text('تم تغيير كلمة المرور. يمكنك العودة إلى حسابك.', 'Password changed. You can return to your account.'))
        setSuccess(true)
      } else {
        await requestPasswordReset(locale, values.email)
        setMessage(text('إذا كان البريد مسجلًا، أرسلنا رابطًا صالحًا لمدة ٣٠ دقيقة.', 'If that email is registered, we sent a link valid for 30 minutes.'))
        setSuccess(true)
      }
    } catch (error) {
      const serverErrors = fieldErrorsByPath(locale, error)
      const field = token ? 'password' : 'email'
      const errorMessage = serverErrors.get(field)
      if (errorMessage) setError(field, { type: 'server', message: errorMessage })
      setMessage(requestErrorMessage(locale, error, { ar: 'تعذر إتمام الطلب الآن. حاول مرة أخرى.', en: 'We could not complete that request. Please try again.' }))
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <section className="rounded-[2rem] border border-[#0D7D78]/12 bg-[#FAF8F3] p-5 shadow-[0_16px_42px_rgba(7,95,91,.08)] sm:p-8">
        <MintCompanion
          pose={token ? 'happy' : 'reading'}
          tone={token ? 'sunshine' : 'cream'}
          eyebrow={text('مساعدة Mint', 'Mint is here to help')}
          message={token
            ? text('خطوة أخيرة صغيرة، وبعدها ستعود إلى عالم Mint.', 'One little step and you will be back in Mint’s world.')
            : text('لا تقلق، سنساعدك على العودة إلى حسابك بأمان.', 'No worries, we will help you get back into your account safely.')}
        />
        <p className="mt-7 text-sm font-black uppercase tracking-[.14em] text-[#0D7D78]">{text('مساعدة Mint', 'Mint is here to help')}</p>
        <h1 className="mint-heading mt-2 text-4xl leading-none text-[#075f5b] sm:text-5xl">
          {token ? text('كلمة مرور جديدة', 'Set a new password') : text('استعادة كلمة المرور', 'Reset password')}
        </h1>
        <p className="mt-4 leading-7 text-[#075f5b]/75">{token ? text('اختر كلمة مرور جديدة من ٨ أحرف على الأقل.', 'Choose a new password with at least 8 characters.') : text('سنرسل رابطًا قصير الصلاحية إلى بريدك الإلكتروني.', 'We will send a short-lived link to your email.')}</p>

        <form className="mt-7 space-y-4 rounded-[1.65rem] border border-[#0D7D78]/12 bg-white p-5 sm:p-6" noValidate onSubmit={handleSubmit(onSubmit)}>
          <FormErrorSummary errors={errors} text={text} />
          {token ? (
            <AccountField label={text('كلمة المرور الجديدة', 'New password')} name="password" error={errors.password} text={text}>
              <input id="password" type="password" dir="ltr" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} {...register('password', { required: true, minLength: 8 })} />
            </AccountField>
          ) : (
            <AccountField label={text('البريد الإلكتروني', 'Email')} name="email" error={errors.email} text={text}>
              <input id="email" type="email" dir="ltr" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} {...register('email', { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })} />
            </AccountField>
          )}
          <button disabled={isSubmitting} className="mint-cta w-full rounded-2xl px-5 py-3.5 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60" type="submit">
            {isSubmitting ? text('جارٍ المعالجة…', 'Working…') : token ? text('حفظ كلمة المرور', 'Save password') : text('إرسال رابط الاستعادة', 'Send reset link')}
          </button>
        </form>
        {message ? <div className="mt-5"><FormNotice tone={success ? 'success' : 'error'}>{message}</FormNotice></div> : null}
      </section>
    </main>
  )
}
