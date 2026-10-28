/**
 * Add garage's import, on the panel's side: which files can be sent, and how
 * the API's reading of a garage becomes the review screen — the form filled
 * in, an amber "Check this" or "Not found — fill in" beside the fields that
 * need a person, and the counts at the top. Pure, so it is tested here
 * (garage-import.test.ts) rather than in a page.
 *
 * The reading itself is the API's (POST /admin/vendor-imports/extract);
 * nothing here second-guesses it. Create is the ordinary createAdminVendor,
 * always Pending and not verified.
 */
import type { ImportFieldNote, ImportedGarage } from '@repo/core/api/admin'
import { bookingModeOf, radiusText } from './garage-edit'
import {
  DEFAULT_WORKING_DAYS,
  isRequiredField,
  requiredFieldFilled,
  type GarageFormInitial,
  type GarageFormText,
  type GarageTextField,
} from './garage-form'
import { emptyServiceRow, minsToDuration, type ServiceRow } from './service-editor'

// ─── Files ───────────────────────────────────────────────────────────────────

/** Files in one import, as the API takes them. */
export const MAX_IMPORT_FILES = 5

/**
 * All the files together as base64, as the API takes them: about 3 MB, so
 * the request stays under the platform's 4.5 MB body limit.
 */
export const MAX_IMPORT_BASE64_CHARS = 4_000_000

/** A photo's longest side before it is sent. Small print stays legible. */
export const IMPORT_IMAGE_EDGE = 2000

/** A Tally file, as the API takes it. */
export const MAX_TALLY_CSV_CHARS = 1_000_000

export type ImportFileKind = 'image' | 'pdf' | 'heic' | 'other'

/** What a picked file is, from its type and, when a phone leaves that blank, its name. */
export function importFileKind(file: { name: string; type: string }): ImportFileKind {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  if (type === 'image/heic' || type === 'image/heif' || /\.(heic|heif)$/.test(name)) return 'heic'
  if (type === 'application/pdf' || (!type && name.endsWith('.pdf'))) return 'pdf'
  if (['image/jpeg', 'image/png', 'image/webp'].includes(type) || (!type && /\.(jpe?g|png|webp)$/.test(name))) {
    return 'image'
  }
  return 'other'
}

/**
 * Why the picked files can't be sent, in words for the admin, or null.
 * HEIC (an iPhone's own format) can't be drawn by most browsers, so it is
 * refused here with what to do instead.
 */
export function pickedFilesProblem(files: Array<{ name: string; type: string }>): string | null {
  if (files.length === 0) return null
  if (files.length > MAX_IMPORT_FILES) {
    return `Up to ${MAX_IMPORT_FILES} files at a time. Pick the pages that matter most.`
  }
  for (const file of files) {
    const kind = importFileKind(file)
    if (kind === 'heic') {
      return `“${file.name}” is a HEIC photo, which can't be read here. Take a screenshot of it, or set the iPhone camera to Most Compatible (Settings › Camera › Formats), and upload that.`
    }
    if (kind === 'other') {
      return `“${file.name}” isn't a photo or a PDF. Upload JPG, PNG, WebP or PDF files.`
    }
  }
  return null
}

/** The review screen's subtitle: "Add garage · from a photo", "· from 3 photos", "· from Tally". */
export function importSourceLine(source: { kind: 'tally' } | { kind: 'files'; files: Array<{ name: string; type: string }> }): string {
  if (source.kind === 'tally') return 'Add garage · from Tally'
  const kinds = source.files.map(importFileKind)
  const n = kinds.length
  if (kinds.every((k) => k === 'image')) return n === 1 ? 'Add garage · from a photo' : `Add garage · from ${n} photos`
  if (kinds.every((k) => k === 'pdf')) return n === 1 ? 'Add garage · from a PDF' : `Add garage · from ${n} PDFs`
  return `Add garage · from ${n} files`
}

/** "1 photo", "2 photos and a PDF". */
export function importFilesMeta(files: Array<{ name: string; type: string }>): string {
  const photos = files.filter((f) => importFileKind(f) === 'image').length
  const pdfs = files.filter((f) => importFileKind(f) === 'pdf').length
  const parts = [
    photos > 0 ? (photos === 1 ? '1 photo' : `${photos} photos`) : null,
    pdfs > 0 ? (pdfs === 1 ? '1 PDF' : `${pdfs} PDFs`) : null,
  ].filter(Boolean)
  return parts.join(' and ')
}

// ─── The review screen ───────────────────────────────────────────────────────

/** What a field shows beside it on the review screen. */
export interface ImportMark {
  kind: 'check' | 'missing'
  reason?: string
}

/** A note under a service row, for one of its fields. */
export interface ServiceRowNote extends ImportMark {
  field: 'name' | 'category' | 'price'
}

/**
 * Whether a field shows its note now. "Check this" stays — it is a record
 * of what to look at. "Not found — fill in" is for fields Create needs, and
 * goes once the field is filled.
 */
export function visibleMark(
  key: string,
  note: ImportFieldNote | undefined,
  text: GarageFormText,
  /** Customers come to the garage: the address is needed (0061). */
  atGarage = true
): ImportMark | null {
  if (!note) return null
  if (note.confidence === 'check') return { kind: 'check', reason: note.reason }
  if (
    note.confidence === 'missing' &&
    isRequiredField(key, atGarage) &&
    !requiredFieldFilled(key, text, atGarage)
  ) {
    return { kind: 'missing', reason: note.reason }
  }
  return null
}

/** The counts at the top of the review screen. */
export interface ImportSummary {
  filled: number
  check: number
  /** Fields Create needs that were not found, and services with no price. */
  missing: number
}

export function importSummary({ fields }: Pick<ImportedGarage, 'fields'>): ImportSummary {
  let filled = 0
  let check = 0
  let missing = 0
  for (const [path, note] of Object.entries(fields)) {
    // The list-wide note ("the first 50 are here") is not a field.
    if (path === 'services') continue
    if (note.confidence !== 'missing') filled++
    if (note.confidence === 'check') check++
    if (note.confidence === 'missing' && (isRequiredField(path) || /^services\.\d+\.price$/.test(path))) missing++
  }
  return { filled, check, missing }
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The open days' most common hours, and the days that keep others. */
function weekForForm(hours: NonNullable<ImportedGarage['draft']['workingHours']>) {
  const open = hours.filter((day) => !day.isClosed)
  const tally = new Map<string, number>()
  for (const day of open) {
    const key = `${day.openTime}-${day.closeTime}`
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }
  const [common] = [...tally.entries()].sort((a, b) => b[1] - a[1])
  const [openTime, closeTime] = (common?.[0] ?? '09:00-18:00').split('-')
  const others = open.filter((day) => day.openTime !== openTime || day.closeTime !== closeTime)
  return { workingDays: open.map((day) => day.dayOfWeek), openTime, closeTime, others }
}

export interface ImportedForm {
  initial: GarageFormInitial
  /** Garage-level notes by field, as the API sent them (plus the hours one below). */
  marks: Record<string, ImportFieldNote>
  /** Notes under each service row, by the row's key. */
  rowNotes: Record<string, ServiceRowNote[]>
  /** Services the document gave no time for: each takes one booking slot. */
  untimedServices: number
}

const textFrom = (value: string | null) => value ?? ''

/**
 * The reading as the Add garage form: each value in its field, a service
 * row per service, and the notes to show beside them.
 *
 * The form takes one opening time for every open day (the edit page takes
 * a time per day). When the document gives a day other hours — a Sunday
 * half-day — the most common hours are used and the day is named in a
 * "Check this", to set on the edit page after Create.
 */
export function formFromImport({ draft, fields }: Pick<ImportedGarage, 'draft' | 'fields'>): ImportedForm {
  const marks: Record<string, ImportFieldNote> = { ...fields }

  const text: Partial<GarageFormText> = {}
  for (const key of [
    'ownerName',
    'ownerPhone',
    'businessName',
    'phone',
    'address',
    'city',
    'pincode',
    'email',
    'whatsapp',
    'yearsInOperation',
    'mapsUrl',
  ] as const satisfies readonly GarageTextField[]) {
    text[key] = textFrom(draft[key])
  }

  let workingDays = DEFAULT_WORKING_DAYS
  if (draft.workingHours) {
    const week = weekForForm(draft.workingHours)
    workingDays = week.workingDays
    text.openTime = week.openTime
    text.closeTime = week.closeTime
    if (week.others.length > 0) {
      const days = week.others.map((d) => `${DAY_SHORT[d.dayOfWeek]} ${d.openTime}–${d.closeTime}`).join(', ')
      const reason = `Other hours on ${days}. This form takes one time for every open day; set ${
        week.others.length === 1 ? 'that day' : 'those days'
      } on the edit page after creating.`
      const earlier = fields.workingHours?.confidence === 'check' ? fields.workingHours.reason : undefined
      marks.workingHours = { confidence: 'check', reason: earlier ? `${earlier} ${reason}` : reason }
    }
  }

  const services: ServiceRow[] = []
  const rowNotes: Record<string, ServiceRowNote[]> = {}
  let untimedServices = 0
  draft.services.forEach((service, index) => {
    const price = (n: number | null) => (n != null && n > 0 ? String(n) : '')
    const row: ServiceRow = {
      ...emptyServiceRow(),
      name: service.name,
      description: service.description ?? '',
      category: service.category,
      pricingType: service.pricingType,
      price: service.pricingType === 'per_vehicle' ? '' : price(service.price),
      priceHatchback: price(service.priceHatchback),
      priceSedan: price(service.priceSedan),
      priceSuv: price(service.priceSuv),
      ...(service.durationMins != null ? minsToDuration(service.durationMins) : { durationValue: '', durationUnit: 'min' as const }),
    }
    if (service.durationMins == null) untimedServices++
    services.push(row)

    const notes: ServiceRowNote[] = []
    for (const field of ['name', 'category', 'price'] as const) {
      const note = fields[`services.${index}.${field}`]
      if (note?.confidence === 'check') notes.push({ field, kind: 'check', reason: note.reason })
      // Only a price is needed to create; a missing one says why it is empty.
      if (note?.confidence === 'missing' && field === 'price') notes.push({ field, kind: 'missing', reason: note.reason })
    }
    if (notes.length > 0) rowNotes[row.key] = notes
  })

  return {
    initial: {
      text,
      // Not said either way: the form's own default, at the garage.
      bookingMode: bookingModeOf(draft.dropinEnabled ?? false, draft.doorstepEnabled ?? false) ?? 'garage',
      doorstepRadius: radiusText(draft.doorstepRadiusKm),
      workingDays,
      vehicleTypes: draft.vehicleTypes,
      services,
    },
    marks,
    rowNotes,
    untimedServices,
  }
}

/** The help line under the services when the document gave no times. */
export function untimedLine(untimed: number, total: number): string | null {
  if (untimed === 0) return null
  if (untimed === total) {
    return total === 1
      ? 'No time given for this service, so it takes one booking slot. You can change this later.'
      : 'No times given for these services, so each takes one booking slot. You can change this later.'
  }
  return untimed === 1
    ? '1 service has no time given, so it takes one booking slot. You can change this later.'
    : `${untimed} services have no time given, so each takes one booking slot. You can change this later.`
}

/** A Tally row on the pick list: "Sparkle Auto Spa", with the owner and date under it. */
export function tallyRowTitle(label: ImportedGarage['label'], index: number): string {
  return label.businessName ?? `Response ${index + 1}`
}

export function tallyRowMeta(label: ImportedGarage['label']): string {
  return [label.ownerName, label.submittedAt ? `sent ${label.submittedAt.slice(0, 10)}` : null]
    .filter(Boolean)
    .join(' · ')
}
