import { apiClient } from '@repo/core/api/client'
import type { BypassKind, BypassRewardStatus, BypassStatus } from '@repo/core/bypass-reports'

/**
 * "Did the garage ask you to book directly?" (0052). The customer's own
 * reports (the server only ever reads and writes the signed-in customer's,
 * about their own bookings) and admin's Bypass reports page, garage strikes
 * and customer drop-off (super-admin). A garage has no route to any of it.
 */

// ─── The customer's own ──────────────────────────────────────────────────────

/** A report as its customer sees it: never the team's names or reasons. */
export interface MyBypassReport {
  id: string
  bookingId: string | null
  bookingRef: string
  garageName: string
  kind: BypassKind
  note: string | null
  status: BypassStatus
  reward: BypassRewardStatus
  /** Rupees, "100.00". */
  rewardAmount: string
  createdAt: string
  rewardGrantedAt: string | null
}

export type BypassRefusal = 'not_accepted' | 'window_closed' | 'already_reported' | 'limit_reached'

/** Whether this booking can be reported now, and the report if it was. */
export interface BypassBookingStatus {
  canReport: boolean
  refusal: BypassRefusal | null
  report: MyBypassReport | null
  reportsLeft: number
  /** Detlio credit is on: the form promises the reward. */
  rewardOffered: boolean
  rewardAmount: string
}

export interface ReportBypassInput {
  bookingId: string
  kind: BypassKind
  note?: string
}

/** GET /users/me/bypass-reports/bookings/:bookingId */
export function getBypassStatus(bookingId: string): Promise<BypassBookingStatus> {
  return apiClient<BypassBookingStatus>(`/users/me/bypass-reports/bookings/${bookingId}`)
}

/** POST /users/me/bypass-reports */
export function reportBypass(input: ReportBypassInput): Promise<MyBypassReport> {
  return apiClient<MyBypassReport>('/users/me/bypass-reports', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export type AdminBypassFilter = BypassStatus

export interface AdminBypassReport {
  id: string
  status: BypassStatus
  kind: BypassKind
  kindLabel: string
  note: string | null
  createdAt: string
  garage: { id: string | null; name: string; strikes: number; highlighted: boolean }
  booking: {
    id: string | null
    reference: string
    status: string | null
    scheduledAt: string | null
    markedTest: boolean
  }
  /** Who reported it (admin only); null once the account was deleted. */
  customer: { id: string; name: string | null; phone: string | null } | null
  confirmedAt: string | null
  confirmedBy: string | null
  dismissedAt: string | null
  dismissedBy: string | null
  dismissedReason: string | null
  reward: { status: BypassRewardStatus; grantedAt: string | null }
}

export interface AdminBypassList {
  reports: AdminBypassReport[]
  counts: Record<BypassStatus, number>
  rules: { rewardAmount: string; strikeWindowDays: number; strikeAlertAt: number; creditOn: boolean }
}

export function listAdminBypassReports(show: AdminBypassFilter): Promise<AdminBypassList> {
  return apiClient<AdminBypassList>('/admin/bypass-reports', { params: { show } })
}

export function confirmBypassReport(id: string, input: { actorName: string }): Promise<AdminBypassReport> {
  return apiClient<AdminBypassReport>(`/admin/bypass-reports/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function dismissBypassReport(id: string, input: { actorName: string; reason: string }): Promise<AdminBypassReport> {
  return apiClient<AdminBypassReport>(`/admin/bypass-reports/${id}/dismiss`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** A garage's strikes and reports, for its admin page. */
export interface GarageStrikes {
  strikes: number
  highlighted: boolean
  windowDays: number
  newReports: number
  confirmed: number
  dismissed: number
}

export function getGarageStrikes(vendorId: string): Promise<GarageStrikes> {
  return apiClient<GarageStrikes>(`/admin/bypass-reports/vendors/${vendorId}`)
}

/** Customer drop-off: regulars of a garage who went quiet on Detlio. */
export interface DropOffView {
  rules: {
    regularMinCompleted: number
    regularWindowDays: number
    historyDays: number
    quietMultiplier: number
    minQuietDays: number
    flagRate: number
    flagMinRegulars: number
  }
  /** More chains than one read takes: the figures may be low. */
  truncated: boolean
  garages: Array<{
    vendorId: string
    name: string
    inBin: boolean
    regulars: number
    wentQuiet: number
    /** 0–1. */
    rate: number
    flagged: boolean
    strikes: number
  }>
  quiet: Array<{
    vendorId: string
    garageName: string
    customer: { id: string; name: string | null; phone: string | null }
    completedHere: number
    usualGapDays: number
    thresholdDays: number
    quietDays: number
    lastBookingId: string
    lastBookingRef: string
    lastServiceAt: string
  }>
  now: string
}

export function getDropOff(): Promise<DropOffView> {
  return apiClient<DropOffView>('/admin/bypass-reports/drop-off')
}
