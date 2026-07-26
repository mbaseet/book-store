import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Locale } from './api'

export function useStoreLocale() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const locale: Locale = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'ar'
  const text = (arabic: string, english: string) => (locale === 'ar' ? arabic : english)
  const localizedPath = (path: string) => (locale === 'ar' ? `/ar${path === '/' ? '' : path}` : path)
  const switchLanguage = (nextLocale: Locale) => {
    const basePath = location.pathname.replace(/^\/(?:ar|en)(?=\/|$)/, '') || '/'
    void i18n.changeLanguage(nextLocale)
    navigate(nextLocale === 'ar' ? `/ar${basePath === '/' ? '' : basePath}` : basePath)
  }

  return { locale, text, localizedPath, switchLanguage }
}
