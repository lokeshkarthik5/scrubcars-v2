/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { acceptedLine, dayOf, graceLine, publishedLine, tickDetail, tickKeyFor } from './agreement-view';

test('days are read in IST', () => {
  // 20:00 UTC on the 2nd is already the 3rd in India.
  expect(dayOf('2026-11-02T20:00:00.000Z')).toBe('3 Nov 2026');
});

test('the tick belongs to one garage and one version', () => {
  expect(tickKeyFor('g1', 2)).toBe('g1:2');
  expect(tickKeyFor('g1', 3)).not.toBe(tickKeyFor('g1', 2));
  expect(tickKeyFor('g2', 2)).not.toBe(tickKeyFor('g1', 2));
  expect(tickKeyFor('g1', null)).toBeNull();
  expect(tickKeyFor('g1', undefined)).toBeNull();
});

test('the lines read as the web reads', () => {
  expect(publishedLine('2026-11-03T05:00:00.000Z', null)).toBe('Published 3 Nov 2026');
  expect(publishedLine('2026-11-03T05:00:00.000Z', 'Adds pickup terms')).toBe(
    'Published 3 Nov 2026 · Adds pickup terms'
  );
  expect(acceptedLine('2026-11-03T05:00:00.000Z', 'Om')).toBe(
    'On 3 Nov 2026, by Om. You hold Bronze while this is the latest version.'
  );
  expect(graceLine(2, '3 Dec 2026')).toBe('Detlio updated the agreement. Accept v2 by 3 Dec 2026 to keep your tier.');
  expect(tickDetail('Detlio garage agreement v2')).toBe(
    'I have read the Detlio garage agreement v2 and agree to it for my garage.'
  );
});
