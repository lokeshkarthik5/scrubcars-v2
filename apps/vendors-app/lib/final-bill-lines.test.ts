import { describe, expect, test } from 'bun:test';

import { seedLines, serviceLinesOf } from './final-bill-lines';

const items = [
  { name: 'Inspection', amount: 299 },
  { name: 'Helmet wash', amount: 99, isAddon: true },
];

describe('final bill lines', () => {
  test('an add-on is not seeded into the bill', () => {
    expect(seedLines(items, 20, 80)).toEqual([{ description: 'Inspection', amount: '299' }]);
  });
  test('a booking without the field behaves as before', () => {
    const old = [{ name: 'Wash', amount: 500 }, { name: 'Wax', amount: 200, isAddon: null }];
    expect(serviceLinesOf(old)).toHaveLength(2);
  });
  test('caps lines and description length', () => {
    expect(seedLines([{ name: 'abcdef', amount: 1 }, { name: 'x', amount: 2 }], 1, 3)).toEqual([
      { description: 'abc', amount: '1' },
    ]);
  });
});
