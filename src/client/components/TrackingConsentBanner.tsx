import { useEffect, useState } from 'react'
import { Cookie, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { TrackingSettings } from '../lib/api'
import {
  TRACKING_CONSENT_CHANGE_EVENT,
  readTrackingConsent,
  writeTrackingConsent,
} from '../lib/tracking'
import { useStoreLocale } from '../lib/locale'

function hasConfiguredTracking(tracking: TrackingSettings) {
  return Boolean(
    tracking.gtmContainerId
    || tracking.ga4MeasurementId
    || tracking.metaPixelId
    || tracking.tiktokPixelId,
  )
}

/**
 * This is deliberately absent until an administrator configures at least one
 * provider. The only persisted value is the visitor's allow/not-now choice;
 * it contains no browsing, cart, order, or personal information.
 */
export function TrackingConsentBanner({ tracking }: { tracking: TrackingSettings }) {
  const { localizedPath, text } = useStoreLocale()
  const [, setConsent] = useState(readTrackingConsent)

  useEffect(() => {
    const sync = () => setConsent(readTrackingConsent())
    window.addEventListener(TRACKING_CONSENT_CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(TRACKING_CONSENT_CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const matchingConsent = readTrackingConsent(tracking)
  if (!hasConfiguredTracking(tracking) || matchingConsent !== null) return null

  const choose = (value: 'granted' | 'denied') => {
    writeTrackingConsent(value, tracking)
    setConsent(value)
  }

  return (
    <section
      role="dialog"
      aria-label={text('اختيار الخصوصية', 'Privacy choice')}
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-xl rounded-3xl border border-[#0D7D78]/15 bg-[#FAF8F3]/95 p-4 text-start shadow-[0_18px_50px_rgba(7,95,91,.20)] backdrop-blur-xl sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#9FD9C2]/45 text-[#075f5b]"><Cookie size={19} aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="font-black text-[#075f5b]">{text('ساعدينا نتحسّن', 'Help Mint Meow improve')}</p>
          <p className="mt-1 text-xs leading-5 text-[#47716e]">
            {text(
              'بموافقتك قد تعمل أدوات التحليلات والإعلانات المعتمدة أثناء التصفح والدفع. نرسل لها أحداثًا مجهّلة فقط، وليس بيانات التواصل أو العنوان أو تفاصيل الطفل أو التخصيص أو إثبات الدفع.',
              'With your permission, approved analytics and ad tools may run while you browse and check out. We send them anonymous events only—not contact, address, child, personalization, or payment-proof details.',
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => choose('granted')} className="mint-cta inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs">
              <ShieldCheck size={15} aria-hidden="true" />
              {text('سماح', 'Allow')}
            </button>
            <button type="button" onClick={() => choose('denied')} className="rounded-xl border border-[#0D7D78]/15 bg-white px-3.5 py-2 text-xs font-black text-[#075f5b]">
              {text('لا، شكرًا', 'No thanks')}
            </button>
            <Link className="px-1 text-xs font-bold text-[#0D7D78] underline decoration-[#0D7D78]/35 underline-offset-4" to={localizedPath('/privacy')}>
              {text('الخصوصية', 'Privacy')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
