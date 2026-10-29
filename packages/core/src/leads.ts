/**
 * Coverage & leads' words and small rules for the admin panel (0064).
 * Twin of apps/server/src/lib/leads.ts and lib/places/kinds.ts
 * (leads.parity.test.ts keeps the kinds, statuses and phone rule equal).
 */

export const LEAD_STATUSES = [
  'to_target',
  'not_interested',
  'onboarded',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  to_target: 'To target',
  not_interested: 'Not interested',
  onboarded: 'Onboarded',
}

export const LEAD_SOURCES = [
  'manual',
  'paste',
  'google',
  'ola',
  'customer',
] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  manual: 'Added by hand',
  paste: 'From a pasted list',
  google: 'From map search',
  ola: 'From map search',
  customer: 'Recommended by a customer',
}

export const PLACE_KINDS = [
  'car_wash',
  'detailing',
  'doorstep',
  'workshop',
  'tyres',
] as const
export type PlaceKind = (typeof PLACE_KINDS)[number]

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  car_wash: 'Car wash',
  detailing: 'Detailing studio',
  doorstep: 'Doorstep wash',
  workshop: 'Workshop / service centre',
  tyres: 'Tyres & accessories',
}

/** Why something looks like a place the team already has. */
export type MatchReason =
  'phone' | 'place_id' | 'name_nearby' | 'same_name_zone'

export const MATCH_REASON_TEXT: Record<MatchReason, string> = {
  phone: 'same phone',
  place_id: 'same map place',
  name_nearby: 'similar name within 150 m',
  same_name_zone: 'same name in this zone',
}

export const LEAD_NAME_MAX = 120
export const LEAD_NOTE_MAX = 500
export const LEAD_REASON_MAX = 200

/** How long Google's details are held before they are read again or cleared (Google's terms). */
export const GOOGLE_HOLD_DAYS = 30

/** Digits only, an Indian number cut to its ten (the server's normalisePhone). Null for none. */
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

/** "98400 41230" for ten digits; any other number as it is. */
export function formatLeadPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone
}
