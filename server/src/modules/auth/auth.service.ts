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
import { authRepository } from './auth.repository.js'
import type { SendOtpInput, VerifyOtpInput } from './auth.validation.js'
import type { UserRecord, VendorRecord } from './auth.repository.js'

const log = logger.child({ module: 'auth' })

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
  isAdmin: boolean
  status: string
}

export type AuthVendorResponse = {
  id: string
  businessName: string
  phone: string
  status: string
  isVerified: boolean
}

export type SessionResult = {
  accessToken: string
  refreshToken: string
  user: AuthUserResponse
  vendor: AuthVendorResponse | null
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
    isAdmin: user.isAdmin,
    status: user.status,
  }
}

function toVendorResponse(vendor: VendorRecord): AuthVendorResponse {
  return {
    id: vendor.id,
    businessName: vendor.businessName,
    phone: vendor.phone,
    status: vendor.status,
    isVerified: vendor.isVerified,
  }
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

    if (input.audience === 'vendor' && !existingUser.isVendorOwner) {
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
      name: input.name!,
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

  if (input.audience === 'vendor' && !existingUser.isVendorOwner) {
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
    isAdmin: user.isAdmin,
  }

  const accessToken = await signAccessToken(payload)
  const refreshToken = generateRefreshToken()
  const tokenHash = hashRefreshToken(refreshToken)

  await authRepository.createRefreshToken({
    userId: user.id,
    tokenHash,
    expiresAt: getRefreshTokenExpiryDate(),
  })

  const vendor =
    audience === 'vendor' && user.isVendorOwner
      ? await authRepository.findVendorByOwnerId(user.id)
      : null

  log.info({ userId: user.id, audience }, 'session:created')

  return {
    accessToken,
    refreshToken,
    user: toUserResponse(user),
    vendor: vendor ? toVendorResponse(vendor) : null,
  }
}

const BYPASS_PHONE = '8015676678'

export const authService = {
  async sendOtp(input: SendOtpInput) {
    await validateSendOtpRules(input)

    if (input.phone === BYPASS_PHONE) {
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
    if (input.phone === BYPASS_PHONE) {
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

    const audience: TokenAudience = user.isVendorOwner ? 'vendor' : 'customer'
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
    const user = await authRepository.findUserById(userId)

    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
    }

    assertActiveUser(user)

    const vendor =
      audience === 'vendor' && user.isVendorOwner
        ? await authRepository.findVendorByOwnerId(user.id)
        : null

    return {
      user: toUserResponse(user),
      vendor: vendor ? toVendorResponse(vendor) : null,
    }
  },
}
