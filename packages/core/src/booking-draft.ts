/**
 * A booking started without signing in (customer reach, 0062: "guests can
 * book and sign in only at payment"), kept on the phone until the customer
 * signs in at "Confirm", and offered back as "Continue your booking at
 * <garage>" on the landing page and Home if they leave half way.
 *
 * Only on the device (localStorage, `detlio:booking-draft`, named in the
 * privacy policy's storage table), never sent anywhere until sign-in: the
 * car and address are saved to the account then, through the ordinary
 * vehicle and address APIs. One draft at a time; a new checkout replaces it.
 * Ignored, and removed when read, after 24 hours; removed on booking.
 *
 * Pure apart from the small storage helpers, which take the Storage and the
 * clock so tests pass their own (booking-draft.test.ts).
 */

import type { BookingType, VehicleType } from './types'

export const BOOKING_DRAFT_KEY = 'detlio:booking-draft'

/** A day: long enough to come back after lunch, short enough not to haunt next week. */
export const BOOKING_DRAFT_TTL_MS = 24 * 60 * 60 * 1000

/** A clock a few minutes fast on another visit must not make a draft "from the future" live for ever. */
const CLOCK_SKEW_MS = 5 * 60 * 1000

/** The car as the guest described it: the body type sets the price. */
export interface DraftCar {
  vehicleType: VehicleType
  make: string
  model: string
}

/** Where to come (doorstep) or collect from (pickup), with its pin. */
export interface DraftAddress {
  label: string
  address: string
  city: string
  lat: number
  lng: number
  geoSource: 'gps' | 'map_pin'
}

export interface BookingDraft {
  vendorId: string
  vendorName: string
  serviceIds: string[]
  mode: BookingType
  /** The picked time (ISO), or null before one is picked. */
  slot: string | null
  car: DraftCar | null
  address: DraftAddress | null
  /** Epoch ms of the last change. */
  savedAt: number
}

const MODES: readonly BookingType[] = ['dropin', 'doorstep', 'pickup']
const TYPES: readonly VehicleType[] = ['hatchback', 'sedan', 'suv']

const isString = (value: unknown): value is string => typeof value === 'string'
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function parseCar(value: unknown): DraftCar | null {
  if (!value || typeof value !== 'object') return null
  const car = value as Record<string, unknown>
  if (!TYPES.includes(car.vehicleType as VehicleType) || !isString(car.make) || !isString(car.model)) return null
  return { vehicleType: car.vehicleType as VehicleType, make: car.make, model: car.model }
}

function parseAddress(value: unknown): DraftAddress | null {
  if (!value || typeof value !== 'object') return null
  const a = value as Record<string, unknown>
  if (!isString(a.label) || !isString(a.address) || !isString(a.city)) return null
  if (!isFiniteNumber(a.lat) || !isFiniteNumber(a.lng)) return null
  if (a.geoSource !== 'gps' && a.geoSource !== 'map_pin') return null
  return { label: a.label, address: a.address, city: a.city, lat: a.lat, lng: a.lng, geoSource: a.geoSource }
}

/**
 * The draft stored under BOOKING_DRAFT_KEY, if it is well formed and still
 * live (written in the last 24 hours, and not in the future beyond a little
 * clock skew). Anything else is null: an old shape, someone's edit, or a
 * draft past its day.
 */
export function parseBookingDraft(raw: string | null | undefined, now: number): BookingDraft | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const d = value as Record<string, unknown>
  if (!isString(d.vendorId) || d.vendorId === '' || !isString(d.vendorName)) return null
  if (!Array.isArray(d.serviceIds) || d.serviceIds.length === 0 || !d.serviceIds.every(isString)) return null
  if (!MODES.includes(d.mode as BookingType)) return null
  if (d.slot !== null && !isString(d.slot)) return null
  if (!isFiniteNumber(d.savedAt)) return null
  const draft: BookingDraft = {
    vendorId: d.vendorId,
    vendorName: d.vendorName,
    serviceIds: d.serviceIds as string[],
    mode: d.mode as BookingType,
    slot: (d.slot as string | null) ?? null,
    car: d.car == null ? null : parseCar(d.car),
    address: d.address == null ? null : parseAddress(d.address),
    savedAt: d.savedAt,
  }
  return isDraftLive(draft, now) ? draft : null
}

/** Whether a draft is still offered: written in the last 24 hours. */
export function isDraftLive(draft: Pick<BookingDraft, 'savedAt'>, now: number): boolean {
  return draft.savedAt <= now + CLOCK_SKEW_MS && now - draft.savedAt < BOOKING_DRAFT_TTL_MS
}

/** Where "Continue your booking" goes: checkout with the same garage, services and mode. */
export function draftResumePath(draft: Pick<BookingDraft, 'vendorId' | 'serviceIds' | 'mode'>): string {
  const params = new URLSearchParams({ service: draft.serviceIds.join(',') })
  if (draft.mode !== 'dropin') params.set('mode', draft.mode)
  return `/book/${encodeURIComponent(draft.vendorId)}?${params.toString()}`
}

/**
 * The time a draft still offers: its slot only while it is ahead of now. A
 * time that has passed is no booking at all; checkout picks again.
 */
export function draftSlotStillAhead(slot: string | null, now: number): string | null {
  if (!slot) return null
  const at = Date.parse(slot)
  return Number.isFinite(at) && at > now ? slot : null
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** The live draft on this phone, or null. A dead one is removed as it is read. */
export function readBookingDraft(now = Date.now(), store: Storage | null = storage()): BookingDraft | null {
  if (!store) return null
  try {
    const raw = store.getItem(BOOKING_DRAFT_KEY)
    const draft = parseBookingDraft(raw, now)
    if (raw && !draft) store.removeItem(BOOKING_DRAFT_KEY)
    return draft
  } catch {
    return null
  }
}

/** Keeps the draft (replacing any other). Storage blocked is fine: the draft is a nicety. */
export function writeBookingDraft(draft: BookingDraft, store: Storage | null = storage()): void {
  try {
    store?.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Private mode or a full quota: checkout still works, it just is not kept.
  }
}

export function clearBookingDraft(store: Storage | null = storage()): void {
  try {
    store?.removeItem(BOOKING_DRAFT_KEY)
  } catch {
    // As above.
  }
}
