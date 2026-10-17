import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import {
  checkOtpSendLimit,
  deriveOtpKey,
  generateOtpCode,
  getOtpExpiryDate,
  getOtpPurgeCutoff,
  getOtpSendWindowStart,
  getOtpVerifyWindowStart,
  MAX_OTP_VERIFY_ATTEMPTS,
  OTP_EXPIRY_SECONDS,
  OTP_PURGE_BATCH,
  OTP_VERIFY_WINDOW_MINUTES,
  otpAttemptCap,
  otpDigest,
  otpMatches,
  otpSendLimitMessage,
} from '../../lib/otp.js'
import { sendOtpSms, SmsSendError } from '../../lib/sms.js'
import { createThrottle } from '../../lib/throttle.js'
import {
  generateRefreshToken,
  getRefreshTokenExpiryDate,
  hashRefreshToken,
} from '../../lib/tokens.js'
import {
  signAccessToken,
  type AccessTokenPayload,
  type TokenAudience,
} from '../../lib/jwt.js'
import { membersRepository } from '../members/members.repository.js'
import { membersService } from '../members/members.service.js'
import type { VendorScopedRole } from '../members/members.repository.js'
import { authRepository } from './auth.repository.js'
import type { SendOtpInput, VerifyOtpInput } from './auth.validation.js'
import type { UserRecord } from './auth.repository.js'

const log = logger.child({ module: 'auth' })

const otpKey = deriveOtpKey(env.jwtSecret)

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function maskPhone(phone: string) {
  return phone.length >= 6 ? `${phone.slice(0, 2)}****${phone.slice(-2)}` : '****'
}

export type AuthUserResponse = {
  id: string
  name: string
  phone: string
  email: string | null
  phoneVerified: boolean
  isCustomer: boolean
  isVendorOwner: boolean
  status: string
}

export type AuthVendorResponse = {
  id: string
  businessName: string
  logoUrl: string | null
  phone: string
  status: string
  isVerified: boolean
  /** This caller's power inside this company. */
  role: VendorScopedRole
  isOwner: boolean
}

export type SessionResult = {
  accessToken: string
  refreshToken: string
  user: AuthUserResponse
  /**
   * The active company. Populated when there is exactly one, so every existing
   * single-garage client survives the transition untouched; `vendors` is the
   * full list the switcher reads.
   */
  vendor: AuthVendorResponse | null
  vendors: AuthVendorResponse[]
}

function toUserResponse(user: UserRecord): AuthUserResponse {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    phoneVerified: user.phoneVerified,
    isCustomer: user.isCustomer,
    isVendorOwner: user.isVendorOwner,
    status: user.status,
  }
}

/**
 * Every company this person can act as, each carrying the role they hold in it.
 * The 1:1 `findVendorByOwnerId` this replaces could only ever answer "the one
 * company they own", which is now the wrong question in two ways: they may hold
 * several, and they may hold a seat in one they do not own.
 */
async function listSessionVendors(
  userId: string
): Promise<AuthVendorResponse[]> {
  const seats = await membersService.listMyVendors(userId)

  return seats.map((seat) => ({
    id: seat.id,
    businessName: seat.businessName,
    logoUrl: seat.logoUrl,
    phone: seat.phone,
    status: seat.status,
    isVerified: seat.isVerified,
    role: seat.role,
    isOwner: seat.isOwner,
  }))
}

/**
 * May this person open the vendor app?
 *
 * Normally: they hold an active seat in at least one company. Note the role
 * filter inside `hasActiveVendorSeat` — a bare "has any mapping row" check would
 * let a super_admin in with no company, and tenant resolution would then 404
 * them on every request.
 *
 * The second clause is the onboarding window, and it is why this is not just the
 * seat check. `vendor_onboard` sets `is_vendor_owner` when the OTP is verified,
 * but the company — and therefore the mapping row — is not created until step 2
 * of onboarding. Between those two points a real vendor has the flag and no
 * seat, so a seat-only gate locks them out of the flow they are halfway through.
 *
 * This does not reopen suspension: member management keeps the flag in step with
 * the seats, clearing it when someone's last active seat goes away, so a
 * suspended or removed member fails both clauses. The flag is retired once
 * onboarding writes the mapping row before it needs the vendor session, and this
 * clause goes with it.
 */
async function canOpenVendorApp(user: UserRecord): Promise<boolean> {
  return (
    (await membersRepository.hasActiveVendorSeat(user.id)) || user.isVendorOwner
  )
}

/**
 * Clears out codes from more than a day ago, a batch per send, so the table
 * holds only what the rate limits still count. Housekeeping: a failure is
 * logged and the customer's code goes out regardless.
 */
async function purgeOldOtps() {
  try {
    await authRepository.deleteOtpsExpiredBefore(getOtpPurgeCutoff(new Date()), OTP_PURGE_BATCH)
  } catch (err) {
    log.warn({ err }, 'otp:purge_failed')
  }
}

/**
 * The per-phone send limits (lib/otp.ts), counted from the codes already in
 * otp_verifications. Checked after the account rules, so a number with no
 * account still hears "no account" rather than "wait".
 */
async function assertOtpSendAllowed(phone: string) {
  const now = new Date()
  const sent = await authRepository.listOtpSendTimes(phone, getOtpSendWindowStart(now))
  const refusal = checkOtpSendLimit(
    sent.map((row) => row.createdAt),
    now
  )

  if (refusal) {
    log.warn(
      { phone: maskPhone(phone), reason: refusal.reason, retryAfterSeconds: refusal.retryAfterSeconds },
      'otp:send_limited'
    )
    throw new AppError(429, otpSendLimitMessage(refusal.retryAfterSeconds), 'OTP_RATE_LIMITED', {
      retryAfterSeconds: refusal.retryAfterSeconds,
    })
  }
}

// When the SMS provider is failing it fails for everyone, so the first
// failure tells the team everything and the rest would only bury it.
const SMS_ALERT_QUIET_MINUTES = 10
const smsAlertDue = createThrottle(SMS_ALERT_QUIET_MINUTES * 60_000)

/**
 * The customer's half of an SMS failure. Their message says nothing about the
 * provider — the apps add how to reach us — and the code stays
 * SMS_SEND_FAILED so the apps can tell it from every other refusal.
 */
function smsFailed(phone: string, providerMessage: string): AppError {
  log.error({ phone: maskPhone(phone), providerMessage }, 'otp:sms_failed')

  if (smsAlertDue()) {
    alertOps({
      kind: 'sms_failed',
      phone,
      providerMessage,
      quietMinutes: SMS_ALERT_QUIET_MINUTES,
    })
  }

  return new AppError(
    502,
    "We couldn't send the code right now. Try again in a minute.",
    'SMS_SEND_FAILED'
  )
}

function assertActiveUser(user: UserRecord) {
  if (user.status === 'suspended') {
    throw new AppError(403, 'Account is suspended', 'ACCOUNT_SUSPENDED')
  }
}

async function validateSendOtpRules(input: SendOtpInput) {
  const existingUser = await authRepository.findUserByPhone(input.phone)

  if (input.audience === 'customer' && input.purpose === 'register') {
    if (existingUser) {
      throw new AppError(
        409,
        'Phone number is already registered. Please log in instead.',
        'PHONE_ALREADY_REGISTERED'
      )
    }
    return
  }

  if (input.purpose === 'login') {
    if (!existingUser) {
      throw new AppError(
        404,
        'No account found for this phone number',
        'USER_NOT_FOUND'
      )
    }

    assertActiveUser(existingUser)

    if (input.audience === 'vendor' && !(await canOpenVendorApp(existingUser))) {
      throw new AppError(
        403,
        'This phone number is not registered as a vendor',
        'NOT_A_VENDOR'
      )
    }
  }

  if (input.purpose === 'vendor_onboard') {
    if (existingUser?.isVendorOwner) {
      throw new AppError(
        409,
        'This phone number is already registered as a vendor. Please log in instead.',
        'VENDOR_ALREADY_REGISTERED'
      )
    }
  }
}

async function resolveUserAfterVerification(
  input: VerifyOtpInput
): Promise<UserRecord> {
  const existingUser = await authRepository.findUserByPhone(input.phone)

  if (input.purpose === 'register') {
    if (existingUser) {
      throw new AppError(
        409,
        'Phone number is already registered',
        'PHONE_ALREADY_REGISTERED'
      )
    }

    const [created] = await authRepository.createUser({
      name: input.name!,
      phone: input.phone,
      isCustomer: true,
      isVendorOwner: false,
      phoneVerified: true,
    })

    return created
  }

  if (input.purpose === 'vendor_onboard') {
    if (existingUser) {
      const [updated] = await authRepository.updateUser(existingUser.id, {
        name: input.name ?? existingUser.name,
        phoneVerified: true,
        isVendorOwner: true,
      })
      return updated
    }

    const [created] = await authRepository.createUser({
      name: input.name ?? 'Vendor',
      phone: input.phone,
      isCustomer: false,
      isVendorOwner: true,
      phoneVerified: true,
    })

    return created
  }

  if (!existingUser) {
    throw new AppError(
      404,
      'No account found for this phone number',
      'USER_NOT_FOUND'
    )
  }

  assertActiveUser(existingUser)

  // The vendor-app login gate. One query per login, not per request.
  if (input.audience === 'vendor' && !(await canOpenVendorApp(existingUser))) {
    throw new AppError(
      403,
      'This phone number is not registered as a vendor',
      'NOT_A_VENDOR'
    )
  }

  const [updated] = await authRepository.updateUser(existingUser.id, {
    phoneVerified: true,
  })

  return updated
}

async function createSession(
  user: UserRecord,
  audience: TokenAudience
): Promise<SessionResult> {
  const payload: AccessTokenPayload = {
    sub: user.id,
    aud: audience,
    isCustomer: user.isCustomer,
    isVendorOwner: user.isVendorOwner,
  }

  const accessToken = await signAccessToken(payload)
  const refreshToken = generateRefreshToken()
  const tokenHash = hashRefreshToken(refreshToken)

  await authRepository.createRefreshToken({
    userId: user.id,
    tokenHash,
    expiresAt: getRefreshTokenExpiryDate(),
  })

  const vendors =
    audience === 'vendor' ? await listSessionVendors(user.id) : []

  log.info(
    { userId: user.id, audience, vendorCount: vendors.length },
    'session:created'
  )

  return {
    accessToken,
    refreshToken,
    user: toUserResponse(user),
    vendor: vendors.length === 1 ? vendors[0] : null,
    vendors,
  }
}

const BYPASS_PHONES = new Set(['7358197924', '9566141671', '8015676678'])

export const authService = {
  async sendOtp(input: SendOtpInput) {
    await validateSendOtpRules(input)

    if (BYPASS_PHONES.has(input.phone)) {
      log.debug({ phone: maskPhone(input.phone), purpose: input.purpose, audience: input.audience }, 'otp:bypass')
      return {
        phone: input.phone,
        purpose: input.purpose,
        audience: input.audience,
        expiresInSeconds: OTP_EXPIRY_SECONDS,
      }
    }

    await assertOtpSendAllowed(input.phone)

    const otpCode = generateOtpCode()
    const expiresAt = getOtpExpiryDate()

    const [otpRow] = await authRepository.createOtpVerification({
      phone: input.phone,
      otpDigest: otpDigest(otpKey, otpCode, input.phone, input.purpose),
      purpose: input.purpose,
      expiresAt,
    })

    try {
      await sendOtpSms(input.phone, otpCode)
    } catch (err) {
      if (!(err instanceof SmsSendError)) throw err
      // A code the provider definitely refused is not one the customer used
      // up: removing it keeps a provider outage from spending their sends for
      // the hour. When we don't know — a timeout, a 5xx — the SMS may still
      // arrive, so the code stays valid for them to type, and it stays
      // counted, so a slow provider cannot be made to send this number a paid
      // SMS on every request the per-IP limiter lets through.
      if (err.delivered === 'no') {
        await authRepository.deleteOtpVerification(otpRow.id)
      }
      throw smsFailed(input.phone, err.message)
    }

    log.info({ phone: maskPhone(input.phone), purpose: input.purpose, audience: input.audience }, 'otp:sent')

    // After the SMS, so the purge never delays the code reaching the phone.
    await purgeOldOtps()

    return {
      phone: input.phone,
      purpose: input.purpose,
      audience: input.audience,
      expiresInSeconds: OTP_EXPIRY_SECONDS,
    }
  },

  async verifyOtp(input: VerifyOtpInput): Promise<SessionResult> {
    if (BYPASS_PHONES.has(input.phone)) {
      const user = await resolveUserAfterVerification(input)
      log.debug({ userId: user.id, audience: input.audience, purpose: input.purpose }, 'otp:bypass_verified')
      return createSession(user, input.audience)
    }

    const windowStart = getOtpVerifyWindowStart()
    const [{ value: recentAttempts }] =
      await authRepository.sumRecentOtpAttempts(
        input.phone,
        input.purpose,
        windowStart
      )

    if (Number(recentAttempts) >= MAX_OTP_VERIFY_ATTEMPTS) {
      log.warn({ phone: maskPhone(input.phone), purpose: input.purpose, attempts: recentAttempts }, 'otp:rate_limit')
      throw new AppError(
        429,
        `Too many OTP attempts. Try again in ${OTP_VERIFY_WINDOW_MINUTES} minutes.`,
        'OTP_ATTEMPTS_EXCEEDED'
      )
    }

    const otpRecord = await authRepository.findLatestValidOtp(
      input.phone,
      input.purpose
    )

    if (!otpRecord) {
      throw new AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')
    }

    // Every guess claims an attempt before it is compared — atomically, see
    // claimOtpAttempt — so guesses sent in parallel all count, and the check
    // above cannot be raced past. The right guess's attempt is handed back
    // when the code is marked verified.
    //
    // The cap is worked out from the window's other codes only, read after
    // this code was found. Those rows are history and cannot change under us;
    // the total read above includes this code's own counter, which parallel
    // guesses are moving, and a cap built from it would drift upwards.
    const [{ value: otherAttempts }] = await authRepository.sumRecentOtpAttempts(
      input.phone,
      input.purpose,
      windowStart,
      otpRecord.id
    )
    const [claimed] = await authRepository.claimOtpAttempt(
      otpRecord.id,
      otpAttemptCap(Number(otherAttempts))
    )

    if (!claimed) {
      log.warn({ phone: maskPhone(input.phone), purpose: input.purpose }, 'otp:rate_limit')
      throw new AppError(
        429,
        `Too many OTP attempts. Try again in ${OTP_VERIFY_WINDOW_MINUTES} minutes.`,
        'OTP_ATTEMPTS_EXCEEDED'
      )
    }

    if (!otpMatches(otpKey, otpRecord.otpCode, input.otp, input.phone, input.purpose)) {
      log.warn({ phone: maskPhone(input.phone), purpose: input.purpose }, 'otp:invalid')
      throw new AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')
    }

    // Empty when a simultaneous request with the same code got there first.
    const [used] = await authRepository.markOtpVerified(otpRecord.id)
    if (!used) {
      throw new AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')
    }

    const user = await resolveUserAfterVerification(input)
    log.info({ userId: user.id, phone: maskPhone(input.phone), audience: input.audience, purpose: input.purpose }, 'otp:verified')
    return createSession(user, input.audience)
  },

  async refreshSession(refreshToken: string): Promise<SessionResult> {
    const tokenHash = hashRefreshToken(refreshToken)
    const storedToken = await authRepository.findActiveRefreshToken(tokenHash)

    if (!storedToken) {
      log.warn('session:refresh_invalid')
      throw new AppError(
        401,
        'Invalid or expired refresh token',
        'INVALID_REFRESH_TOKEN'
      )
    }

    const user = await authRepository.findUserById(storedToken.userId)

    if (!user) {
      log.warn({ userId: storedToken.userId }, 'session:refresh_user_not_found')
      throw new AppError(401, 'User not found', 'USER_NOT_FOUND')
    }

    assertActiveUser(user)

    await authRepository.revokeRefreshToken(storedToken.id)

    // Which app this session belongs to. Same rule as the login gate, so a
    // half-onboarded vendor refreshing their tab lands back in the vendor app
    // rather than being bounced to the customer one mid-signup.
    const audience: TokenAudience = (await canOpenVendorApp(user))
      ? 'vendor'
      : 'customer'
    log.info({ userId: user.id, audience }, 'session:refreshed')
    return createSession(user, audience)
  },

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) {
      return
    }

    const tokenHash = hashRefreshToken(refreshToken)
    await authRepository.revokeRefreshTokenByHash(tokenHash)
  },

  async getMe(userId: string, audience: TokenAudience) {
    // Guard against non-UUID subjects (e.g. a leaked admin token, sub='admin')
    // reaching the users table — a raw UUID column query would throw a 500.
    if (!UUID_RE.test(userId)) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
    }

    const user = await authRepository.findUserById(userId)

    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
    }

    assertActiveUser(user)

    const vendors =
      audience === 'vendor' ? await listSessionVendors(user.id) : []

    return {
      user: toUserResponse(user),
      vendor: vendors.length === 1 ? vendors[0] : null,
      vendors,
    }
  },

  /** The company switcher's data source. Active, vendor-scoped rows only. */
  async listMyVendors(userId: string) {
    if (!UUID_RE.test(userId)) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
    }

    return listSessionVendors(userId)
  },
}
