import { describe, expect, test } from 'bun:test'
import {
  CAR_CHECK_ANGLES,
  answerRefusal,
  carCheckGateFor,
  carCheckGateLines,
  carCheckGateMessage,
  carCheckGateRefusal,
  carCheckGateStep,
  carCheckPhotoLocked,
  carCheckPhotos,
  carCheckRequired,
  cleanBox,
  cleanNote,
  cleanPart,
  conditionCheckOnFor,
  customerConditionView,
  garageConditionView,
  markEditRefusal,
  markLabel,
  parseConditionCheckEnabled,
  photoToRead,
  sendRefusal,
  type ConditionJob,
  type MarkRow,
  type ViewPhoto,
} from './condition-check.js'

const GARAGE = 'e2e00000-0000-4000-8000-000000002610'
const at = (minute: number) => new Date(Date.UTC(2026, 10, 15, 4, minute))

function photo(id: string, stage: 'before' | 'after', angle: string | null, minute = 0, extra: Partial<ViewPhoto> = {}): ViewPhoto {
  return { id, stage, angle, uploadedByRole: 'garage', url: `vendors/v/job-photos/b/${id}.jpg`, createdAt: at(minute), ...extra }
}

function walkRound(stage: 'before' | 'after', count = 8): ViewPhoto[] {
  return CAR_CHECK_ANGLES.slice(0, count).map((angle, i) => photo(`${stage}-${angle}`, stage, angle, i))
}

function mark(id: string, photoId: string, extra: Partial<MarkRow> = {}): MarkRow {
  return {
    id,
    photoId,
    comparedPhotoId: null,
    stage: 'before',
    kind: 'scratch',
    part: 'rear left door',
    boxX: 0.5,
    boxY: 0.4,
    boxW: 0.1,
    boxH: 0.1,
    source: 'ai',
    unsure: false,
    removedAt: null,
    garageAnswer: null,
    customerAnswer: null,
    createdAt: at(30),
    ...extra,
  }
}

describe('the switch', () => {
  test('off unless it says on', () => {
    expect(parseConditionCheckEnabled(undefined)).toBe(false)
    expect(parseConditionCheckEnabled('')).toBe(false)
    expect(parseConditionCheckEnabled('true')).toBe(false)
    expect(parseConditionCheckEnabled(' ON ')).toBe(true)
  })

  test('on for everyone, or for the listed garages only', () => {
    const none = new Set<string>()
    expect(conditionCheckOnFor(GARAGE, { enabled: true, garages: none })).toBe(true)
    expect(conditionCheckOnFor(GARAGE, { enabled: false, garages: none })).toBe(false)
    expect(conditionCheckOnFor(GARAGE.toUpperCase(), { enabled: false, garages: new Set([GARAGE]) })).toBe(true)
  })
})

describe('when the walk-round is required', () => {
  test('pickup & drop and doorstep, not at the garage', () => {
    expect(carCheckRequired({ bookingType: 'pickup' })).toBe(true)
    expect(carCheckRequired({ bookingType: 'doorstep' })).toBe(true)
    expect(carCheckRequired({ bookingType: 'dropin' })).toBe(false)
  })

  test("Detlio's photo waiver waives it", () => {
    expect(carCheckRequired({ bookingType: 'pickup', photosWaivedAt: at(0) })).toBe(false)
  })

  test('it stands before Picked up for pickup & drop, Start otherwise', () => {
    expect(carCheckGateStep('pickup')).toBe('picked_up')
    expect(carCheckGateStep('doorstep')).toBe('start')
    expect(carCheckGateStep('dropin')).toBe('start')
  })
})

describe('the gate', () => {
  test('nothing when not required', () => {
    expect(carCheckGateRefusal({ required: false, anglesTaken: 0, sentAt: null })).toBeNull()
  })

  test('the angles still to take, and the send', () => {
    expect(carCheckGateRefusal({ required: true, anglesTaken: 6, sentAt: null })).toEqual({ missing: 2, notSent: true })
    expect(carCheckGateRefusal({ required: true, anglesTaken: 8, sentAt: null })).toEqual({ missing: 0, notSent: true })
    expect(carCheckGateRefusal({ required: true, anglesTaken: 8, sentAt: at(1) })).toBeNull()
  })

  test('sent is enough: a check sent under a waiver that was later undone never holds the job', () => {
    // The photos cannot be added to once sent, so missing angles could never be filled.
    expect(carCheckGateRefusal({ required: true, anglesTaken: 3, sentAt: at(1) })).toBeNull()
  })

  test('the words, one line each, and as one sentence', () => {
    expect(carCheckGateLines({ missing: 2, notSent: true })).toEqual([
      'Take 2 more car check photos',
      'Send the car check to the customer',
    ])
    expect(carCheckGateLines({ missing: 1, notSent: false })).toEqual(['Take 1 more car check photo'])
    expect(carCheckGateMessage({ missing: 2, notSent: true })).toBe(
      'Take 2 more car check photos, then send the car check to the customer.'
    )
    expect(carCheckGateMessage({ missing: 0, notSent: true })).toBe('Send the car check to the customer.')
  })
})

describe('the gate at a job step', () => {
  const base = { on: true, photosWaivedAt: null, photos: walkRound('before', 6), sentAt: null }

  test('pickup & drop: before Picked up, not at Start work', () => {
    expect(carCheckGateFor({ ...base, bookingType: 'pickup' }, 'picked_up')).toEqual({ missing: 2, notSent: true })
    expect(carCheckGateFor({ ...base, bookingType: 'pickup' }, 'start')).toBeNull()
  })

  test('doorstep: before Start job', () => {
    expect(carCheckGateFor({ ...base, bookingType: 'doorstep' }, 'start')).toEqual({ missing: 2, notSent: true })
  })

  test('not at the garage, not while off, not when waived, not once complete and sent', () => {
    expect(carCheckGateFor({ ...base, bookingType: 'dropin' }, 'start')).toBeNull()
    expect(carCheckGateFor({ ...base, on: false, bookingType: 'doorstep' }, 'start')).toBeNull()
    expect(carCheckGateFor({ ...base, photosWaivedAt: at(1), bookingType: 'doorstep' }, 'start')).toBeNull()
    expect(
      carCheckGateFor({ ...base, photos: walkRound('before'), sentAt: at(2), bookingType: 'doorstep' }, 'start')
    ).toBeNull()
  })

  test('sent with fewer angles while waived, then the waiver undone: the job still moves', () => {
    expect(carCheckGateFor({ ...base, photos: walkRound('before', 3), sentAt: at(2), bookingType: 'pickup' }, 'picked_up')).toBeNull()
  })
})

describe('the walk-round photos', () => {
  test("the garage's latest of each angle; customers' photos, extras and the interior do not count", () => {
    const photos = [
      photo('a', 'before', 'front', 1),
      photo('b', 'before', 'front', 5),
      photo('c', 'before', 'interior', 2),
      photo('d', 'before', null, 3),
      photo('e', 'before', 'back', 4, { uploadedByRole: 'customer' }),
      photo('f', 'after', 'left', 6),
    ]
    const before = carCheckPhotos(photos, 'before')
    expect([...before.keys()]).toEqual(['front'])
    expect(before.get('front')?.id).toBe('b')
  })

  test('sent, the before angles are fixed; extras and after photos are not', () => {
    expect(carCheckPhotoLocked({ stage: 'before', angle: 'front_left', sentAt: at(1) })).toBe(true)
    expect(carCheckPhotoLocked({ stage: 'before', angle: 'front_left', sentAt: null })).toBe(false)
    expect(carCheckPhotoLocked({ stage: 'before', angle: null, sentAt: at(1) })).toBe(false)
    expect(carCheckPhotoLocked({ stage: 'before', angle: 'interior', sentAt: at(1) })).toBe(false)
    expect(carCheckPhotoLocked({ stage: 'after', angle: 'front', sentAt: at(1) })).toBe(false)
  })

  test("Detlio reads the garage's car-check photos once", () => {
    expect(photoToRead({ angle: 'back_right', uploadedByRole: 'garage', conditionRead: null })).toBe(true)
    expect(photoToRead({ angle: 'back_right', uploadedByRole: 'garage', conditionRead: 'done' })).toBe(false)
    expect(photoToRead({ angle: 'back_right', uploadedByRole: 'garage', conditionRead: 'failed' })).toBe(false)
    expect(photoToRead({ angle: 'back', uploadedByRole: 'customer', conditionRead: null })).toBe(false)
    expect(photoToRead({ angle: 'interior', uploadedByRole: 'garage', conditionRead: null })).toBe(false)
  })
})

describe('sending, editing and answering', () => {
  test('send: while the job is open, once, with the angles it needs', () => {
    expect(sendRefusal({ status: 'confirmed', required: true, anglesTaken: 8, sentAt: null })).toBeNull()
    expect(sendRefusal({ status: 'confirmed', required: true, anglesTaken: 7, sentAt: null })).toBe('missing_angles')
    expect(sendRefusal({ status: 'confirmed', required: false, anglesTaken: 3, sentAt: null })).toBeNull()
    expect(sendRefusal({ status: 'confirmed', required: false, anglesTaken: 0, sentAt: null })).toBe('no_photos')
    expect(sendRefusal({ status: 'in_progress', required: false, anglesTaken: 3, sentAt: at(1) })).toBe('already_sent')
    expect(sendRefusal({ status: 'completed', required: false, anglesTaken: 8, sentAt: null })).toBe('job_over')
    expect(sendRefusal({ status: 'pending', required: false, anglesTaken: 8, sentAt: null })).toBe('job_over')
  })

  test('marks change until sent', () => {
    expect(markEditRefusal({ status: 'confirmed', sentAt: null })).toBeNull()
    expect(markEditRefusal({ status: 'confirmed', sentAt: at(1) })).toBe('sent')
    expect(markEditRefusal({ status: 'cancelled', sentAt: null })).toBe('job_over')
  })

  test('the customer answers once it is sent, once', () => {
    expect(answerRefusal({ status: 'confirmed', sentAt: null, answeredAt: null })).toBe('not_sent')
    expect(answerRefusal({ status: 'confirmed', sentAt: at(1), answeredAt: null })).toBeNull()
    expect(answerRefusal({ status: 'completed', sentAt: at(1), answeredAt: null })).toBeNull()
    expect(answerRefusal({ status: 'confirmed', sentAt: at(1), answeredAt: at(2) })).toBe('already_answered')
    expect(answerRefusal({ status: 'cancelled', sentAt: at(1), answeredAt: null })).toBe('job_over')
  })

  test('a note is tidied, and nothing is no note', () => {
    expect(cleanNote('  The dent was there\r\n before  ')).toBe('The dent was there\n before')
    expect(cleanNote('   ')).toBeNull()
    expect(cleanNote('x'.repeat(600))?.length).toBe(500)
  })
})

describe('marks', () => {
  test('the label', () => {
    expect(markLabel('scratch', 'rear left door')).toBe('Scratch – rear left door')
    expect(markLabel('paint_chip', 'bonnet')).toBe('Paint chip – bonnet')
    expect(markLabel('other', 'front bumper')).toBe('Mark – front bumper')
  })

  test('where on the car: one short line, lower case, never a digit', () => {
    expect(cleanPart('  Rear LEFT door ')).toBe('rear left door')
    expect(cleanPart('Front bumper, right')).toBe('front bumper, right')
    expect(cleanPart('plate TN 09 AB 1234')).toBe('plate tn ab')
    expect(cleanPart('1234')).toBeNull()
    expect(cleanPart('a'.repeat(100))?.length).toBe(60)
    expect(cleanPart('line one\nline two')).toBe('line one line two')
  })

  test('a box is kept inside the photo, or dropped', () => {
    expect(cleanBox({ x: 0.5, y: 0.4, w: 0.2, h: 0.1 })).toEqual({ x: 0.5, y: 0.4, w: 0.2, h: 0.1 })
    expect(cleanBox({ x: 0.9, y: -0.2, w: 0.5, h: 0.5 })).toEqual({ x: 0.9, y: 0, w: 0.1, h: 0.5 })
    expect(cleanBox({ x: 0.5, y: 0.5, w: 0.001, h: 0.2 })).toBeNull()
    expect(cleanBox({ x: Number.NaN, y: 0, w: 0.1, h: 0.1 })).toBeNull()
    expect(cleanBox(null)).toBeNull()
  })
})

describe('the views', () => {
  const link = (stored: string) => `https://signed.test/${stored}`
  const job = (extra: Partial<ConditionJob> = {}): ConditionJob => ({
    status: 'confirmed',
    bookingType: 'pickup',
    photosWaivedAt: null,
    photos: walkRound('before'),
    check: null,
    marks: [],
    ...extra,
  })

  test("the garage's: unread photos while AI is on, the gate, every mark of a standing photo", () => {
    const view = garageConditionView(
      job({
        photos: [...walkRound('before', 7), photo('old-front', 'before', 'front', -5, { conditionRead: 'done' })],
        marks: [
          mark('m1', 'before-front'),
          mark('m2', 'before-back', { removedAt: at(40) }),
          // On a photo a retake replaced: gone with it.
          mark('m3', 'old-front'),
        ],
      }),
      true
    )
    expect(view.required).toBe(true)
    expect(view.taken).toEqual({ before: 7, after: 0 })
    expect(view.canSend).toBe(false)
    expect(view.gate).toEqual({ missing: 1, notSent: true })
    expect(view.unread).toHaveLength(7)
    expect(view.marks.map((m) => [m.id, m.removed, m.label])).toEqual([
      ['m1', false, 'Scratch – rear left door'],
      ['m2', true, 'Scratch – rear left door'],
    ])
    expect(view.photos).toEqual([])
  })

  test('with AI off nothing waits to be read; sent, the before photos are not read', () => {
    expect(garageConditionView(job(), false).unread).toEqual([])
    const sent = garageConditionView(
      job({
        photos: [...walkRound('before'), photo('a1', 'after', 'front', 20)],
        check: { sentAt: at(10), customerAnswer: null, customerAnsweredAt: null, customerNote: null },
      }),
      true
    )
    expect(sent.unread).toEqual(['a1'])
    expect(sent.gate).toBeNull()
    expect(sent.canSend).toBe(false)
  })

  test("the customer's: nothing until sent", () => {
    expect(customerConditionView(job({ marks: [mark('m1', 'before-front')] }), true, link)).toBeNull()
  })

  test("the customer's: the sent photos with their own links, the marks not removed, the answer", () => {
    const view = customerConditionView(
      job({
        check: {
          sentAt: at(10),
          customerAnswer: 'something_wrong',
          customerAnsweredAt: at(12),
          customerNote: 'The dent was there before',
        },
        marks: [mark('m1', 'before-front'), mark('m2', 'before-back', { removedAt: at(40) })],
      }),
      true,
      link
    )!
    expect(view.photos).toHaveLength(8)
    expect(view.photos[0].url).toBe('https://signed.test/vendors/v/job-photos/b/before-front.jpg')
    expect(view.marks.map((m) => m.id)).toEqual(['m1'])
    expect(view.answer).toEqual({ kind: 'something_wrong', at: at(12).toISOString(), note: 'The dent was there before' })
    expect(view.unread).toEqual([])
    expect(view.gate).toBeNull()
  })

  test("the customer's: possible new marks only once the job is completed, with both photos", () => {
    const photos = [...walkRound('before'), photo('a-back', 'after', 'back', 50)]
    const newMark = mark('n1', 'a-back', { stage: 'after', comparedPhotoId: 'before-back', kind: 'dent', part: 'rear bumper' })
    const sentCheck = { sentAt: at(10), customerAnswer: null, customerAnsweredAt: null, customerNote: null }
    const working = customerConditionView(job({ status: 'in_progress', photos, check: sentCheck, marks: [newMark] }), true, link)!
    expect(working.marks).toEqual([])
    const done = customerConditionView(job({ status: 'completed', photos, check: sentCheck, marks: [newMark] }), true, link)!
    expect(done.marks.map((m) => [m.label, m.beforePhotoId])).toEqual([['Dent – rear bumper', 'before-back']])
    expect(done.photos.map((p) => p.id)).toContain('a-back')
    // Not sent, but a new mark after the job: just the two photos.
    const unsent = customerConditionView(job({ status: 'completed', photos, check: null, marks: [newMark] }), true, link)!
    expect(unsent.photos.map((p) => p.id).sort()).toEqual(['a-back', 'before-back'])
    expect(unsent.sentAt).toBeNull()
  })
})
