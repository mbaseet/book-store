import { describe, expect, it } from 'vitest'
import { ApiClientError } from './api'
import { fieldErrorsByPath, requestErrorMessage } from './form-errors'

describe('form error messages', () => {
  it('maps stable server field codes to localized customer guidance', () => {
    const error = new ApiClientError(422, 'Please check the submitted information.', {
      code: 'validation_failed',
      fieldErrors: [{ path: ['email'], code: 'invalid_format' }],
    })

    expect(fieldErrorsByPath('en', error).get('email')).toBe('Enter this in the correct format.')
    expect(fieldErrorsByPath('ar', error).get('email')).toBe('أدخل البيانات بالتنسيق الصحيح.')
  })

  it('does not expose a raw server message to storefront customers', () => {
    const error = new ApiClientError(500, 'Unexpected database exception')
    expect(requestErrorMessage('en', error)).toBe('We could not complete this request. Please try again.')
    expect(requestErrorMessage('ar', error)).toBe('تعذر إكمال الطلب الآن. حاول مرة أخرى.')
  })
})
