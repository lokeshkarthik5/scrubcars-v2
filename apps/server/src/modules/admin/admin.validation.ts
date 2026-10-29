import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import {
  isCalendarDate,
  parseBookingListCursor,
} from '../../lib/booking-ops.js'
import { AT_GARAGE_ADDRESS_MESSAGE, atGarageAddressMissing } from '../../lib/garage-address.js'
import { MAX_PICKUP_RADIUS_KM, MIN_PICKUP_RADIUS_KM } from '../../lib/pickup.js'

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Phone must be a 10-digit number')

// Who on the team brought the garage in (0059): a login's name or free
// text, set by hand. Trimmed; blank or null means not set.
const onboardedByNameSchema = z
  .string()
  .trim()
  .max(100)
  .nullable()
  .transform((value) => (value ? value : null))

const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM')

const serviceBaseSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional(),
  category: z.enum([
    'car_wash',
    'detailing',
    'coating',
    'scratch_removal',
    'others',
  ]),
  pricingType: z.enum(['flat', 'per_vehicle', 'on_inspection']).default('flat'),
  price: z.number().positive().optional(),
  priceHatchback: z.number().positive().optional(),
  priceSedan: z.number().positive().optional(),
  priceSuv: z.number().positive().optional(),
  // Optional (0064): left out or null, the service has no duration, shows
  // "Duration not set" in admin and holds the default 60 minutes in the slot
  // calendar (lib/service-duration.ts). Stored in minutes (the UI offers
  // minute/hour/day units and converts before sending).
  durationMins: z.number().int().positive().max(10_080).nullable().optional(),
  // The service's own commission percent for Statistics (0064), 0 to 50 with
  // at most two decimals; null is the category's rate. Left out leaves it as
  // it is, so an older panel never clears it.
  commissionRate: z
    .number()
    .min(0)
    .max(50)
    // Compared as text: 8.29 * 100 is not 829 in floating point.
    .refine((value) => Number(value.toFixed(2)) === value, 'At most two decimals')
    .nullable()
    .optional(),
})

type ServiceBase = z.infer<typeof serviceBaseSchema>

const refineServicePricing = (data: ServiceBase, ctx: z.RefinementCtx) => {
  if (data.pricingType === 'flat' || data.pricingType === 'on_inspection') {
    if (data.price === undefined || data.price <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: `A positive price is required for '${data.pricingType}' pricing`,
      })
    }
  }
  // Every tier, not just one — see the note in vendors.validation.ts: the
  // booking charge reads the tier matching the customer's vehicle, so a gap
  // would misprice or block that booking.
  if (data.pricingType === 'per_vehicle') {
    const tiers = [
      { key: 'priceHatchback', label: 'Hatchback' },
      { key: 'priceSedan', label: 'Sedan' },
      { key: 'priceSuv', label: 'SUV' },
    ] as const

    for (const { key, label } of tiers) {
      const value = data[key]
      if (typeof value !== 'number' || value <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `A ${label} price is required for per-vehicle pricing`,
        })
      }
    }
  }
}

// Exported for the garage import, which checks each service it read against
// exactly what Create will accept (modules/vendor-imports).
export const serviceInputSchema = serviceBaseSchema.superRefine(refineServicePricing)

// Update variant: an optional `id` marks an existing row to edit in place;
// rows without an `id` are inserted. Existing services omitted from the array
// are deactivated (soft-deleted) — see adminService.updateVendor.
const serviceUpdateSchema = serviceBaseSchema
  .extend({ id: z.string().uuid().optional() })
  .superRefine(refineServicePricing)

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
})

// A pincode, or empty (0064): only an at-garage garage needs one
// (lib/garage-address.ts).
const optionalPincodeSchema = z
  .string()
  .trim()
  .regex(/^(\d{6})?$/, 'Pincode must be a 6-digit number')

export const createVendorSchema = z.object({
  // Business + contact
  ownerName: z.string().trim().min(1).max(255),
  ownerPhone: phoneSchema,
  businessName: z.string().trim().min(1).max(255),
  phone: phoneSchema,
  // Empty for a doorstep-only garage, which needs only its pin (0064); one
  // with at-garage on needs both (the refine below).
  address: z.string().trim().default(''),
  city: z.string().trim().min(1).max(100),
  pincode: optionalPincodeSchema.default(''),
  email: z.string().trim().email().optional(),
  whatsapp: phoneSchema.optional(),
  yearsInOperation: z.string().trim().max(20).optional(),
  mapsUrl: z.string().trim().url().max(2048).optional(),
  // Location. Optional here, unlike the vendor's own onboarding: staff often
  // create a garage record from a phone call and pin it afterwards. The
  // consequence is enforced at verification instead — a garage cannot go live
  // without coordinates.
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
  // Operations
  // Pickup & drop (0037). `pickupEnabled: true` needs `pickupAgreementSigned:
  // true`: the admin's tick that the garage signed the agreement to be
  // responsible for the customer's car from pickup until it is returned.
  // The legacy `pickup` answer is still read from an older panel, under the
  // same rule (lib/pickup.ts legacyPickupIntent).
  pickupEnabled: z.boolean().optional(),
  pickupAgreementSigned: z.boolean().optional(),
  pickup: z.enum(['yes', 'nearby', 'no']).optional(),
  pickupRadiusKm: z.number().min(MIN_PICKUP_RADIUS_KM).max(MAX_PICKUP_RADIUS_KM).optional(),
  // How far this garage travels for doorstep work. Distinct from
  // pickupRadiusKm, which is pickup-and-drop of the vehicle.
  doorstepRadiusKm: z.number().positive().max(100).optional(),
  dropinEnabled: z.boolean().optional(),
  doorstepEnabled: z.boolean().optional(),
  slotIntervalMins: z
    .union([z.literal(30), z.literal(45), z.literal(60)])
    .optional(),
  bays: z.number().int().min(0).optional(),
  jobsPerDay: z.number().int().min(0).optional(),
  vehicleTypes: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  // Working hours: applied to workingDays, closed on the rest
  workingDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  openTime: timeSchema.optional(),
  closeTime: timeSchema.optional(),
  // Onboarding
  status: z.enum(['pending', 'active', 'suspended', 'archived']).optional(),
  isVerified: z.boolean().optional(),
  notes: z.string().trim().max(5000).optional(),
  onboardedByName: onboardedByNameSchema.optional(),
  // Services offered (structured: bookable line items)
  services: z.array(serviceInputSchema).max(50).optional(),
  // The lead this garage was onboarded from (0064, Coverage's "Onboard"):
  // once created, the lead is linked to it and becomes Onboarded.
  leadId: z.string().uuid().optional(),
})
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'lat and lng must be provided together',
  })
  .refine(
    (data) =>
      !atGarageAddressMissing({
        dropinEnabled: data.dropinEnabled === true,
        address: data.address,
        pincode: data.pincode,
      }),
    { message: AT_GARAGE_ADDRESS_MESSAGE, path: ['address'] }
  )

// One day of the week as the garage keeps it, the same shape the vendor's own
// settings save. Closed days still carry times, which are ignored.
const workingHoursDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: timeSchema,
  closeTime: timeSchema,
  isClosed: z.boolean(),
})

// Partial update of an existing vendor. Every field is optional; only the keys
// present in the payload are changed. Nullable fields accept `null` to clear
// them. Owner name/phone update the linked user row.
//
// Hours: `workingHours` sets the named days exactly as given and leaves the
// rest alone; the panel sends it only when the admin changed a day. The older
// `workingDays` + one open/close time rewrites the whole week to a single
// schedule — kept for callers that still send it, but it flattens per-day
// hours, which is how an admin fixing a phone number used to reset a garage's
// Saturday.
export const updateVendorSchema = z.object({
  ownerName: z.string().trim().min(1).max(255).optional(),
  ownerPhone: phoneSchema.optional(),
  businessName: z.string().trim().min(1).max(255).optional(),
  phone: phoneSchema.optional(),
  // May be emptied for a doorstep-only garage; adminService refuses leaving
  // an at-garage one without them (0064).
  address: z.string().trim().optional(),
  city: z.string().trim().min(1).max(100).optional(),
  pincode: optionalPincodeSchema.optional(),
  email: z.string().trim().email().nullable().optional(),
  whatsapp: phoneSchema.nullable().optional(),
  yearsInOperation: z.string().trim().max(20).nullable().optional(),
  mapsUrl: z.string().trim().url().max(2048).nullable().optional(),
  // Pickup & drop, as on create. The edit page saves these on their own, on
  // tap, never with Save changes.
  pickupEnabled: z.boolean().optional(),
  pickupAgreementSigned: z.boolean().optional(),
  pickup: z.enum(['yes', 'nearby', 'no']).nullable().optional(),
  pickupRadiusKm: z
    .number()
    .min(MIN_PICKUP_RADIUS_KM)
    .max(MAX_PICKUP_RADIUS_KM)
    .nullable()
    .optional(),
  doorstepRadiusKm: z.number().positive().max(100).nullable().optional(),
  // Staff correcting a pin on the map. Both or neither — a half-set pair is
  // never anything but a bug.
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
  /**
   * "I looked at this pin and it is right." Stamps `geoConfirmedAt` without
   * moving anything, which is the only way to confirm a pin on a vendor that is
   * already verified — verification is the other writer, and it cannot run
   * twice.
   */
  confirmLocation: z.literal(true).optional(),
  dropinEnabled: z.boolean().optional(),
  doorstepEnabled: z.boolean().optional(),
  slotIntervalMins: z
    .union([z.literal(30), z.literal(45), z.literal(60)])
    .optional(),
  bays: z.number().int().min(0).nullable().optional(),
  jobsPerDay: z.number().int().min(0).nullable().optional(),
  vehicleTypes: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  workingHours: z
    .array(workingHoursDaySchema)
    .min(1)
    .max(7)
    .refine(
      (days) => new Set(days.map((day) => day.dayOfWeek)).size === days.length,
      'Each day can appear only once'
    )
    .optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  openTime: timeSchema.optional(),
  closeTime: timeSchema.optional(),
  status: z.enum(['pending', 'active', 'suspended', 'archived']).optional(),
  isVerified: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  onboardedByName: onboardedByNameSchema.optional(),
  // Full desired set of services. Rows with an `id` are updated, rows without
  // are inserted, and existing services missing from the array are deactivated.
  // Omit the key entirely to leave services untouched.
  services: z.array(serviceUpdateSchema).max(50).optional(),
})
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'lat and lng must be provided together',
  })

// Pausing a garage on its behalf — the owner asked ops to, or ops has a
// reason of its own. The reason is shown on the garage page.
export const pauseVendorSchema = z.object({
  reason: z.string().trim().max(200).optional(),
})

export type PauseVendorInput = z.infer<typeof pauseVendorSchema>

// Hiding a service, or showing a hidden one again. Strict, so a stray field
// (a price, a name) is refused rather than silently ignored: this route only
// ever flips whether customers can see the service.
export const setServiceActiveSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict()

export type SetServiceActiveInput = z.infer<typeof setServiceActiveSchema>

// ─── Media (vendor logo / photos, service images) ────────────────────────────
//
// Same two-step flow the vendor panel uses: presign, PUT to R2, then register
// the returned public URL.

export const uploadUrlSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

export const mediaUrlSchema = z.object({
  url: z.string().url().max(2048),
})

// ─── Bookings ────────────────────────────────────────────────────────────────

/**
 * The bookings list's saved views (0059), All aside. `needs_action`: paid
 * and waiting for the garage, not Test (Today's rule), or a refund owed;
 * `today`: scheduled today (IST); `upcoming`: still to happen, from
 * tomorrow on; `completed` and `cancelled` by status. Today and Upcoming
 * sort soonest first; the rest newest scheduled first.
 */
export const BOOKING_VIEWS = [
  'needs_action',
  'today',
  'upcoming',
  'completed',
  'cancelled',
] as const
export type BookingView = (typeof BOOKING_VIEWS)[number]

// The filters live in the panel's URL, so a hand-edited or mistyped date
// arrives here. One that doesn't exist is a 400, not an Invalid Date for the
// query to choke on.
const istDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')
  .refine(isCalendarDate, 'That date does not exist')

/** How the car is served (0059 filters). */
export const BOOKING_TYPES = ['dropin', 'doorstep', 'pickup'] as const

/**
 * Payment (0059 filters): `paid` online, `pay_later` (on or done with no
 * money in yet, to pay in the app or at the garage) and `refund_owed` (the
 * same refunds owed as needs_action). The rules: paymentCondition in
 * admin.repository.ts.
 */
export const BOOKING_PAYMENTS = ['paid', 'pay_later', 'refund_owed'] as const

/**
 * The filters the list and its views' counts share, so a chip's count is
 * the rows that chip lists.
 */
const bookingFilterShape = {
  status: z
    .enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'])
    .optional(),
  q: z.string().trim().max(100).optional(),
  vendorId: z.string().uuid().optional(),
  from: istDateSchema.optional(),
  to: istDateSchema.optional(),
  // Bookings ops marked "Test": only those, or all but those.
  test: z.enum(['only', 'hide']).optional(),
  bookingType: z.enum(BOOKING_TYPES).optional(),
  payment: z.enum(BOOKING_PAYMENTS).optional(),
}

const fromBeforeTo = (data: { from?: string; to?: string }) =>
  !data.from || !data.to || data.from <= data.to
const fromBeforeToError = {
  message: "'from' must be on or before 'to'",
  path: ['from'],
}

/**
 * Every param is optional, so the panel built before search existed — which
 * sends `status` alone, or nothing — still gets the list it expects.
 *
 * `q` is matched as a booking reference, a customer phone, a customer name and
 * a garage name at once (see parseBookingSearch). `from`/`to` are IST calendar
 * dates on the scheduled time, both inclusive.
 *
 * `cursor` continues the list after a given row (see parseBookingListCursor)
 * and is what the panel pages with. `page` stays for older callers; when a
 * cursor is sent, it is ignored.
 */
export const listBookingsQuerySchema = z
  .object({
    ...bookingFilterShape,
    // A saved view (0059, BOOKING_VIEWS); left out is All.
    // Today and Upcoming sort soonest first, so their cursor runs forwards.
    view: z.enum(BOOKING_VIEWS).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    cursor: z
      .string()
      .max(100)
      .transform((value, ctx) => {
        const cursor = parseBookingListCursor(value)
        if (!cursor) {
          ctx.addIssue({ code: 'custom', message: 'Invalid cursor' })
          return z.NEVER
        }
        return cursor
      })
      .optional(),
  })
  .refine(fromBeforeTo, fromBeforeToError)

export const bookingIdParamSchema = z.object({ id: z.string().uuid() })

/** A garage's holiday, and a booking's extra work, by id (0065). */
export const vendorClosureParamSchema = z.object({ id: z.string().uuid(), closureId: z.string().uuid() })
export const extraWorkParamSchema = z.object({ id: z.string().uuid(), chargeId: z.string().uuid() })

/** Undo the photo waiver (0065): signed by the session. */
export const undoWaiverSchema = z.object({ actorName: signedActorName }).strict()

/** A booking's note (0065): edited or deleted by its author. */
export const bookingNoteParamSchema = z.object({ id: z.string().uuid(), noteId: z.string().uuid() })

/**
 * GET /admin/bookings/views: every filter the list has (status, search,
 * garage, dates, Test, type and payment), so the counts agree with the rows.
 */
export const bookingViewCountsQuerySchema = z
  .object(bookingFilterShape)
  .refine(fromBeforeTo, fromBeforeToError)

/**
 * The reason is required: an admin cancellation is always someone's decision
 * on someone's behalf, and the customer and the garage both read it.
 */
export const adminCancelBookingSchema = z.object({
  onBehalfOf: z.enum(['customer', 'garage', 'detlio']),
  reason: z.string().trim().min(1, 'Give a reason').max(500),
})

export const markNoShowSchema = z.object({
  party: z.enum(['customer', 'garage']),
  note: z.string().trim().max(2000).optional(),
})

/**
 * Detlio confirming a pickup & drop handover for a customer who cannot give
 * the code (lost phone, code locked after wrong tries). Why is required: it
 * goes in the booking's notes with the admin's name.
 */
export const pickupStepOverrideSchema = z.object({
  step: z.enum(['picked_up', 'delivered']),
  note: z.string().trim().min(1, 'Say why the code could not be used').max(500),
})

// Detlio waives the photo standard on one booking (0045): who (the signed-in
// admin, 0058), and why.
export const waiveJobPhotosSchema = z
  .object({
    actorName: signedActorName,
    reason: z.string().trim().min(5, 'Say why the photos are waived').max(500),
  })
  .strict()

export const createBookingNoteSchema = z.object({
  body: z.string().trim().min(1, 'Write a note').max(2000),
})

// ─── Platform admins ─────────────────────────────────────────────────────────
//
// A super_admin row opens both the platform portal and every company. Granted
// only from here, only by an existing super-admin, never self-serve.

export const grantSuperAdminSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Phone must be 10 digits'),
})

export const superAdminIdParamSchema = z.object({ id: z.string().uuid() })

export type GrantSuperAdminInput = z.infer<typeof grantSuperAdminSchema>

export type LoginInput = z.infer<typeof loginSchema>
export type CreateVendorInput = z.infer<typeof createVendorSchema>
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>
export type BookingViewCountsQuery = z.infer<typeof bookingViewCountsQuerySchema>
export type AdminCancelBookingInput = z.infer<typeof adminCancelBookingSchema>
export type MarkNoShowInput = z.infer<typeof markNoShowSchema>
export type CreateBookingNoteInput = z.infer<typeof createBookingNoteSchema>
export type PickupStepOverrideInput = z.infer<typeof pickupStepOverrideSchema>
export type WaiveJobPhotosInput = z.infer<typeof waiveJobPhotosSchema>
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>
export type MediaUrlInput = z.infer<typeof mediaUrlSchema>

// The pilot dashboard's two windows. Anything else is refused rather than
// clamped: a window nobody asked for would be a number nobody can compare.
export const pilotStatsQuerySchema = z.object({
  days: z
    .enum(['7', '30'])
    .default('7')
    .transform((days) => Number(days) as 7 | 30),
})

export type PilotStatsQuery = z.infer<typeof pilotStatsQuerySchema>
