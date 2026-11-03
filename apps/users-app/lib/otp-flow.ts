import type { NativeOtpPurpose } from '@repo/core/native-session';
import { safeNextPath } from '@repo/core/redirect';

/**
 * What the code screen needs from the phone screen. The web keeps it in sessionStorage;
 * here it stays in memory, and out of the route (a number has no place in a URL). `next`
 * is where sign-in was interrupting, checked by safeNextPath where it is used.
 */
export interface OtpFlow {
  phone: string;
  purpose: NativeOtpPurpose;
  expiresAt: number;
  resendAt: number;
}

let flow: OtpFlow | null = null;
let next: string | null = null;
let welcome = false;

export const otpFlow = {
  get: () => flow,
  set: (value: OtpFlow | null) => {
    flow = value;
  },
  setNext: (value: string | null) => {
    next = value;
  },
  peekNext: () => next,
  /**
   * Where signing in goes on to: what it interrupted, or Home, which says welcome once.
   * safeNextPath's the path, as this may have come from a link.
   */
  takeDestination: () => {
    const value = safeNextPath(next);
    next = null;
    welcome = value === null;
    return value ?? '/home';
  },
  takeWelcome: () => {
    const value = welcome;
    welcome = false;
    return value;
  },
};
