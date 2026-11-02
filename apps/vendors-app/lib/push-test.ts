/**
 * What "Send me a test notification" tells the person, and what the screen does
 * next. Words are the web's (packages/ui/src/features/push-notifications.tsx
 * sendTest); only "browser" becomes "phone". Pure, so the 404s and the wait can
 * be tested without an API.
 */
export type PushTestResult = 'sent' | 'expired' | 'failed';

export interface PushTestOutcome {
  tone: 'success' | 'error';
  message: string;
  /** The server no longer has this phone: switch it off here, so the screen asks to turn it on again. */
  turnOff?: boolean;
  /** The route does not exist on this server: hide the button. */
  hideButton?: boolean;
}

export const TEST_SENT = 'Sent. It should show in a few seconds.';
export const TEST_EXPIRED = 'This device stopped taking notifications. Turn them on again.';
export const TEST_FAILED = "The phone's push service didn't take it. Try again in a minute.";
export const TEST_NOT_ON = 'Turn notifications on first';
export const TEST_NOT_AVAILABLE = "Test notifications aren't available yet.";
export const TEST_FALLBACK = "Couldn't send a test notification.";

/** The code the API gives when none of this person's phones is on (PR #113). */
export const PUSH_NOT_SUBSCRIBED = 'PUSH_NOT_SUBSCRIBED';
export const PUSH_TEST_RATE_LIMIT = 'PUSH_TEST_RATE_LIMIT';

export function pushTestResultOutcome(result: PushTestResult): PushTestOutcome {
  if (result === 'sent') return { tone: 'success', message: TEST_SENT };
  if (result === 'expired') return { tone: 'error', message: TEST_EXPIRED, turnOff: true };
  return { tone: 'error', message: TEST_FAILED };
}

/** "in 45 seconds", "in a minute", "in 4 minutes": rounded up, never short of the real wait. */
export function waitText(seconds: number): string {
  const whole = Math.max(1, Math.ceil(seconds));
  if (whole < 60) return `in ${whole} ${whole === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.ceil(whole / 60);
  return minutes === 1 ? 'in a minute' : `in ${minutes} minutes`;
}

export interface PushTestError {
  status?: number;
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
}

/**
 * - 429 PUSH_TEST_RATE_LIMIT (five per ten minutes, shared with the browser test): the wait.
 * - 404 PUSH_NOT_SUBSCRIBED: the server has no row for this phone; it goes off here too.
 * - any other 404: the route is missing (device push is off on the server): hide the button.
 * - anything else: the API's own words, or the fallback (`message` is already
 *   the fallback for a network failure; see errorText).
 */
export function pushTestErrorOutcome(error: PushTestError, fallbackMessage: string): PushTestOutcome {
  if (error.status === 429 && error.code === PUSH_TEST_RATE_LIMIT) {
    const wait = typeof error.retryAfterSeconds === 'number' ? ` ${waitText(error.retryAfterSeconds)}` : ' in a few minutes';
    return { tone: 'error', message: `Too many test notifications. Try again${wait}.` };
  }
  if (error.status === 404) {
    if (error.code === PUSH_NOT_SUBSCRIBED) {
      return { tone: 'error', message: "Notifications aren't on for this phone. Turn them on first.", turnOff: true };
    }
    return { tone: 'error', message: TEST_NOT_AVAILABLE, hideButton: true };
  }
  return { tone: 'error', message: fallbackMessage };
}
