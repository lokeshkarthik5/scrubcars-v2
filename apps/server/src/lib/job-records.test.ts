import { describe, expect, test } from 'bun:test'
import {
  PHOTO_EDIT_WINDOW_DAYS,
  customerSeesPhotos,
  isJobPhotoKey,
  jobPhotoFolder,
  photoChangeRefusal,
} from './job-records.js'

const NOW = new Date('2026-10-05T10:00:00Z').getTime()
const DAY = 24 * 60 * 60 * 1000
const VENDOR = '11111111-1111-4111-8111-111111111111'
const BOOKING = '22222222-2222-4222-8222-222222222222'
const FILE = '33333333-3333-4333-8333-333333333333'

const job = (status: string, completedAt: Date | null = null) => ({
  status,
  completedAt,
  scheduledAt: new Date(NOW - 2 * 60 * 60 * 1000),
  now: NOW,
})

describe('photoChangeRefusal', () => {
  test('before photos from the moment the garage accepts', () => {
    expect(photoChangeRefusal({ stage: 'before', ...job('confirmed') })).toBeNull()
    expect(photoChangeRefusal({ stage: 'before', ...job('in_progress') })).toBeNull()
  })

  test('after photos only once the work has started', () => {
    expect(photoChangeRefusal({ stage: 'after', ...job('confirmed') })).toBe('stage_not_open')
    expect(photoChangeRefusal({ stage: 'after', ...job('in_progress') })).toBeNull()
    expect(photoChangeRefusal({ stage: 'after', ...job('completed', new Date(NOW - DAY)) })).toBeNull()
  })

  test('none before the garage accepts, or on a cancelled or moved job', () => {
    for (const status of ['pending', 'cancelled', 'rescheduled']) {
      expect(photoChangeRefusal({ stage: 'before', ...job(status) })).toBe('booking_closed')
      expect(photoChangeRefusal({ stage: 'after', ...job(status) })).toBe('booking_closed')
    }
  })

  test(`closed ${PHOTO_EDIT_WINDOW_DAYS} days after completion`, () => {
    const justInside = new Date(NOW - 7 * DAY + 60_000)
    const justOutside = new Date(NOW - 7 * DAY - 60_000)
    expect(photoChangeRefusal({ stage: 'after', ...job('completed', justInside) })).toBeNull()
    expect(photoChangeRefusal({ stage: 'after', ...job('completed', justOutside) })).toBe('window_closed')
    expect(photoChangeRefusal({ stage: 'before', ...job('completed', justOutside) })).toBe('window_closed')
  })

  test('a job finished before completion times were kept counts from its slot', () => {
    expect(
      photoChangeRefusal({
        stage: 'after',
        status: 'completed',
        completedAt: null,
        scheduledAt: new Date(NOW - 8 * DAY),
        now: NOW,
      })
    ).toBe('window_closed')
  })
})

describe('customerSeesPhotos', () => {
  test('once the work has started', () => {
    expect(customerSeesPhotos('in_progress')).toBe(true)
    expect(customerSeesPhotos('completed')).toBe(true)
    expect(customerSeesPhotos('confirmed')).toBe(false)
    expect(customerSeesPhotos('cancelled')).toBe(false)
  })
})

describe('isJobPhotoKey', () => {
  const folder = `vendors/${VENDOR}/${jobPhotoFolder(BOOKING)}`

  test('a key minted for this garage and this job', () => {
    expect(isJobPhotoKey(`${folder}/${FILE}.jpg`, VENDOR, BOOKING)).toBe(true)
    expect(isJobPhotoKey(`${folder}/${FILE}.webp`, VENDOR, BOOKING)).toBe(true)
  })

  test('nothing from another job, another garage or elsewhere in the bucket', () => {
    const otherBooking = '44444444-4444-4444-8444-444444444444'
    expect(isJobPhotoKey(`vendors/${VENDOR}/job-photos/${otherBooking}/${FILE}.jpg`, VENDOR, BOOKING)).toBe(false)
    expect(isJobPhotoKey(`vendors/${otherBooking}/job-photos/${BOOKING}/${FILE}.jpg`, VENDOR, BOOKING)).toBe(false)
    expect(isJobPhotoKey(`vendors/${VENDOR}/${FILE}.jpg`, VENDOR, BOOKING)).toBe(false)
  })

  test('no path tricks or other file types', () => {
    expect(isJobPhotoKey(`${folder}/../../logo/${FILE}.jpg`, VENDOR, BOOKING)).toBe(false)
    expect(isJobPhotoKey(`${folder}/sub/${FILE}.jpg`, VENDOR, BOOKING)).toBe(false)
    expect(isJobPhotoKey(`${folder}/${FILE}.svg`, VENDOR, BOOKING)).toBe(false)
    expect(isJobPhotoKey(`${folder}/`, VENDOR, BOOKING)).toBe(false)
  })
})
