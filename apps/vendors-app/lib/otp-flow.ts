import type { NativeOtpPurpose } from '@repo/core/native-session';

/**
 * What the code screen needs from the phone screen. The web keeps it in
 * sessionStorage; here it stays in memory, and out of the route (a number has no
 * place in a URL).
 */
export interface OtpFlow {
  phone: string;
  purpose: NativeOtpPurpose;
  expiresAt: number;
  resendAt: number;
}

let flow: OtpFlow | null = null;

export const otpFlow = {
  get: () => flow,
  set: (next: OtpFlow | null) => {
    flow = next;
  },
};
