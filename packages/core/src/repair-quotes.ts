import { msg } from './i18n/translate'

/**
 * Repair & bodywork quotes (0076): the apps' copy of the numbers and words.
 * The rules live in apps/server/src/lib/repair-quotes.ts;
 * repair-quotes.parity.test.ts there keeps these numbers the same.
 */
export const REPAIR_QUOTE_RULES = {
  maxGarages: 5,
  answerMinutes: 4 * 60,
  openHours: 48,
  videoMinSecs: 15,
  videoMaxSecs: 30,
  videoMaxBytes: 60 * 1024 * 1024,
  photoMaxBytes: 8 * 1024 * 1024,
  maxPhotos: 3,
  maxFrames: 4,
  noteMax: 140,
  briefMax: 240,
  garageNoteMax: 200,
  priceMax: 500_000,
  daysMax: 30,
  maxOpenPerCustomer: 2,
  badgeMinJobs: 3,
} as const

export type RepairRequestState = 'open' | 'booked' | 'cancelled' | 'expired'
export type RepairQuoteState = 'waiting' | 'quoted' | 'declined' | 'missed' | 'closed'

/** "₹4,000–5,500", the way quotes read everywhere. */
export function priceRangeLabel(from: number, to: number): string {
  const inr = (n: number) => n.toLocaleString('en-IN')
  return from === to ? `₹${inr(from)}` : `₹${inr(from)}–${inr(to)}`
}

/**
 * Whole rupees from what a garage typed in its quote ("4,000" → 4000), or
 * null. Paise after a point are dropped, never read as more digits:
 * "4,000.50" is 4000, not 400050.
 */
export function typedRupees(value: string): number | null {
  const digits = (value.split('.')[0] ?? '').replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isSafeInteger(n) ? n : null
}

/** "2 days" / "1 day" (English; shown through `tn`). */
export function daysLabel(days: number): string {
  return days === 1 ? '1 day' : `${days} days`
}

/** One garage's answer, as the customer's waiting list says it (English, shown through `t`). */
export const CUSTOMER_QUOTE_WORD: Record<RepairQuoteState, string> = {
  waiting: msg('Waiting'),
  quoted: msg('Answered'),
  declined: msg('Can’t do'),
  missed: msg('No answer'),
  closed: msg('Closed'),
}

/** Which status tone each answer reads in (StatusChip). */
export const QUOTE_TONE: Record<RepairQuoteState, 'done' | 'closed' | 'attention'> = {
  waiting: 'closed',
  quoted: 'done',
  declined: 'closed',
  missed: 'closed',
  closed: 'closed',
}

/** Whether the customer's request page shows the quotes (any answered) or the waiting screen. */
export function showsQuotes(request: { state: RepairRequestState; quotes: Array<{ state: RepairQuoteState }> }): boolean {
  return request.quotes.some((quote) => quote.state === 'quoted' || quote.state === 'declined')
}

/**
 * Where, in seconds, to take `count` still frames from a video `duration`
 * seconds long: spread evenly, away from the very start and end (often a
 * blur while the phone is raised or lowered).
 */
export function frameTimes(duration: number, count: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || count <= 0) return []
  const step = duration / (count + 1)
  return Array.from({ length: count }, (_, i) => Math.round(step * (i + 1) * 100) / 100)
}

/** Why a video can't be used (English, shown through `t`), or null when it can. */
export function videoProblem(video: { durationSecs: number; sizeBytes: number; type: string }): string | null {
  if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(video.type)) {
    return msg('Use an MP4 or MOV video, like the ones your phone records.')
  }
  if (video.sizeBytes > REPAIR_QUOTE_RULES.videoMaxBytes) return msg('This video is too large. Keep it under 60 MB.')
  if (!Number.isFinite(video.durationSecs) || video.durationSecs <= 0) return msg('This video can’t be played. Try recording again.')
  if (video.durationSecs > REPAIR_QUOTE_RULES.videoMaxSecs + 0.5) {
    return msg('Keep the video to 30 seconds or less. Walk slowly past the damage.')
  }
  return null
}

/** A video shorter than 15 s still goes, with a gentle line (English, shown through `t`). */
export function videoShortHint(durationSecs: number): string | null {
  return durationSecs < REPAIR_QUOTE_RULES.videoMinSecs ? msg('A 15–30 second video helps garages quote closer.') : null
}

/**
 * A video's place, wiped (0076). Phones write where a video was recorded
 * into its file (an ISO 6709 string such as "+13.0827+080.2707+012.000/"
 * in the `©xyz` or Apple location atoms of the `moov` box). Garages get the
 * file itself, so before it is uploaded every such string inside `moov` has
 * its digits turned to zeros, in place: same length, so every box keeps its
 * size and the video plays as before. Returns how many were wiped.
 */
export function wipeVideoLocation(bytes: Uint8Array): number {
  const moov = findTopLevelBox(bytes, 'moov')
  if (!moov) return 0
  let wiped = 0
  const end = moov.end
  for (let i = moov.start; i < end - 12; i++) {
    const c = bytes[i]
    if (c !== 0x2b && c !== 0x2d) continue // + or -
    const match = iso6709At(bytes, i, end)
    if (match === 0) continue
    for (let j = i; j < i + match; j++) {
      const b = bytes[j]!
      if (b >= 0x30 && b <= 0x39) bytes[j] = 0x30
    }
    wiped += 1
    i += match - 1
  }
  return wiped
}

/** The length of an ISO 6709 point ("±DD.D…±DDD.D…[±A…]/") starting at `i`, or 0. */
function iso6709At(bytes: Uint8Array, i: number, end: number): number {
  let j = i
  const signed = (intDigits: number) => {
    const b = bytes[j]
    if (b !== 0x2b && b !== 0x2d) return false
    j += 1
    for (let k = 0; k < intDigits; k++) {
      if (j >= end || bytes[j]! < 0x30 || bytes[j]! > 0x39) return false
      j += 1
    }
    if (bytes[j] !== 0x2e) return false // .
    j += 1
    let decimals = 0
    while (j < end && bytes[j]! >= 0x30 && bytes[j]! <= 0x39) {
      j += 1
      decimals += 1
    }
    return decimals > 0
  }
  if (!signed(2)) return 0
  if (!signed(3)) return 0
  // An altitude may follow; the point ends with "/" or where the digits stop.
  const beforeAltitude = j
  if (j < end && (bytes[j] === 0x2b || bytes[j] === 0x2d)) {
    j += 1
    while (j < end && ((bytes[j]! >= 0x30 && bytes[j]! <= 0x39) || bytes[j] === 0x2e)) j += 1
    if (j === beforeAltitude + 1) j = beforeAltitude
  }
  return j - i
}

/** A top-level ISO-BMFF box by type, as a byte range of its contents. */
function findTopLevelBox(bytes: Uint8Array, type: string): { start: number; end: number } | null {
  let at = 0
  while (at + 8 <= bytes.length) {
    let size = ((bytes[at]! << 24) >>> 0) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!
    const name = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!)
    let header = 8
    if (size === 1) {
      if (at + 16 > bytes.length) return null
      // A 64-bit size: anything past 2^53 is not a phone video.
      size = Number(new DataView(bytes.buffer, bytes.byteOffset + at + 8, 8).getBigUint64(0))
      header = 16
    } else if (size === 0) {
      size = bytes.length - at
    }
    if (size < header) return null
    if (name === type) return { start: at + header, end: Math.min(bytes.length, at + size) }
    at += size
  }
  return null
}

/** "3 h 12 min", "12 min", or "0 min" once passed: a repair quote's time left to answer. */
export function timeLeftLabel(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
