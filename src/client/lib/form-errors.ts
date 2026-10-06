import { ApiClientError, type ApiFieldError, type Locale } from './api'
import { formatMoney } from './format'

type Copy = { ar: string; en: string }

const messages: Record<string, Copy> = {
  required: { ar: 'هذا الحقل مطلوب.', en: 'This field is required.' },
  too_small: { ar: 'البيان أقصر من المطلوب.', en: 'This value is too short.' },
  too_big: { ar: 'البيان أطول من المسموح.', en: 'This value is too long.' },
  too_large: { ar: 'البيان أكبر من المسموح.', en: 'This value is too large.' },
  too_short: { ar: 'البيان أقصر من المطلوب.', en: 'This value is too short.' },
  too_long: { ar: 'البيان أطول من المسموح.', en: 'This value is too long.' },
  whole_number: { ar: 'أدخل رقمًا صحيحًا.', en: 'Enter a whole number.' },
  invalid_option: { ar: 'اختر إحدى القيم المتاحة.', en: 'Choose one of the available options.' },
  too_few_photos: { ar: 'أضف العدد المطلوب من الصور.', en: 'Add the required number of photos.' },
  too_many_photos: { ar: 'أضفت صورًا أكثر من المسموح.', en: 'You added more photos than allowed.' },
  invalid_story_language: { ar: 'اختر لغة قصة متاحة.', en: 'Choose an available story language.' },
  invalid_format: { ar: 'أدخل البيانات بالتنسيق الصحيح.', en: 'Enter this in the correct format.' },
  invalid_type: { ar: 'أدخل قيمة صحيحة.', en: 'Enter a valid value.' },
  invalid_value: { ar: 'اختر قيمة متاحة.', en: 'Choose an available value.' },
  invalid: { ar: 'راجع هذا الحقل ثم حاول مرة أخرى.', en: 'Review this field and try again.' },
  validation_failed: { ar: 'راجع الحقول المحددة ثم حاول مرة أخرى.', en: 'Review the highlighted fields and try again.' },
  invalid_input: { ar: 'راجع الحقول المحددة ثم حاول مرة أخرى.', en: 'Review the highlighted fields and try again.' },
  duplicate: { ar: 'هذه القيمة مستخدمة بالفعل.', en: 'This value is already in use.' },
  already_exists: { ar: 'هذه القيمة مستخدمة بالفعل.', en: 'This value is already in use.' },
  checkout_draft_expired: { ar: 'انتهت جلسة الطلب المؤقتة. أضف القصة مرة أخرى للمتابعة.', en: 'Your saved checkout has expired. Add the story again to continue.' },
  checkout_draft_conflict: { ar: 'تم تحديث الطلب في نافذة أخرى. حدّث الصفحة ثم حاول مرة أخرى.', en: 'This checkout changed in another tab. Refresh and try again.' },
  promo_not_found: { ar: 'كود الخصم غير صحيح. راجع كتابته أو تابع بدونه.', en: 'Code not found. Check the spelling or continue without a code.' },
  promo_inactive: { ar: 'هذا الكود غير متاح حاليًا. استخدم كودًا آخر أو تابع بدونه.', en: 'This code is inactive. Try another code or continue without it.' },
  promo_not_started: { ar: 'لم يبدأ هذا العرض بعد. استخدم كودًا آخر أو تابع بدونه.', en: 'This offer has not started yet. Try another code or continue without it.' },
  promo_limit_reached: { ar: 'تم استخدام هذا الكود بالكامل. استخدم كودًا آخر أو تابع بدونه.', en: 'This code has reached its usage limit. Try another code or continue without it.' },
  promo_minimum_not_met: { ar: 'لم يصل طلبك للحد الأدنى لهذا الكود. أضف منتجات أو تابع بدونه.', en: 'Your order is below this code’s minimum spend. Add products or continue without it.' },
  promo_code_unavailable: { ar: 'لم يعد هذا الكود متاحًا. استخدم كودًا آخر أو تابع بدونه.', en: 'This code is no longer available. Try another code or continue without it.' },
  email_verification_required: { ar: 'أكد بريدك الإلكتروني لعرض طلباتك.', en: 'Verify your email to view your orders.' },
  invalid_verification_token: { ar: 'انتهت صلاحية رابط التأكيد أو تم استخدامه. اطلب رابطًا جديدًا من حسابك.', en: 'This verification link has expired or was used. Request a new one from your account.' },
  email_in_use: { ar: 'يوجد حساب بهذا البريد. سجل الدخول أو أعد تعيين كلمة المرور.', en: 'An account already uses this email. Sign in or reset your password.' },
  review_already_submitted: { ar: 'لقد أرسلت تقييمًا لهذا الطلب بالفعل.', en: 'You have already submitted a review for this order.' },
  promo_invalid: { ar: 'رمز الخصم غير متاح لهذا الطلب.', en: 'This promo code is not available for this order.' },
  promo_expired: { ar: 'انتهت صلاحية رمز الخصم.', en: 'This promo code has expired.' },
  rate_limited: { ar: 'تمت محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.', en: 'Too many attempts. Please wait a moment and try again.' },
  network_error: { ar: 'تعذر الاتصال. تحقق من الإنترنت ثم حاول مرة أخرى.', en: 'We could not connect. Check your internet connection and try again.' },
  request_failed: { ar: 'تعذر إكمال الطلب الآن. حاول مرة أخرى.', en: 'We could not complete this request. Please try again.' },
}

function copyFor(locale: Locale, code: string, fallback: Copy) {
  return (messages[code] ?? fallback)[locale]
}

export function fieldErrorMessage(locale: Locale, error: ApiFieldError | undefined) {
  if (!error) return undefined
  return copyFor(locale, error.code, messages.invalid)
}

export function requestErrorMessage(locale: Locale, error: unknown, fallback?: Copy) {
  const defaultMessage = fallback ?? messages.request_failed
  if (error instanceof ApiClientError) {
    if (error.code === 'promo_minimum_not_met' && Number.isFinite(error.details.minimumSubtotalAmount) && Number.isFinite(error.details.shortfallAmount)) {
      const minimum = formatMoney(error.details.minimumSubtotalAmount, locale)
      const shortfall = formatMoney(error.details.shortfallAmount, locale)
      return locale === 'ar' ? `الحد الأدنى ${minimum}. أضف منتجات بقيمة ${shortfall} أو تابع بدون الكود.` : `Minimum spend is ${minimum}. Add ${shortfall} more in products or continue without this code.`
    }
    return copyFor(locale, error.code, defaultMessage)
  }
  if (error instanceof TypeError) return copyFor(locale, 'network_error', defaultMessage)
  return defaultMessage[locale]
}

export function fieldErrorsByPath(locale: Locale, error: unknown) {
  if (!(error instanceof ApiClientError)) return new Map<string, string>()
  return new Map(
    error.fieldErrors.map((item) => [item.path.join('.'), fieldErrorMessage(locale, item) ?? messages.invalid[locale]]),
  )
}
