/// <reference types="bun" />
import { expect, test } from 'bun:test';

import {
  pushTestErrorOutcome,
  pushTestResultOutcome,
  TEST_EXPIRED,
  TEST_FAILED,
  TEST_FALLBACK,
  TEST_NOT_AVAILABLE,
  TEST_SENT,
  waitText,
} from './push-test';

test('sent says so and changes nothing', () => {
  expect(pushTestResultOutcome('sent')).toEqual({ tone: 'success', message: TEST_SENT });
});

test('expired turns notifications off here and asks to turn them on again', () => {
  expect(pushTestResultOutcome('expired')).toEqual({ tone: 'error', message: TEST_EXPIRED, turnOff: true });
  expect(TEST_EXPIRED).toContain('Turn them on again');
});

test('failed is an error that keeps the phone on', () => {
  expect(pushTestResultOutcome('failed')).toEqual({ tone: 'error', message: TEST_FAILED });
});

test('the wait is rounded up and worded for people', () => {
  expect(waitText(1)).toBe('in 1 second');
  expect(waitText(0)).toBe('in 1 second');
  expect(waitText(44.2)).toBe('in 45 seconds');
  expect(waitText(60)).toBe('in a minute');
  expect(waitText(61)).toBe('in 2 minutes');
  expect(waitText(590)).toBe('in 10 minutes');
});

test('the rate limit says how long to wait', () => {
  const outcome = pushTestErrorOutcome(
    { status: 429, code: 'PUSH_TEST_RATE_LIMIT', retryAfterSeconds: 240 },
    TEST_FALLBACK,
  );
  expect(outcome).toEqual({ tone: 'error', message: 'Too many test notifications. Try again in 4 minutes.' });
  expect(pushTestErrorOutcome({ status: 429, code: 'PUSH_TEST_RATE_LIMIT' }, TEST_FALLBACK).message).toBe(
    'Too many test notifications. Try again in a few minutes.',
  );
});

test('a 429 from anywhere else is not the test limit', () => {
  expect(pushTestErrorOutcome({ status: 429, code: 'RATE_LIMITED' }, TEST_FALLBACK).message).toBe(TEST_FALLBACK);
});

test('PUSH_NOT_SUBSCRIBED turns this phone off, and keeps the button', () => {
  const outcome = pushTestErrorOutcome({ status: 404, code: 'PUSH_NOT_SUBSCRIBED' }, TEST_FALLBACK);
  expect(outcome.turnOff).toBe(true);
  expect(outcome.hideButton).toBeUndefined();
  expect(outcome.message).toBe("Notifications aren't on for this phone. Turn them on first.");
});

test('any other 404 is a server without the route: hide the button', () => {
  for (const code of ['NOT_FOUND', undefined]) {
    const outcome = pushTestErrorOutcome({ status: 404, code }, TEST_FALLBACK);
    expect(outcome).toEqual({ tone: 'error', message: TEST_NOT_AVAILABLE, hideButton: true });
  }
});

test('other failures use the message passed in', () => {
  expect(pushTestErrorOutcome({ status: 500 }, 'Server said no').message).toBe('Server said no');
  expect(pushTestErrorOutcome({}, TEST_FALLBACK)).toEqual({ tone: 'error', message: TEST_FALLBACK });
});
