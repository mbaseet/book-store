import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, LoaderCircle, Upload, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCart } from '../features/cart/CartContext'
import {
  addCheckoutDraftItem,
  getProduct,
  uploadPrivateFile,
  type PersonalizationDefinition,
  type PersonalizationField,
  type Product,
} from '../lib/api'
import { formatMoney } from '../lib/format'
import { useStoreLocale } from '../lib/locale'
import { fieldErrorsByPath, requestErrorMessage } from '../lib/form-errors'
import { CheckoutProgress } from '../components/CheckoutProgress'
import { FormErrorSummary, FormNotice, InlineFieldError } from '../components/FormFeedback'
import { MarkdownContent } from '../components/MarkdownContent'
import { ProductGallery } from '../components/ProductGallery'
import { MintCompanion } from '../components/MintCompanion'

type ProductPurchaseForm = {
  quantity: number
}

type Text = (arabic: string, english: string) => string

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const STORY_LANGUAGE_OPTIONS = [
  { value: 'ar_msa', ar: 'العربية الفصحى', en: 'Modern Standard Arabic' },
  { value: 'ar_eg', ar: 'العامية المصرية', en: 'Egyptian Arabic' },
  { value: 'en', ar: 'الإنجليزية', en: 'English' },
] as const

function definitionFor(product: Product) {
  const candidate = product.personalizationDefinition
  if (!candidate || !Array.isArray(candidate.fields) || typeof candidate.version !== 'number') return null
  return candidate
}

function fieldText(value: PersonalizationField['label'] | PersonalizationField['help'], locale: 'ar' | 'en') {
  if (!value || typeof value !== 'object') return ''
  return value[locale] ?? value.en ?? value.ar ?? ''
}

function isPhotoField(field: PersonalizationField) {
  return field.type === 'photo'
}

function fieldId(key: string) {
  return `personalization-${key}`
}

function initialDynamicAnswers(definition: PersonalizationDefinition | null, locale: 'ar' | 'en') {
  const answers: Record<string, string> = {}
  for (const field of definition?.fields ?? []) {
    if (field.type === 'story_language' && field.required) answers[field.key] = locale === 'en' ? 'en' : 'ar_msa'
  }
  return answers
}

function photoLimits(field: PersonalizationField | undefined) {
  if (!field) return null
  const rawMinimum = field.required ? Math.max(1, field.min ?? 1) : field.min ?? 0
  const minimum = Math.min(2, Math.max(0, rawMinimum))
  const maximum = Math.min(2, Math.max(minimum, field.max ?? 2))
  return { minimum, maximum }
}

function photoCountMessage(minimum: number, maximum: number, text: Text) {
  if (minimum === maximum) {
    return text(`أضف ${minimum} صورة واضحة.`, `Add ${minimum} clear photo${minimum === 1 ? '' : 's'}.`)
  }
  return text(`أضف من ${minimum} إلى ${maximum} صور واضحة.`, `Add ${minimum} to ${maximum} clear photos.`)
}

export function ProductPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { replaceItems } = useCart()
  const { locale, localizedPath, text } = useStoreLocale()
  const productQuery = useQuery({ queryKey: ['product', locale, slug], queryFn: () => getProduct(locale, slug), enabled: Boolean(slug) })
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProductPurchaseForm>({
    defaultValues: { quantity: 1 },
    shouldFocusError: true,
    shouldUnregister: true,
  })
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({})
  const [dynamicErrors, setDynamicErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const product = productQuery.data?.product
  const definition = product ? definitionFor(product) : null
  const definitionFields = definition?.fields ?? []
  const configuredPhotoField = definitionFields.find(isPhotoField)
  const photoConfiguration = photoLimits(configuredPhotoField)
  const personalizationKey = product ? `${product.id}:${definition?.version ?? 'ready-product'}` : ''
  const quantity = Math.min(Math.max(watch('quantity') || 1, 1), 10)
  const selectedAddons = product?.addons.filter((addon) => selectedAddonIds.includes(addon.id)) ?? []
  const unitPrice = (product?.salePriceAmount ?? product?.basePriceAmount ?? 0) + selectedAddons.reduce((sum, addon) => sum + addon.priceAmount, 0)

  useEffect(() => {
    if (!product) return
    reset({ quantity: 1 })
    setSelectedAddonIds([])
    setFiles([])
    setDynamicErrors({})
    setDynamicValues(initialDynamicAnswers(definition, locale))
    setSubmitError(null)
  }, [definition, locale, personalizationKey, product, reset])

  const updateDynamicValue = (key: string, value: string) => {
    setDynamicValues((current) => ({ ...current, [key]: value }))
    setDynamicErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const setPhotoValidationError = (message: string | null) => {
    if (!configuredPhotoField) return
    setDynamicErrors((current) => {
      if (!message && !current[configuredPhotoField.key]) return current
      const next = { ...current }
      if (message) next[configuredPhotoField.key] = message
      else delete next[configuredPhotoField.key]
      return next
    })
  }

  const validatePhotoCount = () => {
    if (!photoConfiguration) return true
    const { minimum, maximum } = photoConfiguration
    if (files.length < minimum || files.length > maximum) {
      setPhotoValidationError(photoCountMessage(minimum, maximum, text))
      const id = fieldId(configuredPhotoField?.key ?? 'photos')
      window.setTimeout(() => document.getElementById(id)?.focus(), 0)
      return false
    }
    setPhotoValidationError(null)
    return true
  }

  const validateDynamicFields = () => {
    if (!definition) return { answers: {} }
    const nextErrors: Record<string, string> = {}
    const answers: Record<string, string | number> = {}

    for (const field of definition.fields) {
      if (field.type === 'photo') {
        if (photoConfiguration && (files.length < photoConfiguration.minimum || files.length > photoConfiguration.maximum)) {
          nextErrors[field.key] = photoCountMessage(photoConfiguration.minimum, photoConfiguration.maximum, text)
        }
        continue
      }

      const rawValue = dynamicValues[field.key] ?? ''
      const value = rawValue.trim()
      const label = fieldText(field.label, locale) || field.key
      if (!value) {
        if (field.required) nextErrors[field.key] = text(`أدخل ${label}.`, `Enter ${label}.`)
        continue
      }

      if (field.type === 'whole_number') {
        const parsed = Number(value)
        if (!Number.isInteger(parsed)) {
          nextErrors[field.key] = text(`${label} يجب أن يكون رقمًا صحيحًا.`, `${label} must be a whole number.`)
          continue
        }
        if (field.min !== null && field.min !== undefined && parsed < field.min) {
          nextErrors[field.key] = text(`${label} يجب ألا يقل عن ${field.min}.`, `${label} must be at least ${field.min}.`)
          continue
        }
        if (field.max !== null && field.max !== undefined && parsed > field.max) {
          nextErrors[field.key] = text(`${label} يجب ألا يزيد على ${field.max}.`, `${label} must be no more than ${field.max}.`)
          continue
        }
        answers[field.key] = parsed
        continue
      }

      if (field.type === 'single_select') {
        if (!(field.options ?? []).some((option) => option.value === value)) {
          nextErrors[field.key] = text(`اختر قيمة متاحة لـ ${label}.`, `Choose an available ${label}.`)
          continue
        }
        answers[field.key] = value
        continue
      }

      if (field.type === 'story_language') {
        if (!STORY_LANGUAGE_OPTIONS.some((option) => option.value === value)) {
          nextErrors[field.key] = text('اختر لغة قصة متاحة.', 'Choose an available story language.')
          continue
        }
        answers[field.key] = value
        continue
      }

      if (field.min !== null && field.min !== undefined && value.length < field.min) {
        nextErrors[field.key] = text(`${label} يحتاج ${field.min} أحرف على الأقل.`, `${label} needs at least ${field.min} characters.`)
        continue
      }
      if (field.max !== null && field.max !== undefined && value.length > field.max) {
        nextErrors[field.key] = text(`${label} يجب ألا يزيد على ${field.max} حرفًا.`, `${label} must be ${field.max} characters or fewer.`)
        continue
      }
      answers[field.key] = value
    }

    setDynamicErrors(nextErrors)
    const firstKey = Object.keys(nextErrors)[0]
    if (firstKey) window.setTimeout(() => document.getElementById(fieldId(firstKey))?.focus(), 0)
    return Object.keys(nextErrors).length === 0 ? { answers } : null
  }

  const selectFiles = (fileList: FileList | null) => {
    if (!photoConfiguration) return
    const selected = Array.from(fileList ?? [])
    if (selected.length === 0) return
    const invalid = selected.find((file) => !IMAGE_TYPES.has(file.type) || file.size > 10 * 1024 * 1024)
    if (invalid) {
      setPhotoValidationError(!IMAGE_TYPES.has(invalid.type)
        ? text('استخدم صورة JPG أو PNG أو WebP فقط.', 'Use a JPG, PNG, or WebP image only.')
        : text('يجب أن تكون كل صورة أصغر من ١٠ ميجابايت.', 'Each image must be smaller than 10 MB.'))
      return
    }
    const next = [...files, ...selected]
    if (next.length > photoConfiguration.maximum) {
      setPhotoValidationError(photoCountMessage(photoConfiguration.minimum, photoConfiguration.maximum, text))
      return
    }
    setFiles(next)
    setPhotoValidationError(next.length >= photoConfiguration.minimum ? null : photoCountMessage(photoConfiguration.minimum, photoConfiguration.maximum, text))
  }

  const removeFile = (index: number) => {
    const next = files.filter((_, fileIndex) => fileIndex !== index)
    setFiles(next)
    if (photoConfiguration) {
      setPhotoValidationError(next.length < photoConfiguration.minimum ? photoCountMessage(photoConfiguration.minimum, photoConfiguration.maximum, text) : null)
    }
  }

  const onSubmit = async (values: ProductPurchaseForm) => {
    if (!product) return
    setSubmitError(null)

    const dynamicValidation = definition ? validateDynamicFields() : { answers: {} }
    const photoIsValid = validatePhotoCount()
    if (!photoIsValid || !dynamicValidation) return

    setIsAdding(true)
    try {
      const childUploads = photoConfiguration
        ? await Promise.all(files.map((file) => uploadPrivateFile(locale, 'child_photo', file)))
        : []
      const baseInput = {
        productId: product.id,
        quantity: Math.min(Math.max(Number(values.quantity) || 1, 1), 10),
        addonIds: selectedAddons.map((addon) => addon.id),
        childUploads,
      }
      const draft = await addCheckoutDraftItem(locale, {
        ...baseInput,
        personalization: dynamicValidation.answers,
      })
      replaceItems(draft.draft.items)
      await queryClient.invalidateQueries({ queryKey: ['checkout-draft', locale] })
      navigate(localizedPath('/checkout'))
    } catch (error) {
      const serverErrors = fieldErrorsByPath(locale, error)
      const nextErrors: Record<string, string> = {}
      for (const field of definition?.fields ?? []) {
        const message = serverErrors.get(`personalization.${field.key}`)
          ?? (field.type === 'photo' ? serverErrors.get('childUploads') : undefined)
        if (message) nextErrors[field.key] = message
      }
      if (Object.keys(nextErrors).length > 0) setDynamicErrors((current) => ({ ...current, ...nextErrors }))
      setSubmitError(requestErrorMessage(locale, error, {
        ar: 'تعذر حفظ تفاصيل المنتج الآن. لم يُنشأ طلب؛ حاول مرة أخرى.',
        en: 'We could not save these product details. No order was created; please try again.',
      }))
    } finally {
      setIsAdding(false)
    }
  }

  if (productQuery.isLoading) return <main className="mx-auto max-w-7xl px-5 py-14 sm:px-8"><div className="h-96 animate-pulse rounded-[2rem] bg-[#9FD9C2]/25" /></main>
  if (!product) return <main className="mx-auto max-w-7xl px-5 py-14 sm:px-8"><p className="rounded-[2rem] bg-white p-8 text-center text-[#47716e]">{text('هذا المنتج غير متاح الآن.', 'This product is not available right now.')}</p></main>

  const dynamicHasSensitiveField = definitionFields.some((field) => field.sensitive)
  const photoError = configuredPhotoField ? dynamicErrors[configuredPhotoField.key] : undefined

  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
    <CheckoutProgress currentStep={1} />
    <Link to={localizedPath('/stories')} className="mt-6 inline-flex items-center gap-1 text-sm font-black text-[#0D7D78]"><ChevronLeft size={17} /> {text('كل المنتجات', 'All products')}</Link>
    <div className="mt-6 grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:gap-12">
      <section><ProductGallery media={product.media} productTitle={product.title} text={text} /></section>
      <section className="rounded-[2rem] bg-white p-5 shadow-[0_14px_40px_rgba(7,95,91,.08)] sm:p-7">
        <div className="flex flex-wrap items-center gap-2">{product.categories.length > 0 ? <p className="text-sm font-black text-[#0D7D78]">{product.categories.map((category) => category.name).join(' · ')}</p> : null}<span className={`rounded-full px-3 py-1 text-xs font-black ${definition ? 'bg-[#FFD14D] text-[#075f5b]' : 'bg-[#9FD9C2]/45 text-[#075f5b]'}`}>{definition ? text('مخصّص لك', 'Make it theirs') : text('جاهز للشحن', 'Ready to ship')}</span></div>
        <h1 className="mint-heading mt-3 text-4xl leading-tight tracking-tight text-[#075f5b] sm:text-5xl">{product.title}</h1>
        {product.description ? <MarkdownContent content={product.description} className="mt-5" /> : null}
        <div className="mt-6 flex items-baseline gap-2"><span className="text-2xl font-black text-[#0D7D78]">{formatMoney(product.salePriceAmount ?? product.basePriceAmount, locale)}</span>{product.salePriceAmount !== null ? <span className="text-[#7a9693] line-through">{formatMoney(product.basePriceAmount, locale)}</span> : null}</div>
        <form className="mt-8 space-y-6" noValidate onSubmit={handleSubmit(onSubmit)}>
          <FormErrorSummary errors={errors} text={text} />
          {Object.keys(dynamicErrors).length > 0 ? <PersonalizationErrorSummary errors={dynamicErrors} text={text} /> : null}

          {definition ? (
            <fieldset>
              <legend className="text-xl font-black text-[#075f5b]">{text('اجعله لهم', 'Make it theirs')}</legend>
              {definitionFields.length > 0 ? <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {definitionFields.filter((field) => field.type !== 'photo').map((field) => <PersonalizationInput key={field.key} field={field} locale={locale} text={text} value={dynamicValues[field.key] ?? ''} error={dynamicErrors[field.key]} onChange={(value) => updateDynamicValue(field.key, value)} />)}
              </div> : <p className="mt-3 text-sm leading-6 text-[#47716e]">{text('لا يحتاج هذا المنتج إلى تفاصيل إضافية قبل المتابعة.', 'This product does not need any additional details before you continue.')}</p>}
              {dynamicHasSensitiveField ? <SensitiveDataNotice text={text} /> : null}
            </fieldset>
          ) : <p className="rounded-2xl bg-[#9FD9C2]/25 p-4 text-sm font-semibold leading-6 text-[#175451]">{text('هذا منتج جاهز للشحن، لذا يمكنك المتابعة مباشرة إلى بيانات التوصيل والدفع.', 'This item is ready to ship, so you can continue straight to delivery and payment.')}</p>}

          {photoConfiguration ? <PhotoField
            id={fieldId(configuredPhotoField?.key ?? 'photos')}
            label={fieldText(configuredPhotoField?.label, locale)}
            help={fieldText(configuredPhotoField?.help, locale)}
            required={Boolean(configuredPhotoField?.required)}
            minimum={photoConfiguration.minimum}
            maximum={photoConfiguration.maximum}
            files={files}
            error={photoError}
            text={text}
            onChange={selectFiles}
            onRemove={removeFile}
          /> : null}

          {product.addons.length > 0 ? <fieldset><legend className="text-xl font-black text-[#075f5b]">{text('إضافات اختيارية', 'Optional add-ons')}</legend><div className="mt-3 space-y-2">{product.addons.map((addon) => <label key={addon.id} className="flex cursor-pointer items-center justify-between rounded-2xl border border-[#0D7D78]/10 bg-[#FAF8F3] p-4 transition hover:border-[#0D7D78]/40"><span className="flex items-center gap-3"><input type="checkbox" checked={selectedAddonIds.includes(addon.id)} onChange={() => setSelectedAddonIds((current) => current.includes(addon.id) ? current.filter((id) => id !== addon.id) : [...current, addon.id])} /><span><strong className="block">{addon.name}</strong>{addon.description ? <small className="text-[#47716e]">{addon.description}</small> : null}</span></span><span className="font-black text-[#0D7D78]">+{formatMoney(addon.priceAmount, locale)}</span></label>)}</div></fieldset> : null}

          <div className="max-w-32">
            <label className="text-sm font-black text-[#075f5b]" htmlFor="quantity">{text('الكمية', 'Quantity')}<input id="quantity" aria-invalid={Boolean(errors.quantity)} aria-describedby={errors.quantity ? 'quantity-error' : undefined} className={`mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:border-[#0D7D78] ${errors.quantity ? 'border-red-500' : 'border-[#0D7D78]/15'}`} type="number" min="1" max="10" {...register('quantity', { valueAsNumber: true, min: 1, max: 10 })} /></label>
          </div>
          <InlineFieldError id="quantity-error" error={errors.quantity} name="quantity" text={text} />
          <div className="flex items-center justify-between rounded-2xl bg-[#9FD9C2]/25 p-4 text-[#075f5b]"><span className="font-black">{text('إجمالي المنتج', 'Product total')}</span><span className="text-xl font-black text-[#0D7D78]">{formatMoney(unitPrice * quantity, locale)}</span></div>
          <FormNotice tone="info">{text('الخطوة التالية: اختر المحافظة، راجع الإجمالي النهائي، ثم أرسل إثبات التحويل. لا يلزم إنشاء حساب.', 'Next: choose a governorate, review the final total, then upload the transfer proof. No account is required.')}</FormNotice>
          {submitError ? <FormNotice>{submitError}</FormNotice> : null}
          <button disabled={isAdding} className="mint-cta flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FFD14D]/50 disabled:cursor-not-allowed disabled:opacity-60" type="submit">{isAdding ? <LoaderCircle className="animate-spin" size={18} /> : null}{isAdding ? text('يتم حفظ التفاصيل…', 'Saving details…') : definition ? text('تابع للتوصيل والدفع', 'Continue to delivery & payment') : text('أكمل الطلب', 'Continue to checkout')}</button>
        </form>
        <MintCompanion
          pose={definition ? 'exploring' : 'happy'}
          tone={definition ? 'mint' : 'cream'}
          className="mt-6"
          eyebrow={text('مِنت تقول', 'Mint says')}
          message={definition ? text('أضيفي التفاصيل التي تجعلها هدية تخصّهم وحدهم.', 'Add the little details that make this gift theirs alone.') : text('اختيار جميل! هذا المنتج جاهز ليصل إليكم.', 'Great pick! This one is ready to make its way to you.')}
        />
      </section>
    </div>
  </main>
}

function PersonalizationInput({ field, locale, text, value, error, onChange }: { field: PersonalizationField; locale: 'ar' | 'en'; text: Text; value: string; error?: string; onChange: (value: string) => void }) {
  const id = fieldId(field.key)
  const label = fieldText(field.label, locale) || field.key
  const help = fieldText(field.help, locale)
  const descriptionId = error ? `${id}-error` : help ? `${id}-help` : undefined
  const className = `mt-2 w-full rounded-xl border bg-[#FAF8F3] px-4 py-3 outline-none transition focus:border-[#0D7D78] focus:ring-4 focus:ring-[#9FD9C2]/35 ${error ? 'border-red-500' : 'border-[#0D7D78]/15'}`

  return <label className={`block text-sm font-black text-[#075f5b] ${field.type === 'long_text' ? 'sm:col-span-2' : ''}`} htmlFor={id}>{label}{field.required ? <span className="ms-1 text-[#0D7D78]" aria-hidden="true">*</span> : null}
    {field.type === 'long_text' ? <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} minLength={field.min ?? undefined} maxLength={field.max ?? undefined} aria-required={field.required || undefined} aria-invalid={Boolean(error)} aria-describedby={descriptionId} className={`${className} min-h-28 resize-y`} />
      : field.type === 'single_select' ? <select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-required={field.required || undefined} aria-invalid={Boolean(error)} aria-describedby={descriptionId} className={className}><option value="">{text('اختر', 'Select')}</option>{(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label[locale] ?? option.label.en ?? option.label.ar}</option>)}</select>
        : field.type === 'story_language' ? <select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-required={field.required || undefined} aria-invalid={Boolean(error)} aria-describedby={descriptionId} className={className}>{!field.required ? <option value="">{text('اختر', 'Select')}</option> : null}{STORY_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{text(option.ar, option.en)}</option>)}</select>
          : <input id={id} type={field.type === 'whole_number' ? 'number' : 'text'} step={field.type === 'whole_number' ? '1' : undefined} inputMode={field.type === 'whole_number' ? 'numeric' : undefined} value={value} onChange={(event) => onChange(event.target.value)} min={field.type === 'whole_number' ? field.min ?? undefined : undefined} max={field.type === 'whole_number' ? field.max ?? undefined : undefined} minLength={field.type !== 'whole_number' ? field.min ?? undefined : undefined} maxLength={field.type !== 'whole_number' ? field.max ?? undefined : undefined} aria-required={field.required || undefined} aria-invalid={Boolean(error)} aria-describedby={descriptionId} className={className} />}
    {help ? <small id={`${id}-help`} className="mt-1.5 block font-normal leading-5 text-[#47716e]">{help}</small> : null}
    {error ? <small id={`${id}-error`} className="mt-1.5 block font-medium text-red-700" role="alert">{error}</small> : null}
  </label>
}

function PhotoField({ id, label, help, required, minimum, maximum, files, error, text, onChange, onRemove }: {
  id: string
  label: string
  help: string
  required: boolean
  minimum: number
  maximum: number
  files: File[]
  error?: string | null
  text: Text
  onChange: (files: FileList | null) => void
  onRemove: (index: number) => void
}) {
  const guidance = help || text('لا نعرض الصور علنًا. تقبل صور JPG وPNG وWebP حتى ١٠ ميجابايت. تُحذف الصور بعد ٣٠ يومًا من تسليم الطلب أو إلغائه.', 'Photos are never public. JPG, PNG, and WebP up to 10 MB are accepted. Photos are deleted 30 days after delivery or cancellation.')
  return <fieldset>
    <legend className="text-xl font-black text-[#075f5b]">{label}{required ? <span className="ms-1 text-[#0D7D78]" aria-hidden="true">*</span> : null}</legend>
    <label className={`mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed bg-[#FAF8F3] px-4 py-6 text-sm font-black transition ${error ? 'border-red-400 text-red-700' : 'border-[#0D7D78]/45 text-[#0D7D78] hover:bg-[#9FD9C2]/20'}`}>
      <Upload size={18} />{minimum === maximum ? text(`ارفع ${minimum} صورة`, `Upload ${minimum} photo${minimum === 1 ? '' : 's'}`) : text(`ارفع من ${minimum} إلى ${maximum} صور`, `Upload ${minimum} to ${maximum} photos`)}
      <input id={id} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple={maximum > 1} aria-required={required || undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : `${id}-help`} onChange={(event) => { onChange(event.target.files); event.currentTarget.value = '' }} />
    </label>
    {files.length > 0 ? <ul className="mt-3 space-y-2" aria-label={text('الصور المختارة', 'Selected photos')}>{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-[#9FD9C2]/25 px-3 py-2 text-sm text-[#175451]"><span className="flex min-w-0 items-center gap-1"><Check size={14} className="shrink-0 text-[#0D7D78]" /><span className="truncate">{file.name}</span></span><button type="button" onClick={() => onRemove(index)} className="grid size-7 shrink-0 place-items-center rounded-full text-[#47716e] hover:bg-white hover:text-red-700" aria-label={text(`إزالة ${file.name}`, `Remove ${file.name}`)}><X size={15} /></button></li>)}</ul> : null}
    {error ? <p id={`${id}-error`} className="mt-2 text-sm font-medium text-red-700" role="alert">{error}</p> : null}
    <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-[#47716e]">{guidance}</p>
  </fieldset>
}

function SensitiveDataNotice({ text }: { text: Text }) {
  return <p className="mt-4 rounded-xl bg-[#9FD9C2]/25 p-3 text-xs leading-5 text-[#175451]">{text('نستخدم التفاصيل الحساسة المطلوبة فقط لتجهيز المنتج. تُحذف بعد ٣٠ يومًا من تسليم الطلب أو إلغائه.', 'We use requested sensitive details only to prepare this product. They are deleted 30 days after delivery or cancellation.')}</p>
}

function PersonalizationErrorSummary({ errors, text }: { errors: Record<string, string>; text: Text }) {
  const entries = Object.entries(errors)
  if (entries.length === 0) return null
  return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert" aria-live="assertive">
    <p className="font-bold">{text('راجِع بيانات التخصيص التالية:', 'Please review these personalization details:')}</p>
    <ul className="mt-2 list-inside list-disc space-y-1">{entries.map(([key, message]) => <li key={key}><a className="underline decoration-red-300 underline-offset-2 hover:decoration-red-700" href={`#${fieldId(key)}`}>{message}</a></li>)}</ul>
  </div>
}
