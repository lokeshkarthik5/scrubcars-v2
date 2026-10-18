import type { DraftCategory, DraftHoursDay, DraftPricingType } from './draft.js'

/**
 * Turning what a document says into what the form holds: phone numbers,
 * prices, durations, hours, car types. The same rules for a poster read by
 * the AI and for a Tally answer typed by the owner, so the model only ever
 * reads — every decision about what a "from ₹299" or a "Call" means is
 * made here, in plain code with its own tests (normalise.test.ts).
 *
 * The one rule over all of them: never guess. A price or a time the
 * document does not give is left empty for a person to fill in, and
 * anything read with a guess in it is marked to check, with the reason.
 */

// ─── Phones ──────────────────────────────────────────────────────────────────

export interface NormalisedPhone {
  /** 10 digits, or null when no number could be read. */
  phone: string | null
  /** A mobile starts 6–9; anything else is a landline with its STD code. */
  mobile: boolean
}

/**
 * The first number in the text as the 10 digits Detlio stores: "+91 98765
 * 43210", "098765-43210" and "98765 43210" are all 9876543210. A Chennai
 * landline written "044 2345 6789" becomes 4423456789, which the form takes
 * but is not a mobile. Several numbers ("98765 43210 / 044 …") give the
 * first.
 */
export function normalisePhone(text: string | null | undefined): NormalisedPhone {
  if (!text) return { phone: null, mobile: false }
  for (const part of text.split(/[,/;|&]|\bor\b|\band\b/i)) {
    let digits = part.replace(/\D/g, '')
    if (digits.length === 0) continue
    // Country code, then the trunk 0, in either order of writing.
    if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2)
    if (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(1)
    if (digits.length === 10 && /^[1-9]/.test(digits)) {
      return { phone: digits, mobile: /^[6-9]/.test(digits) }
    }
  }
  return { phone: null, mobile: false }
}

// ─── Prices ──────────────────────────────────────────────────────────────────

export interface ParsedPrice {
  pricingType: DraftPricingType
  price: number | null
  priceHatchback: number | null
  priceSedan: number | null
  priceSuv: number | null
  confidence: 'sure' | 'check' | 'missing'
  reason?: string
  /**
   * The price text should go into the service's description, because the
   * form cannot hold all of it (four car sizes, say). The admin is asked to
   * check it, so it is never published as read.
   */
  keepInDescription: boolean
}

type Tier = 'priceHatchback' | 'priceSedan' | 'priceSuv'

/** Words a document uses for "no fixed price". */
const INSPECTION =
  /\b(call|on inspection|after inspection|inspection|ask|enquire|enquiry|contact|varies|depends|quote|negotiable)\b/i

/** Words that make one price a starting price. */
const STARTING = /\b(from|starting|starts|onwards?|min(imum)?|upwards)\b|\+\s*$|\babove\b/i

/** A size label and what Detlio calls it; null for a size it has no tier for. */
const SIZE_LABELS: Array<{ pattern: RegExp; tier: Tier | null }> = [
  { pattern: /^(hatch(back)?s?|small|mini|compact)$/i, tier: 'priceHatchback' },
  { pattern: /^(sedans?|medium|mid|mid-?size)$/i, tier: 'priceSedan' },
  { pattern: /^(suvs?|muvs?|suv\/muv|large|big|xl)$/i, tier: 'priceSuv' },
  { pattern: /^(7[\s-]?seaters?|luxury|premium|xuv|xxl|bikes?|van)$/i, tier: null },
]

const LABEL_WORDS =
  'hatch(?:back)?s?|small|mini|compact|sedans?|medium|mid(?:-?size)?|suvs?|muvs?|suv\\/muv|large|big|xl|7[\\s-]?seaters?|luxury|premium|xuv|xxl|bikes?|van'

const AMOUNT = '(?:₹|rs\\.?|inr)?\\s*(\\d[\\d,]*(?:\\.\\d+)?)'

/** "Hatch 299", "SUV: ₹399", "small-299". */
const LABELLED = new RegExp(`(${LABEL_WORDS})\\s*[:\\-–=]?\\s*${AMOUNT}`, 'gi')

/** "299 (hatch)", "₹299 hatchback". */
const LABEL_AFTER = new RegExp(`${AMOUNT}\\s*(?:/-)?\\s*\\(?\\s*(${LABEL_WORDS})\\b`, 'gi')

const toAmount = (raw: string) => Number(raw.replace(/,/g, ''))

/**
 * Amounts in rupees in the text. A run of seven or more digits is a phone
 * number on a "Call 98765 43210" line, not a price.
 */
function amountsIn(text: string): number[] {
  const withoutPhones = text.replace(/(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, ' ')
  return [...withoutPhones.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)]
    .map((m) => m[1])
    .filter((raw) => raw.replace(/\D/g, '').length < 7)
    .map(toAmount)
    .filter((n) => n > 0)
}

const rupees = (n: number) => `₹${n}`
const quoted = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return `“${line.length > 40 ? `${line.slice(0, 39)}…` : line}”`
}

const blank = (): Omit<ParsedPrice, 'pricingType' | 'confidence' | 'keepInDescription'> => ({
  price: null,
  priceHatchback: null,
  priceSedan: null,
  priceSuv: null,
})

/**
 * A price as the document writes it, turned into the form's pricing:
 *
 * - nothing → missing.
 * - "Call", "on inspection", "varies" → On inspection, with the fee left to
 *   fill in (it is the garage's to say, not ours to guess).
 * - "from ₹299", "₹299 onwards" → ₹299, marked to check.
 * - one amount → that price.
 * - sizes ("Hatch 299 / Sedan 349 / SUV 399") → by car type; a size missing
 *   is left empty; more than three sizes, or one Detlio has no tier for
 *   (7-seater, luxury), keeps the whole text in the description, to check.
 * - three amounts with no sizes → read as hatchback, sedan, SUV, to check.
 * - two amounts (often a crossed-out price and the offer) → the lower, to
 *   check; four or more → the text kept in the description, to check.
 */
export function parsePriceText(text: string | null | undefined): ParsedPrice {
  const raw = (text ?? '').trim()
  if (!raw) {
    return { pricingType: 'flat', ...blank(), confidence: 'missing', keepInDescription: false }
  }

  const amounts = amountsIn(raw)

  if (INSPECTION.test(raw)) {
    if (amounts.length === 1) {
      return {
        pricingType: 'on_inspection',
        ...blank(),
        price: amounts[0],
        confidence: 'check',
        reason: `Says ${quoted(raw)}, so we set On inspection with ${rupees(amounts[0])} as the inspection fee.`,
        keepInDescription: false,
      }
    }
    return {
      pricingType: 'on_inspection',
      ...blank(),
      confidence: 'missing',
      reason: `Says ${quoted(raw)}, so we set On inspection. Ask the garage for its fee.`,
      keepInDescription: false,
    }
  }

  // Sizes, written either way round — but one way per text: in "Hatch 299
  // Sedan 349", "299 Sedan" would otherwise read as a second sedan price.
  const before = [...raw.matchAll(LABELLED)].map((m) => ({ label: m[1], amount: toAmount(m[2]) }))
  const labelled =
    before.length > 0
      ? before
      : [...raw.matchAll(LABEL_AFTER)].map((m) => ({ label: m[2], amount: toAmount(m[1]) }))
  if (labelled.length > 0) {
    const tiers: Partial<Record<Tier, number>> = {}
    let extra = 0
    for (const { label, amount } of labelled) {
      const size = SIZE_LABELS.find((s) => s.pattern.test(label.trim()))
      if (!size?.tier || tiers[size.tier] !== undefined) {
        extra++
        continue
      }
      tiers[size.tier] = amount
    }
    const prices = {
      priceHatchback: tiers.priceHatchback ?? null,
      priceSedan: tiers.priceSedan ?? null,
      priceSuv: tiers.priceSuv ?? null,
    }
    const sizes = new Set(labelled.map((l) => l.label.toLowerCase())).size
    if (extra > 0) {
      return {
        pricingType: 'per_vehicle',
        price: null,
        ...prices,
        confidence: 'check',
        reason: `The price list has ${sizes} car sizes and Detlio has 3 (hatchback, sedan, SUV). The full list is in the description: check the prices, then edit the description.`,
        keepInDescription: true,
      }
    }
    const gaps = (['priceHatchback', 'priceSedan', 'priceSuv'] as const).filter((t) => prices[t] === null)
    if (gaps.length > 0) {
      const names = gaps.map((t) => ({ priceHatchback: 'hatchback', priceSedan: 'sedan', priceSuv: 'SUV' })[t])
      return {
        pricingType: 'per_vehicle',
        price: null,
        ...prices,
        confidence: 'missing',
        reason: `No ${names.join(' or ')} price given.`,
        keepInDescription: false,
      }
    }
    return { pricingType: 'per_vehicle', price: null, ...prices, confidence: 'sure', keepInDescription: false }
  }

  if (amounts.length === 0) {
    return {
      pricingType: 'flat',
      ...blank(),
      confidence: 'missing',
      reason: `Couldn't read a price in ${quoted(raw)}.`,
      keepInDescription: false,
    }
  }

  if (amounts.length === 1) {
    if (STARTING.test(raw)) {
      return {
        pricingType: 'flat',
        ...blank(),
        price: amounts[0],
        confidence: 'check',
        reason: `Says ${quoted(raw)}: bigger cars may cost more. Check the price for each car size.`,
        keepInDescription: false,
      }
    }
    return { pricingType: 'flat', ...blank(), price: amounts[0], confidence: 'sure', keepInDescription: false }
  }

  if (amounts.length === 2) {
    const low = Math.min(...amounts)
    return {
      pricingType: 'flat',
      ...blank(),
      price: low,
      confidence: 'check',
      reason: `Two prices (${amounts.map(rupees).join(' and ')}) with no car sizes; we used ${rupees(low)}.`,
      keepInDescription: false,
    }
  }

  if (amounts.length === 3) {
    const [priceHatchback, priceSedan, priceSuv] = amounts
    return {
      pricingType: 'per_vehicle',
      price: null,
      priceHatchback,
      priceSedan,
      priceSuv,
      confidence: 'check',
      reason: 'Three prices with no car sizes; read as hatchback, sedan and SUV.',
      keepInDescription: false,
    }
  }

  return {
    pricingType: 'flat',
    ...blank(),
    price: Math.min(...amounts),
    confidence: 'check',
    reason: `${amounts.length} prices with no car sizes. The full text is in the description: set the prices, then edit the description.`,
    keepInDescription: true,
  }
}

/** A service sold as several together: a combo, or "Wash + Polish". */
export const looksLikeCombo = (name: string) => /\bcombo\b|\s\+\s|\bpackage\b/i.test(name)

// ─── Durations ───────────────────────────────────────────────────────────────

export interface ParsedDuration {
  mins: number | null
  reason?: string
}

const UNIT_MINS: Array<{ pattern: RegExp; mins: number }> = [
  { pattern: /^(d|days?)$/i, mins: 1440 },
  { pattern: /^(h|hrs?|hours?)$/i, mins: 60 },
  { pattern: /^(m|mins?|minutes?)$/i, mins: 1 },
]

/**
 * "45 min", "1 hr", "1.5 hours", "1 hr 30 min", "2 days" as minutes. A
 * range ("45–60 min") takes the longer end, to check. A bare number, or
 * anything else, is not a time — null, never a guess.
 */
export function parseDurationText(text: string | null | undefined): ParsedDuration {
  const raw = (text ?? '').trim()
  if (!raw) return { mins: null }

  const range = raw.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*([a-z]+)/i)
  if (range) {
    const unit = UNIT_MINS.find((u) => u.pattern.test(range[3]))
    if (unit) {
      const mins = Math.round(Number(range[2]) * unit.mins)
      return { mins, reason: `Given as ${quoted(raw)}; we used the longer time.` }
    }
  }

  let total = 0
  let found = false
  for (const m of raw.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/gi)) {
    const unit = UNIT_MINS.find((u) => u.pattern.test(m[2]))
    if (!unit) continue
    total += Number(m[1]) * unit.mins
    found = true
  }
  if (!found || total <= 0) return { mins: null }
  return { mins: Math.round(total) }
}

// ─── Hours ───────────────────────────────────────────────────────────────────

/** "9", "9:30", "9.30 am", "21:00" → minutes after midnight, with the am/pm if written. */
function clock(text: string): { mins: number; meridiem: 'am' | 'pm' | null } | null {
  const m = text.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i)
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2] ?? '0')
  if (hours > 23 || minutes > 59) return null
  const meridiem = m[3] ? (m[3].toLowerCase().startsWith('a') ? 'am' : 'pm') : null
  return { mins: hours * 60 + minutes, meridiem }
}

function to24(c: { mins: number; meridiem: 'am' | 'pm' | null }, fallback: 'am' | 'pm'): number {
  const meridiem = c.meridiem ?? fallback
  let hours = Math.floor(c.mins / 60)
  const minutes = c.mins % 60
  if (hours <= 12) {
    if (meridiem === 'pm' && hours !== 12) hours += 12
    if (meridiem === 'am' && hours === 12) hours = 0
  }
  return hours * 60 + minutes
}

export const hhmm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

const TIME = '(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?)'
const TIME_RANGE = new RegExp(`${TIME}\\s*(?:-|–|—|to|till|until)\\s*${TIME}`, 'i')

/**
 * "9 am – 8 pm", "9-8", "09:00 to 21:00" as open and close in 24-hour
 * HH:MM. Without am/pm a morning start and an evening close are assumed
 * (a car wash that opens at 9 does not open at 9 pm), and said so.
 */
export function parseTimeRange(
  text: string
): { openTime: string; closeTime: string; assumed: boolean } | null {
  const m = text.match(TIME_RANGE)
  if (!m) return null
  const open = clock(m[1])
  const close = clock(m[2])
  if (!open || !close) return null
  // Only the close is a real guess: nobody opens a car wash at 9 pm, but
  // "9–8" could be read either way by a careless eye, so it is said.
  const assumed = !close.meridiem && close.mins < 12 * 60
  const openMins = to24(open, 'am')
  let closeMins = to24(close, close.meridiem ?? (close.mins >= 13 * 60 ? 'am' : 'pm'))
  if (closeMins <= openMins && !close.meridiem && close.mins < 12 * 60) closeMins += 12 * 60
  if (closeMins <= openMins || closeMins > 24 * 60) return null
  return { openTime: hhmm(openMins), closeTime: hhmm(Math.min(closeMins, 23 * 60 + 59)), assumed }
}

const DAY_WORDS: Array<{ pattern: RegExp; day: number }> = [
  { pattern: /^sun(day)?s?$/i, day: 0 },
  { pattern: /^mon(day)?s?$/i, day: 1 },
  { pattern: /^tue(s|sday)?s?$/i, day: 2 },
  { pattern: /^wed(nesday)?s?$/i, day: 3 },
  { pattern: /^thu(r|rs|rsday)?s?$/i, day: 4 },
  { pattern: /^fri(day)?s?$/i, day: 5 },
  { pattern: /^sat(urday)?s?$/i, day: 6 },
]

const dayOf = (word: string) => DAY_WORDS.find((d) => d.pattern.test(word))?.day ?? null

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The days a piece of text names: "Mon-Sat", "Sunday", "all days", "Mon, Wed". */
function daysIn(text: string): number[] {
  if (/\b(all days|every ?day|daily|7 days|all 7 days|all week)\b/i.test(text)) {
    return [0, 1, 2, 3, 4, 5, 6]
  }
  const days = new Set<number>()
  const words = '[a-z]+'
  for (const m of text.matchAll(new RegExp(`(${words})\\s*(?:-|–|to)\\s*(${words})`, 'gi'))) {
    const from = dayOf(m[1])
    const to = dayOf(m[2])
    if (from === null || to === null) continue
    for (let d = from; ; d = (d + 1) % 7) {
      days.add(d)
      if (d === to) break
    }
  }
  for (const m of text.matchAll(/[a-z]+/gi)) {
    const day = dayOf(m[0])
    if (day !== null) days.add(day)
  }
  return [...days].sort()
}

const CLOSED = /\b(closed|holiday|leave|off|shut)\b/i

export interface ParsedHours {
  days: DraftHoursDay[] | null
  /** Set when something was assumed, or could not be read. */
  reason?: string
}

/**
 * Opening hours as people type them into a form: "9am - 8pm", "Mon–Sat
 * 9:00 am to 7:30 pm, Sunday holiday", "Mon-Sat 9-8; Sun 9-1". Each piece
 * is a time range, the days it is for, or days that are closed. A time with
 * no days is for every day not named elsewhere. When days are named and
 * some are left out, those are taken as closed, and said.
 */
export function parseHoursText(text: string | null | undefined): ParsedHours {
  const raw = (text ?? '').trim()
  if (!raw) return { days: null }

  const week: Array<DraftHoursDay | null> = Array.from({ length: 7 }, () => null)
  let fallback: { openTime: string; closeTime: string } | null = null
  // Days named with no time and no "closed" ("Monday to Saturday"): open,
  // at the time given without days.
  const openDays = new Set<number>()
  let assumed = false
  let namedDays = false

  for (const piece of raw.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean)) {
    const range = parseTimeRange(piece)
    const days = daysIn(piece)
    if (days.length > 0) namedDays = true
    if (range) {
      assumed ||= range.assumed
      if (days.length === 0) fallback = { openTime: range.openTime, closeTime: range.closeTime }
      for (const day of days) {
        week[day] = { dayOfWeek: day, openTime: range.openTime, closeTime: range.closeTime, isClosed: false }
      }
    } else if (CLOSED.test(piece)) {
      for (const day of days) {
        week[day] = { dayOfWeek: day, openTime: '09:00', closeTime: '18:00', isClosed: true }
      }
    } else {
      days.forEach((day) => openDays.add(day))
    }
  }

  const anyTime = fallback !== null || week.some((d) => d && !d.isClosed)
  if (!anyTime) {
    return { days: null, reason: `Couldn't read the hours in ${quoted(raw)}.` }
  }

  const leftOut: number[] = []
  const days = week.map((day, dayOfWeek): DraftHoursDay => {
    if (day) return day
    if (fallback && (openDays.size === 0 || openDays.has(dayOfWeek))) {
      return { dayOfWeek, ...fallback, isClosed: false }
    }
    leftOut.push(dayOfWeek)
    return { dayOfWeek, openTime: '09:00', closeTime: '18:00', isClosed: true }
  })

  const reasons: string[] = []
  if (assumed) reasons.push(`Read ${quoted(raw)} as morning to evening.`)
  if (namedDays && leftOut.length > 0) {
    reasons.push(`${leftOut.map((d) => DAY_SHORT[d]).join(', ')} not mentioned, so set as closed.`)
  }
  return reasons.length > 0 ? { days, reason: reasons.join(' ') } : { days }
}

/** "HH:MM" (or "H:MM", or with seconds) as a valid 24-hour HH:MM, else null. */
export function cleanTime(value: string | null | undefined): string | null {
  const m = (value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (hours > 23 || minutes > 59) return null
  return hhmm(hours * 60 + minutes)
}

// ─── Car types, booking types, distance, categories ─────────────────────────

/** The car types a garage can take, as the admin form labels them. */
export const VEHICLE_TYPE_LABELS = ['Hatchback', 'Sedan', 'SUV / MUV'] as const

/**
 * The car types named in a list or a sentence, as the form's labels, plus
 * whatever was named that Detlio does not book (luxury, bikes, vans).
 */
export function mapVehicleTypes(values: string[]): { types: string[]; others: string[] } {
  const found = new Set<string>()
  const others: string[] = []
  for (const value of values.flatMap((v) => v.split(/[,/;|&\n]|\band\b/i))) {
    const word = value.trim()
    if (!word) continue
    if (/hatch|small|compact|mini/i.test(word)) found.add('Hatchback')
    else if (/sedan|medium/i.test(word)) found.add('Sedan')
    else if (/suv|muv|large|7[\s-]?seater|xuv/i.test(word)) found.add('SUV / MUV')
    else if (/\ball\b|every|any/i.test(word)) VEHICLE_TYPE_LABELS.forEach((t) => found.add(t))
    else others.push(word)
  }
  return { types: VEHICLE_TYPE_LABELS.filter((t) => found.has(t)), others }
}

/**
 * Drop-in and doorstep from an answer like "Both — at our shop and at the
 * customer's home". Null when the text names neither.
 */
export function parseBookingTypes(text: string | null | undefined): { dropin: boolean; doorstep: boolean } | null {
  const raw = (text ?? '').trim()
  if (!raw) return null
  const both = /\bboth\b/i.test(raw)
  const doorstep = both || /door ?step|home|house|customer'?s? (place|location)|at your|on.?site|mobile/i.test(raw)
  const dropin =
    both || /garage|shop|centre|center|studio|workshop|drop.?in|walk.?in|our (place|location)|outlet/i.test(raw)
  if (!doorstep && !dropin) return null
  return { dropin, doorstep }
}

/** The first distance in the text, in km. */
export function parseKm(text: string | null | undefined): number | null {
  const m = (text ?? '').match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const km = Number(m[1])
  return km > 0 ? km : null
}

const CATEGORY_WORDS: Array<{ category: DraftCategory; label: string; pattern: RegExp }> = [
  { category: 'coating', label: 'Coating', pattern: /ceramic|coating|ppf|teflon|graphene|paint protection/i },
  { category: 'scratch_removal', label: 'Scratch removal', pattern: /scratch|dent|buff|rubbing|swirl/i },
  {
    category: 'detailing',
    label: 'Detailing',
    pattern: /detail|interior|polish|upholstery|vacuum|engine|seat|dashboard|leather|odou?r|sanitis|saniti[sz]/i,
  },
  { category: 'car_wash', label: 'Car wash', pattern: /wash|foam|clean|rinse|shampoo|underbody|water/i },
]

/**
 * A category from a service's name, for a typed list with no categories.
 * One clear match is taken; two (an "interior wash") or none are marked to
 * check, naming what it could be.
 */
export function guessCategory(name: string): { category: DraftCategory; reason?: string } {
  const matches = CATEGORY_WORDS.filter((c) => c.pattern.test(name))
  if (matches.length === 1) return { category: matches[0].category }
  if (matches.length > 1) {
    return {
      category: matches[0].category,
      reason: `Could be ${matches.map((m) => m.label).join(' or ')}.`,
    }
  }
  return { category: 'others', reason: 'Category not clear from the name; set as Others.' }
}
