/**
 * Takes phone numbers and one-time codes out of text before it leaves for the
 * error tracker, in the three web apps.
 *
 * Login is by phone and OTP, so both turn up in error messages, page URLs and
 * breadcrumbs (a console line, a fetch to /auth/otp/send) as a matter of
 * course — and an error tracker is a third party that keeps what it is sent.
 * The API has its own copy, apps/server/src/lib/scrub.ts, with the same rules:
 * a deploy rooted at apps/server reaches nothing outside it. Change both.
 *
 * Deliberately blunt: any 10-digit run (with or without +91 / 91, and with
 * the 5-5 space or dash people type) is a phone, and any standalone 6-digit
 * run is a code. A six-figure amount loses its digits too; an error report
 * that reads "[code]" where a price was is a small price for never shipping a
 * live OTP.
 */

const PHONE = /(?:\+91[\s-]?|\b91[\s-]?|\b)\d{5}[\s-]?\d{5}\b/g
const CODE = /\b\d{6}\b/g

export function scrubText(text: string): string {
  return text.replace(PHONE, '[phone]').replace(CODE, '[code]')
}

/** Every string inside a value, scrubbed; anything else returned as it was. */
export function scrubValue<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return scrubText(value) as T
  // Event payloads are shallow; the cap only guards against a cycle.
  if (depth > 6 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1)) as T
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) out[key] = scrubValue(item, depth + 1)
  return out as T
}

/**
 * The parts of an error-tracker event that carry free text: the message, each
 * exception's value, the request (URL, query and body) and the extra data.
 * Stack frames are left alone — they hold file paths and line numbers, not
 * anything a person typed.
 */
export interface ScrubbableEvent {
  message?: string
  exception?: { values?: Array<{ value?: string }> }
  request?: { url?: string; query_string?: unknown; data?: unknown }
  extra?: Record<string, unknown>
  breadcrumbs?: ScrubbableBreadcrumb[]
}

export interface ScrubbableBreadcrumb {
  message?: string
  data?: Record<string, unknown>
}

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.message) event.message = scrubText(event.message)
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value)
  }
  if (event.request) {
    if (event.request.url) event.request.url = scrubText(event.request.url)
    if (event.request.query_string !== undefined) {
      event.request.query_string = scrubValue(event.request.query_string)
    }
    if (event.request.data !== undefined) event.request.data = scrubValue(event.request.data)
  }
  if (event.extra) event.extra = scrubValue(event.extra)
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb)
  return event
}

export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T {
  if (crumb.message) crumb.message = scrubText(crumb.message)
  if (crumb.data) crumb.data = scrubValue(crumb.data)
  return crumb
}
