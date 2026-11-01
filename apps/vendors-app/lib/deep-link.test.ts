/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { afterSignIn, rewriteSystemPath } from './deep-link';

test("the server's push link keeps its tab and its job", () => {
  expect(rewriteSystemPath('/bookings?tab=incoming#job-abc')).toBe('/bookings?tab=incoming&job=abc');
  expect(rewriteSystemPath('https://vendor.detlio.com/bookings?tab=upcoming#job-abc')).toBe(
    '/bookings?tab=upcoming&job=abc'
  );
});

test("the app's own scheme reads the same", () => {
  expect(rewriteSystemPath('detliogarages://bookings?tab=cancelled#job-abc')).toBe('/bookings?tab=cancelled&job=abc');
  expect(rewriteSystemPath('detliogarages://bookings/abc')).toBe('/bookings/abc');
  expect(rewriteSystemPath('detliogarages://home')).toBe('/home');
  expect(rewriteSystemPath('detliogarages:///settings/notifications')).toBe('/settings/notifications');
});

test("Expo Go's path prefix goes", () => {
  expect(rewriteSystemPath('exp://127.0.0.1:8081/--/bookings?tab=new')).toBe('/bookings?tab=new');
  expect(rewriteSystemPath('exp://127.0.0.1:8081')).toBe('/');
});

test('other paths, and a hash that is not a job, pass through', () => {
  expect(rewriteSystemPath('/guarantee#claim-1')).toBe('/guarantee');
  expect(rewriteSystemPath('/requests')).toBe('/requests');
  expect(rewriteSystemPath('/bookings?tab=new#job-')).toBe('/bookings?tab=new');
});

test('a link is only followed inside the app', () => {
  expect(afterSignIn('/bookings?tab=new', '/home')).toBe('/bookings?tab=new');
  expect(afterSignIn('//evil.com', '/home')).toBe('/home');
  expect(afterSignIn(null, '/home')).toBe('/home');
});
