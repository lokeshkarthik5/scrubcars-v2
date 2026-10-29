/**
 * Coverage's lead forms (0064): what each field accepts, and how a possible
 * duplicate is described. Pure, unit-tested in lead-form.test.ts. The API
 * holds the same rules (apps/server/src/modules/leads/leads.validation.ts).
 */
import type { DuplicateMatch, Lead } from '@repo/core/api/admin-coverage'
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

/**
 * Whether Edit lead shows something Google gave as the lead's name or
 * phone (none of the team's own yet): then it offers "Confirmed by phone".
 */
export function showsGoogleDetails(
  lead: Pick<Lead, 'ownName' | 'phone' | 'ownPhone'>
): boolean {
  return (
    lead.ownName === null || (lead.ownPhone === null && lead.phone !== null)
  )
}

/**
 * The name and phone Save on Edit lead sends (part 2's review): the team's
 * own fields change only when the admin changed them, or ticked
 * "Confirmed by phone" for what Google gave. Saving anything else (a pin,
 * a zone, the garage link) never copies Google's name or phone into the
 * team's, which would keep them past Google's 30 days. `phone` is the
 * field's value cleaned (normalisePhone), null for none.
 */
export function leadOwnFieldsToSave(
  lead: Pick<Lead, 'name' | 'ownName' | 'phone' | 'ownPhone'>,
  draft: { name: string; phone: string | null; confirmed: boolean }
): { name?: string; phone?: string | null } {
  const name = draft.name.trim()
  const out: { name?: string; phone?: string | null } = {}
  if (name !== lead.name || (draft.confirmed && lead.ownName === null))
    out.name = name
  if (
    draft.phone !== lead.phone ||
    (draft.confirmed && lead.ownPhone === null && draft.phone !== null)
  )
    out.phone = draft.phone
  return out
}
