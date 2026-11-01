import { describe, expect, test } from 'bun:test';

import { afterSignIn, heldLinkCode, rewriteSystemPath } from './deep-link';

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

test('afterSignIn checks the path', () => {
  expect(afterSignIn('/garage/abc', '/home')).toBe('/garage/abc');
  expect(afterSignIn('//evil.com', '/home')).toBe('/home');
  expect(afterSignIn(null, '/home')).toBe('/home');
});
