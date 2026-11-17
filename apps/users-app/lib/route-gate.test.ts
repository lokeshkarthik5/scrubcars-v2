import { describe, expect, test } from 'bun:test';

import { gateRedirect } from './route-gate';

const guest = { signedIn: false, incomplete: false };
const customer = { signedIn: true, incomplete: false };
const newCustomer = { signedIn: true, incomplete: true };

describe('gateRedirect', () => {
  test('a guest browses everything but their own feed', () => {
    for (const path of ['/garages', '/map', '/search', '/garage/abc', '/book/abc', '/bookings', '/profile']) {
      expect(gateRedirect(path, guest)).toBeNull();
    }
    expect(gateRedirect('/updates', guest)).toBe('/login');
    // Repair quotes (0075): one customer's own requests.
    expect(gateRedirect('/repair-quotes/new', guest)).toBe('/login');
    expect(gateRedirect('/repair-quotes/abc', customer)).toBeNull();
  });
  test("a guest's Home is the list, and so is the start", () => {
    expect(gateRedirect('/home', guest)).toBe('/garages');
    expect(gateRedirect('/', guest)).toBe('/garages');
  });
  test('signed in, the sign-in screens move on', () => {
    expect(gateRedirect('/login', customer)).toBe('/home');
    expect(gateRedirect('/verify-otp', customer)).toBe('/home');
    expect(gateRedirect('/', customer)).toBe('/home');
  });
  test('sign-up is finished before anything guarded', () => {
    expect(gateRedirect('/verify-otp', newCustomer)).toBe('/profile-setup');
    expect(gateRedirect('/updates', newCustomer)).toBe('/profile-setup');
    expect(gateRedirect('/profile-setup', newCustomer)).toBeNull();
    expect(gateRedirect('/garages', newCustomer)).toBeNull();
  });
});
