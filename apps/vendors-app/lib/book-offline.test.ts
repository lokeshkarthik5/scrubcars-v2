import { describe, expect, test } from 'bun:test';

import { ApiError } from '@repo/core/api/client';

import { isFinalRefusal, isNoSignal } from './book-offline-rules';

describe('saving a walk-in with no signal', () => {
  test('a fetch that never reached the server is kept for a resend; a refusal from the server is not', () => {
    expect(isNoSignal(new TypeError('Network request failed'))).toBe(true);
    expect(isNoSignal(new ApiError(400, 'Pick a time', 'WHEN_OUT_OF_RANGE'))).toBe(false);
    expect(isNoSignal(new ApiError(500, 'Server error'))).toBe(false);
    expect(isNoSignal(new Error('other'))).toBe(false);
  });

  test('only a final refusal lets a waiting walk-in go; a server blip keeps it', () => {
    expect(isFinalRefusal(new ApiError(400, 'Not on your price list', 'UNKNOWN_SERVICE'))).toBe(true);
    expect(isFinalRefusal(new ApiError(404, 'Customer not found'))).toBe(true);
    for (const status of [500, 502, 503, 401, 408, 429]) expect(isFinalRefusal(new ApiError(status, 'x'))).toBe(false);
    expect(isFinalRefusal(new TypeError('Network request failed'))).toBe(false);
  });
});
