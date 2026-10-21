import { describe, expect, test } from 'bun:test'
import {
  carWithGarage,
  handoverLocked,
  insidePickupReach,
  pickupCodeCard,
  pickupFeeLabel,
  pickupStageOf,
  pickupTimeline,
  type PickupTimelineBooking,
} from './pickup'

const T = {
  requested: '2026-10-17T03:00:00.000Z',
  accepted: '2026-10-17T03:10:00.000Z',
  pickedUp: '2026-10-18T04:00:00.000Z',
  atGarage: '2026-10-18T04:30:00.000Z',
  started: '2026-10-18T04:40:00.000Z',
  out: '2026-10-18T06:00:00.000Z',
  delivered: '2026-10-18T06:30:00.000Z',
}

const booking = (overrides: Partial<PickupTimelineBooking> = {}): PickupTimelineBooking => ({
  status: 'confirmed',
  vendorName: 'Hub Motors',
  requestedAtIso: T.requested,
  acceptedAtIso: T.accepted,
  pickup: {},
  ...overrides,
})

const states = (b: PickupTimelineBooking) =>
  pickupTimeline(b)!.map((step) => `${step.key}:${step.state}`)

describe('pickupStageOf', () => {
  test('the latest step reached, in order', () => {
    expect(pickupStageOf({ status: 'pending' })).toBe('booked')
    expect(pickupStageOf({ status: 'confirmed' })).toBe('booked')
    expect(pickupStageOf({ status: 'confirmed', pickedUpAt: T.pickedUp })).toBe('picked_up')
    expect(
      pickupStageOf({ status: 'confirmed', pickedUpAt: T.pickedUp, atGarageAt: T.atGarage })
    ).toBe('at_garage')
    expect(
      pickupStageOf({ status: 'in_progress', pickedUpAt: T.pickedUp, atGarageAt: T.atGarage, startedAt: T.started })
    ).toBe('in_progress')
    expect(
      pickupStageOf({ status: 'in_progress', startedAt: T.started, outForDeliveryAt: T.out })
    ).toBe('out_for_delivery')
    expect(pickupStageOf({ status: 'completed', deliveredAt: T.delivered })).toBe('delivered')
  })

  test('a completed job is delivered even when Detlio confirmed the step without a time', () => {
    expect(pickupStageOf({ status: 'completed' })).toBe('delivered')
  })
})

describe('pickupTimeline', () => {
  test('the six steps, named for the customer', () => {
    expect(pickupTimeline(booking())!.map((step) => step.label)).toEqual([
      'Booked',
      'Picked up',
      'At garage',
      'Being worked on',
      'Out for delivery',
      'Delivered',
    ])
  })

  test('before the garage accepts, Booked is still waiting', () => {
    const steps = pickupTimeline(booking({ status: 'pending', acceptedAtIso: undefined }))!
    expect(steps.map((s) => s.state)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
    expect(steps[0].caption).toBe('Waiting for Hub Motors to accept')
    expect(steps[0].at).toBe(T.requested)
  })

  test('accepted: Booked is done, Picked up is next', () => {
    const steps = pickupTimeline(booking())!
    expect(states(booking())).toEqual([
      'booked:done',
      'picked_up:current',
      'at_garage:upcoming',
      'in_progress:upcoming',
      'out_for_delivery:upcoming',
      'delivered:upcoming',
    ])
    expect(steps[0].at).toBe(T.accepted)
    // A step not reached never shows a time.
    expect(steps[1].at).toBeUndefined()
  })

  test('collected: Picked up has its time, At garage is next', () => {
    const b = booking({ pickup: { pickedUpAtIso: T.pickedUp } })
    expect(states(b).slice(0, 3)).toEqual(['booked:done', 'picked_up:done', 'at_garage:current'])
    expect(pickupTimeline(b)![1].at).toBe(T.pickedUp)
  })

  test('being worked on is under way until the car leaves, and nothing after it is', () => {
    const b = booking({
      status: 'in_progress',
      startedAtIso: T.started,
      pickup: { pickedUpAtIso: T.pickedUp, atGarageAtIso: T.atGarage },
    })
    expect(states(b)).toEqual([
      'booked:done',
      'picked_up:done',
      'at_garage:done',
      'in_progress:current',
      'out_for_delivery:upcoming',
      'delivered:upcoming',
    ])
    const working = pickupTimeline(b)![3]
    expect(working.caption).toBe('Work has started on your car')
    expect(working.at).toBe(T.started)
  })

  test('out for delivery: Delivered is next', () => {
    const b = booking({
      status: 'in_progress',
      startedAtIso: T.started,
      pickup: { pickedUpAtIso: T.pickedUp, atGarageAtIso: T.atGarage, outForDeliveryAtIso: T.out },
    })
    expect(states(b).slice(3)).toEqual(['in_progress:done', 'out_for_delivery:done', 'delivered:current'])
  })

  test('delivered: every step done, none current', () => {
    const b = booking({
      status: 'completed',
      startedAtIso: T.started,
      completedAtIso: T.delivered,
      pickup: {
        pickedUpAtIso: T.pickedUp,
        atGarageAtIso: T.atGarage,
        outForDeliveryAtIso: T.out,
        deliveredAtIso: T.delivered,
      },
    })
    expect(pickupTimeline(b)!.every((step) => step.state === 'done')).toBe(true)
    expect(pickupTimeline(b)![5].at).toBe(T.delivered)
  })

  test('a cancelled or moved booking has no timeline', () => {
    expect(pickupTimeline(booking({ status: 'cancelled' }))).toBeNull()
    expect(pickupTimeline(booking({ status: 'rescheduled' }))).toBeNull()
  })
})

describe('pickupCodeCard', () => {
  const codes = { pickupCode: '4821', deliveryCode: '0937' }

  test('the pickup code until the garage has the car', () => {
    const card = pickupCodeCard({ status: 'confirmed', pickup: { ...codes } })
    expect(card).toEqual({
      kind: 'pickup',
      code: '4821',
      title: 'Pickup code',
      line: 'Give this code to the garage when they collect your car:',
    })
    // Before the garage accepts too: the code is the customer's from the start.
    expect(pickupCodeCard({ status: 'pending', pickup: { ...codes } })?.kind).toBe('pickup')
  })

  test('then the delivery code until the car is back', () => {
    const card = pickupCodeCard({
      status: 'in_progress',
      pickup: { pickedUpAtIso: T.pickedUp, pickupCode: null, deliveryCode: '0937' },
    })
    expect(card?.kind).toBe('delivery')
    expect(card?.code).toBe('0937')
    expect(card?.line).toBe('Give this code when your car is returned:')
  })

  test('never the pickup code once collected, even if a payload still carried it', () => {
    const card = pickupCodeCard({
      status: 'confirmed',
      pickup: { pickedUpAtIso: T.pickedUp, ...codes },
    })
    expect(card?.kind).toBe('delivery')
  })

  test('none once the booking is over, or without codes (not the customer’s payload)', () => {
    for (const status of ['completed', 'cancelled', 'rescheduled']) {
      expect(pickupCodeCard({ status, pickup: { ...codes } })).toBeNull()
    }
    expect(pickupCodeCard({ status: 'confirmed', pickup: {} })).toBeNull()
    expect(pickupCodeCard({ status: 'confirmed' })).toBeNull()
    expect(
      pickupCodeCard({ status: 'in_progress', pickup: { pickedUpAtIso: T.pickedUp, deliveredAtIso: T.delivered, ...codes } })
    ).toBeNull()
  })
})

describe('carWithGarage', () => {
  test('only a pickup job, only once collected', () => {
    expect(carWithGarage({ bookingType: 'pickup', pickup: { pickedUpAtIso: T.pickedUp } })).toBe(true)
    expect(carWithGarage({ bookingType: 'pickup', pickup: {} })).toBe(false)
    expect(carWithGarage({ bookingType: 'doorstep' })).toBe(false)
  })
})

describe('pickupFeeLabel', () => {
  test('free until a fee is set', () => {
    expect(pickupFeeLabel(0)).toBe('Free')
    expect(pickupFeeLabel(null)).toBe('Free')
    expect(pickupFeeLabel(undefined)).toBe('Free')
    expect(pickupFeeLabel(149)).toBe('₹149')
  })
})

describe('insidePickupReach', () => {
  // Adyar, Chennai, and points roughly 5 km and 15 km north of it.
  const garage = { lat: 13.0012, lng: 80.2565, pickupRadiusKm: 8 }
  const near = { lat: 13.0462, lng: 80.2565 }
  const far = { lat: 13.1362, lng: 80.2565 }

  test('inside and outside the garage’s own radius', () => {
    expect(insidePickupReach(garage, near)).toBe(true)
    expect(insidePickupReach(garage, far)).toBe(false)
  })

  test('an empty radius is the 10 km default', () => {
    expect(insidePickupReach({ ...garage, pickupRadiusKm: null }, near)).toBe(true)
    expect(insidePickupReach({ ...garage, pickupRadiusKm: null }, far)).toBe(false)
  })

  test('unknown without a pin on either side', () => {
    expect(insidePickupReach({ lat: null, lng: null }, near)).toBeNull()
    expect(insidePickupReach(garage, { lat: null, lng: null })).toBeNull()
  })
})

describe('handoverLocked', () => {
  test('locks the step the too-many-codes answer came back on', () => {
    expect(handoverLocked('picked_up', 'picked_up', 2)).toBe(true)
    expect(handoverLocked('delivered', 'delivered', 1)).toBe(true)
  })

  test('clears once Detlio confirms the handover and the job moves on', () => {
    expect(handoverLocked('at_garage', 'picked_up', undefined)).toBe(false)
    expect(handoverLocked('start_work', 'picked_up', undefined)).toBe(false)
    expect(handoverLocked('out_for_delivery', 'picked_up', undefined)).toBe(
      false
    )
    expect(handoverLocked('delivered', 'picked_up', 5)).toBe(false)
  })

  test('with no answer seen, the server tries left decide, for the code steps only', () => {
    expect(handoverLocked('picked_up', null, 0)).toBe(true)
    expect(handoverLocked('delivered', null, 0)).toBe(true)
    expect(handoverLocked('picked_up', null, 3)).toBe(false)
    expect(handoverLocked('at_garage', null, 0)).toBe(false)
  })
})
