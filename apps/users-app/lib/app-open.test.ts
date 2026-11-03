import { visitAttribution } from '@repo/core/analytics-events';
import { expect, test } from 'bun:test';

test('a link\'s tags attribute the visit; a plain open is direct', () => {
  const tagged = visitAttribution({ search: '?utm_source=Instagram&utm_campaign=diwali', referrer: '', userAgent: '', ownHost: '' });
  expect(tagged.source).toBe('instagram');
  expect(tagged.campaign).toBe('diwali');
  expect(visitAttribution({ search: '', referrer: '', userAgent: '', ownHost: '' }).source).toBeUndefined();
});
