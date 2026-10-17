/**
 * A garage read from a document: what the admin panel's review screen is
 * filled in from.
 *
 * The shape follows the admin "Add garage" form (POST /admin/vendors), so
 * the panel can put each value into its field, and every field carries how
 * sure the reading is:
 *
 *   sure     read cleanly; nothing to say
 *   check    filled in, but a person should look (with a short reason)
 *   missing  not found; left empty for the admin to fill in
 *
 * Nothing here is saved. The draft goes to the screen, the admin corrects it,
 * and the garage is created by the ordinary create endpoint, always as
 * Pending and not verified.
 */

import { normalisePhone } from './normalise.js'

export type DraftConfidence = 'sure' | 'check' | 'missing'

export interface FieldNote {
  confidence: DraftConfidence
  /** Why to check it, or what was found instead. Plain words for the admin. */
  reason?: string
}

export type DraftCategory = 'car_wash' | 'detailing' | 'coating' | 'scratch_removal' | 'others'
export type DraftPricingType = 'flat' | 'per_vehicle' | 'on_inspection'

/** One day of the week, as the garage's settings keep it (0 = Sunday). */
export interface DraftHoursDay {
  dayOfWeek: number
  /** HH:MM, 24-hour. */
  openTime: string
  closeTime: string
  isClosed: boolean
}

export interface DraftService {
  name: string
  description: string | null
  category: DraftCategory
  pricingType: DraftPricingType
  /** The one price of a flat service, or the fee of an on-inspection one. */
  price: number | null
  priceHatchback: number | null
  priceSedan: number | null
  priceSuv: number | null
  /** Never guessed: null when the document gives no time. */
  durationMins: number | null
}

export interface GarageDraft {
  businessName: string | null
  ownerName: string | null
  /** 10 digits. The owner signs in to the garage app with it. */
  ownerPhone: string | null
  /** The business phone customers call, 10 digits. */
  phone: string | null
  whatsapp: string | null
  email: string | null
  yearsInOperation: string | null
  address: string | null
  city: string | null
  pincode: string | null
  mapsUrl: string | null
  /** Drop-in at the garage, doorstep at the customer's; null when not said. */
  dropinEnabled: boolean | null
  doorstepEnabled: boolean | null
  doorstepRadiusKm: number | null
  /** All seven days when the hours were found, else null. */
  workingHours: DraftHoursDay[] | null
  /** Only the three the platform books: 'Hatchback', 'Sedan', 'SUV / MUV'. */
  vehicleTypes: string[]
  services: DraftService[]
}

/** The garage-level fields, each of which always has a note. */
export const DRAFT_FIELDS = [
  'businessName',
  'ownerName',
  'ownerPhone',
  'phone',
  'whatsapp',
  'email',
  'yearsInOperation',
  'address',
  'city',
  'pincode',
  'mapsUrl',
  'bookingTypes',
  'doorstepRadiusKm',
  'workingHours',
  'vehicleTypes',
] as const
export type DraftField = (typeof DRAFT_FIELDS)[number]

/** A service's own fields, noted as `services.<index>.<field>`. */
export const DRAFT_SERVICE_FIELDS = ['name', 'category', 'price', 'durationMins'] as const
export type DraftServiceField = (typeof DRAFT_SERVICE_FIELDS)[number]

export interface GarageImport {
  draft: GarageDraft
  /**
   * How sure each field is, by path: `ownerPhone`, `bookingTypes` (the two
   * booking switches together), `services.2.price` (all of a service's
   * prices together). Every garage-level field has an entry.
   */
  fields: Record<string, FieldNote>
}

export const emptyDraft = (): GarageDraft => ({
  businessName: null,
  ownerName: null,
  ownerPhone: null,
  phone: null,
  whatsapp: null,
  email: null,
  yearsInOperation: null,
  address: null,
  city: null,
  pincode: null,
  mapsUrl: null,
  dropinEnabled: null,
  doorstepEnabled: null,
  doorstepRadiusKm: null,
  workingHours: null,
  vehicleTypes: [],
  services: [],
})

export const servicePath = (index: number, field: DraftServiceField) =>
  `services.${index}.${field}`

/**
 * A reason as the screen shows it: one line, no control characters, and
 * short enough to sit under a field. The model writes some of these, so
 * nothing in one is trusted to be tidy.
 */
export function cleanReason(text: string | null | undefined, max = 160): string | undefined {
  if (!text) return undefined
  // eslint-disable-next-line no-control-regex
  const line = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!line) return undefined
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/** Collects the notes while a draft is built. */
export class NoteBook {
  readonly fields: Record<string, FieldNote> = {}

  sure(path: string) {
    this.fields[path] = { confidence: 'sure' }
  }

  check(path: string, reason: string | null | undefined) {
    const clean = cleanReason(reason)
    this.fields[path] = clean ? { confidence: 'check', reason: clean } : { confidence: 'check' }
  }

  missing(path: string, reason?: string | null) {
    const clean = cleanReason(reason)
    this.fields[path] = clean ? { confidence: 'missing', reason: clean } : { confidence: 'missing' }
  }

  /** Sure when there is a value and nothing to say, check with a note, missing without a value. */
  read(path: string, hasValue: boolean, note: string | null | undefined) {
    if (!hasValue) this.missing(path, note)
    else if (cleanReason(note)) this.check(path, note)
    else this.sure(path)
  }

  /** Raises a field to check (keeps a missing one missing), keeping the first reason. */
  flag(path: string, reason: string) {
    const current = this.fields[path]
    if (current?.confidence === 'missing') return
    if (current?.confidence === 'check' && current.reason) return
    this.check(path, reason)
  }
}

/**
 * The garage's phone numbers, settled together. The owner's number is
 * always marked to check — the owner signs in to Detlio with it, and a
 * misread digit hands the garage to whoever has that number. A document
 * that gives only one number (a poster, usually) has it copied into the
 * empty one, said so, rather than leave the form unable to save.
 *
 * A garage's only number is often a landline. That is fine for customers to
 * call, but the owner's sign-in code goes to a mobile, so a copied landline
 * says so on the owner's field: the "Looks like a landline." on the
 * garage's own field is easy to miss once the owner's field reads as if the
 * number were fine.
 */
export function settlePhones(draft: GarageDraft, notes: NoteBook) {
  const signsIn = 'The owner signs in to Detlio'
  const signIn = `${signsIn} with it.`

  if (!draft.ownerPhone && draft.phone) {
    draft.ownerPhone = draft.phone
    notes.check(
      'ownerPhone',
      normalisePhone(draft.phone).mobile
        ? `Copied from the garage's number. ${signIn}`
        : `Copied from the garage's number, which looks like a landline. ${signsIn} with a mobile number; ask for theirs.`
    )
  } else if (draft.ownerPhone && !draft.phone) {
    draft.phone = draft.ownerPhone
    notes.check('phone', "Copied from the owner's number.")
  }

  if (draft.ownerPhone) {
    const note = notes.fields.ownerPhone
    if (note?.confidence !== 'check' || !note.reason?.includes(signsIn)) {
      notes.check('ownerPhone', note?.reason ? `${note.reason} ${signIn}` : `${signIn} Make sure it is the owner's mobile.`)
    }
  }
}
