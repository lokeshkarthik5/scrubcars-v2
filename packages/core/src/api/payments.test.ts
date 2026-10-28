import { describe, expect, test } from 'bun:test'
import { PURCHASE_EVENT_PREFIX, purchaseEventId, purchaseEventIdFromDigest } from './payments'

describe('the Purchase event id', () => {
  // SHA-256 worked out independently (Python hashlib), not by this code.
  test('is purchase_ and the first 32 hex characters of the SHA-256 of the booking id', async () => {
    expect(await purchaseEventId('8d3c1f2e-4b5a-4c6d-9e7f-0a1b2c3d4e5f')).toBe(
      'purchase_82a67467bc2ee43e1c857c12ef529bb5'
    )
    expect(await purchaseEventId('2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10')).toBe(
      'purchase_cab11a04c9ad208a57ec24db4e1d07ae'
    )
  })

  test('never contains the booking id, or any part of it', async () => {
    const booking = '2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10'
    const id = await purchaseEventId(booking)
    expect(id).not.toContain(booking)
    for (const part of booking.split('-')) expect(id).not.toContain(part)
    expect(id).toMatch(/^purchase_[0-9a-f]{32}$/)
  })

  test('is the same for the id in capitals, and differs between bookings', async () => {
    const booking = '2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10'
    expect(await purchaseEventId(booking.toUpperCase())).toBe(await purchaseEventId(booking))
    expect(await purchaseEventId('2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d11')).not.toBe(
      await purchaseEventId(booking)
    )
  })

  test('the digest rule on its own', () => {
    expect(purchaseEventIdFromDigest('ab'.repeat(32))).toBe(`${PURCHASE_EVENT_PREFIX}${'ab'.repeat(16)}`)
  })
})
