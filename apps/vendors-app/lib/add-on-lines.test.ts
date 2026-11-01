import { expect, test } from 'bun:test';
import type { Booking } from '@repo/core/types';

import { listServicesLine, serviceOnlyLine } from './add-on-lines';

const item = (name: string, amount: number, isAddon?: boolean) => ({
  id: name,
  serviceId: name,
  name,
  amount,
  durationMins: 30,
  ...(isAddon ? { isAddon: true } : {}),
});

const booking = (items: ReturnType<typeof item>[], serviceSummary: string) => ({ items, serviceSummary }) as unknown as Booking;

test('services alone on the card, each add-on is its own line elsewhere', () => {
  const b = booking([item('Foam wash', 600), item('Helmet wash', 99, true), item('Air freshener', 49, true)], 'Foam wash + 2 add-ons');
  expect(serviceOnlyLine(b)).toBe('Foam wash');
});

test('a list row says "+ 2 add-ons" rather than naming an add-on as a service', () => {
  const b = booking([item('Foam wash', 600), item('Helmet wash', 99, true)], 'Foam wash + 1 add-on');
  expect(listServicesLine(b)).toBe('Foam wash + 1 add-on');
});

test('no add-ons: nothing changes', () => {
  const b = booking([item('Foam wash', 600), item('Vacuum', 200)], 'Foam wash + Vacuum');
  expect(listServicesLine(b)).toBe('Foam wash + Vacuum');
  expect(serviceOnlyLine(b)).toBe('Foam wash + Vacuum');
});

test('the final bill is seeded with services only', async () => {
  const { serviceLinesOf } = await import('@repo/core/add-ons');
  const lines = serviceLinesOf([item('Inspection', 299), item('Helmet wash', 99, true)]);
  expect(lines.map((l) => l.name)).toEqual(['Inspection']);
});
