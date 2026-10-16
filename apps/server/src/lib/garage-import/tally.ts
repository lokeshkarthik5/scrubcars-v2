import { NoteBook, emptyDraft, settlePhones, type GarageImport } from './draft.js'
import {
  mapVehicleTypes,
  normalisePhone,
  parseBookingTypes,
  parseDurationText,
  parseHoursText,
  parseKm,
} from './normalise.js'
import { calmCapitals, serviceFromLine } from './vision.js'

/**
 * The Tally import: the responses file the owner downloads from Tally
 * (Responses → Download → CSV), one garage per row.
 *
 * No AI. Each column is matched to a form field by its question's wording,
 * through the table below, and its answer goes through the same rules as a
 * poster's (normalise.ts). Columns the table does not know — Tally's own
 * Respondent ID, a file upload, a question added later — are ignored, so a
 * new question on the form never breaks the import; it just isn't read.
 *
 * Header → field (first match wins, in this order; the header is lower-cased
 * and its punctuation turned into spaces before matching):
 *
 *   Submitted at / Submission date        → shown on the pick list only
 *   Submission ID, Respondent ID          → ignored
 *   …e-mail… / …email…                    → email
 *   …WhatsApp…                            → WhatsApp
 *   Google Maps / map link / location link→ Google Maps link
 *   Pincode / PIN code / postal code      → pincode
 *   Owner's phone / Owner mobile number,
 *     or a bare "Phone" / "Mobile number" → owner phone
 *   Garage / business / shop … phone,
 *     or any other "… phone number"       → business phone
 *   Garage / business / shop … name,
 *     "Name of the garage"                → business name
 *   any other "… name" (Owner name, Your name) → owner name
 *   Years / since / established           → years in operation
 *   …address…                             → address
 *   City / town                           → city
 *   km / radius / distance / how far      → doorstep distance (km)
 *   doorstep / home service / drop-in / walk-in / service mode → how customers book
 *   hours / timings / opening / working days / open → opening hours (several columns are joined)
 *   vehicle(s) / car types / car sizes    → car types
 *   services / price list / rate card / prices / packages → services, one per line (several columns are joined)
 *
 * A services answer is read one line at a time: "Foam wash - 399", "Full
 * wash: Hatch 499 / Sedan 549 / SUV 649", "Interior cleaning – Call",
 * "Ceramic coating ₹15000 (2 days)".
 */

type TallyField =
  | 'submittedAt'
  | 'ignore'
  | 'email'
  | 'whatsapp'
  | 'mapsUrl'
  | 'pincode'
  | 'ownerPhone'
  | 'phone'
  | 'businessName'
  | 'ownerName'
  | 'yearsInOperation'
  | 'address'
  | 'city'
  | 'doorstepKm'
  | 'bookingTypes'
  | 'hours'
  | 'vehicleTypes'
  | 'services'

const BUSINESS = '(business|garage|shop|studio|centre|center|company|workshop|brand|firm)'

/** The mapping table, in the order it is tried. Documented above. */
export const TALLY_COLUMNS: ReadonlyArray<{ field: TallyField; match: RegExp; many?: boolean }> = [
  { field: 'submittedAt', match: /^(submitted at|submission date|submitted on|created at|date submitted)$/ },
  { field: 'ignore', match: /^(submission|respondent|response) id$/ },
  { field: 'email', match: /\be ?mail\b/ },
  { field: 'whatsapp', match: /\bwhats ?app\b/ },
  { field: 'mapsUrl', match: /\b(google )?maps?\b|\blocation (link|url)\b/ },
  { field: 'pincode', match: /\bpin ?code\b|\bpostal code\b|\bzip\b|^pin$/ },
  {
    field: 'ownerPhone',
    match: /\bowner\b.*\b(phone|mobile|number|contact)\b|^(your )?(phone|mobile|contact)( number| no)?$/,
  },
  {
    field: 'phone',
    match: new RegExp(`\\b${BUSINESS}\\b.*\\b(phone|mobile|number|contact)\\b|\\b(phone|mobile|contact) (number|no)\\b`),
  },
  {
    field: 'businessName',
    match: new RegExp(`\\b${BUSINESS}\\b.*\\bname\\b|\\bname of (the |your )?${BUSINESS}\\b`),
  },
  { field: 'ownerName', match: /\bname\b/ },
  { field: 'yearsInOperation', match: /\byears?\b|\bsince\b|\bestablished\b/ },
  { field: 'address', match: /\baddress\b/ },
  { field: 'city', match: /\bcity\b|\btown\b/ },
  { field: 'doorstepKm', match: /\bkm\b|\bradius\b|\bhow far\b|\bdistance\b/ },
  {
    field: 'bookingTypes',
    match: /\bdoor ?step\b|\bhome service\b|\bdrop ?in\b|\bwalk ?in\b|\bservice (mode|type|location)\b|\bwhere do you\b/,
  },
  { field: 'hours', match: /\bhours\b|\btimings?\b|\bopening\b|\bworking days\b|\bopen\b/, many: true },
  { field: 'vehicleTypes', match: /\bvehicles?\b|\bcar (types?|sizes?|models?)\b/ },
  { field: 'services', match: /\bservices?\b|\bprice list\b|\brate card\b|\bprices?\b|\bpackages?\b/, many: true },
]

const normaliseHeader = (header: string) =>
  header
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Which field each column feeds, or null to ignore it. */
export function mapTallyHeaders(headers: string[]): Array<TallyField | null> {
  const taken = new Set<TallyField>()
  return headers.map((header) => {
    const h = normaliseHeader(header)
    if (!h) return null
    const row = TALLY_COLUMNS.find((c) => c.match.test(h) && (c.many || !taken.has(c.field)))
    if (!row || row.field === 'ignore') return null
    taken.add(row.field)
    return row.field
  })
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/**
 * RFC 4180 CSV: quoted fields may hold commas, doubled quotes and line
 * breaks (a long answer in Tally keeps its new lines). A byte-order mark is
 * dropped; CRLF and LF both end a row; rows that are entirely empty are
 * skipped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === '') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((cell) => cell.trim())) rows.push(row)
  return rows
}

// ─── Rows → drafts ───────────────────────────────────────────────────────────

/** At most this many garages from one file; a pick list longer than that helps no one. */
export const MAX_TALLY_ROWS = 100

export interface TallyGarage {
  /** What the pick list shows for the row. */
  label: { businessName: string | null; ownerName: string | null; submittedAt: string | null }
  import: GarageImport
}

const tidy = (value: string | undefined | null, max = 500): string | null => {
  const line = (value ?? '').replace(/\s+/g, ' ').trim()
  return line ? line.slice(0, max) : null
}

/** "1. Foam wash - 399" → name "Foam wash", price "399"; "Interior (45 min) – Call" too. */
export function splitServiceLine(line: string): { name: string; price: string | null; duration: string | null } | null {
  let text = line.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim()
  if (!text) return null

  // A time in brackets or after a comma: "(45 min)", ", 2 hrs".
  let duration: string | null = null
  const time = text.match(
    /\(?\s*(\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?\s*(?:mins?|minutes?|hrs?|hours?|days?)\b)\s*\)?/i
  )
  if (time && parseDurationText(time[1]).mins !== null) {
    duration = time[1].trim()
    text = text.replace(time[0], ' ').replace(/\s+/g, ' ').trim()
  }

  const m = text.match(/^(.+?)\s*(?:[:=|]|\s[-–—]\s|-(?=\s*(?:₹|rs\.?|\d))|(?=₹|\brs\.?\s*\d|\b\d|\b(?:from|starting|starts|call)\b))\s*(.*)$/i)
  const name = (m ? m[1] : text).replace(/[\s:=|–—-]+$/, '').trim()
  const price = m ? m[2].trim() : ''
  if (!name) return null
  return { name, price: price || null, duration }
}

/** One row of answers as a draft. `cells` are by column, `fields` by mapTallyHeaders. */
export function importFromTallyRow(cells: string[], fields: Array<TallyField | null>): TallyGarage {
  const draft = emptyDraft()
  const notes = new NoteBook()

  const one = (field: TallyField) => {
    const i = fields.indexOf(field)
    return i >= 0 ? tidy(cells[i]) : null
  }
  // Several columns for one field are read together, keeping their lines.
  const all = (field: TallyField) =>
    fields
      .map((f, i) => (f === field ? (cells[i] ?? '').trim() : ''))
      .filter(Boolean)
      .join('\n')

  for (const field of ['ownerName', 'email', 'yearsInOperation', 'address', 'city', 'mapsUrl'] as const) {
    draft[field] = one(field)
    notes.read(field, draft[field] !== null, null)
  }
  const business = one('businessName')
  draft.businessName = business ? calmCapitals(business) : null
  notes.read('businessName', draft.businessName !== null, null)

  const pincode = (one('pincode') ?? '').replace(/\s+/g, '')
  draft.pincode = /^\d{6}$/.test(pincode) ? pincode : null
  if (draft.pincode) notes.sure('pincode')
  else notes.missing('pincode', pincode ? `“${pincode}” is not a 6-digit pincode.` : null)

  for (const [field, mobileOnly] of [
    ['ownerPhone', true],
    ['phone', false],
    ['whatsapp', true],
  ] as const) {
    const raw = one(field)
    const { phone, mobile } = normalisePhone(raw)
    draft[field] = phone
    if (!phone) notes.missing(field, raw ? `Couldn't read a 10-digit number in “${raw.slice(0, 30)}”.` : null)
    else if (!mobile) notes.check(field, mobileOnly ? 'Looks like a landline, not a mobile.' : 'Looks like a landline.')
    else notes.sure(field)
  }
  settlePhones(draft, notes)

  const booking = parseBookingTypes(one('bookingTypes'))
  draft.dropinEnabled = booking?.dropin ?? null
  draft.doorstepEnabled = booking?.doorstep ?? null
  if (booking) notes.sure('bookingTypes')
  else notes.missing('bookingTypes', one('bookingTypes') ? `Couldn't tell from “${one('bookingTypes')}”.` : null)

  draft.doorstepRadiusKm = parseKm(one('doorstepKm'))
  notes.read('doorstepRadiusKm', draft.doorstepRadiusKm !== null, null)

  // Days and times often come as two questions ("Working days", "Timings");
  // read together they are one week.
  const hours = parseHoursText(all('hours').replace(/\n/g, '; '))
  draft.workingHours = hours.days
  if (!hours.days) notes.missing('workingHours', hours.reason)
  else if (hours.reason) notes.check('workingHours', hours.reason)
  else notes.sure('workingHours')

  const vehiclesRaw = one('vehicleTypes')
  const vehicles = mapVehicleTypes(vehiclesRaw ? [vehiclesRaw] : [])
  draft.vehicleTypes = vehicles.types
  if (vehicles.types.length === 0) notes.missing('vehicleTypes')
  else if (vehicles.others.length > 0) {
    notes.check('vehicleTypes', `Also listed: ${vehicles.others.join(', ')}. Detlio books hatchbacks, sedans and SUVs only.`)
  } else notes.sure('vehicleTypes')

  // Services: one per line of the answer (or per comma, when a line holds
  // several priced items).
  const lines = all('services')
    .split(/\r?\n|;/)
    .flatMap((line) => {
      // Not inside an amount: "₹15,000" is one price.
      const parts = line.split(/,(?!\d)/)
      return parts.length > 1 && parts.every((p) => /\d|call|inspection/i.test(p)) ? parts : [line]
    })
    .map((line) => splitServiceLine(line))
    .filter((line): line is NonNullable<typeof line> => line !== null)
  draft.services = lines.map((line, index) =>
    serviceFromLine({ ...line, category: null, description: null }, index, notes)
  )

  return {
    label: {
      businessName: draft.businessName,
      ownerName: draft.ownerName,
      submittedAt: one('submittedAt'),
    },
    import: { draft, fields: notes.fields },
  }
}

/**
 * Every garage in a Tally responses file, newest last as Tally writes them,
 * or an empty list when the file has a header and nothing else (or no
 * column the table knows, which is not a Tally garage form).
 */
export function garagesFromTallyCsv(text: string): TallyGarage[] {
  const [header, ...rows] = parseCsv(text)
  if (!header) return []
  const fields = mapTallyHeaders(header)
  const known = fields.filter((f) => f && f !== 'submittedAt')
  if (known.length < 2) return []
  return rows.slice(0, MAX_TALLY_ROWS).map((cells) => importFromTallyRow(cells, fields))
}
