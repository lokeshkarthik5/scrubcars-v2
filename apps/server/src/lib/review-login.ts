import { hashPassword, verifyPassword } from './passwords.js'

/**
 * The app-store reviewer login: the pure rules. Apple and Google test an app
 * by signing in, and they cannot receive our SMS. So two dedicated accounts
 * (one customer, one garage) take a fixed code instead of a texted one, in the
 * native apps only. No env, no database, no network here, so every rule is
 * unit-tested; lib/env.ts reads the variables and modules/auth applies it.
 *
 * It must not become a way around the OTP on a real account, so it is narrow
 * by construction:
 *
 * - All three settings must be present and well formed, or it is fully off.
 * - It applies to exactly one phone per app (customer app: the customer phone;
 *   garage app: the garage phone), and only to a `login`, which never creates
 *   an account.
 * - Only the native verify route asks for it (modules/auth/auth.controller.ts).
 * - The code is never stored in the clear: the setting is a salted scrypt hash
 *   of it (lib/passwords.ts), compared in constant time. The existing OTP
 *   digest (lib/otp.ts) is keyed by JWT_SECRET and cut to ten characters, so
 *   making one would mean putting the production secret on someone's laptop;
 *   scrypt can be made anywhere.
 * - The environment holds the hash as base64url of that scrypt string, so it
 *   has no `$` for a shell or a dotenv file to expand.
 */

export interface ReviewLoginConfig {
  /** The 10-digit phone of the customer-app reviewer account. */
  customerPhone: string
  /** The 10-digit phone of the garage-app reviewer account. */
  garagePhone: string
  /** `scrypt$N$r$p$salt$hash`, as lib/passwords.ts writes it. */
  codeHash: string
}

const PHONE = /^[6-9]\d{9}$/
const BASE64URL = /^[A-Za-z0-9_-]+$/

/** Wraps a lib/passwords.ts hash for an environment variable. */
export function encodeCodeHash(hash: string): string {
  return Buffer.from(hash, 'utf8').toString('base64url')
}

function decodeCodeHash(value: string): string | null {
  if (!BASE64URL.test(value)) return null
  const decoded = Buffer.from(value, 'base64url').toString('utf8')
  return decoded.startsWith('scrypt$') && decoded.split('$').length === 6 ? decoded : null
}

/**
 * The settings, or null when the login is off. Any of the three missing, a
 * phone that is not a 10-digit Indian mobile, or a hash that is not one of
 * ours turns it fully off: a half-set or mistyped login must not half work.
 */
export function readReviewLoginEnv(source: Record<string, string | undefined>): ReviewLoginConfig | null {
  const customerPhone = source.REVIEW_LOGIN_CUSTOMER_PHONE?.trim()
  const garagePhone = source.REVIEW_LOGIN_GARAGE_PHONE?.trim()
  const rawHash = source.REVIEW_LOGIN_CODE_HASH?.trim()
  if (!customerPhone || !garagePhone || !rawHash) return null
  if (!PHONE.test(customerPhone) || !PHONE.test(garagePhone)) return null

  const codeHash = decodeCodeHash(rawHash)
  if (!codeHash) return null
  return { customerPhone, garagePhone, codeHash }
}

/**
 * Whether this sign-in is the reviewer's: the login is on, the purpose is a
 * plain `login` (never `register` or `vendor_onboard`, which create accounts),
 * and the phone is the one set for the audience asking.
 */
export function reviewLoginApplies(
  config: ReviewLoginConfig | null,
  request: { phone: string; purpose: string; audience: 'customer' | 'vendor' }
): config is ReviewLoginConfig {
  if (!config) return false
  if (request.purpose !== 'login') return false
  return request.phone === (request.audience === 'customer' ? config.customerPhone : config.garagePhone)
}

/** Whether `given` is the review code. Constant time; false for anything else. */
export function reviewCodeMatches(config: ReviewLoginConfig, given: string): Promise<boolean> {
  return verifyPassword(given, config.codeHash)
}

/** What to put in REVIEW_LOGIN_CODE_HASH for `code` (scripts/review-login-hash.ts). */
export async function makeReviewCodeHash(code: string): Promise<string> {
  return encodeCodeHash(await hashPassword(code))
}
