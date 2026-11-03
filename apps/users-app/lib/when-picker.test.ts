import { expect, test } from 'bun:test';

import { addDaysToKey, dateChipOf, firstOpenDayAfter, istDay, istToday, splitByMorning } from './when-picker';

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
