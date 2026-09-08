import { describe, expect, it } from 'vitest'
import { announcementBarSchema, trackingSettingsSchema, updateStoreSettingsSchema } from './content'

describe('announcement links', () => {
  it('accepts same-site story paths and HTTPS destinations', () => {
    expect(announcementBarSchema.safeParse({
      isEnabled: true,
      translations: [
        { locale: 'ar', text: 'قصة جديدة', href: '/stories' },
        { locale: 'en', text: 'A new story', href: 'https://example.com/stories' },
      ],
    }).success).toBe(true)
  })

  it('rejects unsafe or protocol-relative announcement links', () => {
    for (const href of ['javascript:alert(1)', 'http://example.com', '//example.com/stories', 'stories']) {
      expect(announcementBarSchema.safeParse({
        isEnabled: true,
        translations: [
          { locale: 'ar', text: 'قصة جديدة', href },
          { locale: 'en', text: 'A new story', href: '/stories' },
        ],
      }).success).toBe(false)
    }
  })
})

describe('tracking settings', () => {
  it('accepts only provider identifiers and normalizes Google IDs', () => {
    const result = trackingSettingsSchema.parse({
      gtmContainerId: ' gtm-ab12cd ',
      ga4MeasurementId: ' g-ab12cd ',
      metaPixelId: '123456789012345',
      tiktokPixelId: 'CABCdef123456',
    })

    expect(result).toEqual({
      gtmContainerId: 'GTM-AB12CD',
      ga4MeasurementId: 'G-AB12CD',
      metaPixelId: '123456789012345',
      tiktokPixelId: 'CABCdef123456',
    })
  })

  it('rejects HTML, URLs, unsupported keys, and malformed IDs', () => {
    const invalidSettings = [
      { gtmContainerId: '<script>', ga4MeasurementId: null, metaPixelId: null, tiktokPixelId: null },
      { gtmContainerId: null, ga4MeasurementId: 'https://example.com', metaPixelId: null, tiktokPixelId: null },
      { gtmContainerId: null, ga4MeasurementId: null, metaPixelId: 'abc123', tiktokPixelId: null },
      { gtmContainerId: null, ga4MeasurementId: null, metaPixelId: null, tiktokPixelId: 'pixel-123' },
      { gtmContainerId: null, ga4MeasurementId: null, metaPixelId: null, tiktokPixelId: null, headerCode: '<script />' },
    ]

    for (const value of invalidSettings) {
      expect(trackingSettingsSchema.safeParse(value).success).toBe(false)
    }
  })

  it('permits an explicit all-disabled configuration through the settings contract', () => {
    expect(updateStoreSettingsSchema.safeParse({
      tracking: {
        gtmContainerId: null,
        ga4MeasurementId: null,
        metaPixelId: null,
        tiktokPixelId: null,
      },
    }).success).toBe(true)
    expect(updateStoreSettingsSchema.safeParse({ headerCode: '<script>alert(1)</script>' }).success).toBe(false)
  })
})
