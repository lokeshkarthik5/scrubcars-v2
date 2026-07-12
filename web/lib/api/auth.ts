import { apiClient } from './client'
import type {
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
  vendor: ApiSessionData['vendor']
  isNewUser: boolean
}

async function sendOtpRequest(options: SendOtpOptions): Promise<OtpPurpose> {
  const purpose =
    options.purpose ??
    (options.audience === 'vendor' ? 'login' : 'login')

  try {
    await apiClient('/auth/otp/send', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({
        phone: options.phone,
        purpose,
        audience: options.audience,
      }),
    })
    return purpose
  } catch (error) {
    if (options.purpose) throw error

    const fallbackPurpose: OtpPurpose =
      options.audience === 'vendor' ? 'vendor_onboard' : 'register'

    await apiClient('/auth/otp/send', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({
        phone: options.phone,
        purpose: fallbackPurpose,
        audience: options.audience,
      }),
    })
    return fallbackPurpose
  }
}

/** POST /auth/otp/send */
export async function sendOtp(options: SendOtpOptions): Promise<OtpPurpose> {
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
    isNewUser: options.purpose === 'register' || options.purpose === 'vendor_onboard',
  }
}

/** POST /auth/otp/send (resend) */
export async function resendOtp(
  phone: string,
  audience: AuthAudience,
  purpose: OtpPurpose
): Promise<void> {
  await sendOtpRequest({ phone, audience, purpose })
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
    isNewUser: false,
    audience: data.vendor ? 'vendor' : 'customer',
  }
}

/** POST /auth/logout */
export async function logout(): Promise<void> {
  await apiClient('/auth/logout', { method: 'POST', auth: false })
}

/** GET /auth/me */
export async function getAuthMe() {
  return apiClient<{ user: ApiSessionData['user']; vendor: ApiSessionData['vendor'] }>(
    '/auth/me'
  )
}
