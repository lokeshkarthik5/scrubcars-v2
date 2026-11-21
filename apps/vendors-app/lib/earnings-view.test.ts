/// <reference types="bun" />
import { expect, test } from 'bun:test';

import type { GarageStatementLine } from '@repo/core/api/earnings';

import {
  balanceFootnote,
  balanceTiles,
  changeRangeDate,
  csvFileName,
  datesFailedLine,
  lineBalanceNote,
  lineFigureRows,
  lineMeta,
  lineTitle,
  payoutNote,
  rangeForPreset,
  statementCsvText,
} from './earnings-view';

function line(over: Partial<GarageStatementLine> = {}): GarageStatementLine {
  return {
    bookingId: 'b1',
    reference: 'AB12',
    payableFrom: '2026-10-17T06:30:00.000Z',
    scheduledAt: null,
    customerFirstName: 'Priya',
    services: ['Foam wash', 'Interior clean'],
    bookingType: 'dropin',
    kind: 'job',
    price: 1000,
    detlioPromo: 0,
    garagePromo: 0,
    refunds: 0,
    commission: { rates: [0.08], amount: 80, freePosition: null, freeOf: 25 },
    share: 920,
    heldByGarage: 0,
    due: 920,
    paid: 0,
    balance: 920,
    status: 'due',
    payouts: [],
    ...over,
  };
}

const NOW = new Date('2026-10-20T10:00:00+05:30');

test('quick periods give IST ranges and Dates keeps the one on screen', () => {
  const current = { from: '2026-10-01', to: '2026-10-05' };
  expect(rangeForPreset('last30', current, NOW)).toEqual({ from: '2026-09-21', to: '2026-10-20' });
  expect(rangeForPreset('thisMonth', current, NOW)).toEqual({ from: '2026-10-01', to: '2026-10-20' });
  expect(rangeForPreset('lastMonth', current, NOW)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  expect(rangeForPreset('custom', current, NOW)).toBe(current);
});

test('last month across New Year', () => {
  expect(rangeForPreset('lastMonth', { from: '', to: '' }, new Date('2027-01-05T10:00:00+05:30'))).toEqual({
    from: '2026-12-01',
    to: '2026-12-31',
  });
});

test('a custom date is taken only when it is a date and From stays on or before To', () => {
  const range = { from: '2026-10-01', to: '2026-10-20' };
  expect(changeRangeDate(range, 'from', '2026-10-10')).toEqual({ from: '2026-10-10', to: '2026-10-20' });
  expect(changeRangeDate(range, 'to', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-01' });
  expect(changeRangeDate(range, 'from', '2026-10-21')).toBeNull();
  expect(changeRangeDate(range, 'to', '2026-09-30')).toBeNull();
  expect(changeRangeDate(range, 'from', '')).toBeNull();
  expect(changeRangeDate(range, 'from', '10/10/2026')).toBeNull();
  expect(changeRangeDate(range, 'from', '2026-13-45')).toBeNull();
  // Nothing changed: nothing to load again.
  expect(changeRangeDate(range, 'from', '2026-10-01')).toBeNull();
});

test('the failed-dates line names the range still shown', () => {
  expect(datesFailedLine({ from: '2026-09-21', to: '2026-10-20' })).toBe(
    "Couldn't load those dates. Showing 21 Sep 2026 to 20 Oct 2026."
  );
});

const summary = (over: object = {}) => ({
  balanceDue: 1500,
  bookingsDue: 2,
  oldestUnpaidAt: null as string | null,
  overdue: false,
  paidThisMonth: 4200.5,
  freeBookings: { used: 25, of: 25 },
  ...over,
});

test('balance tiles: due now, oldest, owed to Detlio', () => {
  expect(balanceTiles({ cycleHours: 24, summary: summary() }).due).toEqual({
    label: 'Due now',
    value: '₹1,500',
    hint: 'Paid within 24 hours',
  });
  expect(balanceTiles({ cycleHours: 24, summary: summary({ oldestUnpaidAt: '2026-10-17T06:30:00.000Z' }) }).due.hint).toBe(
    'Oldest from 17 Oct 2026'
  );
  const owed = balanceTiles({ cycleHours: 24, summary: summary({ balanceDue: -320 }) });
  expect(owed.owesDetlio).toBe(true);
  expect(owed.due).toEqual({ label: 'You owe Detlio', value: '₹320', hint: 'Comes off your next payout' });
  expect(owed.paid).toEqual({ label: 'Paid this month', value: '₹4,200.50' });
});

test('the footnote says the free bookings only while some are left', () => {
  const base = 'Detlio pays your share within 24 hours of each job, by bank transfer or UPI. ';
  expect(balanceFootnote({ cycleHours: 24, summary: summary() })).toBe(
    `${base}Commission is 8% on washes, packages and others, 5% on detailing, coating, scratch removal, general service, repairs and dent & paint.`
  );
  expect(balanceFootnote({ cycleHours: 24, summary: summary({ freeBookings: { used: 7, of: 25 } }) })).toEndWith(
    ' Your first 25 bookings are free: 7 used so far.'
  );
});

test('a plain line: price, commission, share', () => {
  const rows = lineFigureRows(line());
  expect(rows.map((r) => r.key)).toEqual(['price', 'commission', 'share']);
  expect(rows[1]).toMatchObject({ label: 'Detlio commission', value: '−8% · ₹80', free: false });
  expect(rows[2]).toMatchObject({ value: '₹920', strong: true });
});

test('a pickup booking’s pickup fee names the road km (0079)', () => {
  const rows = lineFigureRows(line({ bookingType: 'pickup', travelFee: 99, roadKm: 6.2 }));
  expect(rows.find((r) => r.key === 'travel')).toMatchObject({
    label: 'Pickup & drop · 6.2 km (yours, no commission)',
    value: '₹99',
  });
});

test('every breakdown row, in the web order, with its minus signs', () => {
  const rows = lineFigureRows(
    line({ travelFee: 150, detlioPromo: 100, garagePromo: 50, refunds: 25, heldByGarage: 400 })
  );
  expect(rows.map((r) => [r.label, r.value])).toEqual([
    ['Price', '₹1,000'],
    ['Travel fee (yours, no commission)', '₹150'],
    ['Detlio promo (paid by Detlio)', '₹100'],
    ['Your promo', '−₹50'],
    ['Refunded', '−₹25'],
    ['Detlio commission', '−8% · ₹80'],
    ['Your share', '₹920'],
    ['Cash you collected', '−₹400'],
  ]);
});

test('inside the free bookings the commission reads free, with no minus', () => {
  const rows = lineFigureRows(line({ commission: { rates: [], amount: 0, freePosition: 3, freeOf: 25 } }));
  expect(rows.find((r) => r.key === 'commission')).toMatchObject({
    value: 'Free — booking 3 of your first 25',
    free: true,
  });
});

test('title and meta of a line', () => {
  expect(lineTitle(line())).toBe('Foam wash + Interior clean');
  expect(lineTitle(line({ services: [] }))).toBe('Booking');
  expect(lineMeta(line()).map((s) => s.text).join('')).toBe('Priya · 17 Oct 2026 · #AB12');
});

test('payout notes say paid or taken back', () => {
  const paid = { payoutId: 'p1', reference: 'UTR9', paidAt: '2026-10-18T06:30:00.000Z', amount: 300 };
  expect(payoutNote(paid).map((s) => s.text).join('')).toBe('Paid ₹300 on 18 Oct 2026, ref UTR9');
  expect(payoutNote({ ...paid, amount: -300 }).map((s) => s.text).join('')).toBe(
    'Taken back ₹300 on 18 Oct 2026, ref UTR9'
  );
});

test('balance notes: part-paid and owed back', () => {
  const text = (s: ReturnType<typeof lineBalanceNote>) => s?.map((x) => x.text).join('');
  expect(text(lineBalanceNote(line({ status: 'due', paid: 0, balance: 920 })))).toBeUndefined();
  expect(text(lineBalanceNote(line({ status: 'due', paid: 300, balance: 620 })))).toBe('₹620 more to come');
  expect(text(lineBalanceNote(line({ status: 'owed_back', paid: 920, balance: -40 })))).toBe(
    '₹40 comes off your next payout'
  );
  expect(lineBalanceNote(line({ status: 'paid', paid: 920, balance: 0 }))).toBeNull();
});

test('CSV: file name, byte-order mark, header and CRLF rows', () => {
  expect(csvFileName({ from: '2026-09-21', to: '2026-10-20' })).toBe('detlio-earnings-2026-09-21-to-2026-10-20.csv');
  const text = statementCsvText([line({ customerFirstName: 'Arjun, K' })]);
  expect(text.charCodeAt(0)).toBe(0xfeff);
  const rows = text.slice(1).split('\r\n');
  expect(rows[0].startsWith('Booking,Payable from (IST),Customer,Services,Price')).toBe(true);
  expect(rows[1]).toContain('#AB12,17 Oct 2026,"Arjun, K",Foam wash + Interior clean,1000.00');
  expect(rows[2]).toBe('');
});
