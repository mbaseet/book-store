import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useForm, useWatch, type FieldError } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Trash2, Upload } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { CheckoutDraftDeliveryInput } from '@shared/contracts/checkout'
import { CheckoutProgress } from '../components/CheckoutProgress'
import { useCart } from '../features/cart/CartContext'
import {
  createCheckout,
  getCheckoutDraft,
  getCheckoutQuote,
  getGovernorates,
  getSettings,
  removeCheckoutDraftItem,
  saveCheckoutDraftDelivery,
  uploadPrivateFile,
  ApiClientError,
  type CartCheckoutResult,
} from '../lib/api'
import { formatMoney } from '../lib/format'
import { useStoreLocale } from '../lib/locale'
import { fieldErrorsByPath, requestErrorMessage } from '../lib/form-errors'
import { FormErrorSummary, FormNotice, InlineFieldError } from '../components/FormFeedback'
import { MintCompanion } from '../components/MintCompanion'

function cartItemTotal(item: ReturnType<typeof useCart>['items'][number]) {
  return ((item.salePriceAmount ?? item.basePriceAmount) + item.addons.reduce((sum, addon) => sum + addon.priceAmount, 0)) * item.quantity
}

function cartItemPersonalizationLabel(item: ReturnType<typeof useCart>['items'][number], text: (arabic: string, english: string) => string) {
  if (!item.personalizationDefinition) return text('منتج جاهز', 'Ready product')
  // Never render an undefined child name or expose arbitrary saved answers.
  return item.childName?.trim()
    ? text(`لـ ${item.childName}`, `For ${item.childName}`)
    : text('تفاصيل التخصيص محفوظة', 'Customization details saved')
}

function EmptyCheckout() {
  const { localizedPath, text } = useStoreLocale()
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 text-center sm:px-8">
      <MintCompanion pose="peek" tone="cream" className="mx-auto max-w-md text-start" eyebrow={text('مِنت تبحث', 'Mint is looking')} message={text('أين نبدأ مغامرتنا؟', 'Where shall our adventure begin?')} />
      <h1 className="mint-heading mt-7 text-4xl text-[#075f5b]">{text('لم تضف منتجًا بعد', 'No product has been added yet')}</h1>
      <p className="mt-4 text-[#624b40]">
        {text('اختر منتجًا، وأضف تفاصيل التخصيص فقط إذا طلبها، ثم سنأخذك مباشرةً إلى التوصيل والدفع.', 'Choose a product, add personalization details only when it asks for them, then continue directly to delivery and payment.')}
      </p>
      <Link className="mint-cta mt-7 inline-block rounded-2xl px-6 py-3" to={localizedPath('/stories')}>
        {text('تسوّق مع مِنت', 'Shop with Mint')}
      </Link>
    </main>
  )
}

function CheckoutLoading() {
  const { text } = useStoreLocale()
  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8"><MintCompanion pose="sleeping" tone="mint" message={text('مِنت تحضّر تفاصيل طلبك…', 'Mint is getting your order details ready…')} /><div className="mt-7 h-96 animate-pulse rounded-[2rem] bg-[#9FD9C2]/25" /></main>
}

type PaymentMethod = '' | 'instapay' | 'mobile_wallet'

type CheckoutForm = {
  customerName: string
  email: string
  phone: string
  governorateCode: string
  city: string
  addressLine1: string
  addressLine2: string
  addressNote: string
  paymentMethod: PaymentMethod
  promoCode: string
}

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function emptyDelivery(): CheckoutForm {
  return {
    customerName: '',
    email: '',
    phone: '',
    governorateCode: '',
    city: '',
    addressLine1: '',
    addressLine2: '',
    addressNote: '',
    paymentMethod: '',
    promoCode: '',
  }
}

function asDraftDelivery(values: CheckoutForm, appliedPromoCode: string): CheckoutDraftDeliveryInput {
  return {
    customerName: values.customerName,
    email: values.email,
    phone: values.phone,
    governorateCode: values.governorateCode,
    city: values.city,
    addressLine1: values.addressLine1,
    addressLine2: values.addressLine2,
    addressNote: values.addressNote,
    paymentMethod: values.paymentMethod,
    promoCode: values.promoCode,
    appliedPromoCode,
  }
}

function extractSafePaymentLink(instruction: string | null) {
  const candidate = instruction?.match(/https:\/\/[^\s]+/i)?.[0]
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function CheckoutPage() {
  const { items, estimatedSubtotalAmount, clearCart, replaceItems } = useCart()
  const { locale, localizedPath, text } = useStoreLocale()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const governoratesQuery = useQuery({ queryKey: ['governorates', locale], queryFn: () => getGovernorates(locale) })
  const settingsQuery = useQuery({ queryKey: ['settings', locale], queryFn: () => getSettings(locale) })
  const draftQuery = useQuery({ queryKey: ['checkout-draft', locale], queryFn: () => getCheckoutDraft(locale), retry: false })
  const { register, control, handleSubmit, reset, setError, setValue, watch, formState: { errors } } = useForm<CheckoutForm>({
    defaultValues: emptyDelivery(),
    shouldFocusError: true,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })
  const watchedDelivery = useWatch({ control })
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofError, setProofError] = useState<string | null>(null)
  const [appliedPromoCode, setAppliedPromoCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRemovingItemId, setIsRemovingItemId] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const hydratedDraftKey = useRef<string | null>(null)
  const lastSavedDelivery = useRef('')
  const draftRevision = useRef<number | null>(null)
  const pendingDeliverySave = useRef<{ delivery: CheckoutDraftDeliveryInput; fingerprint: string } | null>(null)
  const deliverySaveInFlight = useRef(false)
  const checkoutCompleted = useRef(false)
  const governorateCode = watch('governorateCode')
  const paymentMethod = watch('paymentMethod')
  const promoCodeValue = watch('promoCode')

  useEffect(() => {
    if (!draftQuery.isSuccess) return
    const draft = draftQuery.data.draft
    if (!draft) {
      replaceItems([])
      hydratedDraftKey.current = null
      draftRevision.current = null
      return
    }
    draftRevision.current = draft.revision
    const draftKey = `${draft.expiresAt}:${draft.items.map((item) => item.id).join(',')}`
    if (hydratedDraftKey.current === draftKey) return
    const { appliedPromoCode: savedAppliedPromoCode, ...savedDelivery } = draft.delivery
    const delivery = { ...emptyDelivery(), ...savedDelivery }
    replaceItems(draft.items)
    reset(delivery)
    setAppliedPromoCode(savedAppliedPromoCode.trim().toLocaleUpperCase('en-US'))
    lastSavedDelivery.current = JSON.stringify(asDraftDelivery(delivery, savedAppliedPromoCode.trim().toLocaleUpperCase('en-US')))
    hydratedDraftKey.current = draftKey
    setDraftMessage(null)
  }, [draftQuery.data, draftQuery.isSuccess, replaceItems, reset])

  const paymentDetails = settingsQuery.data?.settings.paymentDetails
  const deliveryGuidance = settingsQuery.data?.settings.deliveryGuidance?.trim()
  const paymentGuidance = settingsQuery.data?.settings.paymentGuidance?.trim()
  const paymentOptions = useMemo(
    () => [
      { value: 'instapay' as const, label: 'InstaPay', instruction: paymentDetails?.instapay ?? null },
      { value: 'mobile_wallet' as const, label: text('محفظة إلكترونية', 'Mobile wallet'), instruction: paymentDetails?.mobileWallet ?? null },
    ].filter((option) => Boolean(option.instruction?.trim())),
    [paymentDetails, text],
  )
  useEffect(() => {
    if (paymentOptions.length > 0 && !paymentOptions.some((option) => option.value === paymentMethod)) {
      setValue('paymentMethod', paymentOptions[0].value)
    }
  }, [paymentMethod, paymentOptions, setValue])

  const deliveryToSave = useMemo(
    () => asDraftDelivery({ ...emptyDelivery(), ...watchedDelivery }, appliedPromoCode),
    [appliedPromoCode, watchedDelivery],
  )
  const deliveryFingerprint = JSON.stringify(deliveryToSave)
  const flushDeliverySave = useCallback(async () => {
    if (deliverySaveInFlight.current || checkoutCompleted.current) return
    deliverySaveInFlight.current = true
    setIsSavingDraft(true)
    try {
      while (pendingDeliverySave.current && !checkoutCompleted.current) {
        const pending = pendingDeliverySave.current
        pendingDeliverySave.current = null
        const expectedRevision = draftRevision.current
        if (expectedRevision === null) break
        try {
          const { draft } = await saveCheckoutDraftDelivery(locale, pending.delivery, expectedRevision)
          draftRevision.current = draft.revision
          lastSavedDelivery.current = pending.fingerprint
          queryClient.setQueryData(['checkout-draft', locale], { draft })
          setDraftMessage(null)
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 409) {
            setDraftMessage(text('تغير الطلب المحفوظ في نافذة أخرى. حدّث الصفحة وراجع التفاصيل قبل المتابعة.', 'Your saved checkout changed in another tab. Refresh the page and review the details before continuing.'))
            void queryClient.invalidateQueries({ queryKey: ['checkout-draft', locale] })
          } else {
            setDraftMessage(requestErrorMessage(locale, error, {
              ar: 'انتهت مهلة حفظ الطلب. خصّص القصة مرة أخرى للمتابعة.',
              en: 'Your saved checkout expired. Please personalize the story again to continue.',
            }))
          }
          break
        }
      }
    } finally {
      deliverySaveInFlight.current = false
      setIsSavingDraft(false)
    }
  }, [locale, queryClient, text])
  useEffect(() => {
    if (!draftQuery.data?.draft || hydratedDraftKey.current === null || deliveryFingerprint === lastSavedDelivery.current) return
    const timeout = window.setTimeout(() => {
      pendingDeliverySave.current = { delivery: deliveryToSave, fingerprint: deliveryFingerprint }
      void flushDeliverySave()
    }, 850)
    return () => window.clearTimeout(timeout)
  }, [deliveryFingerprint, deliveryToSave, draftQuery.data?.draft, flushDeliverySave])

  const quoteItems = useMemo(
    () => items.map((item) => ({ productId: item.productId, quantity: item.quantity, addonIds: item.addons.map((addon) => addon.id) })),
    [items],
  )
  const quoteQuery = useQuery({
    queryKey: ['checkout-quote', locale, governorateCode, appliedPromoCode, quoteItems],
    queryFn: () => getCheckoutQuote(locale, {
      governorateCode,
      promoCode: appliedPromoCode || undefined,
      items: quoteItems,
    }),
    enabled: Boolean(governorateCode) && quoteItems.length > 0,
    retry: false,
  })
  const quote = quoteQuery.data?.quote
  const promoNeedsApply = (promoCodeValue.trim().toLocaleUpperCase('en-US')) !== appliedPromoCode
  const selectedPayment = paymentOptions.find((option) => option.value === paymentMethod)
  const paymentInstruction = selectedPayment?.instruction ?? null
  const paymentLink = extractSafePaymentLink(paymentInstruction)
  const paymentConfigured = Boolean(paymentInstruction?.trim())
  const quoteReady = Boolean(quote) && !quoteQuery.isFetching && !promoNeedsApply
  const paymentReady = quoteReady && paymentConfigured
  const quoteError = quoteQuery.isError
    ? requestErrorMessage(locale, quoteQuery.error, {
        ar: 'تعذر تحديث الإجمالي. راجع المحافظة أو كود الخصم وحاول مرة أخرى.',
        en: 'We could not update the final total. Check the governorate or promo code and try again.',
      })
    : null

  const applyPromo = () => {
    setAppliedPromoCode(promoCodeValue.trim().toLocaleUpperCase('en-US'))
    setSubmitError(null)
  }

  const removeItem = async (itemId: string) => {
    setIsRemovingItemId(itemId)
    setSubmitError(null)
    try {
      const expectedRevision = draftRevision.current
      if (expectedRevision === null) throw new Error(text('تم تحديث الطلب. أعد المحاولة بعد لحظة.', 'The checkout was refreshed. Please try again in a moment.'))
      const result = await removeCheckoutDraftItem(locale, itemId, expectedRevision)
      draftRevision.current = result.draft?.revision ?? null
      replaceItems(result.draft?.items ?? [])
      queryClient.setQueryData(['checkout-draft', locale], { draft: result.draft })
    } catch (error) {
      setSubmitError(requestErrorMessage(locale, error, {
        ar: 'تعذر إزالة القصة. حاول مرة أخرى.',
        en: 'The story could not be removed. Please try again.',
      }))
    } finally {
      setIsRemovingItemId(null)
    }
  }

  const onSubmit = async (values: CheckoutForm) => {
    if (items.length === 0) return
    if (draftMessage) {
      setSubmitError(draftMessage)
      return
    }
    if (!quoteReady) {
      setSubmitError(
        promoNeedsApply
          ? text('طبّق كود الخصم أولًا لتحديث الإجمالي النهائي.', 'Apply the promo code first to update the final total.')
          : quoteError ?? text('اختر المحافظة وانتظر ظهور الإجمالي النهائي قبل التحويل.', 'Choose a governorate and wait for the final total before transferring.'),
      )
      return
    }
    if (!paymentConfigured || !values.paymentMethod) {
      setSubmitError(text('لا توجد طريقة تحويل متاحة بعد. تواصل معنا للمساعدة.', 'No transfer method is available yet. Please contact us for help.'))
      return
    }
    if (!proofFile) {
      setProofError(text('ارفع لقطة شاشة التحويل لإرسال الطلب.', 'Upload the transfer screenshot to submit your order.'))
      document.getElementById('paymentProof')?.focus()
      return
    }
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const paymentProofUpload = await uploadPrivateFile(locale, 'payment_proof', proofFile)
      const result = await createCheckout(locale, {
        customerName: values.customerName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        governorateCode: values.governorateCode,
        city: values.city.trim(),
        addressLine1: values.addressLine1.trim(),
        addressLine2: values.addressLine2.trim() || undefined,
        addressNote: values.addressNote.trim() || undefined,
        paymentMethod: values.paymentMethod,
        paymentProofUpload,
        promoCode: appliedPromoCode || undefined,
      })
      checkoutCompleted.current = true
      clearCart()
      queryClient.setQueryData(['checkout-draft', locale], { draft: null })
      navigate(localizedPath(`/order-confirmation/${result.order.orderNumber}`), { state: result })
    } catch (error) {
      const serverErrors = fieldErrorsByPath(locale, error)
      const fields: Array<keyof CheckoutForm> = ['customerName', 'email', 'phone', 'governorateCode', 'city', 'addressLine1', 'addressLine2', 'addressNote', 'paymentMethod', 'promoCode']
      for (const field of fields) {
        const message = serverErrors.get(field)
        if (message) setError(field, { type: 'server', message })
      }
      const paymentProofMessage = serverErrors.get('paymentProofUpload') ?? serverErrors.get('paymentProof')
      if (paymentProofMessage) setProofError(paymentProofMessage)
      setSubmitError(requestErrorMessage(locale, error, {
        ar: 'تعذر إرسال الطلب. راجع البيانات وحاول مرة أخرى.',
        en: 'We could not submit the order. Review the details and try again.',
      }))
    } finally {
      setIsSubmitting(false)
    }
  }

  const isHydrating = draftQuery.isLoading || (Boolean(draftQuery.data?.draft) && items.length === 0)
  if (isHydrating) return <CheckoutLoading />
  if (items.length === 0) return <EmptyCheckout />

  const selectProofFile = (file: File | null) => {
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setProofFile(null)
      setProofError(text('استخدم لقطة شاشة بصيغة JPG أو PNG أو WebP.', 'Use a JPG, PNG, or WebP screenshot.'))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setProofFile(null)
      setProofError(text('يجب أن تكون لقطة الشاشة أصغر من ١٠ ميجابايت.', 'Your screenshot must be smaller than 10 MB.'))
      return
    }
    setProofFile(file)
    setProofError(null)
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <CheckoutProgress currentStep={2} />
      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_280px] lg:items-center">
        <div>
        <h1 className="mint-heading text-4xl text-[#075f5b]">{text('التوصيل والدفع', 'Delivery & payment')}</h1>
        <p className="mt-3 max-w-3xl text-[#47716e]">
          {text('أكمل كضيف — لا تحتاج إلى حساب. اختر المحافظة أولًا لنحسب المبلغ الدقيق قبل التحويل.', 'Check out as a guest — no account is needed. Choose delivery first so we can show the exact amount before you transfer.')}
        </p>
        <p className="mt-3 text-sm leading-6 text-[#47716e]">
          {isSavingDraft
            ? text('جارٍ حفظ التفاصيل بأمان…', 'Saving your details securely…')
            : text('تُحفظ القصة وبيانات التوصيل على هذا المتصفح لمدة 60 دقيقة. لا نحفظ لقطة شاشة الدفع تلقائيًا.', 'Your story and delivery details are saved on this browser for 60 minutes. Payment screenshots are never saved automatically.')}
        </p>
        {deliveryGuidance ? <div className="mt-4 rounded-2xl border border-[#9FD9C2] bg-[#9FD9C2]/20 p-4 text-sm leading-6 text-[#175451]"><p className="font-bold">{text('إرشادات التوصيل', 'Delivery guidance')}</p><p className="mt-1 whitespace-pre-line">{deliveryGuidance}</p></div> : null}
        {draftMessage ? <div className="mt-3"><FormNotice>{draftMessage}</FormNotice></div> : null}
        </div>
        <MintCompanion pose="wave" tone="cream" eyebrow={text('مِنت معك', 'Mint is with you')} message={text('خطوة أخيرة ونوصل فرحتك لحد البيت.', 'One more step, then we’ll bring the joy to your door.')} />
      </div>
      <form className="mt-8 grid gap-7 lg:grid-cols-[1fr_360px]" noValidate onSubmit={handleSubmit(onSubmit)}>
        <section className="space-y-6">
          <FormErrorSummary errors={errors} text={text} />
          <fieldset className="rounded-3xl border border-[#0D7D78]/12 bg-white p-6 shadow-sm">
            <legend className="mint-heading px-1 text-2xl text-[#075f5b]">{text('بيانات التواصل والتوصيل', 'Contact and delivery')}</legend>
            <p className="mt-3 text-sm leading-6 text-[#47716e]">{text('ابدأ بالمحافظة لنظهر رسوم التوصيل والإجمالي النهائي.', 'Start with your governorate to reveal the delivery fee and final total.')}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={text('المحافظة', 'Governorate')} name="governorateCode" error={errors.governorateCode} text={text}>
                <select id="governorateCode" aria-invalid={Boolean(errors.governorateCode)} aria-describedby={errors.governorateCode ? 'governorateCode-error' : undefined} {...register('governorateCode', { required: true })}>
                  <option value="">{text('اختر المحافظة', 'Select governorate')}</option>
                  {(governoratesQuery.data?.governorates ?? []).map((governorate) => <option key={governorate.code} value={governorate.code}>{governorate.name}</option>)}
                </select>
              </Field>
              <Field label={text('المدينة / المنطقة', 'City / area')} name="city" error={errors.city} text={text}><input id="city" aria-invalid={Boolean(errors.city)} aria-describedby={errors.city ? 'city-error' : undefined} {...register('city', { required: true, minLength: 2, maxLength: 100 })} /></Field>
              <Field label={text('الاسم', 'Name')} name="customerName" error={errors.customerName} text={text}><input id="customerName" aria-invalid={Boolean(errors.customerName)} aria-describedby={errors.customerName ? 'customerName-error' : undefined} {...register('customerName', { required: true, minLength: 2, maxLength: 120 })} /></Field>
              <Field label={text('رقم الهاتف', 'Phone')} name="phone" error={errors.phone} text={text}><input id="phone" type="tel" dir="ltr" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'phone-error' : undefined} {...register('phone', { required: true, minLength: 7, maxLength: 30 })} /></Field>
              <Field label={text('البريد الإلكتروني', 'Email')} name="email" error={errors.email} text={text}><input id="email" type="email" dir="ltr" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} {...register('email', { required: true, maxLength: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })} /></Field>
              <Field label={text('العنوان', 'Address')} name="addressLine1" error={errors.addressLine1} text={text}><input id="addressLine1" aria-invalid={Boolean(errors.addressLine1)} aria-describedby={errors.addressLine1 ? 'addressLine1-error' : undefined} {...register('addressLine1', { required: true, minLength: 5, maxLength: 250 })} /></Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={text('تفاصيل عنوان إضافية', 'Address details')} name="addressLine2" error={errors.addressLine2} text={text}><input id="addressLine2" aria-invalid={Boolean(errors.addressLine2)} aria-describedby={errors.addressLine2 ? 'addressLine2-error' : undefined} {...register('addressLine2', { maxLength: 250 })} /></Field>
              <Field label={text('ملاحظة للتوصيل', 'Delivery note')} name="addressNote" error={errors.addressNote} text={text}><input id="addressNote" aria-invalid={Boolean(errors.addressNote)} aria-describedby={errors.addressNote ? 'addressNote-error' : undefined} {...register('addressNote', { maxLength: 500 })} /></Field>
            </div>
          </fieldset>

          <fieldset className="rounded-3xl border border-[#0D7D78]/12 bg-white p-6 shadow-sm">
            <legend className="mint-heading px-1 text-2xl text-[#075f5b]">{text('الدفع اليدوي', 'Manual payment')}</legend>
            <p className="mt-3 text-sm leading-6 text-[#47716e]">
              {text('بعد ظهور الإجمالي النهائي، حوّل المبلغ نفسه ثم ارفع لقطة شاشة واضحة. نراجع الدفع قبل بدء التنفيذ.', 'Once the final total appears, transfer that exact amount and upload a clear screenshot. We review payment before production begins.')}
            </p>
            {paymentGuidance ? <div className="mt-4 rounded-2xl border border-[#9FD9C2] bg-[#9FD9C2]/20 p-4 text-sm leading-6 text-[#175451]"><p className="font-bold">{text('إرشادات الدفع', 'Payment guidance')}</p><p className="mt-1 whitespace-pre-line">{paymentGuidance}</p></div> : null}
            {paymentOptions.length > 0 ? <div id="paymentMethod" className={`mt-4 grid gap-2 ${paymentOptions.length === 1 ? 'grid-cols-1' : paymentOptions.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
              {paymentOptions.map((option) => (
                <label key={option.value} className="cursor-pointer rounded-xl border border-[#0D7D78]/15 p-3 text-center text-sm font-bold has-[:checked]:border-[#0D7D78] has-[:checked]:bg-[#9FD9C2]/30">
                  <input className="sr-only" type="radio" value={option.value} aria-invalid={Boolean(errors.paymentMethod)} {...register('paymentMethod', { required: true })} />
                  {option.label}
                </label>
              ))}
            </div> : <div className="mt-4 rounded-2xl bg-[#FFD14D]/20 p-4 text-sm text-[#075f5b]">{text('يجري إعداد بيانات التحويل. تواصل معنا قبل الدفع.', 'Transfer details are being prepared. Please contact us before paying.')}</div>}
            {!quoteReady ? (
              <div className="mt-4 rounded-2xl bg-[#9FD9C2]/25 p-4 text-sm text-[#175451]">
                {quoteQuery.isFetching
                  ? text('نحدّث إجمالي طلبك…', 'Updating your order total…')
                  : quoteError ?? text('اختر المحافظة ثم طبّق كود الخصم — إن وُجد — لإظهار مبلغ التحويل.', 'Choose a governorate, then apply a promo code if you have one, to reveal the transfer amount.')}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-[#9FD9C2]/25 p-4 text-sm">
                <strong>{text('بيانات التحويل', 'Transfer details')}</strong>
                {paymentConfigured ? <><p className="mt-1 whitespace-pre-line text-[#47716e]">{paymentInstruction}</p>{paymentLink ? <a className="mint-cta mt-3 inline-flex rounded-2xl px-4 py-2 text-sm" href={paymentLink} target="_blank" rel="noreferrer">{text('فتح رابط الدفع', 'Open payment link')}</a> : null}</> : <p className="mt-1 text-[#075f5b]">{text('اختر طريقة تحويل متاحة أو تواصل معنا.', 'Choose an available transfer method or contact us.')}</p>}
              </div>
            )}
            {errors.paymentMethod ? <InlineFieldError id="paymentMethod-error" error={errors.paymentMethod} name="paymentMethod" text={text} /> : null}
            <label className={`mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#0D7D78]/45 bg-[#9FD9C2]/15 px-4 py-6 text-sm font-bold text-[#075f5b] ${paymentReady ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'}`}>
              <Upload size={18} />
              {proofFile ? proofFile.name : text('ارفع لقطة شاشة التحويل', 'Upload transfer screenshot')}
              <input id="paymentProof" className="sr-only" type="file" disabled={!paymentReady} accept="image/jpeg,image/png,image/webp" aria-describedby={proofError ? 'paymentProof-error' : undefined} onChange={(event) => selectProofFile(event.target.files?.[0] ?? null)} />
            </label>
            {proofError ? <p id="paymentProof-error" className="mt-2 text-sm font-medium text-red-700" role="alert">{proofError}</p> : <p className="mt-2 text-xs leading-5 text-[#47716e]">{text('JPG أو PNG أو WebP حتى ١٠ ميجابايت. لا نحفظ لقطة الشاشة تلقائيًا عند تحديث الصفحة.', 'JPG, PNG, or WebP up to 10 MB. This screenshot is never saved automatically when you refresh.')}</p>}
          </fieldset>
        </section>

        <aside className="h-fit rounded-3xl bg-[#9FD9C2]/30 p-6 lg:sticky lg:top-24">
          <h2 className="mint-heading text-2xl text-[#075f5b]">{text('ملخص نهائي', 'Final summary')}</h2>
          <div className="mt-5 space-y-3 text-sm">
            {items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <span><strong className="block">{item.productTitle} × {item.quantity}</strong><small className="text-[#47716e]">{cartItemPersonalizationLabel(item, text)}</small></span>
                <span className="flex items-center gap-2"><strong>{formatMoney(cartItemTotal(item), locale)}</strong><button type="button" disabled={isRemovingItemId !== null} onClick={() => void removeItem(item.id)} className="text-[#47716e] hover:text-red-700 disabled:opacity-50" aria-label={text('إزالة القصة', 'Remove story')}>{isRemovingItemId === item.id ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}</button></span>
              </div>
            ))}
            <div className="border-t border-[#0D7D78]/15 pt-3">
              <div className="flex justify-between"><span>{text('إجمالي الكتب', 'Books subtotal')}</span><strong>{formatMoney(quote?.subtotalAmount ?? estimatedSubtotalAmount, locale)}</strong></div>
              {quote?.promoDiscountAmount ? <div className="mt-2 flex justify-between text-[#3e7f43]"><span>{text('الخصم', 'Discount')}</span><strong>−{formatMoney(quote.promoDiscountAmount, locale)}</strong></div> : null}
              <div className="mt-2 flex justify-between"><span>{text('الشحن', 'Shipping')}</span><strong>{quote ? (quote.shippingFeeAmount === 0 ? text('مجاني', 'Free') : formatMoney(quote.shippingFeeAmount, locale)) : governorateCode ? '…' : '—'}</strong></div>
            </div>
          </div>
          <label className="mt-5 block text-sm font-bold text-[#175451]" htmlFor="promoCode">
            {text('كود الخصم', 'Promo code')}
            <div className="mt-2 flex gap-2" dir="ltr">
              <input id="promoCode" aria-invalid={Boolean(errors.promoCode)} aria-describedby={errors.promoCode ? 'promoCode-error' : undefined} className={`min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5 font-normal outline-none focus:border-[#0D7D78] ${errors.promoCode ? 'border-red-500' : 'border-[#0D7D78]/20'}`} maxLength={40} {...register('promoCode', { maxLength: 40 })} />
              <button className="rounded-xl border border-[#0D7D78] px-3 text-sm font-bold text-[#075f5b]" type="button" onClick={applyPromo}>{text('تطبيق', 'Apply')}</button>
            </div>
          </label>
          <InlineFieldError id="promoCode-error" error={errors.promoCode} name="promoCode" text={text} />
          {promoNeedsApply ? <p className="mt-2 text-xs leading-5 text-[#075f5b]">{text('اضغط «تطبيق» لتحديث الإجمالي قبل التحويل.', 'Press Apply to update the total before transferring.')}</p> : null}
          {quoteError ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{quoteError}</p> : null}
          <div className="mt-5 rounded-2xl bg-white p-4">
            <div className="flex items-end justify-between gap-3"><span className="mint-heading text-lg text-[#075f5b]">{text('المبلغ المطلوب تحويله', 'Amount to transfer')}</span><strong className="text-xl text-[#0D7D78]">{quote ? formatMoney(quote.totalAmount, locale) : '—'}</strong></div>
            <p className="mt-2 text-xs leading-5 text-[#47716e]">{quote ? text('يشمل الخصم والشحن. نتحقق من السعر مرة أخيرة عند إرسال الطلب.', 'Includes the promo and shipping. We verify the price once more when the order is submitted.') : text('يظهر بعد اختيار المحافظة.', 'Appears after you choose a governorate.')}</p>
          </div>
          <Link className="mt-4 block text-center text-sm font-bold text-[#0D7D78]" to={localizedPath('/stories')}>{text('إضافة منتج آخر', 'Add another product')}</Link>
          {submitError ? <div className="mt-4"><FormNotice>{submitError}</FormNotice></div> : null}
          <button disabled={isSubmitting || !paymentReady || Boolean(draftMessage)} className="mint-cta mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 disabled:opacity-60" type="submit">
            {isSubmitting ? <LoaderCircle className="animate-spin" size={18} /> : null}
            {isSubmitting ? text('جارٍ إرسال الطلب…', 'Submitting order…') : text('إرسال الطلب للمراجعة', 'Submit order for review')}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-[#47716e]">{text('لا يُنشأ طلب قبل رفع إثبات التحويل. يمكن إنشاء حساب لاحقًا فقط لمشاهدة سجل الطلبات.', 'No order is created until you upload the transfer proof. You can create an account later only to view order history.')}</p>
        </aside>
      </form>
    </main>
  )
}

function Field({ label, name, children, error, text }: { label: string; name: string; children: ReactNode; error?: FieldError; text: (arabic: string, english: string) => string }) {
  return <label className="block text-sm font-bold text-[#175451]">{label}<span className={`mt-2 block [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-[#0D7D78]/20 [&_input]:bg-white [&_input]:px-3 [&_input]:py-3 [&_input]:font-normal [&_input]:outline-none [&_input]:focus:border-[#0D7D78] [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-[#0D7D78]/20 [&_select]:bg-white [&_select]:px-3 [&_select]:py-3 [&_select]:font-normal [&_select]:outline-none [&_select]:focus:border-[#0D7D78] ${error ? '[&_input]:border-red-500 [&_input]:focus:border-red-600 [&_select]:border-red-500 [&_select]:focus:border-red-600' : ''}`}>{children}</span><InlineFieldError id={`${name}-error`} error={error} name={name} text={text} /></label>
}

export function OrderConfirmationPage() {
  const { orderNumber = '' } = useParams()
  const location = useLocation()
  const { locale, localizedPath, text } = useStoreLocale()
  const result = location.state as CartCheckoutResult | null
  const order = result?.order
  return <main className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8"><MintCompanion pose="happy" tone="mint" className="mx-auto max-w-md text-start" eyebrow={text('مِنت تحتفل', 'Mint is celebrating')} message={text('وصل طلبك! شكرًا لأنك صنعتِ معنا لحظة جميلة.', 'Your order is in! Thank you for making a lovely little moment with us.')} /><p className="mt-7 text-sm font-black text-[#0D7D78]">{text('تم استلام الطلب', 'Order received')}</p><h1 className="mint-heading mt-2 text-4xl text-[#075f5b]">{text('شكرًا، بدأنا المراجعة', 'Thank you — we’re reviewing it')}</h1><p className="mt-5 leading-7 text-[#47716e]">{text('رقم طلبك هو', 'Your order number is')} <strong dir="ltr">{order?.orderNumber ?? orderNumber}</strong>. {text('سنراجع إثبات الدفع ثم نحدّث الحالة.', 'We will review the payment proof and update its status.')}</p>{order ? <div className="mx-auto mt-7 max-w-sm rounded-3xl bg-[#9FD9C2]/25 p-5 text-start"><div className="flex justify-between"><span>{text('الإجمالي', 'Total')}</span><strong className="text-[#0D7D78]">{formatMoney(order.totalAmount, locale)}</strong></div><div className="mt-3 flex justify-between"><span>{text('الحالة', 'Status')}</span><strong>{text('جاري مراجعة الدفع', 'Payment under review')}</strong></div></div> : null}<div className="mt-8 flex flex-wrap justify-center gap-3"><Link className="mint-cta rounded-2xl px-6 py-3" to={localizedPath('/track-order')}>{text('تتبّع الطلب', 'Track order')}</Link><Link className="rounded-2xl border border-[#0D7D78]/20 bg-white px-6 py-3 font-black text-[#075f5b]" to={localizedPath('/stories')}>{text('تسوّق المزيد', 'Keep exploring')}</Link></div></main>
}
