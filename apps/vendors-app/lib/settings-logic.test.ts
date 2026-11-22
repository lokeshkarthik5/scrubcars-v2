import { describe, expect, test } from 'bun:test';

import {
  addDays,
  bookingsSentence,
  capacityFromVendor,
  capacityPayload,
  capacityProblem,
  closureWindow,
  decimalOnly,
  digitsOnly,
  formatDay,
  hoursSummary,
  initialTab,
  mapWorkingHours,
  normalizeTimeForApi,
  normalizeTimeForInput,
  profilePayload,
  settingsSection,
  shortClock,
  sortClosures,
  todayKey,
  workingHoursPayload,
} from './settings-logic';

describe('initialTab', () => {
  test('opens the requested tab', () => {
    expect(initialTab('time-off')).toBe('time-off');
    expect(initialTab('account')).toBe('account');
    expect(initialTab(['hours'])).toBe('hours');
  });
  test('lands on Profile otherwise', () => {
    expect(initialTab(undefined)).toBe('profile');
    expect(initialTab('nope')).toBe('profile');
  });
});

describe('capacityProblem', () => {
  test('accepts bays 1 to 20 and a blank or 1 to 500 daily limit', () => {
    expect(capacityProblem('1', '')).toBeNull();
    expect(capacityProblem('20', '500')).toBeNull();
    expect(capacityProblem('3', '  ')).toBeNull();
  });
  test('refuses bad bays', () => {
    expect(capacityProblem('', '')).toBe('Cars at the same time must be between 1 and 20.');
    expect(capacityProblem('0', '')).not.toBeNull();
    expect(capacityProblem('21', '')).not.toBeNull();
    expect(capacityProblem('2.5', '')).not.toBeNull();
  });
  test('refuses a bad daily limit', () => {
    expect(capacityProblem('2', '0')).toBe('Jobs in a day must be between 1 and 500, or left blank.');
    expect(capacityProblem('2', '501')).not.toBeNull();
    expect(capacityProblem('2', '1e2')).not.toBeNull();
  });
});

describe('capacity form', () => {
  test('unset bays read as one and no cap as blank', () => {
    expect(capacityFromVendor({ bays: null, jobsPerDay: null })).toEqual({ bays: '1', jobsPerDay: '' });
    expect(capacityFromVendor({ bays: 0, jobsPerDay: 12 })).toEqual({ bays: '1', jobsPerDay: '12' });
    expect(capacityFromVendor({ bays: 4, jobsPerDay: 30 })).toEqual({ bays: '4', jobsPerDay: '30' });
  });
  test('a blank daily limit is sent as null', () => {
    expect(capacityPayload({ bays: '3', jobsPerDay: ' ' })).toEqual({ bays: 3, jobsPerDay: null });
    expect(capacityPayload({ bays: '3', jobsPerDay: '25' })).toEqual({ bays: 3, jobsPerDay: 25 });
  });
});

describe('inputs', () => {
  test('digitsOnly strips and cuts', () => {
    expect(digitsOnly('98a76-54321 09', 10)).toBe('9876543210');
    expect(digitsOnly('60-00 01 9', 6)).toBe('600001');
  });
  test('decimalOnly keeps digits and dots', () => {
    expect(decimalOnly('8.5km')).toBe('8.5');
    expect(decimalOnly('12345.67', 4)).toBe('1234');
  });
});

describe('profilePayload', () => {
  const form = { businessName: 'A', phone: '9000000000', address: 'x', city: 'y', pincode: '600001' };
  test('resends the pin as a map pin', () => {
    expect(profilePayload(form, { lat: 13.1, lng: 80.2 })).toEqual({ ...form, lat: 13.1, lng: 80.2, geoSource: 'map_pin' });
  });
  test('sends no pin for an unpinned garage', () => {
    const body = profilePayload(form, { lat: null, lng: null });
    expect(body.lat).toBeUndefined();
    expect(body.lng).toBeUndefined();
    expect(body.geoSource).toBeUndefined();
  });
});

describe('working hours', () => {
  test('times show as HH:MM and go as HH:MM:SS', () => {
    expect(normalizeTimeForInput('09:30:00')).toBe('09:30');
    expect(normalizeTimeForApi('09:30')).toBe('09:30:00');
    expect(normalizeTimeForApi('09:30:00')).toBe('09:30:00');
  });
  test('seven rows Sun to Sat with 09:00 to 18:00 where the server has none', () => {
    const rows = mapWorkingHours([
      { id: 'a', dayOfWeek: 0, openTime: '00:00:00', closeTime: '00:00:00', isClosed: true },
      { id: 'b', dayOfWeek: 3, openTime: '08:30:00', closeTime: '20:00:00', isClosed: false },
    ]);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rows[0]).toEqual({ dayOfWeek: 0, openTime: '00:00', closeTime: '00:00', isClosed: true });
    expect(rows[3]).toEqual({ dayOfWeek: 3, openTime: '08:30', closeTime: '20:00', isClosed: false });
    expect(rows[1]).toEqual({ dayOfWeek: 1, openTime: '09:00', closeTime: '18:00', isClosed: false });
  });
  test('the payload carries seconds', () => {
    const body = workingHoursPayload(mapWorkingHours([]));
    expect(body[0]).toEqual({ dayOfWeek: 0, openTime: '09:00:00', closeTime: '18:00:00', isClosed: false });
  });
});

describe('holiday window', () => {
  test('today is the IST day, not the UTC one', () => {
    // 20:00 UTC on 19 Oct is 01:30 IST on 20 Oct.
    expect(todayKey(new Date('2026-10-19T20:00:00Z'))).toBe('2026-10-20');
    expect(todayKey(new Date('2026-10-19T10:00:00Z'))).toBe('2026-10-19');
  });
  test('addDays crosses months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01');
  });
  test('the window is today to 365 days ahead', () => {
    expect(closureWindow(new Date('2026-11-01T06:00:00Z'))).toEqual({ min: '2026-11-01', max: '2027-11-01' });
  });
  test('formatDay reads a calendar day', () => {
    expect(formatDay('2026-10-20')).toContain('20 Oct');
  });
  test('sortClosures orders by date without mutating', () => {
    const list = [{ date: '2026-11-02' }, { date: '2026-10-30' }];
    expect(sortClosures(list).map((c) => c.date)).toEqual(['2026-10-30', '2026-11-02']);
    expect(list[0].date).toBe('2026-11-02');
  });
  test('the bookings sentence is singular or plural', () => {
    expect(bookingsSentence(1)).toBe('You have 1 booking that day — reschedule or cancel it with the customer.');
    expect(bookingsSentence(3)).toBe('You have 3 bookings that day — reschedule or cancel them with the customers.');
  });
});

describe('settingsSection', () => {
  test('opens the section a link names, old tab names included', () => {
    expect(settingsSection('location')).toBe('location');
    expect(settingsSection('time-off')).toBe('time-off');
    expect(settingsSection(['capacity'])).toBe('capacity');
  });
  test('the menu otherwise, Account (the old last tab) included', () => {
    expect(settingsSection('account')).toBeNull();
    expect(settingsSection(undefined)).toBeNull();
    expect(settingsSection('nope')).toBeNull();
  });
});

describe('hoursSummary', () => {
  const day = (openTime: string, closeTime: string, isClosed = false) => ({ openTime, closeTime, isClosed });
  test('the hours every open day keeps, or Varies by day', () => {
    expect(hoursSummary([day('09:00:00', '20:00:00'), day('09:00', '20:00'), day('10:00:00', '18:00:00', true)])).toBe(
      '9 am – 8 pm'
    );
    expect(hoursSummary([day('09:00:00', '20:00:00'), day('10:00:00', '14:30:00')])).toBe('Varies by day');
  });
  test('half hours and noon', () => {
    expect(shortClock('12:30:00')).toBe('12:30 pm');
    expect(shortClock('00:00')).toBe('12 am');
    expect(shortClock('08:15')).toBe('8:15 am');
  });
  test('closed every day', () => {
    expect(hoursSummary([day('09:00', '18:00', true)])).toBe('Closed');
  });
});
