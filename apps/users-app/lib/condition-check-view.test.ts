import { describe, expect, test } from 'bun:test';
import type { Booking, ConditionCheck, JobPhoto } from '@repo/core/types';

import { canAnswerConditionCheck, marksFoundLine, newMarkComplaint, shownBeforeSlots } from './condition-check-view';

const check = (overrides: Partial<ConditionCheck> = {}): ConditionCheck => ({
  required: true,
  ai: true,
  sentAt: '2026-11-15T04:10:00Z',
  canSend: false,
  taken: { before: 8, after: 0 },
  unread: [],
  marks: [],
  photos: [],
  answer: null,
  gate: null,
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

describe('the answer buttons', () => {
  const booking = (status: Booking['status'], conditionCheck: ConditionCheck | null = check()) => ({ status, conditionCheck });

  test('show on a sent, unanswered check while the booking stands', () => {
    expect(canAnswerConditionCheck(booking('confirmed'))).toBe(true);
    expect(canAnswerConditionCheck(booking('in_progress'))).toBe(true);
    expect(canAnswerConditionCheck(booking('completed'))).toBe(true);
  });

  test('hide on a cancelled or moved booking, once answered, or before it is sent', () => {
    expect(canAnswerConditionCheck(booking('cancelled'))).toBe(false);
    expect(canAnswerConditionCheck(booking('rescheduled'))).toBe(false);
    expect(
      canAnswerConditionCheck(
        booking('confirmed', check({ answer: { kind: 'looks_right', at: '2026-11-15T04:20:00Z', note: null } }))
      )
    ).toBe(false);
    expect(canAnswerConditionCheck(booking('confirmed', check({ sentAt: null })))).toBe(false);
    expect(canAnswerConditionCheck(booking('confirmed', null))).toBe(false);
  });
});

test('the line under the title, as the web words it', () => {
  expect(marksFoundLine(0)).toBe('Detlio found no marks.');
  expect(marksFoundLine(1)).toBe('Detlio marked 1 thing already there.');
  expect(marksFoundLine(3)).toBe('Detlio marked 3 things already there.');
});

test("the check's own before photos, latest per angle, in walk-round order", () => {
  const slots = shownBeforeSlots([photo('p2', 'back'), photo('p1', 'front'), photo('p1b', 'front'), photo('a1', 'front', 'after')]);
  expect(slots.map((slot) => [slot.angle, slot.photo.id])).toEqual([
    ['front', 'p1b'],
    ['back', 'p2'],
  ]);
});

test('Raise a complaint starts as Damage to my car, about the mark', () => {
  expect(newMarkComplaint({ kind: 'dent', part: 'rear bumper' })).toEqual({
    category: 'damage',
    message: 'Dent – rear bumper: it is not in the car check photos from before the job.',
  });
});
