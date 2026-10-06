import { Link } from 'react-router-dom'
import { useStoreLocale } from '../lib/locale'
import type { BannerMedia } from '../lib/api'

type Props = { className?: string; priority?: boolean; to?: string; media?: BannerMedia | null; alt?: string }
export function EyebrowBanner({ className = '', priority = false, to = '/stories', media, alt }: Props) {
  const { locale, localizedPath, text } = useStoreLocale()
  const artwork = media?.[locale] ?? media?.en ?? media?.ar ?? { desktop: '/brand/ux-refresh/generic-banner.webp' }
  return <section className={`w-full ${className}`}>
    <Link to={localizedPath(to)} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#FFD14D]">
      <picture>
        {artwork.mobile ? <source media="(max-width: 639px)" srcSet={artwork.mobile} /> : null}
        <img src={artwork.desktop} alt={alt ?? text('اكتشف عوالم مِنت مياو — قصص مخصصة لطفلك', 'Discover Mint Meow worlds — personalized stories for your child')} className="block h-auto w-full" loading={priority ? 'eager' : 'lazy'} decoding="async" />
      </picture>
    </Link>
  </section>
}
