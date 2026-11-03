/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { scrubBreadcrumb, scrubEvent, scrubText } from './sentry-scrub';

test('phones, tokens and codes leave the text', () => {
  const text = scrubText(
    'Call +91 98765 43210 about code 4719 otp 123456 ExponentPushToken[abc] Bearer abc.def eyJa.eyJb.sig ' +
      'f'.repeat(64)
  );
  for (const secret of ['98765', '4719', '123456', 'ExponentPushToken', 'abc.def', 'eyJa', 'ffff']) {
    expect(text).not.toContain(secret);
  }
  expect(text).toContain('Call');
});

test('an event keeps where it broke and loses who', () => {
  const event = scrubEvent({
    message: 'failed for 9876543210',
    user: { id: 'u1', username: 'Meena' },
    request: { data: { code: '4719' } },
    extra: { phone: '9876543210' },
    server_name: "Meena's iPhone",
    contexts: { device: { name: "Meena's iPhone" }, os: { name: 'iOS' } },
    exception: { values: [{ value: 'Wrong code 4719' }] },
    breadcrumbs: [{ category: 'http', message: 'PATCH 4719', data: { url: '/bookings/x', body: '4719' } }],
  });
  expect(JSON.stringify(event)).not.toMatch(/Meena|4719|9876543210/);
  expect(event.user).toBeUndefined();
  expect(event.contexts?.os).toEqual({ name: 'iOS' });
  expect(event.exception?.values?.[0].value).toBe('Wrong code [removed]');
});

test('a breadcrumb keeps no data', () => {
  expect('data' in scrubBreadcrumb({ message: 'ok', data: { phone: '9876543210' } })).toBe(false);
});
