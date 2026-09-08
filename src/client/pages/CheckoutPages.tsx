import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useForm, useWatch, type FieldError } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgePercent, Banknote, LoaderCircle, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { CheckoutDraftDeliveryInput, CheckoutInput, CheckoutQuoteInput } from '@shared/contracts/checkout'
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
import { trackCommerceEvent } from '../lib/tracking'

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

type PaymentMethod = '' | 'instapay' | 'mobile_wallet' | 'cash_on_delivery'
type PaymentPlan = '' | 'full_upfront' | 'personalized_deposit_cod' | 'cash_on_delivery'

type PhaseOneQuote = {
  /**
   * These are supplied by the Phase 1 pricing API. Keeping them optional here
   * lets an older saved draft render safely while the Worker is being rolled
   * out, but submitted amounts always remain server-authoritative.
   */
  instapayDiscountAmount?: number
  amountDueNow?: number
  amountDueOnDelivery?: number
  personalizedSubtotalAmount?: number
  personalizedDiscountedSubtotalAmount?: number
}

type PhaseOneOrder = CartCheckoutResult['order'] & {
  paymentPlan?: Exclude<PaymentPlan, ''>
  paymentStatus?: string
  amountDueNow?: number
  amountDueOnDelivery?: number
}

type CheckoutForm = {
  customerName: string
  email: string
  phone: string
  governorateCode: string
  city: string
  addressLine1: string
  addressLine2: string
  addressNote: string
  paymentPlan: PaymentPlan
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
    paymentPlan: '',
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
    paymentPlan: values.paymentPlan,
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
  const deliverySavePromise = useRef<Promise<void> | null>(null)
  const checkoutCompleted = useRef(false)
  const proofPaymentContext = useRef<string | null>(null)
  const begunCheckoutSignature = useRef<string | null>(null)
  const paymentInfoSignature = useRef<string | null>(null)
  const governorateCode = watch('governorateCode')
  const paymentPlan = watch('paymentPlan')
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
    const delivery = { ...emptyDelivery(), ...savedDelivery } as CheckoutForm
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
      { value: 'instapay' as const, label: 'InstaPay', iconSrc: '/brand/payment-instapay.svg', instruction: paymentDetails?.instapay ?? null },
      { value: 'mobile_wallet' as const, label: text('محفظة إلكترونية', 'Mobile wallet'), iconSrc: '/brand/payment-ewallet.svg', instruction: paymentDetails?.mobileWallet ?? null },
    ].filter((option) => Boolean(option.instruction?.trim())),
    [paymentDetails, text],
  )

  const hasPersonalizedItems = useMemo(
    () => items.some((item) => Boolean(item.personalizationDefinition)),
    [items],
  )
  const trackingItems = useMemo(
    () => items.map((item) => ({
      itemId: item.productId,
      quantity: item.quantity,
      priceAmount: (item.salePriceAmount ?? item.basePriceAmount) + item.addons.reduce((sum, addon) => sum + addon.priceAmount, 0),
    })),
    [items],
  )
  const trackingItemsSignature = useMemo(
    () => trackingItems.map((item) => `${item.itemId}:${item.quantity}:${item.priceAmount}`).join('|'),
    [trackingItems],
  )
  useEffect(() => {
    if (!trackingItems.length || begunCheckoutSignature.current === trackingItemsSignature) return
    begunCheckoutSignature.current = trackingItemsSignature
    trackCommerceEvent('begin_checkout', {
      items: trackingItems,
      valueAmount: estimatedSubtotalAmount,
    })
  }, [estimatedSubtotalAmount, trackingItems, trackingItemsSignature])
  useEffect(() => {
    if (paymentPlan === 'cash_on_delivery') {
      if (paymentMethod !== 'cash_on_delivery') setValue('paymentMethod', 'cash_on_delivery')
      return
    }
    if (paymentOptions.length > 0 && !paymentOptions.some((option) => option.value === paymentMethod)) {
      setValue('paymentMethod', paymentOptions[0].value)
    }
  }, [paymentMethod, paymentOptions, paymentPlan, setValue])

  useEffect(() => {
    const planIsValid = paymentPlan === 'full_upfront'
      || (hasPersonalizedItems && paymentPlan === 'personalized_deposit_cod')
      || (!hasPersonalizedItems && paymentPlan === 'cash_on_delivery')
    if (planIsValid) return
    setValue('paymentPlan', hasPersonalizedItems ? 'personalized_deposit_cod' : 'cash_on_delivery')
  }, [hasPersonalizedItems, paymentPlan, setValue])

  const paymentContextKey = `${paymentPlan}:${paymentMethod}`
  useEffect(() => {
    if (proofPaymentContext.current === null) {
      proofPaymentContext.current = paymentContextKey
      return
    }
    if (proofPaymentContext.current === paymentContextKey) return
    proofPaymentContext.current = paymentContextKey
    setProofFile(null)
    setProofError(null)
  }, [paymentContextKey])

  const deliveryToSave = useMemo(
    () => asDraftDelivery({ ...emptyDelivery(), ...watchedDelivery }, appliedPromoCode),
    [appliedPromoCode, watchedDelivery],
  )
  const deliveryFingerprint = JSON.stringify(deliveryToSave)
  const flushDeliverySave = useCallback(async () => {
    if (checkoutCompleted.current || !pendingDeliverySave.current) return
    if (deliverySavePromise.current) return deliverySavePromise.current
    setIsSavingDraft(true)
    const save = (async () => {
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
    })()
    deliverySavePromise.current = save
    try {
      await save
    } finally {
      deliverySavePromise.current = null
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
  const quotePaymentMethod = paymentPlan === 'cash_on_delivery'
    ? 'cash_on_delivery'
    : paymentMethod === 'cash_on_delivery'
      ? paymentOptions[0]?.value
      : paymentMethod || undefined
  const quoteQuery = useQuery({
    queryKey: ['checkout-quote', locale, governorateCode, appliedPromoCode, paymentPlan, quotePaymentMethod, quoteItems],
    queryFn: () => getCheckoutQuote(locale, {
      governorateCode,
      promoCode: appliedPromoCode || undefined,
      items: quoteItems,
      paymentPlan: paymentPlan || undefined,
      paymentMethod: quotePaymentMethod,
    } as CheckoutQuoteInput),
    enabled: Boolean(governorateCode) && quoteItems.length > 0,
    retry: false,
  })
  const quote = quoteQuery.data?.quote
  const phaseOneQuote = quote as (typeof quote & PhaseOneQuote) | undefined
  const promoNeedsApply = (promoCodeValue.trim().toLocaleUpperCase('en-US')) !== appliedPromoCode
  const requiresManualPayment = paymentPlan !== 'cash_on_delivery'
  const selectedPayment = paymentOptions.find((option) => option.value === paymentMethod)
  const paymentInstruction = selectedPayment?.instruction ?? null
  const paymentLink = extractSafePaymentLink(paymentInstruction)
  const paymentConfigured = !requiresManualPayment || Boolean(paymentInstruction?.trim())
  const quoteReady = Boolean(quote) && !quoteQuery.isFetching && !promoNeedsApply
  const paymentReady = quoteReady && paymentConfigured
  const productSubtotalAmount = quote?.subtotalAmount ?? estimatedSubtotalAmount
  const promoDiscountAmount = quote?.promoDiscountAmount ?? 0
  const standardTotalAmount = quote?.totalAmount ?? 0
  const fullPaymentInstapayDiscountAmount = paymentPlan === 'full_upfront' && paymentMethod === 'instapay'
    ? phaseOneQuote?.instapayDiscountAmount ?? Math.min(Math.floor(Math.max(0, productSubtotalAmount - promoDiscountAmount) * 0.05), 3000)
    : 0
  const localPersonalizedSubtotalAmount = useMemo(
    () => items.filter((item) => Boolean(item.personalizationDefinition)).reduce((sum, item) => sum + cartItemTotal(item), 0),
    [items],
  )
  const localPromoShareForPersonalized = productSubtotalAmount > 0
    ? Math.round((promoDiscountAmount * localPersonalizedSubtotalAmount) / productSubtotalAmount)
    : 0
  const localPersonalizedAfterPromoAmount = phaseOneQuote?.personalizedDiscountedSubtotalAmount
    ?? Math.max(0, (phaseOneQuote?.personalizedSubtotalAmount ?? localPersonalizedSubtotalAmount) - localPromoShareForPersonalized)
  const fallbackDepositAmount = Math.ceil(localPersonalizedAfterPromoAmount / 2)
  const fallbackAmountDueNow = paymentPlan === 'full_upfront'
    ? Math.max(0, standardTotalAmount - fullPaymentInstapayDiscountAmount)
    : paymentPlan === 'personalized_deposit_cod'
      ? fallbackDepositAmount
      : 0
  const fallbackAmountDueOnDelivery = paymentPlan === 'full_upfront'
    ? 0
    : paymentPlan === 'personalized_deposit_cod'
      ? Math.max(0, standardTotalAmount - fallbackDepositAmount)
      : standardTotalAmount
  const amountDueNow = phaseOneQuote?.amountDueNow ?? fallbackAmountDueNow
  const amountDueOnDelivery = phaseOneQuote?.amountDueOnDelivery ?? fallbackAmountDueOnDelivery
  useEffect(() => {
    if (
      !quoteReady
      || !paymentPlan
      || (paymentMethod !== 'instapay' && paymentMethod !== 'mobile_wallet' && paymentMethod !== 'cash_on_delivery')
    ) {
      return
    }
    const signature = `${trackingItemsSignature}:${paymentPlan}:${paymentMethod}:${quote?.totalAmount ?? ''}`
    if (paymentInfoSignature.current === signature) return
    paymentInfoSignature.current = signature
    trackCommerceEvent('add_payment_info', {
      paymentMethod,
      items: trackingItems,
      valueAmount: quote?.totalAmount,
    })
  }, [paymentMethod, paymentPlan, quote?.totalAmount, quoteReady, trackingItems, trackingItemsSignature])
  const paymentPlanOptions: Array<{ value: Exclude<PaymentPlan, ''>; title: string }> = [
    {
      value: 'full_upfront',
      title: text('ادفع كامل المبلغ الآن', 'Pay in full now'),
    },
    ...(hasPersonalizedItems ? [{
      value: 'personalized_deposit_cod' as const,
      title: text('50% عربون + الباقي عند الاستلام', '50% deposit + the rest on delivery'),
    }] : [{
      value: 'cash_on_delivery' as const,
      title: text('الدفع عند الاستلام', 'Cash on delivery'),
    }]),
  ]
  const submitReady = paymentReady && (!requiresManualPayment || Boolean(proofFile))
  const submitLabel = paymentPlan === 'cash_on_delivery'
    ? text('تأكيد طلب الدفع عند الاستلام', 'Place cash-on-delivery order')
    : paymentPlan === 'personalized_deposit_cod'
      ? text('إرسال العربون للمراجعة', 'Send deposit for review')
      : text('إرسال الدفع للمراجعة', 'Send payment for review')
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
    const isCashOnDelivery = values.paymentPlan === 'cash_on_delivery'
    if (!values.paymentPlan) {
      setSubmitError(text('اختر طريقة الدفع المناسبة لإرسال الطلب.', 'Choose how you would like to pay before submitting your order.'))
      return
    }
    if (!isCashOnDelivery && (!paymentConfigured || !values.paymentMethod || values.paymentMethod === 'cash_on_delivery')) {
      setSubmitError(text('لا توجد طريقة تحويل متاحة بعد. تواصل معنا للمساعدة.', 'No transfer method is available yet. Please contact us for help.'))
      return
    }
    if (!isCashOnDelivery && !proofFile) {
      setProofError(text('ارفع لقطة شاشة التحويل لإرسال الطلب.', 'Upload the transfer screenshot to submit your order.'))
      document.getElementById('paymentProof')?.focus()
      return
    }
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const paymentProofUpload = isCashOnDelivery || !proofFile
        ? undefined
        : await uploadPrivateFile(locale, 'payment_proof', proofFile)
      const result = await createCheckout(locale, {
        customerName: values.customerName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        governorateCode: values.governorateCode,
        city: values.city.trim(),
        addressLine1: values.addressLine1.trim(),
        addressLine2: values.addressLine2.trim() || undefined,
        addressNote: values.addressNote.trim() || undefined,
        paymentPlan: values.paymentPlan,
        paymentMethod: isCashOnDelivery ? 'cash_on_delivery' : values.paymentMethod,
        ...(paymentProofUpload ? { paymentProofUpload } : {}),
        promoCode: appliedPromoCode || undefined,
      } as CheckoutInput)
      trackCommerceEvent('purchase', {
        items: items.map((item) => ({
          itemId: item.productId,
          quantity: item.quantity,
          priceAmount: (item.salePriceAmount ?? item.basePriceAmount) + item.addons.reduce((sum, addon) => sum + addon.priceAmount, 0),
        })),
        valueAmount: result.order.totalAmount,
      })
      checkoutCompleted.current = true
      clearCart()
      queryClient.setQueryData(['checkout-draft', locale], { draft: null })
      navigate(localizedPath(`/order-confirmation/${result.order.orderNumber}`), { state: result })
    } catch (error) {
      const serverErrors = fieldErrorsByPath(locale, error)
      const fields: Array<keyof CheckoutForm> = ['customerName', 'email', 'phone', 'governorateCode', 'city', 'addressLine1', 'addressLine2', 'addressNote', 'paymentPlan', 'paymentMethod', 'promoCode']
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
          {text('أكمل كضيف — لا تحتاج إلى حساب. اختر تفاصيل التوصيل لنوضح لك خيارات الدفع والمبلغ الدقيق بهدوء.', 'Check out as a guest — no account is needed. Add delivery details and we’ll clearly show your payment choices and exact total.')}
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
            <p className="mt-3 text-sm leading-6 text-[#47716e]">{text('نحتاج فقط للتفاصيل التي تساعدنا في توصيل فرحتك بدقة.', 'Just the details we need to deliver your little moment accurately.')}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={text('الاسم بالكامل', 'Full name')} name="customerName" error={errors.customerName} text={text}><input id="customerName" autoComplete="name" aria-invalid={Boolean(errors.customerName)} aria-describedby={errors.customerName ? 'customerName-error' : undefined} {...register('customerName', { required: true, minLength: 2, maxLength: 120 })} /></Field>
              <Field label={text('رقم الهاتف', 'Phone')} name="phone" error={errors.phone} text={text}><input id="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'phone-error' : undefined} {...register('phone', { required: true, minLength: 7, maxLength: 30 })} /></Field>
              <Field label={text('المحافظة', 'Governorate')} name="governorateCode" error={errors.governorateCode} text={text}>
                <select id="governorateCode" aria-invalid={Boolean(errors.governorateCode)} aria-describedby={errors.governorateCode ? 'governorateCode-error' : undefined} {...register('governorateCode', { required: true })}>
                  <option value="">{text('اختر المحافظة', 'Select governorate')}</option>
                  {(governoratesQuery.data?.governorates ?? []).map((governorate) => <option key={governorate.code} value={governorate.code}>{governorate.name}</option>)}
                </select>
              </Field>
              <Field label={text('المدينة / المنطقة', 'City / area')} name="city" error={errors.city} text={text}><input id="city" autoComplete="address-level2" aria-invalid={Boolean(errors.city)} aria-describedby={errors.city ? 'city-error' : undefined} {...register('city', { required: true, minLength: 2, maxLength: 100 })} /></Field>
              <div className="sm:col-span-2">
                <Field label={text('تفاصيل العنوان', 'Address details')} name="addressLine1" error={errors.addressLine1} text={text}>
                  <textarea id="addressLine1" rows={3} autoComplete="street-address" aria-invalid={Boolean(errors.addressLine1)} aria-describedby={errors.addressLine1 ? 'addressLine1-error' : undefined} {...register('addressLine1', { required: true, minLength: 5, maxLength: 250 })} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label={text('البريد الإلكتروني (اختياري)', 'Email (optional)')} name="email" error={errors.email} text={text}><input id="email" type="email" inputMode="email" autoComplete="email" dir="ltr" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} {...register('email', { maxLength: 254, validate: (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) })} /></Field>
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-3xl border border-[#0D7D78]/12 bg-white p-6 shadow-sm">
            <legend className="mint-heading px-1 text-2xl text-[#075f5b]">{text('اختاري طريقة الدفع', 'Choose how to pay')}</legend>

            <div id="paymentPlan" className="mt-4 grid gap-3">
              {paymentPlanOptions.map((option) => (
                <label key={option.value} className={`cursor-pointer rounded-2xl border p-4 transition-colors has-[:checked]:border-[#0D7D78] has-[:checked]:bg-[#9FD9C2]/25 ${option.value === 'full_upfront' ? 'border-[#FFD14D]/80 bg-[#FFD14D]/10' : 'border-[#0D7D78]/15 bg-white'}`}>
                  <input className="sr-only" type="radio" value={option.value} aria-invalid={Boolean(errors.paymentPlan)} aria-describedby={errors.paymentPlan ? 'paymentPlan-error' : undefined} {...register('paymentPlan', { required: true })} />
                  <span className="flex items-start gap-3">
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${option.value === 'full_upfront' ? 'bg-[#FFD14D]/65 text-[#075f5b]' : 'bg-[#9FD9C2]/45 text-[#075f5b]'}`}>
                      {option.value === 'full_upfront' ? <BadgePercent size={19} aria-hidden="true" /> : option.value === 'cash_on_delivery' ? <Banknote size={19} aria-hidden="true" /> : <ShieldCheck size={19} aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-black text-[#075f5b]">
                        {option.title}
                        {option.value === 'full_upfront' ? <span className="rounded-full bg-[#FFD14D] px-2 py-0.5 text-xs text-[#075f5b]">{text('وفّر 5% مع InstaPay', 'Save 5% with InstaPay')}</span> : null}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {errors.paymentPlan ? <InlineFieldError id="paymentPlan-error" error={errors.paymentPlan} name="paymentPlan" text={text} /> : null}

            {requiresManualPayment ? <>
              <div className="mt-5 border-t border-[#0D7D78]/10 pt-5">
                <h3 className="text-sm font-black text-[#175451]">{paymentPlan === 'personalized_deposit_cod' ? text('طريقة دفع العربون', 'How to pay your deposit') : text('طريقة الدفع', 'Payment method')}</h3>
                {paymentOptions.length > 0 ? <div id="paymentMethod" className={`mt-3 grid gap-3 ${paymentOptions.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
                  {paymentOptions.map((option) => (
                    <label key={option.value} className={`cursor-pointer rounded-2xl border p-4 text-start transition-colors has-[:checked]:border-[#0D7D78] has-[:checked]:bg-[#9FD9C2]/25 ${option.value === 'instapay' ? 'border-[#FFD14D]/80 bg-[#FFD14D]/10' : 'border-[#0D7D78]/15 bg-white'}`}>
                      <input className="sr-only" type="radio" value={option.value} aria-invalid={Boolean(errors.paymentMethod)} aria-describedby={errors.paymentMethod ? 'paymentMethod-error' : undefined} {...register('paymentMethod', { required: true })} />
                      <span className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-xl ${option.value === 'instapay' ? 'w-12 bg-white p-1 ring-1 ring-[#7C559E]/10' : 'w-9 bg-[#9FD9C2]/45'}`}>
                          <img src={option.iconSrc} alt="" className={option.value === 'instapay' ? 'h-full w-full object-contain' : 'h-full w-full'} />
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-sm font-black text-[#075f5b]"><span>{option.label}</span>{option.value === 'instapay' ? <span className="rounded-full bg-[#FFD14D] px-2 py-0.5 text-xs text-[#075f5b]">{text('وفّر 5%', 'Save 5%')}</span> : null}</span>
                      </span>
                    </label>
                  ))}
                </div> : <div className="mt-3 rounded-2xl bg-[#FFD14D]/20 p-4 text-sm text-[#075f5b]">{text('يجري إعداد بيانات التحويل. تواصل معنا قبل الدفع.', 'Transfer details are being prepared. Please contact us before paying.')}</div>}
              </div>

              {paymentPlan === 'full_upfront' && paymentMethod === 'instapay' ? <div className="mt-4 rounded-2xl border border-[#FFD14D]/80 bg-[#FFD14D]/20 p-4 text-sm text-[#075f5b]" role="status" aria-live="polite">
                <div className="flex items-center gap-3"><BadgePercent className="shrink-0" size={20} aria-hidden="true" /><p className="font-black">{quoteReady ? text(`توفير InstaPay: ${formatMoney(fullPaymentInstapayDiscountAmount, locale)}`, `InstaPay saving: ${formatMoney(fullPaymentInstapayDiscountAmount, locale)}`) : text('خصم 5% مع InstaPay', '5% off with InstaPay')}</p></div>
              </div> : null}

              {paymentGuidance ? <div className="mt-4 rounded-2xl border border-[#9FD9C2] bg-[#9FD9C2]/20 p-4 text-sm leading-6 text-[#175451]"><p className="font-bold">{text('إرشادات الدفع', 'Payment guidance')}</p><p className="mt-1 whitespace-pre-line">{paymentGuidance}</p></div> : null}
              {!quoteReady ? (
                <div className="mt-4 rounded-2xl bg-[#9FD9C2]/25 p-4 text-sm text-[#175451]">
                  {quoteQuery.isFetching
                    ? text('نحدّث إجمالي طلبك…', 'Updating your order total…')
                    : quoteError ?? text('اختاري المحافظة ثم طبّقي كود الخصم — إن وُجد — لإظهار مبلغ الدفع.', 'Choose a governorate, then apply a promo code if you have one, to reveal your payment amount.')}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl bg-[#9FD9C2]/25 p-4 text-sm">
                  <div className="flex flex-wrap items-end justify-between gap-3"><strong>{paymentPlan === 'personalized_deposit_cod' ? text('العربون المطلوب الآن', 'Deposit due now') : text('المبلغ المطلوب دفعه الآن', 'Amount due now')}</strong><strong className="text-lg text-[#0D7D78]">{formatMoney(amountDueNow, locale)}</strong></div>
                  {paymentPlan === 'personalized_deposit_cod' ? <p className="mt-2 text-xs leading-5 text-[#47716e]">{text(`يتبقى ${formatMoney(amountDueOnDelivery, locale)} عند الاستلام.`, `${formatMoney(amountDueOnDelivery, locale)} remains due on delivery.`)}</p> : null}
                  {paymentConfigured ? <><p className="mt-3 whitespace-pre-line text-[#47716e]">{paymentInstruction}</p>{paymentLink ? <a className="mint-cta mt-3 inline-flex rounded-2xl px-4 py-2 text-sm" href={paymentLink} target="_blank" rel="noreferrer">{text('فتح رابط الدفع', 'Open payment link')}</a> : null}</> : <p className="mt-3 text-[#075f5b]">{text('اختاري طريقة تحويل متاحة أو تواصلي معنا.', 'Choose an available transfer method or contact us.')}</p>}
                </div>
              )}
              {errors.paymentMethod ? <InlineFieldError id="paymentMethod-error" error={errors.paymentMethod} name="paymentMethod" text={text} /> : null}
              <label className={`mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#0D7D78]/45 bg-[#9FD9C2]/15 px-4 py-6 text-sm font-bold text-[#075f5b] ${paymentReady ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'}`}>
                <Upload size={18} />
                {proofFile ? proofFile.name : paymentPlan === 'personalized_deposit_cod' ? text('ارفع لقطة شاشة العربون', 'Upload deposit screenshot') : text('ارفع لقطة شاشة التحويل', 'Upload transfer screenshot')}
                <input id="paymentProof" className="sr-only" type="file" disabled={!paymentReady} accept="image/jpeg,image/png,image/webp" aria-describedby={proofError ? 'paymentProof-error' : undefined} onChange={(event) => selectProofFile(event.target.files?.[0] ?? null)} />
              </label>
              {proofError ? <p id="paymentProof-error" className="mt-2 text-sm font-medium text-red-700" role="alert">{proofError}</p> : <p className="mt-2 text-xs leading-5 text-[#47716e]">{text('JPG أو PNG أو WebP حتى ١٠ ميجابايت. لا نحفظ لقطة الشاشة تلقائيًا عند تحديث الصفحة.', 'JPG, PNG, or WebP up to 10 MB. This screenshot is never saved automatically when you refresh.')}</p>}
            </> : <div className="mt-5 rounded-2xl border border-[#9FD9C2] bg-[#9FD9C2]/25 p-5 text-sm text-[#175451]" role="status">
              <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#075f5b]"><ShieldCheck size={20} aria-hidden="true" /></span><div><p className="font-black text-[#075f5b]">{text('الدفع عند الاستلام', 'Pay on delivery')}</p>{quoteReady ? <p className="mt-2 font-black text-[#075f5b]">{text(`المبلغ عند الاستلام: ${formatMoney(amountDueOnDelivery, locale)}`, `Due on delivery: ${formatMoney(amountDueOnDelivery, locale)}`)}</p> : <p className="mt-2 text-xs leading-5 text-[#47716e]">{text('اختاري المحافظة ليظهر المبلغ.', 'Choose a governorate to see the total.')}</p>}</div></div>
            </div>}
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
              {fullPaymentInstapayDiscountAmount > 0 ? <div className="mt-2 flex justify-between font-bold text-[#3e7f43]"><span>{text('توفير InstaPay', 'InstaPay saving')}</span><strong>−{formatMoney(fullPaymentInstapayDiscountAmount, locale)}</strong></div> : null}
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
            <div className="flex items-end justify-between gap-3"><span className="mint-heading text-lg text-[#075f5b]">{paymentPlan === 'cash_on_delivery' ? text('المبلغ عند الاستلام', 'Due on delivery') : paymentPlan === 'personalized_deposit_cod' ? text('المبلغ المطلوب الآن', 'Due now') : text('المبلغ المطلوب الآن', 'Due now')}</span><strong className="text-xl text-[#0D7D78]">{quote ? formatMoney(paymentPlan === 'cash_on_delivery' ? amountDueOnDelivery : amountDueNow, locale) : '—'}</strong></div>
            {quote && paymentPlan === 'personalized_deposit_cod' ? <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#0D7D78]/10 pt-3 text-sm"><span className="text-[#47716e]">{text('المتبقي عند الاستلام', 'Remaining on delivery')}</span><strong className="text-[#075f5b]">{formatMoney(amountDueOnDelivery, locale)}</strong></div> : null}
          </div>
          <Link className="mt-4 block text-center text-sm font-bold text-[#0D7D78]" to={localizedPath('/stories')}>{text('إضافة منتج آخر', 'Add another product')}</Link>
          {submitError ? <div className="mt-4"><FormNotice>{submitError}</FormNotice></div> : null}
          <button disabled={isSubmitting || !submitReady || Boolean(draftMessage)} className="mint-cta mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 disabled:opacity-60" type="submit">
            {isSubmitting ? <LoaderCircle className="animate-spin" size={18} /> : null}
            {isSubmitting ? text('جارٍ إرسال الطلب…', 'Submitting order…') : submitLabel}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-[#47716e]">{paymentPlan === 'cash_on_delivery' ? text('سنراجع بيانات الطلب ونؤكده قبل التجهيز. يمكنك إنشاء حساب لاحقًا فقط لمشاهدة سجل الطلبات.', 'We’ll review and confirm your order before preparing it. You can create an account later only to view order history.') : paymentPlan === 'personalized_deposit_cod' ? text('لا يبدأ تجهيز المنتج المخصص قبل مراجعة العربون. الباقي يُدفع عند الاستلام.', 'We begin preparing your personalized item after the deposit is reviewed; the rest is paid on delivery.') : text('لا يُنشأ طلب قبل رفع إثبات التحويل. يمكنك إنشاء حساب لاحقًا فقط لمشاهدة سجل الطلبات.', 'No order is created until you upload the transfer proof. You can create an account later only to view order history.')}</p>
        </aside>
      </form>
    </main>
  )
}

function Field({ label, name, children, error, text }: { label: string; name: string; children: ReactNode; error?: FieldError; text: (arabic: string, english: string) => string }) {
  return <label className="block text-sm font-bold text-[#175451]">{label}<span className={`mt-2 block [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-[#0D7D78]/20 [&_input]:bg-white [&_input]:px-3 [&_input]:py-3 [&_input]:font-normal [&_input]:outline-none [&_input]:focus:border-[#0D7D78] [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-[#0D7D78]/20 [&_select]:bg-white [&_select]:px-3 [&_select]:py-3 [&_select]:font-normal [&_select]:outline-none [&_select]:focus:border-[#0D7D78] [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-[#0D7D78]/20 [&_textarea]:bg-white [&_textarea]:px-3 [&_textarea]:py-3 [&_textarea]:font-normal [&_textarea]:outline-none [&_textarea]:focus:border-[#0D7D78] ${error ? '[&_input]:border-red-500 [&_input]:focus:border-red-600 [&_select]:border-red-500 [&_select]:focus:border-red-600 [&_textarea]:border-red-500 [&_textarea]:focus:border-red-600' : ''}`}>{children}</span><InlineFieldError id={`${name}-error`} error={error} name={name} text={text} /></label>
}

export function OrderConfirmationPage() {
  const { orderNumber = '' } = useParams()
  const location = useLocation()
  const { locale, localizedPath, text } = useStoreLocale()
  const result = location.state as CartCheckoutResult | null
  const order = result?.order as PhaseOneOrder | undefined
  const isCashOnDelivery = order?.paymentPlan === 'cash_on_delivery'
  const isDeposit = order?.paymentPlan === 'personalized_deposit_cod'
  const confirmationMessage = isCashOnDelivery
    ? text('سنراجع بيانات طلبك ونؤكده قبل التجهيز. الدفع سيكون عند الاستلام.', 'We’ll review and confirm your order before preparing it. Payment will be due on delivery.')
    : isDeposit
      ? text('سنراجع إثبات العربون، ثم نبدأ تجهيز منتجك المخصص. الباقي عند الاستلام.', 'We’ll review your deposit proof, then begin preparing your personalized item. The remainder is due on delivery.')
      : text('سنراجع إثبات الدفع ثم نحدّث الحالة.', 'We will review the payment proof and update its status.')

  return <main className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8"><MintCompanion pose="happy" tone="mint" className="mx-auto max-w-md text-start" eyebrow={text('مِنت تحتفل', 'Mint is celebrating')} message={text('وصل طلبك! شكرًا لأنك صنعتِ معنا لحظة جميلة.', 'Your order is in! Thank you for making a lovely little moment with us.')} /><p className="mt-7 text-sm font-black text-[#0D7D78]">{text('تم استلام الطلب', 'Order received')}</p><h1 className="mint-heading mt-2 text-4xl text-[#075f5b]">{text('شكرًا، بدأنا المراجعة', 'Thank you — we’re reviewing it')}</h1><p className="mt-5 leading-7 text-[#47716e]">{text('رقم طلبك هو', 'Your order number is')} <strong dir="ltr">{order?.orderNumber ?? orderNumber}</strong>. {confirmationMessage}</p>{order ? <div className="mx-auto mt-7 max-w-sm rounded-3xl bg-[#9FD9C2]/25 p-5 text-start"><div className="flex justify-between"><span>{text('الإجمالي', 'Total')}</span><strong className="text-[#0D7D78]">{formatMoney(order.totalAmount, locale)}</strong></div>{order.amountDueNow !== undefined ? <div className="mt-3 flex justify-between"><span>{text('المطلوب الآن', 'Due now')}</span><strong>{formatMoney(order.amountDueNow, locale)}</strong></div> : null}{order.amountDueOnDelivery ? <div className="mt-3 flex justify-between"><span>{text('عند الاستلام', 'Due on delivery')}</span><strong>{formatMoney(order.amountDueOnDelivery, locale)}</strong></div> : null}<div className="mt-3 flex justify-between"><span>{text('الحالة', 'Status')}</span><strong>{isCashOnDelivery ? text('بانتظار تأكيد الطلب', 'Awaiting order confirmation') : text('جاري مراجعة الدفع', 'Payment under review')}</strong></div></div> : null}<div className="mt-8 flex flex-wrap justify-center gap-3"><Link className="mint-cta rounded-2xl px-6 py-3" to={localizedPath('/track-order')}>{text('تتبّع الطلب', 'Track order')}</Link><Link className="rounded-2xl border border-[#0D7D78]/20 bg-white px-6 py-3 font-black text-[#075f5b]" to={localizedPath('/stories')}>{text('تسوّق المزيد', 'Keep exploring')}</Link></div></main>
}
