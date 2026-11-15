import { describe, expect, test } from 'bun:test';
import type { Booking, ConditionCheck, ConditionMark, JobPhoto } from '@repo/core/types';

import {
  carCheckSummaryLine,
  checkTheMarksLine,
  inPairs,
  marksOnSlots,
  photoChecklist,
  selectedSlot,
  takenBeforeSlots,
} from './condition-view';

const check = (overrides: Partial<ConditionCheck> = {}): ConditionCheck => ({
  required: true,
  ai: true,
  sentAt: null,
  canSend: false,
  taken: { before: 2, after: 0 },
  unread: [],
  marks: [],
  photos: [],
  answer: null,
  gate: { missing: 6, notSent: true },
  ...overrides,
});

const photo = (id: string, angle: JobPhoto['angle'], stage: JobPhoto['stage'] = 'before'): JobPhoto => ({
  id,
  stage,
  url: `https://r2.example/${id}.jpg`,
  createdAt: '2026-11-15T04:00:00Z',
  angle,
  by: 'garage',
});

const mark = (id: string, photoId: string, overrides: Partial<ConditionMark> = {}): ConditionMark => ({
  id,
  photoId,
  beforePhotoId: null,
  stage: 'before',
  kind: 'scratch',
  part: 'rear left door',
  label: 'Scratch – rear left door',
  box: { x: 0.1, y: 0.4, w: 0.2, h: 0.2 },
  unsure: false,
  source: 'ai',
  removed: false,
  garageAnswer: null,
  customerAnswer: null,
  ...overrides,
});

const booking = (overrides: Partial<Booking> = {}) =>
  ({ id: 'b1', bookingType: 'doorstep', jobPhotos: [], photoStandard: null, conditionCheck: null, ...overrides }) as Booking;

describe('photoChecklist', () => {
  test('off: the 5-slot checklist and the photo standard, exactly as before', () => {
    const list = photoChecklist(
      booking({ photoStandard: { required: true, waived: false } as Booking['photoStandard'] }),
      'before'
    );
    expect(list.carCheck).toBe(false);
    expect(list.angles).toEqual(['front', 'back', 'left', 'right', 'interior']);
    expect(list.required).toBe(true);
    expect(list.locked).toBe(false);
    expect(list.cap).toBe(6);
  });

  test('on: the 8-angle walk-round, required before only when the server says so', () => {
    const b = booking({
      conditionCheck: check(),
      jobPhotos: [photo('p1', 'front'), photo('p2', 'front_left'), photo('p3', null)],
    });
    const before = photoChecklist(b, 'before');
    expect(before.carCheck).toBe(true);
    expect(before.angles).toHaveLength(8);
    expect(before.required).toBe(true);
    expect(before.cap).toBe(12);
    // The extra (no angle) is not a walk-round angle.
    expect(before.taken).toBe(2);
    expect(photoChecklist(b, 'after').required).toBe(false);
    // Optional at the garage, or waived: the server sends required false.
    expect(photoChecklist(booking({ conditionCheck: check({ required: false }) }), 'before').required).toBe(false);
  });

  test('sent: the before angles are locked, the after ones are not', () => {
    const b = booking({ conditionCheck: check({ sentAt: '2026-11-15T04:10:00Z', gate: null }) });
    expect(photoChecklist(b, 'before').locked).toBe(true);
    expect(photoChecklist(b, 'after').locked).toBe(false);
  });
});

test('inPairs lays tiles out two to a row, the last row padded', () => {
  expect(inPairs([1, 2, 3])).toEqual([
    [1, 2],
    [3, null],
  ]);
  expect(inPairs([])).toEqual([]);
});

describe('carCheckSummaryLine', () => {
  test('nothing before the first photo, or once sent', () => {
    expect(carCheckSummaryLine(check({ taken: { before: 0, after: 0 } }), 'Rahul')).toBeNull();
    expect(carCheckSummaryLine(check({ sentAt: '2026-11-15T04:10:00Z' }), 'Rahul')).toBeNull();
  });

  test('still looking, the count it found, or a plain ask with the AI off', () => {
    expect(carCheckSummaryLine(check({ unread: ['p1'] }), 'Rahul')).toBe('Detlio is looking for scratches and dents…');
    expect(carCheckSummaryLine(check({ marks: [mark('m1', 'p1')] }), 'Rahul')).toBe(
      'Detlio found 1 mark. Check it, then send it to Rahul.'
    );
    expect(
      carCheckSummaryLine(check({ marks: [mark('m1', 'p1'), mark('m2', 'p1'), mark('m3', 'p1', { removed: true })] }), 'Rahul')
    ).toBe('Detlio found 2 marks. Check them, then send them to Rahul.');
    expect(carCheckSummaryLine(check({ ai: false }), 'Rahul')).toBe('Check the photos for marks, then send them to Rahul.');
  });
});

describe('Check the marks', () => {
  const photos = [photo('p1', 'front'), photo('p2', 'back'), photo('p0', 'front'), photo('a1', 'front', 'after')];

  test('the latest before photo of each angle, in walk-round order', () => {
    const slots = takenBeforeSlots(photos);
    expect(slots.map((slot) => slot.photo.id)).toEqual(['p0', 'p2']);
  });

  test('marks on a retaken photo drop out; removed ones stay for Undo', () => {
    const slots = takenBeforeSlots(photos);
    const c = check({
      marks: [mark('m1', 'p1'), mark('m2', 'p2', { removed: true }), mark('m3', 'a1', { stage: 'after' })],
    });
    expect(marksOnSlots(c, slots).map((m) => m.id)).toEqual(['m2']);
  });

  test('the photo in view: tapped, else the first with a mark, else the first', () => {
    const slots = takenBeforeSlots(photos);
    expect(selectedSlot(slots, [], null)?.photo.id).toBe('p0');
    expect(selectedSlot(slots, [mark('m2', 'p2')], null)?.photo.id).toBe('p2');
    expect(selectedSlot(slots, [mark('m2', 'p2')], 'p0')?.photo.id).toBe('p0');
    expect(selectedSlot([], [], null)).toBeUndefined();
  });

  test('its line, as the web words it', () => {
    const words = { who: 'Rahul', car: 'Swift', sentTime: null };
    expect(checkTheMarksLine(check({ unread: ['p1', 'p2'] }), 0, words)).toBe('Detlio is still looking at 2 photos…');
    expect(checkTheMarksLine(check({ ai: false }), 0, words)).toBe(
      'Add any scratches or dents you see on Rahul’s Swift, then send.'
    );
    expect(checkTheMarksLine(check(), 1, words)).toBe(
      'Detlio found 1 mark on Rahul’s Swift. Remove it if it is wrong, then send.'
    );
    expect(checkTheMarksLine(check(), 3, words)).toBe(
      'Detlio found 3 marks on Rahul’s Swift. Remove any that are wrong, then send.'
    );
    expect(checkTheMarksLine(check({ sentAt: '2026-11-15T04:10:00Z' }), 3, { ...words, sentTime: '9:40 am' })).toBe(
      'Sent to Rahul at 9:40 am. The photos and marks stay with the booking.'
    );
  });
});
