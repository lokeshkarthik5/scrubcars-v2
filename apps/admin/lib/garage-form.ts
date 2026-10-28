/**
 * The Add garage form's values, outside the component: what it starts
 * from (empty, or filled in by an import), which fields Create needs, and
 * how many of those are still empty. Pure, so it is tested here
 * (garage-form.test.ts) rather than in a page.
 */
import type { BookingMode } from './garage-edit'
import type { ServiceRow } from './service-editor'
import { missingServiceFields } from './service-rows'

/** Every text box on the form, as typed. */
export interface GarageFormText {
  ownerName: string
  ownerPhone: string
  businessName: string
  phone: string
  address: string
  city: string
  pincode: string
  email: string
  whatsapp: string
  yearsInOperation: string
  mapsUrl: string
  bays: string
  jobsPerDay: string
  pickupRadiusKm: string
  openTime: string
  closeTime: string
  notes: string
}

export type GarageTextField = keyof GarageFormText

/** What the form opens with. An import fills in some of it; the rest keeps these. */
export interface GarageFormInitial {
  text?: Partial<GarageFormText>
  bookingMode?: BookingMode
  doorstepRadius?: string
  workingDays?: number[]
  vehicleTypes?: string[]
  services?: ServiceRow[]
}

export const EMPTY_GARAGE_TEXT: GarageFormText = {
  ownerName: '',
  ownerPhone: '',
  businessName: '',
  phone: '',
  address: '',
  city: '',
  pincode: '',
  email: '',
  whatsapp: '',
  yearsInOperation: '',
  mapsUrl: '',
  bays: '',
  jobsPerDay: '',
  pickupRadiusKm: '',
  openTime: '09:00',
  closeTime: '18:00',
  notes: '',
}

/** Monday to Saturday: what most garages keep, and the form's starting week. */
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6]

/**
 * The fields Create needs, and what counts as filled: the same rules as the
 * API's createVendorSchema and the edit page's garageFieldsProblem.
 */
export const REQUIRED_GARAGE_FIELDS: ReadonlyArray<{ key: GarageTextField; filled: (value: string) => boolean }> = [
  { key: 'ownerName', filled: (v) => v.trim() !== '' },
  { key: 'ownerPhone', filled: (v) => /^\d{10}$/.test(v.trim()) },
  { key: 'businessName', filled: (v) => v.trim() !== '' },
  { key: 'phone', filled: (v) => /^\d{10}$/.test(v.trim()) },
  { key: 'address', filled: (v) => v.trim() !== '' },
  { key: 'city', filled: (v) => v.trim() !== '' },
  { key: 'pincode', filled: (v) => /^\d{6}$/.test(v.trim()) },
]

/**
 * The fields Create needs for this garage: a doorstep-only one (`atGarage`
 * false, 0061) needs no address, and its pincode may be empty.
 */
export function requiredGarageFields(atGarage = true): ReadonlyArray<{
  key: GarageTextField
  filled: (value: string) => boolean
}> {
  if (atGarage) return REQUIRED_GARAGE_FIELDS
  return REQUIRED_GARAGE_FIELDS.filter((field) => field.key !== 'address').map((field) =>
    field.key === 'pincode' ? { key: field.key, filled: (v: string) => /^(\d{6})?$/.test(v.trim()) } : field
  )
}

export const isRequiredField = (key: string, atGarage = true): key is GarageTextField =>
  requiredGarageFields(atGarage).some((field) => field.key === key)

/** Whether a required field holds what Create takes. True for an optional field. */
export function requiredFieldFilled(key: GarageTextField, text: GarageFormText, atGarage = true): boolean {
  const field = requiredGarageFields(atGarage).find((f) => f.key === key)
  return field ? field.filled(text[key]) : true
}

/**
 * How many things Create still waits for: each required field that is not
 * right yet, and each service still missing a price (or a name). The review
 * screen says it as "Fill in the 3 missing fields to create".
 */
export function missingForCreate(text: GarageFormText, services: ServiceRow[], atGarage = true): number {
  const fields = requiredGarageFields(atGarage).filter((field) => !field.filled(text[field.key])).length
  const rows = services.filter((row) => missingServiceFields(row).length > 0).length
  return fields + rows
}

/** "Fill in the 3 missing fields to create", or null when nothing is missing. */
export function missingLine(count: number): string | null {
  if (count === 0) return null
  return count === 1 ? 'Fill in the 1 missing field to create' : `Fill in the ${count} missing fields to create`
}
