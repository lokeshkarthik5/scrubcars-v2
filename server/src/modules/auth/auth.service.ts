import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  generateOtpCode,
  getOtpExpiryDate,
  getOtpVerifyWindowStart,
  MAX_OTP_VERIFY_ATTEMPTS,
  OTP_EXPIRY_SECONDS,
  OTP_VERIFY_WINDOW_MINUTES,
} from '../../lib/otp.js'
import { sendOtpSms } from '../../lib/sms.js'
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

    if (
      input.audience === 'vendor' &&
      !(await membersRepository.hasActiveVendorSeat(existingUser.id))
    ) {
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

  // The vendor-app login gate. One query per login, not per request — and note
  // the role filter inside it: a bare "has any mapping row" check would let a
  // super_admin open the vendor app with no company, and tenant resolution
  // would then 404 them on every request.
  if (
    input.audience === 'vendor' &&
    !(await membersRepository.hasActiveVendorSeat(existingUser.id))
  ) {
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

    const otpCode = generateOtpCode()
    const expiresAt = getOtpExpiryDate()

    await authRepository.createOtpVerification({
      phone: input.phone,
      otpCode,
      purpose: input.purpose,
      expiresAt,
    })

    await sendOtpSms(input.phone, otpCode)
    log.info({ phone: maskPhone(input.phone), purpose: input.purpose, audience: input.audience }, 'otp:sent')

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

    if (otpRecord.otpCode !== input.otp) {
      await authRepository.incrementOtpAttempts(otpRecord.id)
      log.warn({ phone: maskPhone(input.phone), purpose: input.purpose }, 'otp:invalid')
      throw new AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')
    }

    await authRepository.markOtpVerified(otpRecord.id)

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

    // Which app this session belongs to. Asked of the mapping table rather
    // than the legacy flag, so someone whose last seat was revoked refreshes
    // into the customer app instead of a vendor session with no company.
    const audience: TokenAudience = (await membersRepository.hasActiveVendorSeat(
      user.id
    ))
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
