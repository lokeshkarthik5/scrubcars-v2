import { expect, test } from 'bun:test';

import { hubNavCurrent } from './hub-nav';

test('what the nav lights', () => {
  expect(hubNavCurrent('/home')).toBe('home');
  expect(hubNavCurrent('/map')).toBe('map');
  expect(hubNavCurrent('/garages')).toBeNull();
  expect(hubNavCurrent('/garages', { guest: true })).toBe('home');
  expect(hubNavCurrent('/bookings/abc')).toBe('bookings');
  expect(hubNavCurrent('/profile')).toBe('profile');
  expect(hubNavCurrent('/search')).toBeNull();
});
