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

test('a claim and a request travel as claim= and request=', () => {
  expect(rewriteSystemPath('/guarantee#claim-c1')).toBe('/guarantee?claim=c1');
  expect(rewriteSystemPath('/requests#request-r1')).toBe('/requests?request=r1');
  expect(rewriteSystemPath('https://vendor.detlio.com/guarantee#claim-c1')).toBe('/guarantee?claim=c1');
  expect(rewriteSystemPath('detliogarages://guarantee#claim-c1')).toBe('/guarantee?claim=c1');
  expect(rewriteSystemPath('detliogarages://requests#request-r1')).toBe('/requests?request=r1');
  expect(rewriteSystemPath('exp://127.0.0.1:8081/--/guarantee?claim=c1')).toBe('/guarantee?claim=c1');
  expect(rewriteSystemPath('exp://127.0.0.1:8081/--/requests?request=r1')).toBe('/requests?request=r1');
});

test('ids with odd characters survive the round trip', () => {
  const id = '0b1c2d3e-aaaa-bbbb-cccc-1234567890ab';
  expect(rewriteSystemPath(`/guarantee#claim-${id}`)).toBe(`/guarantee?claim=${id}`);
  expect(new URLSearchParams(rewriteSystemPath('/requests#request-a%20b').split('?')[1]).get('request')).toBe('a%20b');
});

test('other paths, and a hash that names nothing, pass through', () => {
  expect(rewriteSystemPath('/requests')).toBe('/requests');
  expect(rewriteSystemPath('/guarantee')).toBe('/guarantee');
  expect(rewriteSystemPath('/settings/notifications')).toBe('/settings/notifications');
  expect(rewriteSystemPath('/bookings?tab=new#job-')).toBe('/bookings?tab=new');
  expect(rewriteSystemPath('/guarantee#claim-')).toBe('/guarantee');
  expect(rewriteSystemPath('/requests#request-')).toBe('/requests');
  expect(rewriteSystemPath('/guarantee#other-c1')).toBe('/guarantee');
});

test('a claim already in the query is kept', () => {
  expect(rewriteSystemPath('/guarantee?claim=c1')).toBe('/guarantee?claim=c1');
  expect(rewriteSystemPath('/requests?request=r1')).toBe('/requests?request=r1');
});

test('signing in first still arrives at the claim, the request and the job', () => {
  expect(afterSignIn('/guarantee?claim=c1', '/home')).toBe('/guarantee?claim=c1');
  expect(afterSignIn('/requests?request=r1', '/home')).toBe('/requests?request=r1');
  expect(afterSignIn('/bookings?tab=new&job=j1', '/home')).toBe('/bookings?tab=new&job=j1');
});

test('a link is only followed inside the app', () => {
  expect(afterSignIn('/bookings?tab=new', '/home')).toBe('/bookings?tab=new');
  expect(afterSignIn('//evil.com', '/home')).toBe('/home');
  expect(afterSignIn(null, '/home')).toBe('/home');
});

test('a repair quote travels as repair= (0075)', () => {
  expect(rewriteSystemPath('/requests#repair-q1')).toBe('/requests?repair=q1');
});
