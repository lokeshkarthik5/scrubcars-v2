import type { ApiVendorProfile, ApiWorkingHours } from '@repo/core/api/types';
import { t, tn } from '@repo/core/i18n/translate';

/**
 * The pure parts of Settings (apps/vendors/app/settings/page.tsx, pickup-section.tsx
 * and time-off-section.tsx): form mapping, validation and the holiday date window.
 * Kept free of react-native so `bun test` can load it.
 */

export const SETTINGS_TABS = ['profile', 'location', 'hours', 'time-off', 'account'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The tab a `?tab=` link opens on. Anything else lands on Profile, the web's first tab. */
export function initialTab(requested: string | string[] | undefined): SettingsTab {
  const value = Array.isArray(requested) ? requested[0] : requested;
  return SETTINGS_TABS.includes(value as SettingsTab) ? (value as SettingsTab) : 'profile';
}

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const SLOT_INTERVALS = [30, 45, 60] as const;
/** The server's bounds for bays; jobs per day is 1 to 500 or blank. */
export const MAX_BAYS = 20;
export const MAX_JOBS_PER_DAY = 500;
/** How far ahead a holiday can go, matching the server's rule. */
export const MAX_DAYS_AHEAD = 365;
const APP_TIMEZONE = 'Asia/Kolkata';

/** Digits only, cut to `max` (Phone 10, Pincode 6, bays 2, jobs per day 3). */
export const digitsOnly = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

/** A radius box: digits and a dot, as the web's pickup distance and doorstep radius. */
export const decimalOnly = (value: string, max?: number) => {
  const cleaned = value.replace(/[^\d.]/g, '');
  return max ? cleaned.slice(0, max) : cleaned;
};

/**
 * What is wrong with the capacity form, in the owner's words, or null. Bays must be a
 * whole number from 1 to 20; the daily limit is blank (no limit) or a whole number from 1 up.
 */
export function capacityProblem(bays: string, jobsPerDay: string): string | null {
  const bayCount = Number(bays);
  if (!/^\d+$/.test(bays) || bayCount < 1 || bayCount > MAX_BAYS) {
    return t('Cars at the same time must be between 1 and {max}.', { max: MAX_BAYS });
  }
  if (jobsPerDay.trim() === '') return null;
  const jobs = Number(jobsPerDay);
  if (!/^\d+$/.test(jobsPerDay) || jobs < 1 || jobs > MAX_JOBS_PER_DAY) {
    return t('Jobs in a day must be between 1 and {max}, or left blank.', { max: MAX_JOBS_PER_DAY });
  }
  return null;
}

/** The capacity boxes from the garage: unset bays read as one, which the slot list assumes too. */
export function capacityFromVendor(vendor: Pick<ApiVendorProfile, 'bays' | 'jobsPerDay'>) {
  return {
    bays: String(vendor.bays && vendor.bays > 0 ? vendor.bays : 1),
    jobsPerDay: vendor.jobsPerDay != null ? String(vendor.jobsPerDay) : '',
  };
}

/** The PATCH body of "Save capacity": a blank daily limit clears the cap. */
export function capacityPayload(capacity: { bays: string; jobsPerDay: string }) {
  return {
    bays: Number(capacity.bays),
    jobsPerDay: capacity.jobsPerDay.trim() ? Number(capacity.jobsPerDay) : null,
  };
}

export interface ProfileForm {
  businessName: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
}

export const profileFromVendor = (vendor: ApiVendorProfile): ProfileForm => ({
  businessName: vendor.businessName,
  phone: vendor.phone,
  address: vendor.address,
  city: vendor.city,
  pincode: vendor.pincode,
});

/**
 * "Save profile" sends the five fields and also resends the pin the garage has, as
 * the web does (its Location tab's pin state starts from the saved lat/lng, with
 * geoSource 'map_pin'). An unpinned garage sends neither.
 */
export function profilePayload(form: ProfileForm, vendor: Pick<ApiVendorProfile, 'lat' | 'lng'>) {
  const pinned = vendor.lat != null && vendor.lng != null;
  return {
    businessName: form.businessName,
    phone: form.phone,
    address: form.address,
    city: form.city,
    pincode: form.pincode,
    lat: vendor.lat ?? undefined,
    lng: vendor.lng ?? undefined,
    geoSource: pinned ? ('map_pin' as const) : undefined,
  };
}

export interface WorkingHoursForm {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

/** `09:00:00` shown as `09:00`. */
export const normalizeTimeForInput = (time: string) => time.slice(0, 5);
/** `09:00` sent as `09:00:00`. */
export const normalizeTimeForApi = (time: string) => (time.length === 5 ? `${time}:00` : time);

export function defaultWorkingHours(): WorkingHoursForm[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: '09:00',
    closeTime: '18:00',
    isClosed: false,
  }));
}

/** Seven rows Sun to Sat: the server's day where it has one, 09:00 to 18:00 open where it doesn't. */
export function mapWorkingHours(hours: ApiWorkingHours[]): WorkingHoursForm[] {
  const byDay = new Map(hours.map((day) => [day.dayOfWeek, day]));
  return defaultWorkingHours().map((fallback) => {
    const day = byDay.get(fallback.dayOfWeek);
    return day
      ? {
          dayOfWeek: day.dayOfWeek,
          openTime: normalizeTimeForInput(day.openTime),
          closeTime: normalizeTimeForInput(day.closeTime),
          isClosed: day.isClosed,
        }
      : fallback;
  });
}

/** The PUT body of "Save working hours": times as HH:MM:SS. */
export const workingHoursPayload = (form: WorkingHoursForm[]) =>
  form.map((day) => ({
    ...day,
    openTime: normalizeTimeForApi(day.openTime),
    closeTime: normalizeTimeForApi(day.closeTime),
  }));

/** Today as an IST calendar day, `YYYY-MM-DD`. */
export const todayKey = (now: Date = new Date()) => now.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });

export function addDays(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The dates a holiday can be on: today up to 365 days ahead. */
export function closureWindow(now: Date = new Date()) {
  const min = todayKey(now);
  return { min, max: addDays(min, MAX_DAYS_AHEAD) };
}

/** "2026-10-20" to "Tue, 20 Oct". The date is a calendar day, not an instant. */
export function formatDay(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "17 Oct 2026". */
export function formatAcceptedDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: APP_TIMEZONE,
  });
}

export function bookingsSentence(count: number) {
  return tn(
    count,
    'You have {count} booking that day — reschedule or cancel it with the customer.',
    'You have {count} bookings that day — reschedule or cancel them with the customers.'
  );
}

/** The closures list in date order, as the web keeps it after an add. */
export const sortClosures = <C extends { date: string }>(closures: C[]) =>
  [...closures].sort((a, b) => a.date.localeCompare(b.date));
