import { apiClient } from './client'
import { MOCK_USER } from '@/lib/mock/data'
import type { User } from '@/lib/types'

export interface SendOtpPayload {
  phone: string
}

export interface VerifyOtpPayload {
  phone: string
  otp: string
}

export interface AuthResponse {
  user: User
  isNewUser: boolean
}

/** POST /auth/otp/send */
export async function sendOtp(payload: SendOtpPayload): Promise<void> {
  // TODO: await apiClient('/auth/otp/send', { method: 'POST', body: JSON.stringify(payload) })
  void payload
  return Promise.resolve()
}

/** POST /auth/otp/verify */
export async function verifyOtp(payload: VerifyOtpPayload): Promise<AuthResponse> {
  // TODO: return apiClient<AuthResponse>('/auth/otp/verify', { method: 'POST', body: JSON.stringify(payload) })
  void payload
  return { user: MOCK_USER, isNewUser: false }
}

/** POST /auth/otp/resend */
export async function resendOtp(phone: string): Promise<void> {
  // TODO: await apiClient('/auth/otp/resend', { method: 'POST', body: JSON.stringify({ phone }) })
  void phone
  return Promise.resolve()
}

/** POST /auth/logout */
export async function logout(): Promise<void> {
  // TODO: await apiClient('/auth/logout', { method: 'POST' })
  return Promise.resolve()
}
