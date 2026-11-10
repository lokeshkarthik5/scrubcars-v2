import { describe, expect, test } from 'bun:test';

import { addDaysToKey, dateChipOf, firstOpenDayAfter, istDay, istToday, linkedSlot, slotTaken, splitByMorning } from './when-picker';

test('the day is India\'s, not the phone\'s', () => {
  expect(istToday(Date.UTC(2026, 10, 2, 19, 0))).toBe('2026-11-03');
  expect(istDay('2026-11-02T18:29:00Z')).toBe('2026-11-02');
});
test('a day and its chip', () => {
  expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
  expect(dateChipOf('2026-11-02').dayName).toBe('Mon');
});
test('skips closed days', () => {
  expect(firstOpenDayAfter('2026-11-01', -1, (k) => k === '2026-11-01', 3)).toBe('2026-11-02');
});
test('morning is by IST', () => {
  expect(splitByMorning(['2026-11-02T06:00:00Z', '2026-11-02T06:30:00Z'])).toEqual({
    morning: ['2026-11-02T06:00:00Z'],
    later: ['2026-11-02T06:30:00Z'],
  });
});

// 9 Nov 2026, 10:00 IST.
const NOW = Date.parse('2026-11-09T04:30:00.000Z');

describe('a time from a card\'s Next free row', () => {
  test('is kept while it is ahead, in one ISO spelling', () => {
    expect(linkedSlot('2026-11-09T05:30:00.000Z', NOW)).toBe('2026-11-09T05:30:00.000Z');
    expect(linkedSlot('2026-11-09T11:00:00+05:30', NOW)).toBe('2026-11-09T05:30:00.000Z');
  });

  test('a time gone by, or not a time, is no time', () => {
    expect(linkedSlot('2026-11-09T04:00:00.000Z', NOW)).toBeNull();
    expect(linkedSlot('soon', NOW)).toBeNull();
    expect(linkedSlot(null, NOW)).toBeNull();
  });
});

describe('a chosen time that was just taken', () => {
  const day = '2026-11-09';
  const times = ['2026-11-09T05:30:00.000Z', '2026-11-09T06:30:00.000Z'];

  test('is taken once its own day no longer lists it', () => {
    expect(slotTaken('2026-11-09T07:30:00.000Z', day, times)).toBe(true);
    expect(slotTaken('2026-11-09T06:30:00.000Z', day, times)).toBe(false);
    expect(slotTaken('2026-11-09T12:00:00+05:30', day, times)).toBe(false);
  });

  test('says nothing before the day is known, or for a time on another day', () => {
    expect(slotTaken('2026-11-09T07:30:00.000Z', day, null)).toBe(false);
    expect(slotTaken('2026-11-10T07:30:00.000Z', day, times)).toBe(false);
    expect(slotTaken(null, day, times)).toBe(false);
  });
});
