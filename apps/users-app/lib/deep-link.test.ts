import { describe, expect, test } from 'bun:test';

import { heldLinkCode, rewriteSystemPath } from './deep-link';
import { otpFlow } from './otp-flow';

describe('rewriteSystemPath', () => {
  test('the web address, the scheme, and Expo Go', () => {
    expect(rewriteSystemPath('https://detlio.com/garage/abc?mode=doorstep')).toBe('/garage/abc?mode=doorstep');
    expect(rewriteSystemPath('detlio://garage/abc')).toBe('/garage/abc');
    expect(rewriteSystemPath('exp://127.0.0.1:8081/--/map')).toBe('/map');
    expect(rewriteSystemPath('exp://127.0.0.1:8081')).toBe('/');
    expect(rewriteSystemPath('/bookings/abc')).toBe('/bookings/abc');
  });
  test.each(['c', 'gift', 'invite'])('a /%s link: the code never goes on with the URL', (kind) => {
    const out = rewriteSystemPath(`https://detlio.com/${kind}/SECRET123?x=1`);
    expect(out).toBe('/');
    expect(out).not.toContain('SECRET123');
    expect(heldLinkCode.take()).toEqual({ kind: kind as 'c', code: 'SECRET123' });
    expect(heldLinkCode.take()).toBeNull();
  });
  test('never throws', () => {
    expect(rewriteSystemPath('http://[bad')).toBe('/');
  });
});

test('where signing in goes on to', () => {
  otpFlow.setNext('/garage/abc');
  expect(otpFlow.takeDestination()).toBe('/garage/abc');
  expect(otpFlow.takeWelcome()).toBe(false);
  otpFlow.setNext('//evil.com');
  expect(otpFlow.takeDestination()).toBe('/home');
  expect(otpFlow.takeWelcome()).toBe(true);
  expect(otpFlow.takeWelcome()).toBe(false);
});

test('a held coupon code stays until it is cleared, and only for its kind', () => {
  rewriteSystemPath('/c/DTLSECRET');
  expect(heldLinkCode.peek('c')).toBe('DTLSECRET');
  expect(heldLinkCode.peek('gift')).toBeNull();
  expect(heldLinkCode.peek('c')).toBe('DTLSECRET');
  heldLinkCode.clear();
  expect(heldLinkCode.peek('c')).toBeNull();
});

test('the web\'s complaints anchor opens the complaints screen', () => {
  expect(rewriteSystemPath('/profile#my-complaints')).toBe('/profile/complaints');
  expect(rewriteSystemPath('/profile')).toBe('/profile');
});

test('a help anchor opens that answer', () => {
  expect(rewriteSystemPath('/help#cancel')).toBe('/help?open=cancel');
});
