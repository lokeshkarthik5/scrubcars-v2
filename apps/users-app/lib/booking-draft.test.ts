import { describe, expect, mock, test } from 'bun:test';

mock.module('expo-secure-store', () => ({ getItem: () => null, setItem: () => undefined, deleteItemAsync: async () => undefined }));

const { draftResumePath, draftSlotStillAhead, parseBookingDraft } = await import('./booking-draft');

const NOW = 1_800_000_000_000;
const good = { vendorId: 'v', vendorName: 'G', serviceIds: ['s'], mode: 'dropin', slot: null, car: null, address: null, savedAt: NOW - 1000 };

describe('a draft on the phone', () => {
  test('reads back with its add-ons', () => {
    expect(parseBookingDraft(JSON.stringify({ ...good, addOnIds: ['a'] }), NOW)?.addOnIds).toEqual(['a']);
  });
  test('one over a day old is gone', () => {
    expect(parseBookingDraft(JSON.stringify({ ...good, savedAt: NOW - 25 * 3600_000 }), NOW)).toBeNull();
  });
  test('nonsense is gone', () => {
    expect(parseBookingDraft('{', NOW)).toBeNull();
    expect(parseBookingDraft(JSON.stringify({ ...good, serviceIds: [] }), NOW)).toBeNull();
  });
  test('a slot that has passed is dropped', () => {
    expect(draftSlotStillAhead(new Date(NOW - 1).toISOString(), NOW)).toBeNull();
    expect(draftSlotStillAhead(new Date(NOW + 1).toISOString(), NOW)).not.toBeNull();
  });
  test('resumes at its own garage and mode', () => {
    expect(draftResumePath({ vendorId: 'v', serviceIds: ['s', 't'], mode: 'doorstep', addOnIds: ['a'] })).toBe(
      '/book/v?service=s%2Ct&mode=doorstep&addons=a'
    );
  });
});
