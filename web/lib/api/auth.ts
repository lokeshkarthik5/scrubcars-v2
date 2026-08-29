import { apiClient } from './client'
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
    vendors: data.vendors,
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
