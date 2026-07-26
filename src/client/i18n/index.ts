import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import ar from './locales/ar.json'
import en from './locales/en.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
    },
    supportedLngs: ['ar', 'en'],
    fallbackLng: 'ar',
    detection: {
      order: ['path', 'cookie', 'navigator'],
      lookupFromPathIndex: 0,
      caches: ['cookie'],
      cookieOptions: {
        path: '/',
        maxAge: 365 * 24 * 60 * 60,
        sameSite: 'lax',
      },
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
