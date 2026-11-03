import { expect, test } from 'bun:test';

import { levelMetal, splitBig } from './wrapped-look';

test('a figure splits from its unit; a name stays whole', () => {
  expect(splitBig('18 washes')).toEqual({ figure: '18', unit: 'washes' });
  expect(splitBig('₹1,240')).toEqual({ figure: '₹1,240', unit: '' });
  expect(splitBig('Gold')).toBeNull();
  expect(splitBig('July')).toBeNull();
});

test('every level has a metal, never red', () => {
  for (const level of ['member', 'silver', 'gold', 'platinum', 'diamond', 'icon']) expect(levelMetal(level).base).not.toContain('E4002B');
});
