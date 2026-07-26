import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { FieldError, FieldErrors } from 'react-hook-form'
import type { ReactNode } from 'react'

type Text = (arabic: string, english: string) => string

const FIELD_LABELS: Record<string, [string, string]> = {
  childName: ['اسم الطفل', 'child’s name'],
  age: ['العمر', 'age'],
  gender: ['النوع', 'gender'],
  storyLanguage: ['لغة القصة', 'story language'],
  note: ['الملاحظة', 'note'],
  quantity: ['الكمية', 'quantity'],
  customerName: ['الاسم', 'name'],
  displayName: ['الاسم', 'name'],
  email: ['البريد الإلكتروني', 'email address'],
  phone: ['رقم الهاتف', 'phone number'],
  governorateCode: ['المحافظة', 'governorate'],
  city: ['المدينة / المنطقة', 'city or area'],
  addressLine1: ['العنوان', 'address'],
  addressLine2: ['تفاصيل العنوان', 'address details'],
  addressNote: ['ملاحظة التوصيل', 'delivery note'],
  paymentMethod: ['طريقة التحويل', 'transfer method'],
  promoCode: ['كود الخصم', 'promo code'],
  paymentProof: ['لقطة شاشة التحويل', 'transfer screenshot'],
  password: ['كلمة المرور', 'password'],
  orderNumber: ['رقم الطلب', 'order number'],
}

function labelFor(name: string, text: Text) {
  const label = FIELD_LABELS[name]
  return label ? text(label[0], label[1]) : text('هذا الحقل', 'this field')
}

export function formFieldError(name: string, error: FieldError | undefined, text: Text) {
  if (!error) return null
  const label = labelFor(name, text)
  if (error.message) return error.message

  switch (error.type) {
    case 'required':
      return text(`أدخل ${label}.`, `Enter ${label}.`)
    case 'minLength':
      return name === 'password'
        ? text('يجب أن تتكون كلمة المرور من ٨ أحرف على الأقل.', 'Your password must have at least 8 characters.')
        : text(`أدخل ${label} بشكل أكثر تفصيلًا.`, `Enter a little more detail for ${label}.`)
    case 'maxLength':
      return text(`اختصر ${label} قليلًا.`, `Shorten ${label} a little.`)
    case 'min':
      return name === 'quantity'
        ? text('اختر كمية لا تقل عن ١.', 'Choose at least 1 item.')
        : text(`أدخل قيمة أكبر لـ ${label}.`, `Enter a larger value for ${label}.`)
    case 'max':
      return name === 'quantity'
        ? text('يمكن طلب ١٠ كتب كحد أقصى في المرة الواحدة.', 'You can order up to 10 books at once.')
        : text(`أدخل قيمة أصغر لـ ${label}.`, `Enter a smaller value for ${label}.`)
    case 'pattern':
      return text(`تحقق من صيغة ${label}.`, `Check the format of ${label}.`)
    case 'validate':
      return text(`تحقق من ${label} وحاول مرة أخرى.`, `Check ${label} and try again.`)
    default:
      return text(`تحقق من ${label}.`, `Check ${label}.`)
  }
}

export function FormErrorSummary({ errors, text, title }: { errors: FieldErrors; text: Text; title?: string }) {
  const entries = Object.entries(errors).filter(([, error]) => error && typeof error === 'object') as Array<[string, FieldError]>
  if (entries.length === 0) return null

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert" aria-live="assertive" tabIndex={-1}>
      <div className="flex gap-2">
        <AlertCircle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
        <div>
          <p className="font-bold">{title ?? text('راجِع الحقول التالية قبل المتابعة:', 'Please review the following fields:')}</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {entries.map(([name, error]) => (
              <li key={name}>
                <a className="underline decoration-red-300 underline-offset-2 hover:decoration-red-700" href={`#${name}`}>
                  {formFieldError(name, error, text)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function InlineFieldError({ id, error, name, text }: { id: string; error?: FieldError; name: string; text: Text }) {
  const message = formFieldError(name, error, text)
  return message ? <p id={id} className="mt-1.5 text-sm font-medium text-red-700" role="alert">{message}</p> : null
}

export function FormNotice({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : tone === 'info'
      ? 'border-[#9FD9C2] bg-[#9FD9C2]/20 text-[#175451]'
      : 'border-red-200 bg-red-50 text-red-900'
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return <p className={`flex gap-2 rounded-xl border p-3 text-sm ${styles}`} role={tone === 'error' ? 'alert' : 'status'} aria-live="polite"><Icon className="mt-0.5 shrink-0" size={17} aria-hidden="true" /> <span>{children}</span></p>
}
