/**
 * Leads (0064, Coverage & leads): garages the team wants to sign up.
 * Customers never see them. Pure rules, unit-tested in leads.test.ts; the
 * panel's words for them are twinned in packages/core/src/leads.ts
 * (leads.parity.test.ts).
 */

export const LEAD_SOURCES = [
  'manual',
  'paste',
  'google',
  'ola',
  'customer',
] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_STATUSES = [
  'to_target',
  'not_interested',
  'onboarded',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

/** Where a lead's pin came from: a pasted Maps link, typed or clicked on the map, or a search result. */
export const LEAD_PIN_SOURCES = ['maps_link', 'map', 'google', 'ola'] as const
export type LeadPinSource = (typeof LEAD_PIN_SOURCES)[number]

export const LEAD_NAME_MAX = 120
export const LEAD_NOTE_MAX = 500
export const LEAD_REASON_MAX = 200
export const LEAD_ADDRESS_MAX = 300

/** How close a similarly named lead or garage must be to warn that it may be the same place. */
export const LEAD_DUPLICATE_RADIUS_M = 150

/** The most lines one pasted list takes. */
export const LEAD_PASTE_MAX = 200

/**
 * A phone number as we keep it: digits only, an Indian number cut to its
 * ten digits (+91, 91 or a leading 0 dropped, so "044 2345 6789" and
 * "+91 44 2345 6789" are the same number). Anything from 6 to 15 digits
 * otherwise; null for no number at all.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D+/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 13 && digits.startsWith('091'))
    digits = digits.slice(3)
  else if (digits.length === 11 && digits.startsWith('0'))
    digits = digits.slice(1)
  if (digits.length < 6 || digits.length > 15) return null
  return digits
}

/** An Indian mobile number: what WhatsApp can open. */
export function isIndianMobile(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && /^[6-9]\d{9}$/.test(phone)
}

/**
 * What a lead is called on screen: the team's own name, else Google's while
 * it is still held, else a plain stand-in (Google's details were cleared
 * after 30 days and nobody confirmed a name).
 */
export function leadDisplayName(lead: {
  name: string | null
  googleName: string | null
}): string {
  return lead.name ?? lead.googleName ?? 'Place from Google (details expired)'
}

/** The phone shown: the team's, else Google's while it is held. */
export function leadDisplayPhone(lead: {
  phone: string | null
  googlePhone: string | null
}): string | null {
  return lead.phone ?? lead.googlePhone ?? null
}

/**
 * The status columns for a status change: Not interested always carries
 * its reason and the day (today in IST unless given), and an optional day
 * to try again after; any other status clears all three. Onboarded stamps
 * when.
 */
export function statusColumns(
  input: {
    status: LeadStatus
    reason?: string | null
    retryAfter?: string | null
  },
  today: string,
  now: Date
): {
  status: LeadStatus
  notInterestedReason: string | null
  notInterestedOn: string | null
  retryAfter: string | null
  onboardedAt?: Date | null
} {
  if (input.status === 'not_interested') {
    const reason = input.reason?.trim()
    if (!reason) throw new Error('A reason is needed for Not interested')
    return {
      status: 'not_interested',
      notInterestedReason: reason.slice(0, LEAD_REASON_MAX),
      notInterestedOn: today,
      retryAfter: input.retryAfter ?? null,
    }
  }
  return {
    status: input.status,
    notInterestedReason: null,
    notInterestedOn: null,
    retryAfter: null,
    onboardedAt: input.status === 'onboarded' ? now : null,
  }
}
