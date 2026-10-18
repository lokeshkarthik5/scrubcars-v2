import { describe, expect, test } from 'bun:test'
import {
  CUSTOMER_AFTER_WINDOW_HOURS,
  MAX_CUSTOMER_PHOTOS_PER_STAGE,
  MIN_GARAGE_PHOTOS,
  customerAfterClosesAt,
  customerPhotoRefusal,
  customerPhotoWindowsView,
  garageSeesCustomerPhotos,
  garagePhotoStandardView,
  parsePhotosRequired,
  parseRequiredGarages,
  photoGateMessage,
  photoGateRefusal,
  photoRemovalBlocked,
  photosRequiredFor,
} from './job-photo-standards.js'

const NOW = new Date('2026-10-18T10:00:00Z').getTime()
const HOUR = 60 * 60 * 1000
const GARAGE = 'e2e00000-0000-4000-8000-000000002510'

describe('the switch', () => {
  test('JOB_PHOTOS_REQUIRED is off unless it says on', () => {
    expect(parsePhotosRequired(undefined)).toBe(false)
    expect(parsePhotosRequired('')).toBe(false)
    expect(parsePhotosRequired('off')).toBe(false)
    expect(parsePhotosRequired('yes')).toBe(false)
    expect(parsePhotosRequired('on')).toBe(true)
    expect(parsePhotosRequired(' ON ')).toBe(true)
  })

  test('JOB_PHOTOS_REQUIRED_GARAGES keeps it on for the garages named, ids only', () => {
    const garages = parseRequiredGarages(` ${GARAGE.toUpperCase()}, not-an-id,,`)
    expect([...garages]).toEqual([GARAGE])
    expect(photosRequiredFor(GARAGE, { required: false, garages })).toBe(true)
    expect(photosRequiredFor('e2e00000-0000-4000-8000-000000000001', { required: false, garages })).toBe(false)
    expect(photosRequiredFor('e2e00000-0000-4000-8000-000000000001', { required: true, garages })).toBe(true)
  })
})

describe('the start and complete gates', () => {
  test(`start needs ${MIN_GARAGE_PHOTOS} before photos from the garage`, () => {
    expect(photoGateRefusal({ step: 'start', required: true, waived: false, garagePhotoCount: 0 })).toEqual({
      stage: 'before',
      missing: 2,
    })
    expect(photoGateRefusal({ step: 'start', required: true, waived: false, garagePhotoCount: 1 })).toEqual({
      stage: 'before',
      missing: 1,
    })
    expect(photoGateRefusal({ step: 'start', required: true, waived: false, garagePhotoCount: 2 })).toBeNull()
    expect(photoGateRefusal({ step: 'start', required: true, waived: false, garagePhotoCount: 6 })).toBeNull()
  })

  test(`complete (and pickup's out for delivery and delivered) needs ${MIN_GARAGE_PHOTOS} after photos`, () => {
    expect(photoGateRefusal({ step: 'finish', required: true, waived: false, garagePhotoCount: 1 })).toEqual({
      stage: 'after',
      missing: 1,
    })
    expect(photoGateRefusal({ step: 'finish', required: true, waived: false, garagePhotoCount: 2 })).toBeNull()
  })

  test('nothing waits while the standard is off, or waived on the booking', () => {
    expect(photoGateRefusal({ step: 'start', required: false, waived: false, garagePhotoCount: 0 })).toBeNull()
    expect(photoGateRefusal({ step: 'finish', required: true, waived: true, garagePhotoCount: 0 })).toBeNull()
  })

  test('the garage reads what is missing', () => {
    expect(photoGateMessage({ stage: 'before', missing: 2 })).toBe('Add 2 before photos to start.')
    expect(photoGateMessage({ stage: 'before', missing: 1 })).toBe('Add 1 more before photo to start.')
    expect(photoGateMessage({ stage: 'after', missing: 2 })).toBe('Add 2 after photos to complete.')
    expect(photoGateMessage({ stage: 'after', missing: 1 })).toBe('Add 1 more after photo to complete.')
  })
})

describe('removing a photo behind a passed gate', () => {
  const base = { required: true, waived: false, outForDelivery: false, garagePhotoCount: 2 }

  test('before photos of a started job cannot drop under the minimum', () => {
    expect(photoRemovalBlocked({ ...base, stage: 'before', status: 'in_progress' })).toBe(true)
    expect(photoRemovalBlocked({ ...base, stage: 'before', status: 'in_progress', garagePhotoCount: 3 })).toBe(false)
    // Not started yet: the gate is still ahead.
    expect(photoRemovalBlocked({ ...base, stage: 'before', status: 'confirmed' })).toBe(false)
  })

  test('after photos once finished, or once the car is out for delivery', () => {
    expect(photoRemovalBlocked({ ...base, stage: 'after', status: 'in_progress' })).toBe(false)
    expect(photoRemovalBlocked({ ...base, stage: 'after', status: 'in_progress', outForDelivery: true })).toBe(true)
    expect(photoRemovalBlocked({ ...base, stage: 'after', status: 'completed' })).toBe(true)
  })

  test('free while the standard is off or waived', () => {
    expect(photoRemovalBlocked({ ...base, required: false, stage: 'before', status: 'in_progress' })).toBe(false)
    expect(photoRemovalBlocked({ ...base, waived: true, stage: 'after', status: 'completed' })).toBe(false)
  })
})

describe("the customer's upload windows", () => {
  const job = (status: string, extra: Partial<Parameters<typeof customerPhotoRefusal>[0]> = {}) => ({
    status,
    bookingType: 'dropin',
    pickedUpAt: null,
    completedAt: null,
    now: NOW,
    ...extra,
  })

  test('before photos from booking until the work starts', () => {
    expect(customerPhotoRefusal({ stage: 'before', ...job('pending') })).toBeNull()
    expect(customerPhotoRefusal({ stage: 'before', ...job('confirmed') })).toBeNull()
    expect(customerPhotoRefusal({ stage: 'before', ...job('in_progress') })).toBe('before_closed')
    expect(customerPhotoRefusal({ stage: 'before', ...job('completed') })).toBe('before_closed')
  })

  test('doorstep: until in progress; pickup & drop: until the car is collected', () => {
    expect(customerPhotoRefusal({ stage: 'before', ...job('confirmed', { bookingType: 'doorstep' }) })).toBeNull()
    expect(customerPhotoRefusal({ stage: 'before', ...job('confirmed', { bookingType: 'pickup' }) })).toBeNull()
    expect(
      customerPhotoRefusal({
        stage: 'before',
        ...job('confirmed', { bookingType: 'pickup', pickedUpAt: new Date(NOW - HOUR) }),
      })
    ).toBe('before_closed')
  })

  test(`after photos only once completed, for ${CUSTOMER_AFTER_WINDOW_HOURS} hours`, () => {
    expect(customerPhotoRefusal({ stage: 'after', ...job('confirmed') })).toBe('after_not_open')
    expect(customerPhotoRefusal({ stage: 'after', ...job('in_progress') })).toBe('after_not_open')
    const inside = new Date(NOW - CUSTOMER_AFTER_WINDOW_HOURS * HOUR + 60_000)
    const outside = new Date(NOW - CUSTOMER_AFTER_WINDOW_HOURS * HOUR - 60_000)
    expect(customerPhotoRefusal({ stage: 'after', ...job('completed', { completedAt: inside }) })).toBeNull()
    expect(customerPhotoRefusal({ stage: 'after', ...job('completed', { completedAt: outside }) })).toBe('after_closed')
    // No recorded completion time: no window.
    expect(customerPhotoRefusal({ stage: 'after', ...job('completed') })).toBe('after_closed')
  })

  test('nothing on a cancelled or moved booking', () => {
    for (const stage of ['before', 'after'] as const) {
      expect(customerPhotoRefusal({ stage, ...job('cancelled') })).toBe('booking_closed')
      expect(customerPhotoRefusal({ stage, ...job('rescheduled') })).toBe('booking_closed')
    }
  })

  test('the after window closes 24 hours after completion', () => {
    expect(customerAfterClosesAt(new Date(NOW))?.getTime()).toBe(NOW + 24 * HOUR)
    expect(customerAfterClosesAt(null)).toBeNull()
  })
})

describe("the garage and the customer's photos", () => {
  test('once the garage has accepted the job, not while it is only asked', () => {
    expect(garageSeesCustomerPhotos({ status: 'pending', acceptedAt: null })).toBe(false)
    expect(garageSeesCustomerPhotos({ status: 'cancelled', acceptedAt: null })).toBe(false)
    expect(garageSeesCustomerPhotos({ status: 'confirmed', acceptedAt: null })).toBe(true)
    expect(garageSeesCustomerPhotos({ status: 'cancelled', acceptedAt: new Date(NOW) })).toBe(true)
  })
})

describe('what each app is told', () => {
  const photos = [
    { stage: 'before' as const, uploadedByRole: 'garage' },
    { stage: 'before' as const, uploadedByRole: 'customer' },
    { stage: 'before' as const, uploadedByRole: 'customer' },
    { stage: 'after' as const, uploadedByRole: 'garage' },
  ]
  const job = {
    status: 'confirmed',
    bookingType: 'dropin',
    scheduledAt: new Date(NOW + HOUR),
    completedAt: null,
    photos,
  }

  test("the garage's view counts only its own photos toward the gates", () => {
    const view = garagePhotoStandardView(job, true, NOW)
    expect(view.before).toEqual({ count: 1, canChange: true })
    expect(view.after).toEqual({ count: 1, canChange: false })
    expect(view.startBlocked).toEqual({ stage: 'before', missing: 1 })
    expect(view.finishBlocked).toEqual({ stage: 'after', missing: 1 })
    expect(garagePhotoStandardView({ ...job, photosWaivedAt: new Date(NOW) }, true, NOW).startBlocked).toBeNull()
    expect(garagePhotoStandardView(job, false, NOW).startBlocked).toBeNull()
  })

  test("the customer's view counts their own and says when each stage is open", () => {
    const view = customerPhotoWindowsView(job, NOW)
    expect(view).toEqual({
      max: MAX_CUSTOMER_PHOTOS_PER_STAGE,
      before: { open: true, count: 2 },
      after: { open: false, count: 0, closesAt: null },
    })
    const done = customerPhotoWindowsView({ ...job, status: 'completed', completedAt: new Date(NOW - HOUR) }, NOW)
    expect(done.before.open).toBe(false)
    expect(done.after.open).toBe(true)
    expect(done.after.closesAt).toBe(new Date(NOW + 23 * HOUR).toISOString())
  })
})
