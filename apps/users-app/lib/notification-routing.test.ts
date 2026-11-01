/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { pathFromPushUrl } from './notification-routing';

test('every customer push path the server sends keeps its target', () => {
  // apps/server/src/lib/push-messages.ts, rewards.ts, wrapped.ts
  for (const path of [
    '/bookings/b1',
    '/requests',
    '/home',
    '/garages',
    '/profile/rewards',
    '/profile/rewards/wrapped?year=2026',
    '/profile/notifications',
    '/profile/complaints',
    '/profile/credit',
    '/profile/cars/v1',
    '/book/g1?service=s1&mode=doorstep&date=2026-11-02',
    '/updates',
  ]) {
    expect(pathFromPushUrl(path)).toBe(path);
  }
});

test('a complaint answer opens the profile, its anchor dropped', () => {
  expect(pathFromPushUrl('/profile#my-complaints')).toBe('/profile');
});

test('anything that is not a path on this app opens the start', () => {
  expect(pathFromPushUrl('https://evil.example/x')).toBe('/');
  expect(pathFromPushUrl('//evil.example/x')).toBe('/');
  expect(pathFromPushUrl(undefined)).toBe('/');
  expect(pathFromPushUrl(42)).toBe('/');
});

test('a code in a link never comes through', () => {
  expect(pathFromPushUrl('/c/SECRET')).toBe('/');
  expect(pathFromPushUrl('/gift/SECRET')).toBe('/');
});
