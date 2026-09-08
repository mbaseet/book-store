import { describe, expect, it } from 'vitest'
import type { RecoveryLeadPayload } from '@shared/contracts/recovery'
import type { Bindings } from '../types'
import {
  AbandonedCheckoutRecoveryError,
  decryptRecoveryPayload,
  encryptRecoveryPayload,
  hashRecoveryPhone,
  normalizeRecoveryPhone,
  recoveryPayloadFromExpiredDraft,
} from './abandoned-checkout-recovery'

const recoveryEnv = {
  ABANDONED_CART_ENCRYPTION_SECRET: 'a-recovery-secret-that-is-longer-than-thirty-two-characters',
} as Bindings

const payload: RecoveryLeadPayload = {
  version: 1,
  contact: {
    email: 'customer@example.test',
    phone: '+20 10 1234 5678',
  },
  delivery: { governorateCode: 'cairo', city: 'Maadi' },
  checkout: { paymentMethod: 'instapay', paymentPlan: 'full_upfront' },
  items: [
    {
      productId: '00000000-0000-4000-8000-000000000001',
      productSlug: 'storybook',
      productTitle: 'A Storybook',
      basePriceAmount: 50000,
      salePriceAmount: null,
      quantity: 1,
      addons: [{ id: '00000000-0000-4000-8000-000000000002', name: 'Gift wrap', priceAmount: 5000 }],
    },
  ],
}

describe('abandoned checkout recovery', () => {
  it('normalizes equivalent Egyptian phone formats before creating a keyed match hash', async () => {
    expect(normalizeRecoveryPhone('010 1234 5678')).toBe('201012345678')
    expect(normalizeRecoveryPhone('+20 (10) 1234-5678')).toBe('201012345678')
    expect(normalizeRecoveryPhone('٠١٠١٢٣٤٥٦٧٨')).toBe('201012345678')

    await expect(hashRecoveryPhone(recoveryEnv, '010 1234 5678')).resolves.toBe(
      await hashRecoveryPhone(recoveryEnv, '+20 10 1234 5678'),
    )
  })

  it('encrypts the safe payload and rejects a different encryption secret', async () => {
    const encrypted = await encryptRecoveryPayload(recoveryEnv, payload)
    expect(encrypted).not.toContain(payload.contact.email ?? '')
    expect(encrypted).not.toContain(payload.contact.phone)
    await expect(decryptRecoveryPayload(recoveryEnv, encrypted)).resolves.toEqual(payload)

    await expect(
      decryptRecoveryPayload(
        {
          ABANDONED_CART_ENCRYPTION_SECRET: 'another-recovery-secret-that-is-longer-than-thirty-two-characters',
        } as Bindings,
        encrypted,
      ),
    ).rejects.toBeInstanceOf(AbandonedCheckoutRecoveryError)
  })

  it('strips unexpected sensitive keys again at the encryption boundary', async () => {
    const futureCallerPayload = {
      ...payload,
      childName: 'Never retain this name',
      contact: { ...payload.contact, addressLine1: 'Never retain this address' },
      delivery: { ...payload.delivery, addressLine1: 'Never retain this address' },
    } as RecoveryLeadPayload
    const encrypted = await encryptRecoveryPayload(recoveryEnv, futureCallerPayload)
    const recovered = await decryptRecoveryPayload(recoveryEnv, encrypted)
    const serialized = JSON.stringify(recovered)
    expect(serialized).not.toContain('Never retain this name')
    expect(serialized).not.toContain('Never retain this address')
  })

  it('whitelists only valid contact, locality, payment, and catalog data at draft expiry', () => {
    const expiredDraft = {
      id: '00000000-0000-4000-8000-000000000003',
      expiresAt: new Date('2026-07-31T12:00:00.000Z'),
      payload: {
        delivery: {
          customerName: 'Test Customer',
          email: 'customer@example.test',
          phone: '010 1234 5678',
          governorateCode: 'cairo',
          city: 'Maadi',
          paymentMethod: 'instapay',
          paymentPlan: 'full_upfront',
          appliedPromoCode: 'MINT5',
          addressLine1: '12 Secret Street',
          addressLine2: 'Floor 3',
          addressNote: 'Call before arrival',
        },
        items: [
          {
            productId: '00000000-0000-4000-8000-000000000001',
            productSlug: 'storybook',
            productTitle: 'A Storybook',
            basePriceAmount: 50000,
            salePriceAmount: null,
            quantity: 1,
            addons: [{ id: '00000000-0000-4000-8000-000000000002', name: 'Gift wrap', priceAmount: 5000 }],
            childName: 'Private child name',
            note: 'Private customer note',
            personalization: { school: 'Private school' },
            childUploadIds: ['00000000-0000-4000-8000-000000000004'],
            productImageUrl: 'https://res.cloudinary.com/example/private.jpg',
            draftToken: 'never-store-this-token',
          },
        ],
      },
    }
    const recovered = recoveryPayloadFromExpiredDraft(expiredDraft)

    expect(recovered).toEqual({
      ...payload,
      contact: { ...payload.contact, phone: '010 1234 5678' },
    })
    const serialized = JSON.stringify(recovered)
    for (const excluded of [
      'Secret Street',
      'Call before arrival',
      'Private child name',
      'Private customer note',
      'Private school',
      'Test Customer',
      'cloudinary',
      'never-store-this-token',
    ]) {
      expect(serialized).not.toContain(excluded)
    }
  })

  it('never forms a lead without a usable phone contact', () => {
    const incompleteDraft = {
      id: '00000000-0000-4000-8000-000000000003',
      expiresAt: new Date(),
      payload: {
        delivery: {
          customerName: 'Test Customer',
          email: 'customer@example.test',
          phone: '',
          governorateCode: 'cairo',
          city: 'Maadi',
          paymentMethod: 'instapay',
          paymentPlan: 'full_upfront',
          appliedPromoCode: '',
        },
        items: [],
      },
    }
    expect(recoveryPayloadFromExpiredDraft(incompleteDraft)).toBeNull()
  })
})
