import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { getSettings } from '../lib/api'
import {
  TRACKING_CONSENT_CHANGE_EVENT,
  activateTracking,
  deactivateTracking,
  forceCleanDocumentForSensitiveRoute,
  isTrackingEligiblePath,
  readTrackingConsent,
  trackingProviderSignature,
} from '../lib/tracking'

function localeForPath(pathname: string): 'ar' | 'en' {
  return pathname === '/ar' || pathname.startsWith('/ar/') ? 'ar' : 'en'
}

/**
 * Loads configured marketing vendors only after an explicit browser consent
 * decision. It has no visual output; the consent UI owns the customer prompt.
 */
export function TrackingManager() {
  const { pathname } = useLocation()
  const [consent, setConsent] = useState(readTrackingConsent)
  const eligible = isTrackingEligiblePath(pathname)
  const locale = localeForPath(pathname)
  const settingsQuery = useQuery({
    queryKey: ['settings', locale],
    queryFn: () => getSettings(locale),
    enabled: consent === 'granted' && eligible,
    // Detect a provider ID change even if the visitor leaves this tab open;
    // the signature guard below then swaps to a clean document.
    refetchInterval: 60_000,
  })
  const tracking = settingsQuery.data?.settings.tracking
  const loadedProviderSignature = useRef<string | null>(null)
  const providerConfigured = Boolean(
    tracking?.gtmContainerId
    || tracking?.ga4MeasurementId
    || tracking?.metaPixelId
    || tracking?.tiktokPixelId,
  )
  const configuredConsent = tracking ? readTrackingConsent(tracking) : consent
  const providerSignature = tracking ? trackingProviderSignature(tracking) : null

  /**
   * Vendor SDKs cannot reliably be unloaded from a document. Whenever a
   * consented visitor enters an admin, account, reset, order-tracking, or
   * confirmation route from a document that previously loaded them, replace
   * it with a clean document before that sensitive screen is painted. A
   * direct visit has no marked loader, so this cannot create a reload loop.
   */
  useLayoutEffect(() => {
    forceCleanDocumentForSensitiveRoute(
      pathname,
      Boolean(document.querySelector('script[data-mint-meow-tracking]')),
      () => {
        deactivateTracking()
        window.location.replace(window.location.href)
      },
    )
  }, [eligible, pathname])

  useEffect(() => {
    const syncConsent = () => setConsent(readTrackingConsent())
    window.addEventListener(TRACKING_CONSENT_CHANGE_EVENT, syncConsent)
    window.addEventListener('storage', syncConsent)
    return () => {
      window.removeEventListener(TRACKING_CONSENT_CHANGE_EVENT, syncConsent)
      window.removeEventListener('storage', syncConsent)
    }
  }, [])

  useEffect(() => {
    if (loadedProviderSignature.current !== null && providerSignature !== null && loadedProviderSignature.current !== providerSignature) {
      // Any added, removed, or replaced vendor requires a new document. This
      // clears the old SDK before the newly configured consent can activate.
      deactivateTracking()
      window.location.replace(window.location.href)
      return
    }
    if (configuredConsent !== 'granted' || !eligible || !tracking || !providerConfigured) {
      deactivateTracking()
      return
    }
    loadedProviderSignature.current = providerSignature
    activateTracking(tracking, pathname)
  }, [
    configuredConsent,
    eligible,
    pathname,
    tracking?.ga4MeasurementId,
    tracking?.gtmContainerId,
    tracking?.metaPixelId,
    tracking?.tiktokPixelId,
    providerConfigured,
    providerSignature,
  ])

  return null
}
