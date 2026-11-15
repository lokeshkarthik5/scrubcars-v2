import { describe, expect, test } from 'bun:test'
import type { ConditionCheck, ConditionMark, JobPhoto } from '@repo/core/types'
import {
  beforeMarks,
  carCheckGateLines,
  carCheckSlots,
  markLabel,
  newMarksForCustomer,
  newMarksForGarage,
  photoById,
} from './condition-check'

const photo = (id: string, stage: 'before' | 'after', angle: JobPhoto['angle'], by: JobPhoto['by'] = 'garage'): JobPhoto => ({
  id,
  stage,
  angle,
  by,
  url: `https://signed.test/${id}`,
  createdAt: '2026-11-15T04:00:00.000Z',
})

const mark = (id: string, extra: Partial<ConditionMark> = {}): ConditionMark => ({
  id,
  photoId: 'p1',
  beforePhotoId: null,
  stage: 'before',
  kind: 'scratch',
  part: 'rear left door',
  label: 'Scratch – rear left door',
  box: null,
  unsure: false,
  source: 'ai',
  removed: false,
  garageAnswer: null,
  customerAnswer: null,
  ...extra,
})

const check = (marks: ConditionMark[]): ConditionCheck => ({
  required: true,
  ai: true,
  sentAt: null,
  canSend: false,
  taken: { before: 0, after: 0 },
  unread: [],
  marks,
  photos: [],
  answer: null,
  gate: null,
})

describe('car condition check (core)', () => {
  test('the walk-round slots: the latest garage photo of each of the 8 angles', () => {
    const slots = carCheckSlots(
      [photo('a', 'before', 'front'), photo('b', 'before', 'front'), photo('c', 'before', 'back_left'), photo('d', 'before', 'left', 'customer')],
      'before'
    )
    expect(slots.map((slot) => slot.angle)).toEqual([
      'front',
      'back',
      'left',
      'right',
      'front_left',
      'front_right',
      'back_left',
      'back_right',
    ])
    expect(slots[0].photo?.id).toBe('b')
    expect(slots[2].photo).toBeNull()
    expect(slots[6].photo?.id).toBe('c')
  })

  test('the gate lines', () => {
    expect(carCheckGateLines(null)).toEqual([])
    expect(carCheckGateLines({ missing: 2, notSent: true })).toEqual([
      'Take 2 more car check photos',
      'Send the car check to the customer',
    ])
    expect(carCheckGateLines({ missing: 1, notSent: false })).toEqual(['Take 1 more car check photo'])
  })

  test('labels and which marks each side still has', () => {
    expect(markLabel({ kind: 'paint_chip', part: 'bonnet' })).toBe('Paint chip – bonnet')
    const c = check([
      mark('b1'),
      mark('b2', { removed: true }),
      mark('a1', { stage: 'after' }),
      mark('a2', { stage: 'after', garageAnswer: 'was_there' }),
      mark('a3', { stage: 'after', customerAnswer: 'already_there' }),
    ])
    expect(beforeMarks(c).map((m) => m.id)).toEqual(['b1'])
    expect(beforeMarks(c, true).map((m) => m.id)).toEqual(['b1', 'b2'])
    expect(newMarksForGarage(c).map((m) => m.id)).toEqual(['a1', 'a3'])
    expect(newMarksForCustomer(c).map((m) => m.id)).toEqual(['a1', 'a2'])
    expect(newMarksForGarage(null)).toEqual([])
  })

  test('a photo by id', () => {
    const photos = [photo('x', 'after', 'back')]
    expect(photoById(photos, 'x')?.angle).toBe('back')
    expect(photoById(photos, null)).toBeNull()
    expect(photoById(photos, 'y')).toBeNull()
  })
})
