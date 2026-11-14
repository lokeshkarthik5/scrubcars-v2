import { ApiError } from '@repo/core/api/client';

/**
 * A fetch that never reached the server (no signal, airplane mode): React Native's fetch
 * throws a TypeError ("Network request failed"). A refusal from the server is an ApiError
 * and is never kept for a resend.
 */
export function isNoSignal(error: unknown): boolean {
  return !(error instanceof ApiError) && error instanceof TypeError;
}

/**
 * Whether the server's refusal is final, so a waiting walk-in should be let go: a 4xx that
 * isn't about sign-in or timing. A 5xx (a deploy blip), 401, 408 or 429 keeps it for a retry.
 */
export function isFinalRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  return error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status)
}
