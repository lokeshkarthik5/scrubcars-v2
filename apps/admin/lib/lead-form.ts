/**
 * Coverage's lead forms (0064): what each field accepts, and how a possible
 * duplicate is described. Pure, unit-tested in lead-form.test.ts. The API
 * holds the same rules (apps/server/src/modules/leads/leads.validation.ts).
 */
import type { DuplicateMatch } from '@repo/core/api/admin-coverage'
import { LEAD_STATUS_LABELS, normalisePhone } from '@repo/core/leads'

/** A phone is optional; typed, it must be a number (6 to 15 digits once cleaned). */
export function phoneProblem(phone: string): string | null {
  if (!phone.trim()) return null
  return normalisePhone(phone)
    ? null
    : 'Enter a phone number, like 98400 12345.'
}

/** A Maps link is optional; pasted, it must be a web address. */
export function mapsLinkProblem(link: string): string | null {
  const value = link.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? null
      : 'Paste a Google Maps link.'
  } catch {
    return 'Paste a Google Maps link.'
  }
}

/** "SJA Car Care — garage, live" / "Speed Wash — lead, To target". */
export function duplicateLine(
  match: Pick<DuplicateMatch, 'kind' | 'name' | 'status'>
): string {
  const status =
    match.status === 'live'
      ? 'live'
      : match.status === 'not_live'
        ? 'not live yet'
        : LEAD_STATUS_LABELS[match.status]
  return `${match.name} — ${match.kind}, ${status}`
}
