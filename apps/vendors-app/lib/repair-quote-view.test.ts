/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { quoteProblem, rupees } from './repair-quote-view';

test('rupees from what was typed', () => {
  expect(rupees('4,000')).toBe(4000);
  expect(rupees('₹ 5500')).toBe(5500);
  expect(rupees('')).toBeNull();
  // Paise are dropped, never read as more digits.
  expect(rupees('4000.50')).toBe(4000);
});

test('the quote form says what is missing, in order', () => {
  expect(quoteProblem({ from: 4000, to: 5500, days: 2 })).toBeNull();
  expect(quoteProblem({ from: null, to: 5500, days: 2 })).toBe('Enter a price from');
  expect(quoteProblem({ from: 4000, to: null, days: 2 })).toBe('Enter a price to');
  expect(quoteProblem({ from: 5500, to: 4000, days: 2 })).toBe('The price to must be the same as or above the price from');
  expect(quoteProblem({ from: 4000, to: 900000, days: 2 })).toBe('That price is too high');
  expect(quoteProblem({ from: 4000, to: 5500, days: null })).toBe('Pick the days needed');
  expect(quoteProblem({ from: 4000, to: 5500, days: 31 })).toBe('Pick the days needed');
});
