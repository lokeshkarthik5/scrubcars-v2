/**
 * Onboarding marks in the admin panel (0059): the Missing chips' counts and
 * filter, the WhatsApp ask (who to message and what to say), and how a mark's
 * status and date read ("Waiting on owner · Asked 24 Oct").
 *
 * The words and rules shared with the server live in
 * @repo/core/onboarding-marks; this file is the panel's own use of them.
 */
import type { AdminVendor } from '@repo/core/api/admin'
import type {
  OnboardingMark,
  OnboardingMarkBrief,
} from '@repo/core/api/admin-marks'
import { whatsAppHref } from '@repo/core/contact-links'
import {
  MARK_CHASE_AFTER_DAYS,
  MARK_STATUS_LABELS,
  MISSING_ASKS,
  MISSING_KEYS,
  MISSING_TONES,
  markLabel,
  type MarkStatus,
  type MissingKey,
} from '@repo/core/onboarding-marks'

// ─── Missing chips ───────────────────────────────────────────────────────────

/** How many of these garages miss each thing (0 for none). */
export function missingCounts(
  vendors: ReadonlyArray<Pick<AdminVendor, 'missing'>>
): Record<MissingKey, number> {
  const counts = Object.fromEntries(
    MISSING_KEYS.map((key) => [key, 0])
  ) as Record<MissingKey, number>
  for (const vendor of vendors) {
    // A key listed twice by a bad payload still counts the garage once.
    for (const key of new Set(vendor.missing ?? [])) {
      if (key in counts) counts[key] += 1
    }
  }
  return counts
}

/**
 * The chips to show, in order: red ones first (customers can't book it yet),
 * then amber, each in MISSING_KEYS order. Keys no garage misses are left out.
 */
export function missingChipKeys(
  counts: Record<MissingKey, number>
): MissingKey[] {
  const shown = MISSING_KEYS.filter((key) => counts[key] > 0)
  return [
    ...shown.filter((key) => MISSING_TONES[key] === 'red'),
    ...shown.filter((key) => MISSING_TONES[key] === 'amber'),
  ]
}

/** Whether the API sent `missing` for any garage (an older one sends none). */
export function hasMissingInfo(
  vendors: ReadonlyArray<Pick<AdminVendor, 'missing'>>
): boolean {
  return vendors.some((vendor) => Array.isArray(vendor.missing))
}

/** The garages that miss `key`; every garage when no key is picked. */
export function filterByMissing<V extends Pick<AdminVendor, 'missing'>>(
  vendors: readonly V[],
  key: MissingKey | null
): V[] {
  if (!key) return vendors.slice()
  return vendors.filter((vendor) => vendor.missing?.includes(key))
}

// ─── The WhatsApp ask ────────────────────────────────────────────────────────

/** "a", "a and b", "a, b, and c". */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

/** The owner's first name, for "Hi Senthil". */
export function ownerFirstName(owner: AdminVendor['owner']): string | null {
  const first = owner?.name.trim().split(/\s+/)[0]
  return first ? first : null
}

/**
 * The message an admin sends a garage's owner on WhatsApp, in plain English:
 * "Hi Senthil, to finish your Detlio page we still need: 3 shop photos, your
 * logo, and payout bank details (account + IFSC) or a UPI id. Thanks! –
 * Raga, Team Detlio". Only what that garage misses (`keys`), in MISSING_KEYS
 * order. Signed with the admin's name, except the shared login's "admin".
 */
export function askMessage(
  vendor: Pick<AdminVendor, 'businessName' | 'owner'>,
  keys: readonly MissingKey[],
  signedAs: string
): string {
  const name = ownerFirstName(vendor.owner)
  const hi = name ? `Hi ${name}` : `Hi ${vendor.businessName.trim()} team`
  const asks = MISSING_KEYS.filter((key) => keys.includes(key)).map(
    (key) => MISSING_ASKS[key]
  )
  const signer = signedAs.trim()
  const signature =
    signer && signer.toLowerCase() !== 'admin'
      ? `${signer}, Team Detlio`
      : 'Team Detlio'
  const body =
    asks.length > 0
      ? `to finish your Detlio page we still need: ${joinList(asks)}.`
      : 'a quick question about your Detlio page.'
  return `${hi}, ${body} Thanks! – ${signature}`
}

/**
 * The number to message: the garage's WhatsApp, else the owner's phone, else
 * the garage's phone, the first one WhatsApp can open (an Indian mobile).
 * Null when none can: a landline has no WhatsApp.
 */
export function askPhone(
  vendor: Pick<AdminVendor, 'whatsapp' | 'phone' | 'owner'>
): string | null {
  const candidates = [vendor.whatsapp, vendor.owner?.phone, vendor.phone]
  for (const phone of candidates) {
    if (phone && whatsAppHref(phone)) return phone
  }
  return null
}

/** The wa.me link with the message typed in, or null with no usable number. */
export function askHref(
  vendor: Pick<AdminVendor, 'whatsapp' | 'phone' | 'owner'>,
  message: string
): string | null {
  return whatsAppHref(askPhone(vendor), message)
}

/** "98400 11203": the ten national digits, in two fives. */
export function displayPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const national = digits.length > 10 ? digits.slice(-10) : digits
  return national.length === 10
    ? `${national.slice(0, 5)} ${national.slice(5)}`
    : phone.trim()
}

// ─── Mark status and dates ───────────────────────────────────────────────────

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** The day on India's calendar, as a whole number. */
function istDay(time: number): number {
  return Math.floor((time + 5.5 * HOUR_MS) / DAY_MS)
}

/** Whole IST days from `at` to now: 0 today, 1 yesterday. NaN when unreadable. */
export function daysAgo(at: string | Date, now: number = Date.now()): number {
  const time = (at instanceof Date ? at : new Date(at)).getTime()
  if (Number.isNaN(time)) return Number.NaN
  return istDay(now) - istDay(time)
}

/** "today", "yesterday", "24 Oct", "24 Oct 2025" (the year only when it isn't this one). */
export function markDate(at: string | Date, now: number = Date.now()): string {
  const time = (at instanceof Date ? at : new Date(at)).getTime()
  if (Number.isNaN(time)) return ''
  const ago = daysAgo(at, now)
  if (ago === 0) return 'today'
  if (ago === 1) return 'yesterday'
  const ist = new Date(time + 5.5 * HOUR_MS)
  const date = `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}`
  const thisYear = new Date(now + 5.5 * HOUR_MS).getUTCFullYear()
  return ist.getUTCFullYear() === thisYear
    ? date
    : `${date} ${ist.getUTCFullYear()}`
}

type MarkTiming = Pick<OnboardingMark, 'status' | 'askedAt'> & {
  receivedAt?: string | null
}

/** "To ask", "Asked 24 Oct", "Asked today", "Received 25 Oct". */
export function markStatusText(
  mark: MarkTiming,
  now: number = Date.now()
): string {
  if (mark.status === 'asked' && mark.askedAt) {
    return `Asked ${markDate(mark.askedAt, now)}`
  }
  if (mark.status === 'received' && mark.receivedAt) {
    return `Received ${markDate(mark.receivedAt, now)}`
  }
  return MARK_STATUS_LABELS[mark.status]
}

/** "Waiting on owner · Asked 24 Oct": a mark in one line. */
export function markLine(
  mark: Pick<OnboardingMarkBrief, 'kind' | 'label'> & MarkTiming,
  now: number = Date.now()
): string {
  return `${markLabel(mark.kind, mark.label)} · ${markStatusText(mark, now)}`
}

/**
 * Asked more than MARK_CHASE_AFTER_DAYS days ago with no answer: time to
 * chase, so it turns amber.
 */
export function markNeedsChase(
  mark: MarkTiming,
  now: number = Date.now()
): boolean {
  if (mark.status !== 'asked' || !mark.askedAt) return false
  return daysAgo(mark.askedAt, now) > MARK_CHASE_AFTER_DAYS
}

/** The open mark for a missing key, if the garage has one. */
export function markForKey<
  M extends Pick<OnboardingMarkBrief, 'kind' | 'status'>,
>(marks: readonly M[] | undefined, key: MissingKey): M | undefined {
  return marks?.find((mark) => mark.kind === key && mark.status !== 'received')
}

// ─── Undo after "Mark these as Asked today" ──────────────────────────────────

export type UndoStep =
  | { action: 'delete'; markId: string }
  | { action: 'restore'; markId: string; status: MarkStatus }

/**
 * How to put a garage's marks back as they were before "Mark these as Asked
 * today": a mark the ask made is deleted, one it moved goes back to its old
 * status, and one that was already Asked is left alone.
 */
export function askedUndoSteps(
  before: ReadonlyArray<Pick<OnboardingMarkBrief, 'id' | 'status'>> | undefined,
  after: ReadonlyArray<Pick<OnboardingMark, 'id'>>
): UndoStep[] {
  const was = new Map((before ?? []).map((mark) => [mark.id, mark.status]))
  const steps: UndoStep[] = []
  for (const mark of after) {
    const status = was.get(mark.id)
    if (status === undefined) steps.push({ action: 'delete', markId: mark.id })
    else if (status !== 'asked')
      steps.push({ action: 'restore', markId: mark.id, status })
  }
  return steps
}

/** "1 thing", "4 things". */
export function thingsCount(n: number): string {
  return `${n} ${n === 1 ? 'thing' : 'things'}`
}

// ─── The garages the marks components take ───────────────────────────────────

/**
 * What a mark's popover needs of a garage. An AdminVendor is one; the
 * editor builds one from the garage's detail.
 */
export type MarkVendor = Pick<AdminVendor, 'id' | 'businessName' | 'openMarks'>

/** What the WhatsApp ask needs of a garage. An AdminVendor is one. */
export type AskVendor = MarkVendor &
  Pick<AdminVendor, 'owner' | 'whatsapp' | 'phone' | 'missing'>
