import { Check } from 'lucide-react'
import { useStoreLocale } from '../lib/locale'

export function CheckoutProgress({ currentStep }: { currentStep: 1 | 2 }) {
  const { text } = useStoreLocale()
  const steps = [
    { number: 1, title: text('تخصيص القصة', 'Customize your story') },
    { number: 2, title: text('التوصيل والدفع', 'Delivery & payment') },
  ]

  return (
    <nav
      aria-label={text('مراحل إتمام الطلب', 'Checkout progress')}
      className="rounded-2xl border border-[#0D7D78]/15 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold text-[#0D7D78]">
          {text(`الخطوة ${currentStep} من ٢`, `Step ${currentStep} of 2`)}
        </p>
        <p className="text-xs text-[#47716e]">
          {currentStep === 1
            ? text('أضف تفاصيل القصة', 'Add story details')
            : text('راجع الإجمالي ثم أرسل التحويل', 'Review the total, then transfer')}
        </p>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-3">
        {steps.map((step) => {
          const isComplete = step.number < currentStep
          const isCurrent = step.number === currentStep
          return (
            <li
              key={step.number}
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold ${
                isCurrent ? 'bg-[#9FD9C2]/35 text-[#075f5b]' : 'bg-[#FAF8F3] text-[#47716e]'
              }`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${
                  isComplete || isCurrent ? 'bg-[#0D7D78] text-[#FAF8F3]' : 'bg-[#9FD9C2]/45 text-[#47716e]'
                }`}
              >
                {isComplete ? <Check size={14} /> : step.number}
              </span>
              <span>{step.title}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
