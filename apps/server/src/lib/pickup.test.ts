import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_PICKUP_RADIUS_KM,
  MAX_CODE_ATTEMPTS,
  bookingTypeFee,
  checkHandoverCode,
  codeTriesLeft,
  completeRefusal,
  customerChangeRefusal,
  effectivePickupRadiusKm,
  isPickupOffered,
  legacyPickupIntent,
  newHandoverCode,
  newHandoverCodes,
  nextPickupStep,
  pickupStepRefusal,
  planPickupChange,
  type PickupJob,
  type PickupSettings,
} from './pickup.js'

const TERMS_AT = new Date('2026-10-17T04:30:00Z')
const NOW = new Date('2026-10-18T06:00:00Z')

const settings = (overrides: Partial<PickupSettings> = {}): PickupSettings => ({
  pickup: null,
  pickupRadiusKm: null,
  pickupTermsAcceptedAt: null,
  ...overrides,
})

describe('isPickupOffered', () => {
  test('on is a yes with the responsibility terms on file', () => {
    expect(isPickupOffered(settings({ pickup: 'yes', pickupTermsAcceptedAt: TERMS_AT }))).toBe(true)
    // An older onboarding answer counts as yes.
    expect(isPickupOffered(settings({ pickup: 'nearby', pickupTermsAcceptedAt: TERMS_AT }))).toBe(true)
    // As it arrives from the API.
    expect(
      isPickupOffered(settings({ pickup: 'yes', pickupTermsAcceptedAt: TERMS_AT.toISOString() }))
    ).toBe(true)
  })

  test('a yes from before the terms existed is not on, and neither is no', () => {
    expect(isPickupOffered(settings({ pickup: 'yes' }))).toBe(false)
    expect(isPickupOffered(settings({ pickup: 'nearby' }))).toBe(false)
    // Turned off after accepting: the old acceptance stays as history.
    expect(isPickupOffered(settings({ pickup: 'no', pickupTermsAcceptedAt: TERMS_AT }))).toBe(false)
    expect(isPickupOffered(settings())).toBe(false)
  })
})

describe('the pickup radius', () => {
  test('an empty radius is the 10 km default, as for doorstep', () => {
    expect(DEFAULT_PICKUP_RADIUS_KM).toBe(10)
    expect(effectivePickupRadiusKm(null)).toBe(10)
    expect(effectivePickupRadiusKm(undefined)).toBe(10)
    expect(effectivePickupRadiusKm(6.5)).toBe(6.5)
  })
})

describe('planPickupChange', () => {
  const ask = (current: PickupSettings, request: Parameters<typeof planPickupChange>[1]) =>
    planPickupChange(current, request)

  test('turning it on needs the tick, and records who and when', () => {
    expect(ask(settings(), { enabled: true, actor: 'Ravi', now: NOW })).toEqual({
      ok: false,
      code: 'PICKUP_TERMS_REQUIRED',
      message: expect.stringContaining('responsible for the customer'),
    })
    expect(ask(settings(), { enabled: true, termsAccepted: false, actor: 'Ravi', now: NOW }).ok).toBe(false)

    expect(
      ask(settings(), { enabled: true, termsAccepted: true, radiusKm: 8, actor: 'Ravi', now: NOW })
    ).toEqual({
      ok: true,
      patch: {
        pickup: 'yes',
        pickupRadiusKm: 8,
        pickupTermsAcceptedAt: NOW,
        pickupTermsAcceptedBy: 'Ravi',
      },
    })
  })

  test('a yes from onboarding without terms still needs the tick to be on', () => {
    expect(ask(settings({ pickup: 'yes' }), { enabled: true, actor: 'Ravi', now: NOW }).ok).toBe(false)
  })

  test('each time it is turned on again, the terms are taken afresh', () => {
    const wasOn = settings({ pickup: 'no', pickupTermsAcceptedAt: TERMS_AT })
    expect(ask(wasOn, { enabled: true, actor: 'Ravi', now: NOW }).ok).toBe(false)
    expect(ask(wasOn, { enabled: true, termsAccepted: true, actor: 'admin: Meena', now: NOW })).toEqual({
      ok: true,
      patch: { pickup: 'yes', pickupTermsAcceptedAt: NOW, pickupTermsAcceptedBy: 'admin: Meena' },
    })
  })

  test('already on: the radius changes without a tick, and the terms are left alone', () => {
    const on = settings({ pickup: 'yes', pickupTermsAcceptedAt: TERMS_AT, pickupRadiusKm: 5 })
    expect(ask(on, { radiusKm: 12, actor: 'Ravi', now: NOW })).toEqual({
      ok: true,
      patch: { pickupRadiusKm: 12 },
    })
    // Saying "on" again is not turning it on.
    expect(ask(on, { enabled: true, actor: 'Ravi', now: NOW })).toEqual({ ok: true, patch: {} })
    // Null clears the radius to the default.
    expect(ask(on, { radiusKm: null, actor: 'Ravi', now: NOW })).toEqual({
      ok: true,
      patch: { pickupRadiusKm: null },
    })
  })

  test('turning it off is always allowed, and needs no tick', () => {
    const on = settings({ pickup: 'yes', pickupTermsAcceptedAt: TERMS_AT })
    expect(ask(on, { enabled: false, actor: 'Ravi', now: NOW })).toEqual({
      ok: true,
      patch: { pickup: 'no' },
    })
    // A legacy yes with no terms is turned off too.
    expect(ask(settings({ pickup: 'nearby' }), { enabled: false, actor: 'Ravi', now: NOW })).toEqual({
      ok: true,
      patch: { pickup: 'no' },
    })
    // Already off: nothing to write.
    expect(ask(settings({ pickup: 'no' }), { enabled: false, actor: 'Ravi', now: NOW })).toEqual({
      ok: true,
      patch: {},
    })
  })

  test('the name is cut to the column', () => {
    const result = ask(settings(), { enabled: true, termsAccepted: true, actor: 'x'.repeat(200), now: NOW })
    expect(result.ok && result.patch.pickupTermsAcceptedBy?.length).toBe(120)
  })
})

describe('legacyPickupIntent', () => {
  test('an older panel sending back what is stored means nothing', () => {
    expect(legacyPickupIntent('yes', 'yes')).toBeUndefined()
    expect(legacyPickupIntent(null, null)).toBeUndefined()
    expect(legacyPickupIntent('yes', undefined)).toBeUndefined()
  })

  test('a changed answer is on or off', () => {
    expect(legacyPickupIntent(null, 'yes')).toBe(true)
    expect(legacyPickupIntent('no', 'nearby')).toBe(true)
    expect(legacyPickupIntent('yes', 'no')).toBe(false)
    expect(legacyPickupIntent('yes', null)).toBe(false)
  })
})

describe('the price', () => {
  test('no booking type adds a fee yet (owner decision: pickup fee later)', () => {
    expect(bookingTypeFee('pickup')).toBe('0.00')
    expect(bookingTypeFee('doorstep')).toBe('0.00')
    expect(bookingTypeFee('dropin')).toBe('0.00')
  })
})

describe('handover codes', () => {
  test('four digits, leading zeros kept', () => {
    expect(newHandoverCode(() => 42)).toBe('0042')
    expect(newHandoverCode(() => 9999)).toBe('9999')
    for (let i = 0; i < 200; i += 1) expect(newHandoverCode()).toMatch(/^\d{4}$/)
  })

  test('the two codes of a booking are never the same', () => {
    const draws = [1234, 1234, 1234, 5678]
    const codes = newHandoverCodes(() => draws.shift()!)
    expect(codes).toEqual({ pickupCode: '1234', deliveryCode: '5678' })
  })

  test('the right code passes, a wrong one does not', () => {
    expect(checkHandoverCode({ expected: '0420', given: '0420', attempts: 0 })).toBe('ok')
    expect(checkHandoverCode({ expected: '0420', given: '0421', attempts: 0 })).toBe('wrong')
    expect(checkHandoverCode({ expected: '0420', given: '420', attempts: 0 })).toBe('wrong')
    // The last try still counts.
    expect(checkHandoverCode({ expected: '0420', given: '0420', attempts: MAX_CODE_ATTEMPTS - 1 })).toBe('ok')
  })

  test('at the cap it is locked, even for the right code', () => {
    expect(MAX_CODE_ATTEMPTS).toBe(5)
    expect(checkHandoverCode({ expected: '0420', given: '0420', attempts: MAX_CODE_ATTEMPTS })).toBe('locked')
    expect(checkHandoverCode({ expected: '0420', given: '9999', attempts: MAX_CODE_ATTEMPTS + 2 })).toBe('locked')
  })

  test('a booking with no code on file is said so, not passed', () => {
    expect(checkHandoverCode({ expected: null, given: '0000', attempts: 0 })).toBe('missing')
  })

  test('tries left count down to zero and stay there', () => {
    expect(codeTriesLeft(0)).toBe(5)
    expect(codeTriesLeft(4)).toBe(1)
    expect(codeTriesLeft(5)).toBe(0)
    expect(codeTriesLeft(9)).toBe(0)
  })
})

describe('the steps', () => {
  const T = new Date('2026-10-18T05:00:00Z')
  const job = (overrides: Partial<PickupJob> = {}): PickupJob => ({
    bookingType: 'pickup',
    status: 'confirmed',
    pickedUpAt: null,
    atGarageAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    ...overrides,
  })

  test('the order: picked up, at garage, the work, out for delivery, delivered', () => {
    expect(nextPickupStep(job({ status: 'pending' }))).toBeNull()
    expect(nextPickupStep(job())).toBe('picked_up')
    expect(nextPickupStep(job({ pickedUpAt: T }))).toBe('at_garage')
    expect(nextPickupStep(job({ pickedUpAt: T, atGarageAt: T }))).toBe('start_work')
    expect(nextPickupStep(job({ status: 'in_progress', pickedUpAt: T, atGarageAt: T }))).toBe('out_for_delivery')
    expect(
      nextPickupStep(job({ status: 'in_progress', pickedUpAt: T, atGarageAt: T, outForDeliveryAt: T }))
    ).toBe('delivered')
    expect(nextPickupStep(job({ status: 'completed', deliveredAt: T }))).toBeNull()
    expect(nextPickupStep(job({ status: 'cancelled' }))).toBeNull()
  })

  test('other booking types have no pickup steps', () => {
    expect(nextPickupStep(job({ bookingType: 'dropin' }))).toBeNull()
    expect(pickupStepRefusal(job({ bookingType: 'doorstep' }), 'picked_up')).toMatchObject({
      status: 400,
      code: 'NOT_PICKUP_BOOKING',
    })
  })

  test('the step the job is waiting for is allowed', () => {
    expect(pickupStepRefusal(job(), 'picked_up')).toBeNull()
    expect(pickupStepRefusal(job({ pickedUpAt: T }), 'at_garage')).toBeNull()
    expect(pickupStepRefusal(job({ pickedUpAt: T, atGarageAt: T }), 'start_work')).toBeNull()
  })

  test('a step too early names what comes first', () => {
    expect(pickupStepRefusal(job(), 'at_garage')).toEqual({
      status: 409,
      code: 'PICKUP_STEP_OUT_OF_ORDER',
      message: 'Not yet: mark Picked up first.',
    })
    // No work before the car is at the garage.
    expect(pickupStepRefusal(job({ pickedUpAt: T }), 'start_work')).toMatchObject({
      code: 'PICKUP_STEP_OUT_OF_ORDER',
      message: 'Not yet: mark At garage first.',
    })
    // Not delivered before it went out.
    expect(
      pickupStepRefusal(job({ status: 'in_progress', pickedUpAt: T, atGarageAt: T }), 'delivered')
    ).toMatchObject({ code: 'PICKUP_STEP_OUT_OF_ORDER', message: 'Not yet: mark Out for delivery first.' })
  })

  test('a step already done says so, for a double tap or a second phone', () => {
    expect(pickupStepRefusal(job({ pickedUpAt: T }), 'picked_up')).toEqual({
      status: 409,
      code: 'PICKUP_STEP_DONE',
      message: 'Picked up is already marked. Next: At garage.',
    })
  })

  test('a job not accepted yet, or no longer open, takes no steps', () => {
    expect(pickupStepRefusal(job({ status: 'pending' }), 'picked_up')).toMatchObject({
      status: 400,
      code: 'INVALID_BOOKING_STATUS',
      message: 'Accept the booking first.',
    })
    expect(pickupStepRefusal(job({ status: 'cancelled' }), 'picked_up')).toMatchObject({
      code: 'INVALID_BOOKING_STATUS',
    })
    expect(
      pickupStepRefusal(job({ status: 'completed', pickedUpAt: T, deliveredAt: T }), 'delivered')
    ).toMatchObject({ code: 'INVALID_BOOKING_STATUS' })
  })

  test('the plain Mark completed is refused for pickup & drop only', () => {
    expect(completeRefusal({ bookingType: 'pickup' })).toMatchObject({ code: 'PICKUP_STEP_OUT_OF_ORDER' })
    expect(completeRefusal({ bookingType: 'dropin' })).toBeNull()
    expect(completeRefusal({ bookingType: 'doorstep' })).toBeNull()
  })

  test('once the car is collected, the customer cannot cancel or move the booking', () => {
    expect(customerChangeRefusal({ bookingType: 'pickup', pickedUpAt: null })).toBeNull()
    expect(customerChangeRefusal({ bookingType: 'pickup', pickedUpAt: T })).toContain('already collected')
    expect(customerChangeRefusal({ bookingType: 'dropin', pickedUpAt: null })).toBeNull()
  })
})
