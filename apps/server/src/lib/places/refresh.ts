import type { GooglePlaceDetails } from './types.js'

/**
 * Google's terms for what the finder kept (0064): a place id may be kept
 * for good; everything else Google gave (name, phone, address, rating,
 * review count, and a pin taken from Google) may be held 30 days, then
 * read again or deleted. What the team typed or confirmed (`leads.name`,
 * `phone`, notes, status) is ours and is never touched here. Pure,
 * unit-tested in refresh.test.ts; the cron runs it nightly
 * (leadsService.refreshGoogle).
 */

/** How long Google's details may be held. */
export const GOOGLE_HOLD_DAYS = 30

/**
 * When the refresh starts trying: a day early, so a night Google fails to
 * answer still leaves another try before the 30 days are up.
 */
export const GOOGLE_REFRESH_AFTER_DAYS = 29

/** The nightly runs: 01:00 to 04:59 IST, so the morning screens are clean. */
export const GOOGLE_REFRESH_IST_HOURS = { from: 1, until: 5 } as const

/** At most this many leads a cron run (the cron runs every 10 minutes). */
export const GOOGLE_REFRESH_BATCH = 20

const DAY_MS = 24 * 60 * 60 * 1000

export function googleRefreshDue(fetchedAt: Date | null, now: Date): boolean {
  return (
    fetchedAt !== null &&
    now.getTime() - fetchedAt.getTime() >= GOOGLE_REFRESH_AFTER_DAYS * DAY_MS
  )
}

/** Past the 30 days: what cannot be read again must go. */
export function googleHoldEnded(fetchedAt: Date | null, now: Date): boolean {
  return (
    fetchedAt !== null &&
    now.getTime() - fetchedAt.getTime() >= GOOGLE_HOLD_DAYS * DAY_MS
  )
}

/** Whether this cron run is one of the night's refresh runs. */
export function isGoogleRefreshHour(now: Date): boolean {
  const istHour = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).getUTCHours()
  return (
    istHour >= GOOGLE_REFRESH_IST_HOURS.from &&
    istHour < GOOGLE_REFRESH_IST_HOURS.until
  )
}

export interface GoogleHeld {
  pinSource: string | null
  lat: number | null
  lng: number | null
}

export interface GooglePatch {
  googleName: string | null
  googlePhone: string | null
  googleAddress: string | null
  googleRating: string | null
  googleReviewCount: number | null
  googleFetchedAt: Date | null
  /** Present only when the pin came from Google: its new place, or null to clear it. */
  pin?: { lat: number; lng: number } | null
}

export type GoogleRefreshOutcome =
  | { kind: 'refreshed'; patch: GooglePatch }
  | { kind: 'cleared'; patch: GooglePatch }
  | { kind: 'kept' }

/**
 * What a lead's Google fields become in a refresh run.
 *
 * - Google answered: the fields as Google has them now, dated now; a pin
 *   from Google moves with them (and stays if Google gave none).
 * - Google no longer knows the place (`details` null), or could not be
 *   asked (`details` undefined: no key, or an error) and the 30 days are
 *   up: every Google field is cleared, and a pin from Google with them.
 * - Could not be asked, but still inside the 30 days: kept, tried again on
 *   the next run.
 */
export function googleRefreshOutcome(
  lead: GoogleHeld & { googleFetchedAt: Date | null },
  details: GooglePlaceDetails | null | undefined,
  now: Date
): GoogleRefreshOutcome {
  const pinFromGoogle = lead.pinSource === 'google'
  if (details) {
    const pin =
      pinFromGoogle && details.lat !== null && details.lng !== null
        ? { pin: { lat: details.lat, lng: details.lng } }
        : {}
    return {
      kind: 'refreshed',
      patch: {
        googleName: details.name,
        googlePhone: details.phone,
        googleAddress: details.address,
        googleRating:
          details.rating === null ? null : details.rating.toFixed(1),
        googleReviewCount: details.reviewCount,
        googleFetchedAt: now,
        ...pin,
      },
    }
  }
  if (details === null || googleHoldEnded(lead.googleFetchedAt, now)) {
    return {
      kind: 'cleared',
      patch: {
        googleName: null,
        googlePhone: null,
        googleAddress: null,
        googleRating: null,
        googleReviewCount: null,
        googleFetchedAt: null,
        ...(pinFromGoogle ? { pin: null } : {}),
      },
    }
  }
  return { kind: 'kept' }
}
