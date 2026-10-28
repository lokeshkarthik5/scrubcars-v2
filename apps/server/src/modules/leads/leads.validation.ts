import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { isCalendarDate } from '../../lib/booking-ops.js'
import {
  LEAD_ADDRESS_MAX,
  LEAD_NAME_MAX,
  LEAD_NOTE_MAX,
  LEAD_PASTE_MAX,
  LEAD_REASON_MAX,
  normalisePhone,
} from '../../lib/leads.js'

/** The most finder results one "Add N as leads" takes. */
export const FROM_PLACES_MAX = 60

const day = z.string().refine(isCalendarDate, 'Pick a real day (YYYY-MM-DD)')
const latitude = z.number().finite().min(-90).max(90)
const longitude = z.number().finite().min(-180).max(180)

/** A phone typed any usual way, kept as digits (lib/leads.ts normalisePhone). Empty is none. */
const phoneInput = z
  .string()
  .trim()
  .max(30)
  .transform((value, ctx) => {
    if (value === '') return null
    const phone = normalisePhone(value)
    if (!phone) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a phone number (6 to 15 digits)',
      })
      return z.NEVER
    }
    return phone
  })

const leadName = z.string().trim().min(1, 'Enter a name').max(LEAD_NAME_MAX)
const mapsUrl = z.string().trim().url('Paste a Google Maps link').max(2048)
const note = z.string().trim().max(LEAD_NOTE_MAX)
const reason = z
  .string()
  .trim()
  .min(1, 'Say why they are not interested')
  .max(LEAD_REASON_MAX)

const pinTogether = (data: { lat?: number | null; lng?: number | null }) =>
  (data.lat === undefined) === (data.lng === undefined) &&
  (data.lat === null) === (data.lng === null)

/** POST /admin/leads: one lead typed in (Add lead). */
export const createLeadSchema = z
  .object({
    actorName: signedActorName,
    name: leadName,
    phone: phoneInput.nullable().optional(),
    mapsUrl: mapsUrl.nullable().optional(),
    lat: latitude.nullable().optional(),
    lng: longitude.nullable().optional(),
    /** The zone it is added in; used only when it has no pin (a pin decides its own zone). */
    zoneId: z.string().uuid().nullable().optional(),
    status: z.enum(['to_target', 'not_interested']).default('to_target'),
    reason: reason.optional(),
    retryAfter: day.nullable().optional(),
    assignedLoginId: z.string().uuid().nullable().optional(),
    note: note.optional(),
    /** Saved although it looks like a lead or garage already known (the warning was seen). */
    allowDuplicate: z.boolean().optional(),
  })
  .strict()
  .refine(pinTogether, { message: 'lat and lng go together', path: ['lat'] })
  .refine((data) => data.status !== 'not_interested' || Boolean(data.reason), {
    message: 'Say why they are not interested',
    path: ['reason'],
  })
  .refine((data) => !data.retryAfter || data.status === 'not_interested', {
    message: 'Try again after goes with Not interested',
    path: ['retryAfter'],
  })

/**
 * PATCH /admin/leads/:id: any of the lead's fields. A pin (or null to
 * clear it) works out the zone again; `zoneId` is for a lead with no pin.
 * `vendorId` links the garage it became (onboarded), null unlinks it.
 */
export const updateLeadSchema = z
  .object({
    actorName: signedActorName,
    name: leadName.optional(),
    phone: phoneInput.nullable().optional(),
    address: z.string().trim().max(LEAD_ADDRESS_MAX).nullable().optional(),
    mapsUrl: mapsUrl.nullable().optional(),
    lat: latitude.nullable().optional(),
    lng: longitude.nullable().optional(),
    zoneId: z.string().uuid().nullable().optional(),
    status: z.enum(['to_target', 'not_interested', 'onboarded']).optional(),
    reason: reason.optional(),
    retryAfter: day.nullable().optional(),
    assignedLoginId: z.string().uuid().nullable().optional(),
    note: note.optional(),
    vendorId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine(pinTogether, { message: 'lat and lng go together', path: ['lat'] })
  .refine((data) => data.status !== 'not_interested' || Boolean(data.reason), {
    message: 'Say why they are not interested',
    path: ['reason'],
  })
  .refine((data) => !data.retryAfter || data.status === 'not_interested', {
    message: 'Try again after goes with Not interested',
    path: ['retryAfter'],
  })

/** POST /admin/leads/resolve-pin: the pin and zone from a Maps link, for Add lead's "Pin found". */
export const resolvePinSchema = z
  .object({ mapsUrl: z.string().trim().min(1).max(2048) })
  .strict()

/** POST /admin/leads/duplicates: what a lead about to be saved looks like. */
export const duplicatesSchema = z
  .object({
    name: z.string().trim().max(LEAD_NAME_MAX).optional(),
    phone: phoneInput.nullable().optional(),
    lat: latitude.nullable().optional(),
    lng: longitude.nullable().optional(),
    zoneId: z.string().uuid().nullable().optional(),
    /** The lead being edited, which is not its own duplicate. */
    excludeLeadId: z.string().uuid().optional(),
  })
  .strict()
  .refine(pinTogether, { message: 'lat and lng go together', path: ['lat'] })

/** POST /admin/leads/paste/preview: what a pasted list would become, line by line. */
export const pastePreviewSchema = z
  .object({
    text: z.string().max(20_000),
    zoneId: z.string().uuid().nullable().optional(),
  })
  .strict()

/** POST /admin/leads/paste: the previewed lines the admin kept. */
export const pasteSaveSchema = z
  .object({
    actorName: signedActorName,
    zoneId: z.string().uuid().nullable(),
    assignedLoginId: z.string().uuid().nullable().optional(),
    rows: z
      .array(
        z
          .object({
            name: leadName,
            phone: phoneInput.nullable(),
            allowDuplicate: z.boolean().optional(),
          })
          .strict()
      )
      .min(1)
      .max(LEAD_PASTE_MAX),
  })
  .strict()

const sourcePart = z
  .object({
    placeId: z.string().trim().min(1).max(300),
    name: z.string().trim().min(1).max(200),
    address: z.string().trim().max(LEAD_ADDRESS_MAX).nullable(),
    phone: z
      .string()
      .regex(/^[0-9]{6,15}$/)
      .nullable(),
    rating: z.number().min(0).max(5).nullable(),
    reviewCount: z.number().int().min(0).nullable(),
    lat: latitude,
    lng: longitude,
  })
  .strict()

/** POST /admin/leads/from-places: ticked finder results become leads in the zone searched. */
export const fromPlacesSchema = z
  .object({
    actorName: signedActorName,
    zoneId: z.string().uuid(),
    assignedLoginId: z.string().uuid().nullable().optional(),
    places: z
      .array(
        z
          .object({ google: sourcePart.nullable(), ola: sourcePart.nullable() })
          .strict()
          .refine(
            (place) => place.google !== null || place.ola !== null,
            'A place from Google or Ola'
          )
      )
      .min(1)
      .max(FROM_PLACES_MAX),
  })
  .strict()

export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>
export type ResolvePinInput = z.infer<typeof resolvePinSchema>
export type DuplicatesInput = z.infer<typeof duplicatesSchema>
export type PastePreviewInput = z.infer<typeof pastePreviewSchema>
export type PasteSaveInput = z.infer<typeof pasteSaveSchema>
export type FromPlacesInput = z.infer<typeof fromPlacesSchema>
export type PlacePart = z.infer<typeof sourcePart>
