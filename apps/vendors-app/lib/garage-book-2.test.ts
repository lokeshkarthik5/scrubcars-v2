/// <reference types="bun" />
import { expect, test } from 'bun:test';

import type { ImportRow } from '@repo/core/api/garage-book';

import {
  billDate,
  categoryChips,
  dayMonth,
  changePacks,
  countTyping,
  expenseSub,
  expenseTitle,
  importFlag,
  importKind,
  importLine,
  importPayload,
  moneyTyping,
  monthShort,
  onNowLine,
  orderLineName,
  orderLines,
  orderPayload,
  orderTotal,
  packLine,
  posterHtml,
  qrMatrix,
  qrPath,
  rupeesToPaise,
  shortUrl,
  spentShare,
  stepAmount,
  stockLeftLine,
  stockUseLine,
  supplierLine,
  toggleWorker,
  unitWord,
} from './garage-book-2';

test('rupees typed by the owner become paise', () => {
  expect(rupeesToPaise('1,200')).toBe(120_000);
  expect(rupeesToPaise('₹ 499.5')).toBe(49_950);
  expect(rupeesToPaise('0.50')).toBeNull();
  expect(rupeesToPaise('abc')).toBeNull();
  expect(rupeesToPaise('1.234')).toBeNull();
  expect(rupeesToPaise('2000000')).toBeNull();
  expect(moneyTyping('1,2a00.505')).toBe('1200.50');
  expect(moneyTyping('12')).toBe('12');
});

test('expense lines read as the mockup does', () => {
  const arun = { id: 'm1', name: 'Arun' };
  expect(expenseTitle({ category: 'advance', note: null, member: arun })).toBe('Advance · Arun');
  expect(expenseTitle({ category: 'rent', note: 'Shop rent', member: null })).toBe('Shop rent');
  expect(expenseTitle({ category: 'power_water', note: '  ', member: null })).toBe('Power & water');
  expect(expenseSub({ category: 'advance', method: 'cash', member: arun, fromOrder: null })).toBe('Cash · in Team too');
  expect(expenseSub({ category: 'supplies', method: 'upi', member: null, fromOrder: { id: 'o1', supplier: 'Sri Balaji Supplies' } })).toBe(
    'Sri Balaji Supplies · UPI · from an order'
  );
  expect(expenseSub({ category: 'rent', method: null, member: null, fromOrder: null })).toBe('');
});

test('the spent bar and the category chips', () => {
  expect(spentShare(184_300_00, 38_200_00)).toEqual({ kept: 79, spent: 21 });
  expect(spentShare(0, 0)).toEqual({ kept: 0, spent: 0 });
  expect(spentShare(1000, 2000)).toEqual({ kept: 0, spent: 100 });
  expect(categoryChips({ salary: 2_400_000, advance: 0, rent: 800_000, supplies: 460_000, power_water: 160_000, other: 0 }).map((c) => c.category)).toEqual([
    'salary',
    'rent',
    'supplies',
    'power_water',
  ]);
});

test('who did it toggles, and who is on what now', () => {
  expect(toggleWorker(['a'], 'b')).toEqual(['a', 'b']);
  expect(toggleWorker(['a', 'b'], 'a')).toEqual(['b']);
  expect(onNowLine({ plate: 'TN09AB4521', car: 'Creta', service: 'Interior clean' })).toBe('On now · Creta · Interior clean');
  expect(onNowLine({ plate: 'TN09AB4521', car: null, service: null })).toBe('On now · TN09AB4521');
});

test('stock words and steps', () => {
  expect(packLine({ packSize: 5000, unit: 'ml' })).toBe('5 L');
  expect(packLine({ packSize: null, unit: 'ml' })).toBe('');
  expect(stockLeftLine({ jobsLeft: 6, level: 600, unit: 'ml' })).toBe('About 6 jobs');
  expect(stockLeftLine({ jobsLeft: 1, level: 150, unit: 'ml' })).toBe('About 1 job');
  expect(stockLeftLine({ jobsLeft: null, level: 10, unit: 'pcs' })).toBe('10 pcs left');
  expect(stockUseLine({ level: 600, unit: 'ml', usedThisMonth: 7200, jobsThisMonth: 48 })).toBe('600 ml · used 7.2 L on 48 jobs this month');
  expect(stockUseLine({ level: 600, unit: 'ml', usedThisMonth: 0, jobsThisMonth: 0 })).toBe('600 ml');
  expect(unitWord('l')).toBe('L');
  expect(unitWord('pcs')).toBe('pcs');
  expect(stepAmount(150, 'ml', 1)).toBe(160);
  expect(stepAmount(0, 'ml', -1)).toBe(0);
  expect(stepAmount(0.2, 'l', 1)).toBe(0.3);
  expect(stepAmount(3, 'pcs', -1)).toBe(2);
  expect(countTyping('4.1')).toBe(4.1);
  expect(countTyping('')).toBeNull();
  expect(countTyping('-2')).toBeNull();
});

test('an order from the suggestion: packs, total, what is sent', () => {
  const lines = orderLines({
    supplier: { id: 's1', name: 'Sri Balaji', phone: '9840000000', lastOrderAt: '2026-11-08T05:00:00.000Z' },
    totalPaise: 0,
    lines: [
      { itemId: 'i1', name: 'Foam shampoo', unit: 'ml', level: 600, packSize: 5000, packPricePaise: 115_000, packs: 2 },
      { itemId: 'i2', name: 'Cloths', unit: 'pcs', level: 2, packSize: null, packPricePaise: null, packs: 0 },
    ],
  });
  expect(lines[1]!.packs).toBe(1);
  expect(orderLineName(lines[0]!)).toBe('Foam shampoo 5 L');
  expect(orderLineName(lines[1]!)).toBe('Cloths');
  expect(orderTotal(lines)).toBe(230_000);
  const fewer = changePacks(lines, 'i2', -1);
  expect(fewer[1]!.packs).toBe(0);
  expect(orderPayload('s1', fewer)).toEqual({ supplierId: 's1', lines: [{ itemId: 'i1', packs: 2, packPricePaise: 115_000 }] });
  expect(changePacks(lines, 'i1', 1)[0]!.packs).toBe(3);
  expect(supplierLine({ phone: '9840000000', lastOrderAt: '2026-11-08T05:00:00.000Z' })).toBe('Your supplier · WhatsApp · last order 8 Nov');
  expect(supplierLine({ phone: null, lastOrderAt: null })).toBe('Your supplier · No mobile');
});

const row = (over: Partial<ImportRow>): ImportRow => ({
  name: 'Suresh Kumar',
  phone: '9840012345',
  plate: 'TN 09 AB 4521',
  car: 'Creta',
  lastVisit: null,
  owesPaise: null,
  unsure: [],
  note: null,
  match: null,
  ...over,
});

test('import rows: what needs a look, and what is sent', () => {
  expect(importFlag(row({}))).toBeNull();
  expect(importFlag(row({ unsure: ['phone'], phone: '98?40 1123?' }))).toBe('Phone not clear: 98?40 1123?');
  expect(importFlag(row({ match: { customerId: 'c1', name: 'Anitha', by: 'phone' } }))).toBe('Same phone as a customer you have');
  expect(importFlag(row({ name: null, phone: null, plate: null }))).toBe('Nothing to add');
  expect(importLine(row({ owesPaise: 640_000 }))).toBe('98400 12345 · TN 09 AB 4521 · Creta · owes ₹6,400');
  const rows = [row({}), row({ name: 'Ramesh' }), row({ name: null, phone: null, plate: null })];
  expect(importPayload(rows, new Set([1]))).toEqual([
    { name: 'Suresh Kumar', phone: '9840012345', plate: 'TN 09 AB 4521', car: 'Creta', lastVisit: null, owesPaise: null },
  ]);
  expect(importKind('page.JPG', null)).toBe('photo');
  expect(importKind('book.pdf', 'application/pdf')).toBe('pdf');
  expect(importKind('tally.xlsx', 'application/octet-stream')).toBe('sheet');
  expect(importKind('notes.txt', 'text/plain')).toBeNull();
});

test('the booking link QR is a real, square QR', () => {
  const matrix = qrMatrix('https://detlio.com/g/sample-car-care');
  expect(matrix.length).toBeGreaterThanOrEqual(21);
  expect(matrix.every((r) => r.length === matrix.length)).toBe(true);
  // The three finder squares' corners are dark.
  expect(matrix[0]![0]).toBe(true);
  expect(matrix[0]![matrix.length - 1]).toBe(true);
  expect(matrix[matrix.length - 1]![0]).toBe(true);
  expect(qrPath([[true, true, false, true]])).toBe('M0 0h2v1h-2zM3 0h1v1h-1z');
  expect(shortUrl('https://detlio.com/g/sample-car-care')).toBe('detlio.com/g/sample-car-care');
});

test('dates as a bill and a list print them', () => {
  expect(dayMonth('2026-11-08')).toBe('8 Nov');
  expect(billDate('2026-11-12')).toBe('12 Nov 2026');
  expect(dayMonth('soon')).toBe('soon');
  expect(monthShort('2026-11')).toBe('Nov');
});

test('the poster names the garage safely and carries the QR', () => {
  const html = posterHtml('Sri <Balaji> & Sons', 'https://detlio.com/g/sri-balaji');
  expect(html).toContain('Sri &lt;Balaji&gt; &amp; Sons');
  expect(html).toContain('detlio.com/g/sri-balaji');
  expect(html).toMatch(/<path d="M\d/);
});
