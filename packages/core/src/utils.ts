import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * The timezone the app operates in. The server anchors all slot times to
 * IST (+05:30), so every client-side date/time formatter must render in the
 * same zone — otherwise a customer on a non-IST device sees shifted times.
 */
export const APP_TIMEZONE = 'Asia/Kolkata'

/**
 * A service duration for customer-facing display. Durations are stored in
 * minutes, but "180 min" reads worse than "3 hr" and "1440 min" is meaningless
 * at a glance, so anything from an hour up is rolled into hours and days.
 *
 * Remainders are kept rather than rounded away — a 90 minute service is "1 hr
 * 30 min", not "1 hr" — because the number sets the customer's expectation of
 * how long they are without their car.
 *
 * Vendor-facing inputs stay in raw minutes; this is display only.
 */
export function formatDuration(totalMins: number): string {
  if (!Number.isFinite(totalMins) || totalMins <= 0) return '—'

  const mins = Math.round(totalMins)
  if (mins < 60) return `${mins} min`

  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60

  const parts = [
    days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : null,
    hours > 0 ? `${hours} hr` : null,
    minutes > 0 ? `${minutes} min` : null,
  ].filter(Boolean)

  return parts.join(' ')
}

/**
 * A one-line label for the services on a booking: "Full wash",
 * "Full wash + 1 more", "Full wash + 3 more".
 *
 * Every list row — customer, vendor, earnings — is a single line of small text,
 * so the names cannot all fit. What matters is that a multi-service job never
 * *looks* like a single-service one: a garage seeing only "Full wash" for a
 * three-service booking is the worst failure this feature can produce.
 */
export function formatServiceSummary(names: string[]): string {
  const [first, ...rest] = names.filter(Boolean)
  if (!first) return ''
  return rest.length === 0 ? first : `${first} + ${rest.length} more`
}
