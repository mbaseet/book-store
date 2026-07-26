import { describe, expect, it } from 'vitest'
import { announcementBarSchema } from './content'

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
