/**
 * Off-app payment flags (0077, behind OFF_APP_FLAGS_ENABLED; owner-approved
 * screens 15 Nov 2026, docs/off-app-flags.md): Detlio's own daily checks add
 * entries to admin's Bypass reports, "Flagged by Detlio", beside customers'
 * reports (0052, lib/bypass-reports.ts).
 *
 * Pure, unit-tested (off-app-flags.test.ts). modules/bypass-reports reads the
 * rows and the clock and writes what this says.
 *
 * The rules:
 *
 *   - **Flags never punish on their own.** A flag lands as New; only a
 *     person's Confirm makes it a strike (the same strike as a confirmed
 *     report). A flag has no reporter, so it never grants a reward, and it
 *     never blocks a customer's own report of the same booking.
 *   - **Garages are not told**, as with customer reports.
 *   - **Garage Book is never read** (garage_* tables: the garage's own
 *     customers, jobs and money), by the owner's rule, to keep garages' trust.
 *   - **One flag per piece of evidence** (`evidence_key`, unique): the check
 *     can run any number of times.
 *
 * The three signals:
 *
 *   1. **contact_in_note**: a note from the garage that the customer sees
 *      (its reason for declining or cancelling, a bill's or extra work's note
 *      and lines, a suggested time's note) written in the last 3 days, with a
 *      phone number, a UPI ID, or wording like "pay directly" / "book
 *      directly" / "call me directly". Those are found by fixed patterns
 *      (`scanNote`). Text with only softer hints ("GPay", "next time call",
 *      "cash") is ambiguous: when OpenAI is on (lib/ai.ts) it is asked yes or
 *      no about the note alone, with every number and UPI ID masked and no
 *      names; with AI off it is left alone. The evidence keeps the note with
 *      numbers masked ("98•••• •4210"), never the full number.
 *   2. **regulars_went_quiet**: a garage whose repeat customers stopped
 *      booking it. A repeat customer completed 2+ bookings at the garage in
 *      the last 180 days; they stopped when they have made no booking there
 *      for 30 days (whether or not they still book elsewhere). Flagged at 5+
 *      stopped who are 30%+ of its repeat customers. At most one such flag
 *      per garage every 30 days.
 *   3. **cancelled_after_inspection**: the same customer and garage with 3+
 *      bookings with an on-inspection service that the garage accepted and
 *      that were then cancelled with no final bill paid, in the last 90 days
 *      (the job agreed face to face, then paid outside). A new flag at every
 *      third such cancellation.
 *
 * Clock-free: every caller passes `now`.
 */

// ─── Numbers ─────────────────────────────────────────────────────────────────

export const OFF_APP_FLAG_RULES = {
  /** Notes written in the last this many days are read (overlapping runs; the key stops repeats). */
  noteLookbackDays: 3,
  /** Notes read a run, newest first. */
  noteLimit: 500,
  /** Ambiguous notes sent to AI a run, at most. */
  aiChecksPerRun: 10,
  /**
   * No new AI question once this long into a run: the run shares the API's
   * 60-second limit with the rest of the 07:00 digest (one slow answer can
   * take 40 s with its retry). The notes left are asked about on a later run
   * (they stay in the lookback window and have no flag yet).
   */
  aiBudgetMs: 10_000,
  /** The excerpt kept as evidence, in characters. */
  excerptMax: 300,
  /** A repeat customer: this many completed bookings at the garage… */
  regularMinCompleted: 2,
  /** …within this many days. */
  regularWindowDays: 180,
  /** Stopped: no booking at the garage for this many days. */
  stoppedDays: 30,
  /** Flagged with at least this many stopped… */
  flagMinStopped: 5,
  /** …who are at least this share of its repeat customers. */
  flagMinShare: 0.3,
  /** One regulars flag per garage per this many days. */
  regularsRepeatDays: 30,
  /** Customers named in a regulars flag's evidence. */
  regularsListed: 10,
  /** Cancellations after inspection, same customer and garage, to flag. */
  inspectionCancels: 3,
  /** …within this many days. */
  inspectionWindowDays: 90,
} as const

const DAY_MS = 24 * 60 * 60 * 1000

// ─── Words ───────────────────────────────────────────────────────────────────

export const BYPASS_SOURCES = ['customer', 'detlio'] as const
export type BypassSource = (typeof BYPASS_SOURCES)[number]

export const FLAG_SIGNALS = ['contact_in_note', 'regulars_went_quiet', 'cancelled_after_inspection'] as const
export type FlagSignal = (typeof FLAG_SIGNALS)[number]

/** "What happened" on the admin card. */
export const FLAG_SIGNAL_LABELS: Record<FlagSignal, string> = {
  contact_in_note: 'Phone number or UPI ID in a note',
  regulars_went_quiet: 'Regular customers went quiet',
  cancelled_after_inspection: 'Cancelled after inspection, same customer',
}

/** The report kind a flag is filed under (0052's CHECK), for every reader of `kind`. */
export const FLAG_KIND: Record<FlagSignal, 'gave_number' | 'other'> = {
  contact_in_note: 'gave_number',
  regulars_went_quiet: 'other',
  cancelled_after_inspection: 'other',
}

/** Where a garage's note was, as the evidence says it. */
export const NOTE_SOURCES = ['decline_reason', 'bill_note', 'extra_work_note', 'time_suggestion'] as const
export type NoteSource = (typeof NOTE_SOURCES)[number]

export const NOTE_SOURCE_LABELS: Record<NoteSource, string> = {
  decline_reason: 'Garage’s reason for cancelling, shown to the customer',
  bill_note: 'Garage’s final bill',
  extra_work_note: 'Garage’s extra work request',
  time_suggestion: 'Garage’s note with its suggested times',
}

export type FoundKind = 'phone' | 'upi' | 'wording'

/** The evidence a flag keeps (jsonb): masked text, counts and booking links only. */
export type FlagEvidence =
  | {
      signal: 'contact_in_note'
      bookingId: string
      bookingRef: string
      where: NoteSource
      writtenAt: string
      /** The note with every phone number masked, at most excerptMax characters. */
      excerpt: string
      found: FoundKind[]
      /** True when only AI's yes made it a flag (softer wording). */
      confirmedByAi: boolean
    }
  | {
      signal: 'regulars_went_quiet'
      regulars: number
      stopped: number
      /** Of those, how many still booked another garage in the stopped window. */
      bookingElsewhere: number
      stoppedDays: number
      customers: Array<{ userId: string; lastBookingId: string; lastBookingRef: string; lastAt: string }>
    }
  | {
      signal: 'cancelled_after_inspection'
      userId: string
      days: number
      bookings: Array<{ id: string; ref: string; cancelledAt: string; reason: string | null }>
    }

// ─── 1. Contact details in a note ────────────────────────────────────────────

/** A UPI ID: handle@bank, with no dot after the @ (that would be an e-mail). */
const UPI_ID = /\b[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,30}\b(?![.@][a-z])/gi

/**
 * Digits that could be an Indian mobile number: ten digits starting 6–9,
 * optionally after +91 / 91 / 0, written with spaces, dots or dashes between
 * groups. Read from runs of digits and separators, so "₹ 650" or a booking
 * reference never match. No upper length: a number at the end of a long run
 * of figures is still found (and masked).
 */
const DIGIT_RUN = /\+?\d[\d\s.-]{7,}\d/g

/**
 * How people write a mobile number's ten digits (the group lengths after any
 * +91 / 91 / 0): 9840014210, 98400 14210, 984 001 4210, 9840 014 210,
 * 984 0014 210, 98 4001 4210, 98 40 01 42 10. Only these count as a phone
 * when flagging, so figures that merely add up to ten digits — times
 * ("9.00 9.30 10.00 10.30"), prices with paise ("6499.00 9999.00"), a
 * pincode and a year or a date ("600042 2026", "600042 15-11-2026") — are
 * never a number. Masking stays broader (any ten that join up): hiding a
 * figure that wasn't a phone costs nothing.
 */
const MOBILE_LAYOUTS = new Set(['10', '5,5', '3,3,4', '4,3,3', '3,4,3', '2,4,4', '2,2,2,2,2'])

/** "pay directly", "book directly", "call me directly", "pay outside", "without the app"… */
const STRONG_WORDING = [
  /\b(pay|paid|payment|send|transfer)\s+(the\s+)?(money\s+|amount\s+)?(me\s+|us\s+)?(directly|direct|outside)\b/i,
  /\b(book|booking|call|contact|whatsapp|message|ping)\s+(me\s+|us\s+)?(directly|direct)\b/i,
  /\bdirect(ly)?\s+(book|booking|payment|pay|call)\b/i,
  /\bwithout\s+(the\s+)?(app|detlio)\b/i,
  /\b(outside|off)\s+(the\s+)?(app|detlio)\b/i,
  /\b(cancel|skip)\s+(the\s+|this\s+)?(app|detlio)\s+booking\b/i,
]

/** Softer hints: worth a look by AI, never a flag on their own. */
const WEAK_WORDING = [
  /\b(gpay|g\s?pay|google\s?pay|phonepe|phone\s?pe|paytm|upi|bhim)\b/i,
  /\b(cash)\b/i,
  /\bnext\s+time\b/i,
  /\b(call|whatsapp)\s+(me|us)\b/i,
  /\b(less|lower|cheaper|discount|reduce)\b/i,
  /\bmy\s+(number|no\.?|mobile)\b/i,
]

function digitsOf(run: string): string {
  return run.replace(/\D/g, '')
}

/** Digits that read as one Indian mobile number (10 from 6–9, after an optional 91 or 0). */
function isMobileDigits(digits: string): boolean {
  const local =
    digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : digits
  return local.length === 10 && /^[6-9]/.test(local)
}

/** Whether these groups are a mobile number written the way people write one (MOBILE_LAYOUTS). */
function isWrittenMobile(groups: readonly string[]): boolean {
  // The ten digits as written, or after a +91 / 91 / 0 in a group of its
  // own or stuck to the number.
  const [first = '', ...rest] = groups
  const ways: string[][] = [[...groups]]
  if (rest.length > 0 && (first === '91' || first === '0')) ways.push(rest)
  if (first.length === 12 && first.startsWith('91')) ways.push([first.slice(2), ...rest])
  if (first.length === 11 && first.startsWith('0')) ways.push([first.slice(1), ...rest])
  return ways.some((local) => {
    const digits = local.join('')
    return digits.length === 10 && /^[6-9]/.test(digits) && MOBILE_LAYOUTS.has(local.map((g) => g.length).join(','))
  })
}

/**
 * Where a mobile number sits in a run of digits and separators, or null:
 * the run's groups ("98400 14417 5") are tried in every unbroken stretch,
 * so a number next to another figure is still found. `strict` (flagging)
 * takes only the usual ways of writing one; masking takes any ten digits
 * that join up.
 */
function findMobile(run: string, strict: boolean): { start: number; end: number } | null {
  const groups = [...run.matchAll(/\+?\d+/g)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }))
  for (let i = 0; i < groups.length; i++) {
    const digits: string[] = []
    for (let j = i; j < groups.length; j++) {
      digits.push(digitsOf(run.slice(groups[j]!.start, groups[j]!.end)))
      if (digits.join('').length > 12) break
      if (strict ? isWrittenMobile(digits) : isMobileDigits(digits.join(''))) {
        return { start: groups[i]!.start, end: groups[j]!.end }
      }
    }
  }
  return null
}

/** A run of digits that holds an Indian mobile number, written as people write one. */
export function isMobileNumber(run: string): boolean {
  return findMobile(run, true) !== null
}

/** "98•••• •4210": the first two and last four digits, the rest dots. */
export function maskNumber(run: string): string {
  const local = digitsOf(run).slice(-10)
  return `${local.slice(0, 2)}•••• •${local.slice(-4)}`
}

/** The text with every mobile number masked. */
export function maskPhones(text: string): string {
  return text.replace(DIGIT_RUN, (run) => {
    let out = run
    for (let found = findMobile(out, false); found; found = findMobile(out, false)) {
      out = `${out.slice(0, found.start)}${maskNumber(out.slice(found.start, found.end))}${out.slice(found.end)}`
    }
    return out
  })
}

/** "la•••••@okaxis": a UPI ID with its name masked, for sending anywhere. */
export function maskUpi(id: string): string {
  const [name = '', bank = ''] = id.split('@')
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(3, name.length - 2))}@${bank}`
}

/** The text with numbers and UPI IDs masked, and every other run of 5+ digits too: what AI may see. */
export function maskForAi(text: string): string {
  return maskPhones(text)
    .replace(UPI_ID, (id) => maskUpi(id))
    .replace(/\d{5,}/g, (digits) => '•'.repeat(digits.length))
}

export interface NoteScan {
  found: FoundKind[]
  /** strong: a number, a UPI ID or plain wording (flag); weak: only hints (AI may decide); null: nothing. */
  strength: 'strong' | 'weak' | null
}

/** What a note holds. */
export function scanNote(text: string): NoteScan {
  const found: FoundKind[] = []
  const runs = text.match(DIGIT_RUN) ?? []
  if (runs.some(isMobileNumber)) found.push('phone')
  if ((text.match(UPI_ID) ?? []).length > 0) found.push('upi')
  if (STRONG_WORDING.some((pattern) => pattern.test(text))) found.push('wording')
  if (found.length > 0) return { found, strength: 'strong' }
  return { found, strength: WEAK_WORDING.some((pattern) => pattern.test(text)) ? 'weak' : null }
}

/** The evidence excerpt: numbers masked, cut to excerptMax. */
export function noteExcerpt(text: string): string {
  const masked = maskPhones(text.replace(/\s+/g, ' ').trim())
  return masked.length > OFF_APP_FLAG_RULES.excerptMax
    ? `${masked.slice(0, OFF_APP_FLAG_RULES.excerptMax - 1)}…`
    : masked
}

/** The question AI is asked about an ambiguous note (masked, no names). */
export const AI_NOTE_INSTRUCTIONS =
  'You check short notes a car-care garage wrote to a customer on a booking app. ' +
  'Answer with one word, yes or no: is the garage asking the customer to pay it directly, ' +
  'book it directly next time, or contact it outside the app, instead of booking and paying through the app? ' +
  'Numbers and payment IDs are masked with •. Answer no when unsure.'

/** AI's answer, read strictly: only a plain yes counts. */
export function aiSaysYes(answer: string): boolean {
  return /^\s*yes\b/i.test(answer)
}

/** One flag per garage note: the booking's chain and where the note was. */
export function noteEvidenceKey(input: { rootBookingId: string; where: NoteSource; noteId: string }): string {
  return `contact_in_note:${input.rootBookingId}:${input.where}:${input.noteId}`
}

// ─── 2. Regular customers went quiet ─────────────────────────────────────────

/** A booking chain as the check reads it (lib/drop-off.ts's chains, Test-marked left out). */
export interface QuietChain {
  userId: string
  vendorId: string
  bookingId: string
  status: string
  bookedAt: Date
  serviceAt: Date
}

export interface QuietGarage {
  vendorId: string
  regulars: number
  stopped: number
  bookingElsewhere: number
  /** The stopped customers, the longest-quiet first. */
  customers: Array<{ userId: string; lastBookingId: string; lastAt: Date }>
}

/** When a chain last counted at its garage: the later of when it was made and its slot (a booking to come counts). */
function lastActivity(chain: QuietChain): number {
  const booked = chain.bookedAt.getTime()
  return chain.status === 'cancelled' ? booked : Math.max(booked, chain.serviceAt.getTime())
}

/** Every garage's repeat customers and how many stopped; only the flagged ones are returned. */
export function regularsWentQuiet(chains: readonly QuietChain[], now: Date): QuietGarage[] {
  const regularFrom = now.getTime() - OFF_APP_FLAG_RULES.regularWindowDays * DAY_MS
  const stoppedFrom = now.getTime() - OFF_APP_FLAG_RULES.stoppedDays * DAY_MS

  const byPair = new Map<string, QuietChain[]>()
  const byUser = new Map<string, QuietChain[]>()
  for (const chain of chains) {
    const key = `${chain.vendorId}|${chain.userId}`
    byPair.set(key, [...(byPair.get(key) ?? []), chain])
    byUser.set(chain.userId, [...(byUser.get(chain.userId) ?? []), chain])
  }

  const garages = new Map<string, QuietGarage>()
  for (const [key, pairChains] of byPair) {
    const [vendorId, userId] = key.split('|') as [string, string]
    const completed = pairChains.filter(
      (c) => c.status === 'completed' && c.serviceAt.getTime() >= regularFrom && c.serviceAt.getTime() <= now.getTime()
    ).length
    if (completed < OFF_APP_FLAG_RULES.regularMinCompleted) continue
    const garage = garages.get(vendorId) ?? { vendorId, regulars: 0, stopped: 0, bookingElsewhere: 0, customers: [] }
    garage.regulars += 1
    const latest = pairChains.reduce((a, b) => (lastActivity(b) > lastActivity(a) ? b : a))
    if (lastActivity(latest) < stoppedFrom) {
      garage.stopped += 1
      const elsewhere = (byUser.get(userId) ?? []).some((c) => c.vendorId !== vendorId && lastActivity(c) >= stoppedFrom)
      if (elsewhere) garage.bookingElsewhere += 1
      garage.customers.push({ userId, lastBookingId: latest.bookingId, lastAt: new Date(lastActivity(latest)) })
    }
    garages.set(vendorId, garage)
  }

  return [...garages.values()]
    .filter(
      (g) =>
        g.stopped >= OFF_APP_FLAG_RULES.flagMinStopped && g.stopped / g.regulars >= OFF_APP_FLAG_RULES.flagMinShare
    )
    .map((g) => ({ ...g, customers: [...g.customers].sort((a, b) => a.lastAt.getTime() - b.lastAt.getTime()) }))
    .sort((a, b) => (a.vendorId < b.vendorId ? -1 : 1))
}

/** One regulars flag per garage per 30-day period. */
export function regularsEvidenceKey(vendorId: string, now: Date): string {
  const period = Math.floor(now.getTime() / (OFF_APP_FLAG_RULES.regularsRepeatDays * DAY_MS))
  return `regulars_went_quiet:${vendorId}:${period}`
}

// ─── 3. Cancelled after inspection, same customer ────────────────────────────

/** A booking with an on-inspection service that the garage accepted and that was cancelled with no final bill paid. */
export interface InspectionCancel {
  bookingId: string
  userId: string
  vendorId: string
  cancelledAt: Date
  reason: string | null
}

export interface InspectionRun {
  userId: string
  vendorId: string
  /** Oldest first. */
  bookings: InspectionCancel[]
}

/** Customer and garage pairs with 3+ such cancellations in the window. */
export function inspectionCancelRuns(rows: readonly InspectionCancel[], now: Date): InspectionRun[] {
  const from = now.getTime() - OFF_APP_FLAG_RULES.inspectionWindowDays * DAY_MS
  const byPair = new Map<string, InspectionCancel[]>()
  for (const row of rows) {
    if (row.cancelledAt.getTime() < from || row.cancelledAt.getTime() > now.getTime()) continue
    const key = `${row.vendorId}|${row.userId}`
    byPair.set(key, [...(byPair.get(key) ?? []), row])
  }
  const runs: InspectionRun[] = []
  for (const [key, bookings] of byPair) {
    if (bookings.length < OFF_APP_FLAG_RULES.inspectionCancels) continue
    const [vendorId, userId] = key.split('|') as [string, string]
    runs.push({ vendorId, userId, bookings: [...bookings].sort((a, b) => a.cancelledAt.getTime() - b.cancelledAt.getTime()) })
  }
  return runs.sort((a, b) => (a.vendorId + a.userId < b.vendorId + b.userId ? -1 : 1))
}

/** A new flag at every third cancellation: 3 → 1, 6 → 2. */
export function inspectionEvidenceKey(run: Pick<InspectionRun, 'userId' | 'vendorId' | 'bookings'>): string {
  const step = Math.floor(run.bookings.length / OFF_APP_FLAG_RULES.inspectionCancels)
  return `cancelled_after_inspection:${run.vendorId}:${run.userId}:${step}`
}

/** Whole days from the first to the last of a run ("3 bookings … in 20 days"). */
export function runDays(run: Pick<InspectionRun, 'bookings'>): number {
  const first = run.bookings[0]?.cancelledAt.getTime() ?? 0
  const last = run.bookings[run.bookings.length - 1]?.cancelledAt.getTime() ?? 0
  return Math.max(1, Math.ceil((last - first) / DAY_MS))
}
