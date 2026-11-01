import type { BookingType, VehicleType } from '@repo/core/types';

import { devicePrefs } from './device-prefs';

/**
 * A booking started and left half way: kept on this phone for a day, as the web keeps it in
 * localStorage (packages/core/src/booking-draft.ts, whose rules these are; that file is
 * browser-bound and never reaches the phone). Prices are never in it: only ids and what the
 * customer typed. Cleared on a booking and on sign-out.
 */
const KEY = 'detlio.bookingDraft';
export const BOOKING_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface DraftCar {
  vehicleType: VehicleType;
  make: string;
  model: string;
}

export interface DraftAddress {
  label: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  geoSource: 'gps' | 'map_pin';
}

export interface BookingDraft {
  vendorId: string;
  vendorName: string;
  serviceIds: string[];
  addOnIds?: string[];
  mode: BookingType;
  slot: string | null;
  car: DraftCar | null;
  address: DraftAddress | null;
  savedAt: number;
}

const MODES: readonly BookingType[] = ['dropin', 'doorstep', 'pickup'];
const TYPES: readonly VehicleType[] = ['hatchback', 'sedan', 'suv'];
const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function parseCar(value: unknown): DraftCar | null {
  if (!value || typeof value !== 'object') return null;
  const car = value as Record<string, unknown>;
  if (!TYPES.includes(car.vehicleType as VehicleType) || !isString(car.make) || !isString(car.model)) return null;
  return { vehicleType: car.vehicleType as VehicleType, make: car.make, model: car.model };
}

function parseAddress(value: unknown): DraftAddress | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  if (!isString(a.label) || !isString(a.address) || !isString(a.city)) return null;
  if (!isNumber(a.lat) || !isNumber(a.lng)) return null;
  if (a.geoSource !== 'gps' && a.geoSource !== 'map_pin') return null;
  return { label: a.label, address: a.address, city: a.city, lat: a.lat, lng: a.lng, geoSource: a.geoSource };
}

export function isDraftLive(draft: Pick<BookingDraft, 'savedAt'>, now: number): boolean {
  return draft.savedAt <= now + CLOCK_SKEW_MS && now - draft.savedAt < BOOKING_DRAFT_TTL_MS;
}

export function parseBookingDraft(raw: string | null | undefined, now: number): BookingDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const d = value as Record<string, unknown>;
  if (!isString(d.vendorId) || d.vendorId === '' || !isString(d.vendorName)) return null;
  if (!Array.isArray(d.serviceIds) || d.serviceIds.length === 0 || !d.serviceIds.every(isString)) return null;
  if (!MODES.includes(d.mode as BookingType)) return null;
  if (d.slot !== null && !isString(d.slot)) return null;
  if (!isNumber(d.savedAt)) return null;
  const draft: BookingDraft = {
    vendorId: d.vendorId,
    vendorName: d.vendorName,
    serviceIds: d.serviceIds as string[],
    ...(Array.isArray(d.addOnIds) && d.addOnIds.every(isString) && d.addOnIds.length > 0
      ? { addOnIds: d.addOnIds as string[] }
      : {}),
    mode: d.mode as BookingType,
    slot: (d.slot as string | null) ?? null,
    car: d.car == null ? null : parseCar(d.car),
    address: d.address == null ? null : parseAddress(d.address),
    savedAt: d.savedAt,
  };
  return isDraftLive(draft, now) ? draft : null;
}

export function draftResumePath(draft: Pick<BookingDraft, 'vendorId' | 'serviceIds' | 'mode' | 'addOnIds'>): string {
  const params = new URLSearchParams({ service: draft.serviceIds.join(',') });
  if (draft.mode !== 'dropin') params.set('mode', draft.mode);
  if (draft.addOnIds?.length) params.set('addons', draft.addOnIds.join(','));
  return `/book/${encodeURIComponent(draft.vendorId)}?${params.toString()}`;
}

export function draftSlotStillAhead(slot: string | null, now: number): string | null {
  if (!slot) return null;
  const at = Date.parse(slot);
  return Number.isFinite(at) && at > now ? slot : null;
}

export function readBookingDraft(now = Date.now()): BookingDraft | null {
  const raw = devicePrefs.getItem(KEY);
  const draft = parseBookingDraft(raw, now);
  if (raw && !draft) devicePrefs.removeItem(KEY);
  return draft;
}

export const writeBookingDraft = (draft: BookingDraft) => devicePrefs.setItem(KEY, JSON.stringify(draft));
export const clearBookingDraft = () => devicePrefs.removeItem(KEY);

export const draftCarReady = (car: DraftCar | null): car is DraftCar =>
  car !== null && car.make.trim().length > 0 && car.model.trim().length > 0;
