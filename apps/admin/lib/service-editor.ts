/**
 * The services editor's row model, shared by the add and edit garage pages.
 *
 * Both pages used to carry their own copy of the row type, the duration
 * units and the payload mapping, and the copies had started to differ. This
 * is the one copy. What makes a row ready to save stays in service-rows.ts;
 * this file is how a row is built, shown and sent. Pure, so it is tested
 * here rather than in a page.
 */
import type { AdminPhoto, AdminVendorDetail, UpdateVendorServiceInput } from '@repo/core/api/admin'
import type { ServiceTemplate } from '@repo/core/service-templates'
import type { ServiceCategory } from '@repo/core/types'
import type { PricingType, ServiceRowFields } from './service-rows'

export type DurationUnit = 'min' | 'hour' | 'day'

/** A plain service's category: packages are not edited here. */
export type PlainCategory = Exclude<ServiceCategory, 'package'>

export interface ServiceRow extends ServiceRowFields {
  /**
   * Who this row is to React and to the page: the service id once it has
   * one, a made-up `new-…` before. Never sent.
   */
  key: string
  category: PlainCategory
  durationUnit: DurationUnit
  // Images are stored per service row, so they exist only once the service
  // itself does — a row that has never been saved has nowhere to attach them.
  images: AdminPhoto[]
}

const DURATION_FACTOR: Record<DurationUnit, number> = { min: 1, hour: 60, day: 1440 }

export const DURATION_UNITS: Array<{ value: DurationUnit; label: string }> = [
  { value: 'min', label: 'Minutes' },
  { value: 'hour', label: 'Hours' },
  { value: 'day', label: 'Days' },
]

/** The lengths most services take, offered as one tap on the row's chip. */
export const DURATION_PRESETS = [30, 45, 60, 90, 120] as const

/** A value + unit as minutes to send; blank or zero is undefined (omitted). */
export function durationToMins(value: string, unit: DurationUnit): number | undefined {
  const n = Number(value)
  return n > 0 ? Math.round(n * DURATION_FACTOR[unit]) : undefined
}

/** Stored minutes in the largest clean unit (120 → 2 hours), for editing. */
export function minsToDuration(mins: number): Pick<ServiceRow, 'durationValue' | 'durationUnit'> {
  if (mins > 0 && mins % 1440 === 0) return { durationValue: String(mins / 1440), durationUnit: 'day' }
  if (mins > 0 && mins % 60 === 0) return { durationValue: String(mins / 60), durationUnit: 'hour' }
  return { durationValue: mins > 0 ? String(mins) : '', durationUnit: 'min' }
}

/** The row's duration in minutes, or undefined when it is left to the slot. */
export const rowDurationMins = (row: Pick<ServiceRow, 'durationValue' | 'durationUnit'>) =>
  durationToMins(row.durationValue, row.durationUnit)

/**
 * A duration as the row's chip says it: minutes up to the presets ("90
 * min"), then hours ("3 h", "2 h 30 min"), and whole days ("1 day").
 */
export function durationLabel(mins: number): string {
  if (mins % 1440 === 0) return mins === 1440 ? '1 day' : `${mins / 1440} days`
  if (mins <= 120) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/**
 * What the pricing select calls each type. Labels only: the stored values
 * are unchanged, and these are the words the owner chose for the editor.
 */
export const PRICING_OPTIONS: Array<{ value: PricingType; label: string }> = [
  { value: 'per_vehicle', label: 'By car type' },
  { value: 'flat', label: 'Same for all cars' },
  { value: 'on_inspection', label: 'After inspection' },
]

/**
 * The editor's two groups, which are also how Detlio's commission splits
 * services: washes and the everyday extras, and detailing work.
 */
export const SERVICE_GROUPS: ReadonlyArray<{
  key: 'wash' | 'detailing'
  label: string
  categories: readonly PlainCategory[]
}> = [
  { key: 'wash', label: 'Wash and standard', categories: ['car_wash', 'others'] },
  { key: 'detailing', label: 'Detailing', categories: ['detailing', 'coating', 'scratch_removal'] },
]

/** The group a category is listed under. */
export function serviceGroupOf(category: PlainCategory) {
  return SERVICE_GROUPS.find((group) => group.categories.includes(category)) ?? SERVICE_GROUPS[0]
}

export interface GroupedRow {
  row: ServiceRow
  /** 1-based position on screen, across both groups: "Service 3". */
  number: number
}

/**
 * The rows under their group headings, in the order they are held within
 * each group. A group with no rows is left out.
 */
export function groupRows(rows: readonly ServiceRow[]) {
  let number = 0
  return SERVICE_GROUPS.map((group) => ({
    ...group,
    rows: rows
      .filter((row) => group.categories.includes(row.category))
      .map((row): GroupedRow => ({ row, number: ++number })),
  })).filter((group) => group.rows.length > 0)
}

let nextNewKey = 0
/** A key for a row that has no id yet. Unique for the page's lifetime. */
export const newRowKey = () => `new-${++nextNewKey}`

/**
 * A blank row. Priced by car type, since most garages charge a hatchback less
 * than an SUV and the three boxes are then already on screen.
 */
export function emptyServiceRow(): ServiceRow {
  return {
    key: newRowKey(),
    images: [],
    name: '',
    description: '',
    category: 'car_wash',
    pricingType: 'per_vehicle',
    price: '',
    priceHatchback: '',
    priceSedan: '',
    priceSuv: '',
    durationValue: '',
    durationUnit: 'min',
  }
}

/**
 * A row filled from a ready-made service. The prices stay empty — each garage
 * charges its own — so the row asks for them before the garage can be saved.
 */
export function serviceRowFromTemplate(template: ServiceTemplate): ServiceRow {
  return {
    ...emptyServiceRow(),
    name: template.name,
    description: template.description,
    category: template.category,
    pricingType: template.pricingType,
    ...minsToDuration(template.durationMins),
  }
}

// Decimal columns arrive as strings; drop the trailing ".00" for display.
const decToInput = (v: string | null): string => (v == null ? '' : String(Number(v)))

/** A stored service as the editor holds it. */
export function toServiceRow(s: AdminVendorDetail['services'][number]): ServiceRow {
  return {
    key: s.id,
    id: s.id,
    images: s.images ?? [],
    name: s.name,
    description: s.description ?? '',
    // Admin never loads packages (the API leaves them out), so a stored
    // service here is always a plain one.
    category: s.category as PlainCategory,
    pricingType: s.pricingType,
    price: s.pricingType === 'per_vehicle' ? '' : decToInput(s.price),
    priceHatchback: decToInput(s.priceHatchback),
    priceSedan: decToInput(s.priceSedan),
    priceSuv: decToInput(s.priceSuv),
    ...minsToDuration(s.durationMins),
  }
}

/**
 * The row as the API takes it. Only the prices its pricing type uses are
 * sent; a blank or zero price is left out, which the API refuses — the
 * editor holds the save before that can happen (servicesSaveBlock).
 */
export function toServicePayload(row: ServiceRow): UpdateVendorServiceInput {
  const pos = (v: string) => (Number(v) > 0 ? Number(v) : undefined)
  const durationMins = rowDurationMins(row)
  return {
    ...(row.id && { id: row.id }),
    name: row.name.trim(),
    ...(row.description.trim() && { description: row.description.trim() }),
    category: row.category,
    pricingType: row.pricingType,
    ...(durationMins != null && { durationMins }),
    ...(row.pricingType === 'per_vehicle'
      ? {
          priceHatchback: pos(row.priceHatchback),
          priceSedan: pos(row.priceSedan),
          priceSuv: pos(row.priceSuv),
        }
      : { price: pos(row.price) }),
  }
}
