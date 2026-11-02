/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { itemIdParam, locateItem, type ScopeLookup, scrollTarget } from './focus-item';

const AT = 1000;
const loaded = (ids: string[], updatedAt = AT + 5): ScopeLookup => ({ ids, updatedAt, failedAt: 0 });
const waiting: ScopeLookup = { ids: undefined, updatedAt: 0, failedAt: 0 };
const failed: ScopeLookup = { ids: undefined, updatedAt: 0, failedAt: AT + 5 };

test('the id is read from the param', () => {
  expect(itemIdParam('c1')).toBe('c1');
  expect(itemIdParam(' c1 ')).toBe('c1');
  expect(itemIdParam(['c1', 'c2'])).toBe('c1');
  expect(itemIdParam('')).toBeNull();
  expect(itemIdParam('   ')).toBeNull();
  expect(itemIdParam(undefined)).toBeNull();
  expect(itemIdParam(null)).toBeNull();
  expect(itemIdParam([])).toBeNull();
  expect(itemIdParam('x'.repeat(101))).toBeNull();
});

test('Open is shown when it holds the item, whatever Closed says', () => {
  expect(locateItem('c1', AT, loaded(['c1']), loaded(['c1']))).toEqual({ scope: 'open' });
  expect(locateItem('c1', AT, loaded(['c1']), waiting)).toEqual({ scope: 'open' });
});

test('Closed is tried once Open has loaded without it', () => {
  expect(locateItem('c1', AT, loaded(['c2']), waiting)).toBe('wait');
  expect(locateItem('c1', AT, loaded(['c2']), loaded(['c1']))).toEqual({ scope: 'closed' });
});

test('an id in neither list is missing', () => {
  expect(locateItem('c1', AT, loaded(['c2']), loaded(['c3']))).toBe('missing');
  expect(locateItem('c1', AT, loaded([]), loaded([]))).toBe('missing');
});

test('Open comes first: it is waited for even if Closed has the item', () => {
  expect(locateItem('c1', AT, waiting, loaded(['c1']))).toBe('wait');
});

test('a list from before the item was named is not trusted', () => {
  expect(locateItem('c1', AT, loaded(['c2'], AT - 1), loaded(['c1']))).toBe('wait');
  expect(locateItem('c1', AT, loaded(['c1'], AT - 1), waiting)).toBe('wait');
});

test('a list that will not load never says the item is gone', () => {
  expect(locateItem('c1', AT, failed, loaded(['c2']))).toBe('unknown');
  expect(locateItem('c1', AT, loaded(['c2']), failed)).toBe('unknown');
  expect(locateItem('c1', AT, failed, failed)).toBe('unknown');
  expect(locateItem('c1', AT, failed, loaded(['c1']))).toEqual({ scope: 'closed' });
  expect(locateItem('c1', AT, failed, waiting)).toBe('wait');
});

test('an earlier failure does not count', () => {
  expect(locateItem('c1', AT, { ids: undefined, updatedAt: 0, failedAt: AT - 1 }, waiting)).toBe('wait');
});

test('the scroll leaves a little room above the card and never goes negative', () => {
  expect(scrollTarget(200, 300)).toBe(484);
  expect(scrollTarget(0, 4)).toBe(0);
  expect(scrollTarget(100, 50, 0)).toBe(150);
});
