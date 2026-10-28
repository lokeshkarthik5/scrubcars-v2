import { apiClient } from '@repo/core/api/client'
import type { CustomerRequest } from './booking-requests'

/**
 * "Not in your area yet" (customer reach, part 2, 0062): the free-wash
 * sign-up, Home's live status and recommending a garage, all the session's
 * own (/users/me/area).
 */

export interface AreaSignup {
  zone: { slug: string; name: string }
  live: boolean
  position: number
  freeWash: boolean
  waiting: number | null
  freeWashReady: { code: string; amount: number; endsAt: string } | null
  launchBanner: { garages: number } | null
  createdAt: string
}

export interface AreaStatus {
  requests: CustomerRequest[]
  signups: AreaSignup[]
}

export interface SignUpResult {
  zone: { slug: string; name: string }
  position: number
  freeWash: boolean
  waiting: number | null
}

export function getAreaStatus() {
  return apiClient<AreaStatus>('/users/me/area/status')
}

export function signUpForArea(input: { zoneSlug: string; pushOptIn: boolean; whatsappOptIn: boolean }) {
  return apiClient<SignUpResult>('/users/me/area/signups', { method: 'POST', body: JSON.stringify(input) })
}

export function markLaunchBannerSeen(zoneSlug: string) {
  return apiClient<{ seen: true }>(`/users/me/area/signups/${zoneSlug}/banner-seen`, { method: 'POST' })
}

export interface RecommendInput {
  zoneSlug?: string
  name: string
  mapsLink?: string
  phone?: string
  why?: string
}

export function recommendGarage(input: RecommendInput) {
  return apiClient<{ id: string; credit: { perGarage: number; max: number } }>('/users/me/area/recommendations', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
