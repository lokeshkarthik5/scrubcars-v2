import { ApiError, apiClient } from './client'
import type {
  ApiAuthVendor,
  ApiSessionData,
  AuthAudience,
  OtpPurpose,
} from './types'

export interface SendOtpOptions {
  phone: string
  audience: AuthAudience
  purpose?: OtpPurpose
}

export interface VerifyOtpOptions {
  phone: string
  otp: string
  audience: AuthAudience
  purpose: OtpPurpose
  name?: string
}

export interface AuthResult {
  user: ApiSessionData['user']
  /** The active company — populated when there is exactly one. */
  vendor: ApiSessionData['vendor']
  /** Every company this person can act as. */
  vendors?: ApiAuthVendor[]
  isNewUser: boolean
}

/** What a send settled on, and how long the code it sent stays good. */
export interface SentOtp {
  purpose: OtpPurpose
  /** From the server, so the screen counts down to the code's real expiry. */
  expiresInSeconds: number
}

/**
 * The refusals that mean "this number has no account of that kind yet", and
 * so are a sign-up rather than a failure. Anything else — the per-phone send
 * limit, the SMS provider being down, a suspended account — is the answer and
 * must reach the customer as it is. Falling back on every error used to turn
 * a rate limit into "already registered" from the second request.
 */
const SIGN_UP_CODES = new Set(['USER_NOT_FOUND', 'NOT_A_VENDOR'])

async function postSendOtp(
  phone: string,
  purpose: OtpPurpose,
  audience: AuthAudience
): Promise<SentOtp> {
  const data = await apiClient<{ expiresInSeconds: number }>('/auth/otp/send', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ phone, purpose, audience }),
  })
  return { purpose, expiresInSeconds: data.expiresInSeconds }
}

async function sendOtpRequest(options: SendOtpOptions): Promise<SentOtp> {
  if (options.purpose) {
    return postSendOtp(options.phone, options.purpose, options.audience)
  }

  try {
    return await postSendOtp(options.phone, 'login', options.audience)
  } catch (error) {
    if (!(error instanceof ApiError) || !SIGN_UP_CODES.has(error.code ?? '')) {
      throw error
    }

    const fallbackPurpose: OtpPurpose =
      options.audience === 'vendor' ? 'vendor_onboard' : 'register'
    return postSendOtp(options.phone, fallbackPurpose, options.audience)
  }
}

/** POST /auth/otp/send */
export async function sendOtp(options: SendOtpOptions): Promise<SentOtp> {
  return sendOtpRequest(options)
}

/** POST /auth/otp/verify */
export async function verifyOtp(options: VerifyOtpOptions): Promise<AuthResult> {
  const data = await apiClient<ApiSessionData>('/auth/otp/verify', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({
      phone: options.phone,
      otp: options.otp,
      purpose: options.purpose,
      audience: options.audience,
      name: options.name,
    }),
  })

  return {
    user: data.user,
    vendor: data.vendor,
    vendors: data.vendors,
    isNewUser: options.purpose === 'register' || options.purpose === 'vendor_onboard',
  }
}

/** POST /auth/otp/send (resend) */
export async function resendOtp(
  phone: string,
  audience: AuthAudience,
  purpose: OtpPurpose
): Promise<SentOtp> {
  return sendOtpRequest({ phone, audience, purpose })
}

/** POST /auth/refresh */
export async function refreshSession(): Promise<
  AuthResult & { audience: AuthAudience }
> {
  const data = await apiClient<ApiSessionData>('/auth/refresh', {
    method: 'POST',
    auth: false,
  })

  return {
    user: data.user,
    vendor: data.vendor,
    vendors: data.vendors,
    isNewUser: false,
    audience:
      data.vendor || (data.vendors?.length ?? 0) > 0 ? 'vendor' : 'customer',
  }
}

/** POST /auth/logout */
export async function logout(): Promise<void> {
  await apiClient('/auth/logout', { method: 'POST', auth: false })
}

/** GET /auth/me */
export async function getAuthMe({ auth = true }: { auth?: boolean } = {}) {
  return apiClient<{
    user: ApiSessionData['user']
    vendor: ApiSessionData['vendor']
    vendors?: ApiAuthVendor[]
  }>('/auth/me', { auth })
}

/**
 * GET /auth/me/vendors — the company switcher's data source. Active,
 * vendor-scoped seats only, so a suspended member's companies simply disappear.
 */
export async function getMyVendors(): Promise<ApiAuthVendor[]> {
  return apiClient<ApiAuthVendor[]>('/auth/me/vendors')
}
