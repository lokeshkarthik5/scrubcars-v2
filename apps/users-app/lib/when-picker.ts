/** The date and time picker's day maths (apps/users/lib/when-picker.ts): IST, never the phone's clock. */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export interface SlotDayState {
  date: string;
  slots: string[];
  allBooked: boolean;
  unavailable: boolean;
}

export interface DayChip {
  value: string;
  dayOfWeek: number;
  dayName: string;
  day: number;
  monthName: string;
}

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function dateChipOf(key: string): DayChip {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return {
    value: key,
    dayOfWeek: date.getUTCDay(),
    dayName: DAY_NAMES[date.getUTCDay()],
    day: date.getUTCDate(),
    monthName: MONTH_NAMES[date.getUTCMonth()],
  };
}

export const weekOf = (today: string, count: number): DayChip[] =>
  Array.from({ length: count }, (_, i) => dateChipOf(addDaysToKey(today, i)));

export function firstOpenDayAfter(from: string, skip: number, isClosed: (key: string) => boolean, limit: number): string | null {
  for (let i = skip + 1; i <= skip + limit; i++) {
    const key = addDaysToKey(from, i);
    if (!isClosed(key)) return key;
  }
  return null;
}

export function splitByMorning(times: readonly string[]): { morning: string[]; later: string[] } {
  const morning: string[] = [];
  const later: string[] = [];
  for (const time of times) {
    const hour = new Date(new Date(time).getTime() + IST_OFFSET_MS).getUTCHours();
    (hour < 12 ? morning : later).push(time);
  }
  return { morning, later };
}

/** Today in IST, as a key, from an instant (toLocaleDateString('en-CA') isn't on every Hermes). */
export const istToday = (now: number): string => new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
export const istDay = (iso: string): string => istToday(new Date(iso).getTime());
export const MONTHS = MONTH_NAMES;
export const DAYS = DAY_NAMES;

/**
 * A time picked on a garage card's "Next free" row (`slot` in the booking link, customer
 * UI round): kept, as an ISO start, only while it is still ahead of this clock. The
 * booking opens on its day with it chosen; anything else in the link is no time at all.
 */
export function linkedSlot(param: string | null | undefined, now: number): string | null {
  const at = param ? Date.parse(param) : Number.NaN;
  return Number.isFinite(at) && at > now ? new Date(at).toISOString() : null;
}

/**
 * Whether a chosen time has gone from its own day's list (someone else took it): only a
 * day whose times are known can say so, and only for a time on that day.
 */
export function slotTaken(value: string | null, day: string | null, times: readonly string[] | null): boolean {
  if (!value || !day || times === null || istDay(value) !== day) return false;
  const at = Date.parse(value);
  return !times.some((time) => Date.parse(time) === at);
}
