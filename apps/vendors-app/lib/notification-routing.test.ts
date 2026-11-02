/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { tabFromQuery } from './jobs';
import { pathFromPushUrl } from './notification-routing';

test('every push path the server sends (lib/push-messages.ts) keeps its target', () => {
  expect(pathFromPushUrl('/bookings?tab=incoming#job-j1')).toBe('/bookings?tab=incoming&job=j1');
  expect(pathFromPushUrl('/bookings?tab=upcoming#job-j1')).toBe('/bookings?tab=upcoming&job=j1');
  expect(pathFromPushUrl('/bookings?tab=completed#job-j1')).toBe('/bookings?tab=completed&job=j1');
  expect(pathFromPushUrl('/bookings?tab=cancelled#job-j1')).toBe('/bookings?tab=cancelled&job=j1');
  expect(pathFromPushUrl('/guarantee#claim-c1')).toBe('/guarantee?claim=c1');
  expect(pathFromPushUrl('/requests')).toBe('/requests');
  expect(pathFromPushUrl('/requests#request-r1')).toBe('/requests?request=r1');
  expect(pathFromPushUrl('/settings/notifications')).toBe('/settings/notifications');
});

test("the old tab names land on today's lists", () => {
  expect(tabFromQuery('incoming')).toBe('new');
  expect(tabFromQuery('upcoming')).toBe('today');
  expect(tabFromQuery('completed')).toBe('done');
  expect(tabFromQuery('cancelled')).toBe('done');
});

test('anything else opens the start, as the service worker does', () => {
  for (const url of ['https://evil.example/x', '//evil.example/x', 'bookings', '', undefined, null, 42]) {
    expect(pathFromPushUrl(url)).toBe('/');
  }
});
