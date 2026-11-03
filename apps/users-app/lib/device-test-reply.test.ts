import { ApiError } from '@repo/core/api/client';
import { expect, test } from 'bun:test';

import { deviceTestReply } from './device-test-reply';

test('what the server answered', () => {
  expect(deviceTestReply({ result: 'sent' })).toEqual({ kind: 'sent', message: 'Sent. It should show in a few seconds.' });
  expect(deviceTestReply({ result: 'expired' }).kind).toBe('expired');
  expect(deviceTestReply({ result: 'failed' }).kind).toBe('problem');
});

test('off on this server: the button goes', () => {
  expect(deviceTestReply({ error: new ApiError(404, 'Not found', 'NOT_FOUND') })).toEqual({ kind: 'hide' });
});

test('its refusals in its own words', () => {
  const limit = 'Too many test notifications. Try again in a few minutes.';
  expect(deviceTestReply({ error: new ApiError(429, limit, 'PUSH_TEST_RATE_LIMIT') })).toEqual({ kind: 'problem', message: limit });
  const off = "Notifications aren't on for this phone. Turn them on first.";
  expect(deviceTestReply({ error: new ApiError(404, off, 'PUSH_NOT_SUBSCRIBED') })).toEqual({ kind: 'problem', message: off });
});

test('no signal is a plain sentence', () => {
  expect(deviceTestReply({ error: new TypeError('Network request failed') }).kind).toBe('problem');
});
