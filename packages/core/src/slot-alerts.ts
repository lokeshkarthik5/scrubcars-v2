import type { BookingType } from '@repo/core/types'

/**
 * "Notify me if a slot opens" (0047): the words and numbers the customer
 * app shows. The server's twin is apps/server/src/lib/slot-alerts.ts, which
 * decides; slot-alerts.parity.test.ts there fails if the two drift.
 */

export const SLOT_ALERT_WINDOWS = ['any', 'morning', 'afternoon', 'evening'] as const
/** The part of the day the customer wants: a start time in it counts. */
export type SlotAlertWindow = (typeof SLOT_ALERT_WINDOWS)[number]

/** Each window's hours in IST, start included, end not. */
export const SLOT_ALERT_WINDOW_HOURS: Record<Exclude<SlotAlertWindow, 'any'>, { from: number; to: number }> = {
  morning: { from: 6, to: 12 },
  afternoon: { from: 12, to: 17 },
  evening: { from: 17, to: 22 },
}

/** The choice's name. */
export const SLOT_ALERT_WINDOW_LABELS: Record<SlotAlertWindow, string> = {
  any: 'Any time',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

/** Its hours, as the app writes times (SLOT_ALERT_WINDOW_HOURS). */
export const SLOT_ALERT_WINDOW_HINTS: Record<SlotAlertWindow, string | null> = {
  any: null,
  morning: '6 AM–12 PM',
  afternoon: '12–5 PM',
  evening: '5–10 PM',
}

/** At most this many waiting at once, across garages. */
export const MAX_ACTIVE_SLOT_ALERTS = 5

/** How far ahead one may be set, in days from today. */
export const SLOT_ALERT_MAX_DAYS_AHEAD = 60

/** Whether a slot (ISO) starts in the window, in IST. */
export function inSlotAlertWindow(iso: string, window: SlotAlertWindow): boolean {
  if (window === 'any') return true
  // IST is UTC+05:30 all year.
  const hour = new Date(new Date(iso).getTime() + 330 * 60_000).getUTCHours()
  const hours = SLOT_ALERT_WINDOW_HOURS[window]
  return hour >= hours.from && hour < hours.to
}

/** "Sat 24 Oct" for a YYYY-MM-DD date key. */
export function slotAlertDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d))
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getUTCDay()]
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][day.getUTCMonth()]
  return `${weekday} ${d} ${month}`
}

/** "Sat 24 Oct · Morning, 6 AM–12 PM", or "Sat 24 Oct · Any time". */
export function slotAlertSummary(alert: { date: string; window: SlotAlertWindow }): string {
  const hint = SLOT_ALERT_WINDOW_HINTS[alert.window]
  return `${slotAlertDayLabel(alert.date)} · ${SLOT_ALERT_WINDOW_LABELS[alert.window]}${hint ? `, ${hint}` : ''}`
}

/** One waiting alert, as GET /users/me/slot-alerts gives it. */
export interface SlotAlert {
  id: string
  vendorId: string
  vendorName: string
  date: string
  window: SlotAlertWindow
  bookingType: BookingType
  durationMins: number
  serviceIds: string[]
  createdAt: string
  expiresAt: string
}
