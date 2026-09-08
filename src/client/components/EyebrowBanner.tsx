import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStoreLocale } from '../lib/locale'

type EyebrowBannerProps = {
  className?: string
  priority?: boolean
  to?: string
}

/**
 * A reusable, full-bleed brand story banner. The supplied artwork contains
 * its own English headline, while the supporting caption stays localized so
 * the banner remains useful in both storefront languages.
 */
export function EyebrowBanner({ className = '', priority = false, to = '/stories' }: EyebrowBannerProps) {
  const { localizedPath, text } = useStoreLocale()

  return (
    <section className={`mx-auto max-w-7xl px-5 sm:px-8 ${className}`} aria-labelledby="eyebrow-banner-title">
      <div className="overflow-hidden rounded-[2rem] border border-[#0D7D78]/12 bg-white shadow-[0_16px_44px_rgba(7,95,91,.11)]">
        <Link to={localizedPath(to)} className="group block focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FFD14D]/70">
          <picture>
            <source srcSet="/brand/eyebrow-banner.jpg" type="image/jpeg" />
            <img
              src="/brand/eyebrow-banner.png"
              alt={text('قصص مخصّصة تجعل طفلك بطل المغامرة.', 'Personalized stories that make your child the hero of every adventure.')}
              width="1672"
              height="941"
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              decoding="async"
              className="block h-auto w-full transition duration-500 group-hover:scale-[1.01]"
            />
          </picture>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#0D7D78]/10 bg-[#FAF8F3] px-5 py-4 sm:px-7 sm:py-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[.14em] text-[#0D7D78]">{text('مغامرات تشبههم', 'Adventures made for them')}</p>
              <h2 id="eyebrow-banner-title" className="mint-heading mt-1 text-2xl text-[#075f5b] sm:text-3xl">{text('اجعل كل قصة تخصّهم وحدهم', 'Make every story theirs')}</h2>
            </div>
            <span className="mint-cta inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition group-hover:bg-[#ffe17d]">
              {text('اكتشف القصص', 'Explore stories')} <ArrowUpRight size={16} />
            </span>
          </div>
        </Link>
      </div>
    </section>
  )
}
