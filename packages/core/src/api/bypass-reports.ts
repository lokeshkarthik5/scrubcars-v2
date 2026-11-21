import { apiClient } from '@repo/core/api/client'
import type { BypassKind, BypassRewardStatus, BypassStatus } from '@repo/core/bypass-reports'
import { signedBody } from './admin-signer'

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

/** Which kind of entry (0077): all, customers' reports, or Detlio's own flags. */
export type AdminBypassSource = 'all' | 'customer' | 'detlio'

/** What Detlio's check found, as admin reads it (masked; never a full number). */
export type AdminFlagEvidence =
  | {
      signal: 'contact_in_note'
      /** Where the note was ("Garage’s final bill"). */
      where: string
      writtenAt: string
      excerpt: string
      found: Array<'phone' | 'upi' | 'wording'>
      confirmedByAi: boolean
    }
  | {
      signal: 'regulars_went_quiet'
      regulars: number
      stopped: number
      bookingElsewhere: number
      stoppedDays: number
      customers: Array<{ id: string; name: string | null; lastBookingId: string; lastBookingRef: string; lastAt: string }>
    }
  | {
      signal: 'cancelled_after_inspection'
      days: number
      bookings: Array<{ id: string; ref: string; cancelledAt: string; reason: string | null }>
    }

export interface AdminBypassReport {
  id: string
  status: BypassStatus
  /** A customer's report, or Detlio's own flag (0077). Missing from an older server: a report. */
  source?: 'customer' | 'detlio'
  signal?: 'contact_in_note' | 'regulars_went_quiet' | 'cancelled_after_inspection' | null
  /** A flag's evidence; null on a customer's report. */
  evidence?: AdminFlagEvidence | null
  kind: BypassKind
  kindLabel: string
  note: string | null
  createdAt: string
  garage: { id: string | null; name: string; strikes: number; highlighted: boolean }
  booking: {
    id: string | null
    /** Null on a flag about a garage rather than one booking. */
    reference: string | null
    status: string | null
    scheduledAt: string | null
    markedTest: boolean
    /** The pickup fee locked on the booking (0079); null when none. Absent from an older API. */
    pickupFee?: number | null
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
  /** Detlio's flags (OFF_APP_FLAGS_ENABLED): off, or on with the "All / Customer reports / Flagged by Detlio" counts. */
  flags?: { enabled: false } | { enabled: true; from: AdminBypassSource; counts: Record<AdminBypassSource, number> }
  rules: { rewardAmount: string; strikeWindowDays: number; strikeAlertAt: number; creditOn: boolean }
}

export function listAdminBypassReports(show: AdminBypassFilter, from: AdminBypassSource = 'all'): Promise<AdminBypassList> {
  return apiClient<AdminBypassList>('/admin/bypass-reports', { params: { show, from } })
}

/** Detlio's checks at once (0077): new flags only, never a strike or a reward. */
export function checkBypassFlags(): Promise<{ created: number; failed: number }> {
  return apiClient<{ created: number; failed: number }>('/admin/bypass-reports/flags/check', { method: 'POST' })
}

export function confirmBypassReport(id: string): Promise<AdminBypassReport> {
  return apiClient<AdminBypassReport>(`/admin/bypass-reports/${id}/confirm`, {
    method: 'POST',
    body: signedBody({}),
  })
}

export function dismissBypassReport(id: string, input: { reason: string }): Promise<AdminBypassReport> {
  return apiClient<AdminBypassReport>(`/admin/bypass-reports/${id}/dismiss`, {
    method: 'POST',
    body: signedBody(input),
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
