import { describe, expect, test } from 'bun:test';

import type { GarageRequest } from '@repo/core/api/booking-requests';

import {
  acceptedLine,
  acceptedToast,
  canAccept,
  needsTermsHint,
  chosenStart,
  closedBadge,
  declineToast,
  needsStartHint,
  reachGeometry,
  REQUESTS_INTRO,
  servicesLine,
  startTimeHeading,
  waitingLabel,
  whenWhereLine,
} from './requests-view';

const window = { date: '2026-11-02', part: 'morning' as const, label: 'Tomorrow 9–12', start: '', end: '' };

describe('lines', () => {
  test('intro says two hours', () => {
    expect(REQUESTS_INTRO).toBe(
      'Customers just outside your area ask you to come. Nothing is paid until you say yes. Answer within 2 hours, or we ask the next garage.'
    );
  });
  test('services line joins names and names the car type', () => {
    expect(servicesLine({ items: [{ name: 'A', amount: '1' }, { name: 'B', amount: '2' }], vehicleType: 'suv' })).toBe(
      'A + B · SUV'
    );
    expect(servicesLine({ items: [{ name: 'A', amount: '1' }], vehicleType: 'hatchback' })).toBe('A · Hatchback');
    expect(servicesLine({ items: [{ name: 'A', amount: '1' }], vehicleType: 'sedan' })).toBe('A · Sedan');
  });
  test('when and where, with or without an area', () => {
    expect(whenWhereLine({ window, area: 'Velachery' })).toBe('Tomorrow 9–12 · Velachery');
    expect(whenWhereLine({ window, area: null })).toBe('Tomorrow 9–12');
  });
  test('waiting label and start-time heading', () => {
    expect(waitingLabel({ passedOn: false })).toBe('New request · outside your area');
    expect(waitingLabel({ passedOn: true })).toBe('Passed on to you');
    // Ask for pickup (0079).
    expect(waitingLabel({ passedOn: false, bookingType: 'pickup' })).toBe('New request · Ask for pickup');
    expect(startTimeHeading({ window })).toBe('Start time, inside tomorrow 9–12');
  });
});

describe('closed badge', () => {
  test('a word per outcome, green only for booked', () => {
    expect(closedBadge({ status: 'converted' })).toEqual({ label: 'Booked', variant: 'success' });
    expect(closedBadge({ status: 'forwarded' })).toEqual({ label: 'Passed on', variant: 'muted' });
    expect(closedBadge({ status: 'declined' }).label).toBe('Declined');
    expect(closedBadge({ status: 'expired' }).label).toBe('Expired');
    expect(closedBadge({ status: 'cancelled' }).label).toBe('Cancelled');
  });
  test('a withdrawn yes says Withdrawn, and an unknown status is shown as it is', () => {
    expect(closedBadge({ status: 'cancelled', withdrawn: true }).label).toBe('Withdrawn');
    expect(closedBadge({ status: 'mystery' }).label).toBe('mystery');
  });
});

describe('accepted card', () => {
  test('line with start, fee and the confirm time (IST)', () => {
    const line = acceptedLine(
      { acceptedStartAt: '2026-10-17T04:30:00.000Z', travelFee: 100, confirmBy: '2026-10-16T06:11:00.000Z' },
      () => 'Sat 17 Oct, 10:00 am'
    );
    expect(line).toBe('Accepted · starts Sat 17 Oct, 10:00 am · travel fee ₹100 · customer confirms by 11:41 am');
  });
  test('dashes for missing times, ₹0 for no fee', () => {
    expect(
      acceptedLine(
        { acceptedStartAt: '2026-10-17T04:30:00.000Z', travelFee: 180, confirmBy: '2026-10-16T06:11:00.000Z', bookingType: 'pickup' },
        () => 'Sat 17 Oct, 10:00 am'
      )
    ).toBe('Accepted · starts Sat 17 Oct, 10:00 am · pickup fee ₹180 · customer confirms by 11:41 am');
    expect(acceptedLine({ acceptedStartAt: null, travelFee: null, confirmBy: null }, () => 'x')).toBe(
      'Accepted · starts — · travel fee ₹0 · customer confirms by —'
    );
  });
  test('toasts', () => {
    expect(acceptedToast('2026-10-16T06:11:00.000Z')).toBe('Accepted. The customer has until 11:41 am to confirm.');
    expect(acceptedToast(null)).toBe('Accepted.');
    expect(declineToast('passed_on')).toBe('Passed to the next garage');
    expect(declineToast('ended')).toBe('Request closed');
  });
});

describe('start time choice', () => {
  const starts = ['a', 'b'];
  test('only a time still on offer counts as chosen', () => {
    expect(chosenStart('a', starts)).toBe('a');
    expect(chosenStart('z', starts)).toBeNull();
    expect(chosenStart(null, starts)).toBeNull();
  });
  test('Accept needs a time and no answer under way', () => {
    expect(canAccept('a', false)).toBe(true);
    expect(canAccept(null, false)).toBe(false);
    expect(canAccept('a', true)).toBe(false);
    // Ask for pickup (0079): the responsibility tick too.
    expect(canAccept('a', false, true, false)).toBe(false);
    expect(canAccept('a', false, true, true)).toBe(true);
    expect(needsTermsHint('a', true, false)).toBe(true);
    expect(needsTermsHint(null, true, false)).toBe(false);
    expect(needsTermsHint('a', false, false)).toBe(false);
  });
  test('the hint shows only while times are offered and none is chosen', () => {
    expect(needsStartHint(null, 3)).toBe(true);
    expect(needsStartHint('a', 3)).toBe(false);
    expect(needsStartHint(null, 0)).toBe(false);
  });
});

describe('reachGeometry', () => {
  test('the customer 8 km out of a 5 km reach', () => {
    const g = reachGeometry({ coverKm: 5, distanceKm: 8, outsideKm: 3 });
    const scale = (300 - 40 - 24) / 8;
    expect(g.r).toBeCloseTo(5 * scale);
    expect(g.dot).toBeCloseTo(40 + 8 * scale);
    expect(g.dot).toBeLessThanOrEqual(300 - 24 + 0.001);
    expect(g.youLabel).toBe('you · 5 km');
    expect(g.label).toBe('Your reach 5 km, the customer 8 km from you');
  });
  test('a drawn area (no radius) works the cover out from how far outside they are', () => {
    const g = reachGeometry({ coverKm: null, distanceKm: 6, outsideKm: 2 });
    expect(g.r).toBeCloseTo(4 * ((300 - 40 - 24) / 6));
    expect(g.youLabel).toBe('you · area');
    expect(g.label).toBe('Your reach (your area), the customer 6 km from you');
  });
  test('a tiny reach still draws a circle at least 10 wide', () => {
    expect(reachGeometry({ coverKm: 0.1, distanceKm: 50, outsideKm: 49.9 }).r).toBe(10);
  });
  test('the sketch is 300 by 96 with the garage mid-height', () => {
    const g = reachGeometry({ coverKm: 5, distanceKm: 8, outsideKm: 3 });
    expect([g.width, g.height, g.cx, g.cy]).toEqual([300, 96, 40, 48]);
  });
});
