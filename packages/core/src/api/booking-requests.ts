import { apiClient } from '@repo/core/api/client'
import type { RequestMode, TravelFee, WindowPart } from '@repo/core/booking-requests'
import type { VehicleType } from '@repo/core/types'

/**
 * "Request a visit" / "Request a pickup" (customer reach, part 2, 0062).
 * The customer's own requests at /users/me/requests; the garage's inbox at
 * /vendors/me/requests (the garage the session resolved, X-Vendor-Id).
 */

export interface RequestWindowChoice {
  date: string
  part: WindowPart
  label: string
  open: boolean
}

export interface RequestWindows {
  quick: RequestWindowChoice[]
  days: Array<{ date: string; morning: boolean; afternoon: boolean }>
  respondMinutes: number
  confirmMinutes: number
}

export type CustomerRequestState = 'waiting' | 'accepted' | 'no_garage' | 'lapsed' | 'cancelled' | 'booked'

interface RequestWindowView {
  date: string
  part: WindowPart
  label: string
  start: string
  end: string
}

export interface CustomerRequest {
  /** The latest garage's row: what Cancel and Confirm & pay act on. */
  id: string
  rootId: string
  state: CustomerRequestState
  status: string
  bookingType: RequestMode
  garage: { id: string; name: string }
  tried: string[]
  maxGarages: number
  items: Array<{ serviceId: string; name: string; amount: string }>
  subtotal: string
  window: RequestWindowView
  vehicleId: string | null
  addressId: string | null
  createdAt: string
  respondBy: string
  travelFee: number | null
  acceptedStartAt: string | null
  confirmBy: string | null
  bookingId: string | null
}

export interface GarageRequest {
  id: string
  status: string
  bookingType: RequestMode
  passedOn: boolean
  items: Array<{ name: string; amount: string }>
  subtotal: string
  vehicleType: VehicleType
  window: RequestWindowView
  area: string | null
  distanceKm: number
  coverKm: number | null
  outsideKm: number
  beyond: string
  respondBy: string
  /** What the garage earns before any travel fee: the owner seat only (null for operators). */
  earn: number | null
  durationMins: number
  reply: 'accepted' | 'declined' | null
  travelFee: number | null
  acceptedStartAt: string | null
  confirmBy: string | null
  createdAt: string
}

export interface CreateRequestInput {
  vendorId: string
  bookingType: RequestMode
  serviceIds: string[]
  vehicleId: string
  addressId: string
  window: { date: string; part: WindowPart }
}

/** GET /booking-requests/windows (public): what the sheet offers before sign-in. */
export function getRequestWindows(params: { vendorId: string; mode: RequestMode; durationMins: number }) {
  return apiClient<RequestWindows>('/booking-requests/windows', {
    auth: false,
    params: { vendorId: params.vendorId, mode: params.mode, durationMins: String(params.durationMins) },
  })
}

export function createRequest(input: CreateRequestInput) {
  return apiClient<CustomerRequest>('/users/me/requests', { method: 'POST', body: JSON.stringify(input) })
}

export function listMyRequests() {
  return apiClient<{ items: CustomerRequest[] }>('/users/me/requests')
}

export function getMyRequest(id: string) {
  return apiClient<CustomerRequest>(`/users/me/requests/${id}`)
}

export function cancelMyRequest(id: string) {
  return apiClient<CustomerRequest>(`/users/me/requests/${id}/cancel`, { method: 'POST' })
}

// ─── The garage ──────────────────────────────────────────────────────────────

export function listGarageRequests(scope: 'open' | 'closed') {
  return apiClient<{ items: GarageRequest[]; waiting: number; travelFees: TravelFee[] }>('/vendors/me/requests', {
    params: { scope },
  })
}

export function getGarageRequestCount() {
  return apiClient<{ waiting: number }>('/vendors/me/requests/count')
}

export function getRequestStartTimes(id: string) {
  return apiClient<{ starts: string[] }>(`/vendors/me/requests/${id}/start-times`)
}

export function acceptRequest(id: string, input: { startAt: string; travelFee: TravelFee }) {
  return apiClient<GarageRequest>(`/vendors/me/requests/${id}/accept`, { method: 'POST', body: JSON.stringify(input) })
}

export function declineRequest(id: string) {
  return apiClient<{ outcome: 'passed_on' | 'ended' }>(`/vendors/me/requests/${id}/decline`, { method: 'POST' })
}
