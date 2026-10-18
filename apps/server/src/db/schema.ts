import { relations, sql, type AnyColumn } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  decimal,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import type { AnalyticsEventName, DeviceClass } from '../lib/analytics.js'
import type { ComplaintCategory, ComplaintSource, ComplaintStatus } from '../lib/complaints.js'
import type { GatewayRefundStatus, RefundSource } from '../lib/refunds.js'
import type {
  DocumentContentType,
  DocumentSide,
  DocumentStatus,
  DocumentType,
} from '../lib/vendor-documents.js'
import type { PushAudience, ScheduledPushKind } from '../lib/push.js'
import type { PhotoAngle, PhotoRole } from '../lib/job-photo-standards.js'

// ─── A note on the PostGIS `geo` columns ─────────────────────────────────────
//
// `vendors.geo` and `user_addresses.geo` exist in the database but are
// deliberately NOT declared below. They are `gis.geography(Point,4326)` columns
// GENERATED ALWAYS from lat/lng, with GiST indexes — see drizzle/0019_add_geo.sql,
// which is the source of truth for them.
//
// Leaving them undeclared is the safe default, not an oversight. Drizzle never
// writes a generated column, and every read of one goes through an explicit
// `sql` fragment that selects ST_Distance/ST_DWithin rather than the raw value.
// Declaring them would put them in the implicit SELECT list of every
// `findMany`, so the postgres driver would return an EWKB hex blob that then
// rides along in any API response built by spreading a row — which is exactly
// what the admin endpoints do. Nothing needs the raw geometry client-side.

// ─── Enums ───────────────────────────────────────────────────────────────────

/**
 * Who sees an offer on Home (discounts.home_audience). A text column with a
 * CHECK rather than a pgEnum; the rules for each are in lib/offers.ts.
 */
export const HOME_AUDIENCES = [
  'everyone',
  'new_customers',
  'booked_this_garage',
  'near_this_garage',
  'wash_due',
  'car_type',
] as const

export type HomeAudience = (typeof HOME_AUDIENCES)[number]

/**
 * Which Razorpay mode money was taken in (payments, booking_intents and
 * booking_charges `gateway_mode`, 0032): 'live' or 'test' from the key id the
 * order was opened with, 'fake' for an order the server minted itself under
 * E2E_FAKE_PAYMENTS. Null on rows from before 0032. Only the test-data reset
 * reads it; nothing may branch payment logic on it. A text column with a
 * CHECK, like home_audience.
 */
export const GATEWAY_MODES = ['live', 'test', 'fake'] as const

export type GatewayMode = (typeof GATEWAY_MODES)[number]

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended'])

export const otpPurposeEnum = pgEnum('otp_purpose', [
  'login',
  'register',
  'vendor_onboard',
])

export const vehicleTypeEnum = pgEnum('vehicle_type', [
  'sedan',
  'suv',
  'hatchback',
])

export const vendorStatusEnum = pgEnum('vendor_status', [
  'pending',
  'active',
  'suspended',
  'archived',
])

export const vendorPickupEnum = pgEnum('vendor_pickup', [
  'yes',
  'nearby',
  'no',
])

// Where a set of coordinates came from, and therefore how much to trust it.
// 'unset' is the default and the honest answer for anything never pinned — no
// coordinate is ever guessed on a row's behalf (see plans/geo.md §7).
// 'geocoded' is unused today; it exists so a future bulk partner import can be
// told apart from a human-placed pin.
export const geoSourceEnum = pgEnum('geo_source', [
  'unset',
  'gps',
  'map_pin',
  'geocoded',
  'admin',
])

// 'package' is a shape, not a kind of work: a package row bundles other
// services of this vendor (see servicePackageItems). It lives in the same enum
// so a package books and filters like anything else, at the cost of a package
// not appearing under its members' categories — packages get their own chip.
// Listings that mean "plain services" must exclude it; the booking path must
// not, since a package occupies a slot like any other service.
export const serviceCategoryEnum = pgEnum('service_category', [
  'car_wash',
  'detailing',
  'coating',
  'scratch_removal',
  'others',
  'package',
])

// How a service is priced. 'flat' = one price; 'per_vehicle' = a price per
// vehicle tier (hatchback/sedan/suv); 'on_inspection' = a firm vendor-set
// inspection fee, with the final work quoted after the vehicle is seen. All
// types carry a firm price and are prepaid online (Razorpay).
export const servicePricingTypeEnum = pgEnum('service_pricing_type', [
  'flat',
  'per_vehicle',
  'on_inspection',
])

// How the car and the work meet. 'pickup' (0037) is pickup & drop: the garage
// collects the car from the customer's address, does the work at the garage
// and brings it back (lib/pickup.ts). Labels and every rule keyed on the type
// live in lib/booking-types.ts.
export const bookingTypeEnum = pgEnum('booking_type', ['doorstep', 'dropin', 'pickup'])

export const bookingStatusEnum = pgEnum('booking_status', [
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  // Set on a booking that was moved to a new slot via reschedule. The new
  // booking is a separate row; this one is retired and frees its slot.
  'rescheduled',
])

// Who cancelled a booking. 'vendor' means the vendor rejected/cancelled it,
// 'user' means the customer cancelled it, 'admin' means the Detlio ops team
// did it from the admin panel — see cancelledOnBehalfOfEnum for whose call it
// actually was.
export const cancelledByEnum = pgEnum('cancelled_by', ['user', 'vendor', 'admin'])

// Whose decision an admin cancellation records. Ops often cancels because a
// customer or a garage phoned in, and "cancelled by admin" alone would lose
// that. Set only when cancelled_by = 'admin' (a CHECK in 0026 holds it).
export const cancelledOnBehalfOfEnum = pgEnum('cancelled_on_behalf_of', [
  'customer',
  'garage',
  'detlio',
])

// Who failed to turn up for an accepted booking. The two have opposite money
// consequences: a customer no-show keeps the payment (the garage held the
// slot, and that is the published policy), a garage no-show is always
// refunded in full.
export const noShowPartyEnum = pgEnum('no_show_party', ['customer', 'garage'])

// New bookings always prepay online via Razorpay. 'cash' is retained only so
// historical (pre-online-only) bookings still read correctly.
export const paymentMethodEnum = pgEnum('payment_method', ['online', 'cash'])

export const paymentGatewayEnum = pgEnum('payment_gateway', ['razorpay'])

// A discount is either a percentage off the service price or a flat rupee
// amount off. Both are capped by the engine so at least ₹1 stays payable —
// Razorpay rejects a zero-value order.
export const discountTypeEnum = pgEnum('discount_type', [
  'percentage',
  'fixed',
])

// Who absorbs the discount. 'platform' (the default) means the garage is still
// paid the full pre-discount price and Detlio eats the difference; 'vendor'
// means the garage eats it. Snapshotted onto the booking at creation, so
// editing a live code never rewrites a finished job's payout.
export const discountFundedByEnum = pgEnum('discount_funded_by', [
  'platform',
  'vendor',
])

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'paid',
  'failed',
  'refunded',
  'collected',
])

// Lifecycle of a booking intent — the priced, validated record of what a
// customer is about to buy, written *before* Razorpay opens. 'consumed' means
// the payment landed and the booking exists; 'failed' means the money was
// captured but the booking could not be written (see bookingIntents.bookingId
// and .failureReason), which is a manual-refund case.
export const bookingIntentStatusEnum = pgEnum('booking_intent_status', [
  'pending',
  'consumed',
  'failed',
])

// When a job photo was taken. 'before' is the car as it arrived, 'after' the
// work as it was handed back. They are the garage's evidence in a dispute, so
// the stage is part of the record, not a caption.
export const jobPhotoStageEnum = pgEnum('job_photo_stage', ['before', 'after'])

// What an extra charge on a booking is for: the final bill of an inspection
// job, or extra work the garage asked for mid-job and the customer approved by
// paying it in the app (0041, lib/extra-work.ts).
export const bookingChargeKindEnum = pgEnum('booking_charge_kind', ['final_bill', 'extra_work'])

/**
 * Why a charge stopped standing (booking_charges.cancel_reason, 0041): the
 * garage replaced an unpaid final bill, withdrew an unpaid extra-work
 * request, the customer declined one, or the booking was cancelled or moved
 * with it unpaid. Null on rows cancelled before 0041. A text column with a
 * CHECK, like home_audience.
 */
export const CHARGE_CANCEL_REASONS = ['replaced', 'withdrawn', 'declined', 'booking_closed'] as const

export type ChargeCancelReason = (typeof CHARGE_CANCEL_REASONS)[number]

/**
 * Where a garage's suggested times stand (booking_time_proposals.status,
 * 0041): open until the customer picks one ('accepted'), says none work
 * ('declined'), lets it run out ('expired'), or the garage takes it back
 * ('withdrawn'). 'closed' is one left behind by a booking that changed some
 * other way (the customer cancelled or moved it, or Detlio cancelled it).
 * Text + CHECK; the rules are lib/time-proposals.ts.
 */
export const TIME_PROPOSAL_STATUSES = ['open', 'accepted', 'declined', 'expired', 'withdrawn', 'closed'] as const

export type TimeProposalStatus = (typeof TIME_PROPOSAL_STATUSES)[number]

// Where a charge stands. 'due' waits for the customer to pay in the app;
// 'not_needed' is a bill that came to no more than they already paid, kept as
// the record of what the work cost; 'cancelled' is a bill the garage replaced
// before it was paid. 'paid' is final: a paid bill is never edited.
export const bookingChargeStatusEnum = pgEnum('booking_charge_status', [
  'due',
  'paid',
  'cancelled',
  'not_needed',
])

// Where refunded money had been taken: a booking's own payment, a checkout
// that became no booking, or a final bill. Names which table `target_id` in
// refund_records points into. See 0029.
export const refundKindEnum = pgEnum('refund_kind', ['booking', 'checkout', 'bill'])

// Who a team notice is for: every customer, or customers with a booking in a
// time window (optionally at one garage). See 0031.
export const noticeAudienceEnum = pgEnum('notice_audience', [
  'all',
  'with_booking_between',
])

// The single role vocabulary for the whole product. Values are namespaced by
// scope rather than by context, so a role name never means two different things
// depending on which row you found it in — there is deliberately no bare
// 'admin'. Which scope a value belongs to is a property of the row, enforced by
// the CHECK on userMemberMapping:
//   vendor_admin / vendor_operator ⇒ vendorId IS NOT NULL
//   user / super_admin             ⇒ vendorId IS NULL
export const memberRoleEnum = pgEnum('member_role', [
  'user',
  'super_admin',
  'vendor_admin',
  'vendor_operator',
])

// An enum rather than a boolean so 'revoked' or 'invited' can be added without
// a migration. Every read of the mapping table must filter on 'active' — miss
// it in one place and a suspended member still has access.
export const memberStatusEnum = pgEnum('member_status', [
  'active',
  'suspended',
])

// ─── Tables ──────────────────────────────────────────────────────────────────

/**
 * What was given back on money Detlio took. The same five columns on every
 * table money lands in — a booking's payment, a checkout that became no
 * booking, a final bill — because the refunds list reads them all the same
 * way (lib/refunds.ts). See 0029.
 *
 * `refundedAmount` adds up every refund recorded so far; the rest describe
 * the latest one. `refundRef` is the Razorpay refund id (rfnd_…), or null
 * when the money went back another way and `refundNote` says how.
 * `refundedBy` is a name, like booking_notes.author: the break-glass admin
 * login has no users row. A function, not a shared object, because drizzle
 * binds a column builder to the one table it is first used in.
 */
const refundColumns = () => ({
  refundedAmount: decimal('refunded_amount', { precision: 10, scale: 2 }),
  refundRef: varchar('refund_ref', { length: 64 }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  refundedBy: varchar('refunded_by', { length: 100 }),
  refundNote: text('refund_note'),
})

/**
 * The Razorpay mode column (see GATEWAY_MODES), with its CHECK. A function
 * for the same reason as refundColumns.
 */
const gatewayModeColumn = () => text('gateway_mode').$type<GatewayMode>()

const gatewayModeCheck = (name: string, column: AnyColumn) =>
  check(name, sql`${column} in ('live', 'test', 'fake')`)

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull().unique(),
    email: varchar('email', { length: 255 }),
    // Optional profile picture, stored in R2 like vendor logos.
    avatarUrl: varchar('avatar_url', { length: 2048 }),
    avatarStorageKey: varchar('avatar_storage_key', { length: 1024 }),
    phoneVerified: boolean('phone_verified').default(false).notNull(),
    isCustomer: boolean('is_customer').default(true).notNull(),
    isVendorOwner: boolean('is_vendor_owner').default(false).notNull(),
    // There is deliberately no `is_admin`. Nothing ever wrote it, but it was
    // copied into every OTP-issued session token and trusted by the admin gate —
    // a dormant second path into /admin that one UPDATE would have opened.
    // Platform admin now comes from an active `super_admin` row in
    // user_member_mapping, or from the env-credential break-glass token.
    status: userStatusEnum('status').default('active').notNull(),
    // When the customer last looked at Updates. Anything that happened after
    // it is unread and lights the bell on Home; null reads as the account's
    // own created_at. 0031 set it for every existing account, so the bell did
    // not light up for everyone on launch day.
    updatesSeenAt: timestamp('updates_seen_at', { withTimezone: true }),
    // The customer's two notification switches (0044, Profile →
    // Notifications), for every device they turned browser notifications on
    // for: news about their bookings, and the reminders before one. Both on
    // by default; a device that never subscribed gets nothing either way.
    pushBookingUpdates: boolean('push_booking_updates').default(true).notNull(),
    pushReminders: boolean('push_reminders').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('users_phone_idx').on(table.phone)]
)

export const otpVerifications = pgTable(
  'otp_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: varchar('phone', { length: 20 }).notNull(),
    // A keyed hash of the code (otpDigest, lib/otp.ts), never the code
    // itself; rows from before hashing hold the plain six digits.
    otpCode: varchar('otp_code', { length: 10 }).notNull(),
    purpose: otpPurposeEnum('purpose').notNull(),
    verified: boolean('verified').default(false).notNull(),
    attempts: integer('attempts').default(0).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('otp_verifications_phone_idx').on(table.phone),
    index('otp_verifications_expires_at_idx').on(table.expiresAt),
  ]
)

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    revoked: boolean('revoked').default(false).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_token_hash_idx').on(table.tokenHash),
    index('refresh_tokens_expires_at_idx').on(table.expiresAt),
  ]
)

export const userAddresses = pgTable(
  'user_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 100 }).notNull(),
    address: text('address').notNull(),
    city: varchar('city', { length: 100 }).notNull(),
    // Nullable since 0019. An address with text but no pin is a legitimate
    // state: it books a drop-in slot fine, and only needs coordinates when the
    // customer picks it for doorstep — which is where they get prompted.
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    geoSource: geoSourceEnum('geo_source').default('unset').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('user_addresses_user_id_idx').on(table.userId)]
)

export const userVehicles = pgTable(
  'user_vehicles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    make: varchar('make', { length: 100 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    color: varchar('color', { length: 50 }),
    licensePlate: varchar('license_plate', { length: 20 }),
    vehicleType: vehicleTypeEnum('vehicle_type').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    // Set when a customer removes a car that a booking or intent still points
    // at. Those FKs are ON DELETE RESTRICT so history can never lose the car it
    // was for, which made such a vehicle undeletable; archiving takes it out of
    // the customer's garage without touching what was already booked. A car
    // nothing references is still deleted outright.
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    // How often the customer wants this car washed, for the wash bar on Home:
    // 7, 10, 14, 21 or 30 days. Null is the default (lib/wash-status.ts: 14
    // days, 10 from 1 October to 31 December for the Chennai monsoon).
    washIntervalDays: smallint('wash_interval_days'),
  },
  (table) => [
    index('user_vehicles_user_id_idx').on(table.userId),
    check(
      'user_vehicles_wash_interval_check',
      sql`${table.washIntervalDays} is null or ${table.washIntervalDays} in (7, 10, 14, 21, 30)`
    ),
  ]
)

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    businessName: varchar('business_name', { length: 255 }).notNull(),
    logoUrl: varchar('logo_url', { length: 2048 }),
    logoStorageKey: varchar('logo_storage_key', { length: 1024 }),
    phone: varchar('phone', { length: 20 }).notNull(),
    address: text('address').notNull(),
    city: varchar('city', { length: 100 }).notNull(),
    pincode: varchar('pincode', { length: 10 }).notNull().default(''),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    geoSource: geoSourceEnum('geo_source').default('unset').notNull(),
    // Stamped when an admin confirms the pin on a map. A vendor cannot be
    // verified without coordinates, and listings already require is_verified —
    // which is what keeps pin-less garages out of customer-facing results
    // without any special case in the listing query.
    geoConfirmedAt: timestamp('geo_confirmed_at', { withTimezone: true }),
    whatsapp: varchar('whatsapp', { length: 20 }),
    email: varchar('email', { length: 255 }),
    yearsInOperation: varchar('years_in_operation', { length: 20 }),
    mapsUrl: varchar('maps_url', { length: 2048 }),
    // Pickup & drop (0037): the garage collects the car from the customer and
    // brings it back. On is `pickup` 'yes' (a legacy 'nearby' reads as yes)
    // AND the responsibility terms accepted — see isPickupOffered in
    // lib/pickup.ts and PICKUP_OFFERED in vendors.predicates.ts. 'yes' set at
    // onboarding before 0037, with no terms on file, is not on.
    pickup: vendorPickupEnum('pickup'),
    // How far it collects from, measured from the pin. Null is the default,
    // DEFAULT_PICKUP_RADIUS_KM (10 km), as for doorstep.
    pickupRadiusKm: real('pickup_radius_km'),
    // The garage's tick when pickup was last turned on: "We are responsible
    // for the customer's car from pickup until it is returned". `by` is a
    // name: the garage member who ticked it in the portal, or the admin who
    // recorded the signed agreement ("admin: <name>").
    pickupTermsAcceptedAt: timestamp('pickup_terms_accepted_at', {
      withTimezone: true,
    }),
    pickupTermsAcceptedBy: varchar('pickup_terms_accepted_by', { length: 120 }),
    // How far this garage will travel to a customer for doorstep work.
    // Deliberately separate from pickupRadiusKm, which is pickup-and-drop of the
    // vehicle. The doorstep listing asks "who will come to me", so this is the
    // vendor's number, not a radius the customer chooses.
    doorstepRadiusKm: doublePrecision('doorstep_radius_km'),
    bays: integer('bays'),
    jobsPerDay: integer('jobs_per_day'),
    vehicleTypes: text('vehicle_types').array().notNull().default([]),
    notes: text('notes'),
    isVerified: boolean('is_verified').default(false).notNull(),
    doorstepEnabled: boolean('doorstep_enabled').default(false).notNull(),
    dropinEnabled: boolean('dropin_enabled').default(false).notNull(),
    slotIntervalMins: integer('slot_interval_mins').default(30).notNull(),
    status: vendorStatusEnum('status').default('pending').notNull(),
    // Set while the garage has stopped taking new bookings — the owner (or
    // Detlio ops) flipped "Pause new bookings". Distinct from `status`: a
    // paused garage is still live, its page still loads and its existing
    // bookings carry on; it just drops out of the lists and refuses checkout.
    // Null is "taking bookings". See 0027.
    bookingsPausedAt: timestamp('bookings_paused_at', { withTimezone: true }),
    bookingsPausedReason: varchar('bookings_paused_reason', { length: 200 }),
    // The Bin (0034). Set when admin moved the garage there: off the app for
    // customers and for its own team, everything else about it untouched, so
    // Restore brings back exactly what was there. "In the Bin" is
    // `deletedAt IS NOT NULL`, read through vendors.predicates.ts. Distinct
    // from status 'archived', which only hides it from customers.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // The name typed by whoever moved it (the shared admin login cannot say),
    // and why, if they said. The full record is in admin_audit_log.
    deletedByName: varchar('deleted_by_name', { length: 100 }),
    deletedReason: varchar('deleted_reason', { length: 200 }),
    // Set when it was deleted forever but kept as a tombstone, because real
    // money on it is kept: only its name and address remain, for receipts.
    // A garage with nothing kept is deleted outright instead.
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('vendors_owner_id_idx').on(table.ownerId),
    index('vendors_status_idx').on(table.status),
    index('vendors_deleted_at_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} is not null`),
    // Only a garage in the Bin can be deleted forever.
    check(
      'vendors_purged_in_bin_check',
      sql`${table.purgedAt} is null or ${table.deletedAt} is not null`
    ),
    // The GiST indexes on `geo` live in drizzle/0019_add_geo.sql alongside the
    // column itself; see the note at the top of this file.
  ]
)

// Who can act, where, and with what power. One table for both scopes — a
// garage seat and a Detlio staff grant are the same insert against the same
// index, so there is one resolver, one status filter and one revocation path
// instead of two of each.
//
// `vendorId` is null exactly when the row is platform-scoped. The absence of a
// row *is* the 'user' role: baseline accounts are never materialized, because
// 'user' confers nothing a row-less account does not already have.
export const userMemberMapping = pgTable(
  'user_member_mapping',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Null = platform-scoped (super_admin), meaning every company.
    vendorId: uuid('vendor_id').references(() => vendors.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull(),
    status: memberStatusEnum('status').default('active').notNull(),
    addedBy: uuid('added_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // One role per person per company.
    uniqueIndex('user_member_mapping_vendor_user_key').on(
      table.vendorId,
      table.userId
    ),
    // The composite above does not cover platform rows: Postgres treats NULLs
    // as distinct, so (NULL, user_x) could be inserted repeatedly. This partial
    // index is what makes "one platform role per person" true.
    uniqueIndex('user_member_mapping_platform_user_key')
      .on(table.userId)
      .where(sql`${table.vendorId} is null`),
    index('user_member_mapping_user_id_idx').on(table.userId),
    index('user_member_mapping_vendor_id_idx').on(table.vendorId),
    // Without this, ('vendor_operator', NULL) is representable — a company seat
    // that silently applies to every company. That is the single worst row this
    // schema can hold and it is one typo away in any insert path, so it belongs
    // in the database rather than in a service-layer validation.
    check(
      'user_member_mapping_scope_check',
      sql`(
        (${table.role} in ('vendor_admin', 'vendor_operator') and ${table.vendorId} is not null)
        or
        (${table.role} in ('user', 'super_admin') and ${table.vendorId} is null)
      )`
    ),
  ]
)

// Append-only record of Detlio staff acting inside a customer's company. It is
// the only control on that access — a super_admin resolves as vendor_admin, so
// they can change a garage's prices and read its earnings — which is why it is
// written by the middleware on every such request, never by a handler that
// could forget.
export const internalAccessLog = pgTable(
  'internal_access_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    method: varchar('method', { length: 10 }).notNull(),
    endpoint: varchar('endpoint', { length: 512 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('internal_access_log_user_id_idx').on(table.userId),
    index('internal_access_log_vendor_id_idx').on(table.vendorId),
    index('internal_access_log_created_at_idx').on(table.createdAt),
  ]
)

export const vendorWorkingHours = pgTable(
  'vendor_working_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    openTime: time('open_time').notNull(),
    closeTime: time('close_time').notNull(),
    isClosed: boolean('is_closed').default(false).notNull(),
  },
  (table) => [
    index('vendor_working_hours_vendor_id_idx').on(table.vendorId),
    uniqueIndex('vendor_working_hours_vendor_day_idx').on(
      table.vendorId,
      table.dayOfWeek
    ),
  ]
)

// Single days a garage is shut on top of its weekly off days: a festival, a
// family function, a day the power is out. A date here offers no slots and
// refuses checkout, exactly like a weekly closed day.
//
// `date` is the garage's calendar day in IST — the same day key the slot
// picker and the booking checks use (see getDateKeyFromScheduledAt). Adding
// one never touches bookings already on that day: the garage is shown them
// and sorts them out with the customers.
export const vendorClosures = pgTable(
  'vendor_closures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    reason: varchar('reason', { length: 200 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('vendor_closures_vendor_date_key').on(
      table.vendorId,
      table.date
    ),
  ]
)

export const vendorServiceAreas = pgTable(
  'vendor_service_areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    areaName: varchar('area_name', { length: 255 }).notNull(),
    pincode: varchar('pincode', { length: 10 }).notNull(),
    radiusKm: real('radius_km'),
  },
  (table) => [index('vendor_service_areas_vendor_id_idx').on(table.vendorId)]
)

export const vendorPhotos = pgTable(
  'vendor_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    url: varchar('url', { length: 2048 }).notNull(),
    storageKey: varchar('storage_key', { length: 1024 }),
    sortOrder: integer('sort_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('vendor_photos_vendor_id_idx').on(table.vendorId)]
)

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    category: serviceCategoryEnum('category').notNull(),
    pricingType: servicePricingTypeEnum('pricing_type')
      .default('flat')
      .notNull(),
    // Base/display price. For 'flat'/'on_inspection' the fixed price, for
    // 'per_vehicle' the cheapest tier (denormalized so the "from ₹X" listing
    // math keeps working).
    price: decimal('price', { precision: 10, scale: 2 }).notNull(),
    // Per-vehicle tier prices, used only when pricingType = 'per_vehicle'.
    priceHatchback: decimal('price_hatchback', { precision: 10, scale: 2 }),
    priceSedan: decimal('price_sedan', { precision: 10, scale: 2 }),
    priceSuv: decimal('price_suv', { precision: 10, scale: 2 }),
    durationMins: integer('duration_mins').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
  },
  (table) => [
    index('services_vendor_id_idx').on(table.vendorId),
    index('services_category_idx').on(table.category),
  ]
)

// Photos and videos of the work a service produces, shown on the garage page
// (a thumbnail on the service card, the media area in its details sheet).
// Named for what it first held; since 0033 a row is a photo (`kind = 'image'`,
// an R2 object) or a video (`kind = 'video'`, a Cloudflare Stream upload).
// At most R2_MAX_IMAGES_PER_SERVICE photos and one video per service, checked
// in the service layer under a row lock on the service (lib/service-media.ts,
// modules/service-media) rather than by a constraint, so the limits can move
// without a migration. Cascade-deleted with the service; the R2 objects and
// Stream videos behind the rows are removed best-effort alongside.
//
// `source = 'ai'` is a picture made with AI by admin: customers see it tagged
// "Sample image". `consent_confirmed_at` is when the privacy tick ("no number
// plates or faces can be read, or the owner agreed") was given, and
// `uploaded_by` who added it (an admin's name, or 'garage'). Neither is ever
// in a customer-facing response.
export const SERVICE_MEDIA_KINDS = ['image', 'video'] as const
export type ServiceMediaKind = (typeof SERVICE_MEDIA_KINDS)[number]
export const SERVICE_MEDIA_SOURCES = ['upload', 'ai'] as const
export type ServiceMediaSource = (typeof SERVICE_MEDIA_SOURCES)[number]
export const VIDEO_STATUSES = ['processing', 'ready', 'error'] as const
export type VideoStatus = (typeof VIDEO_STATUSES)[number]

export const serviceImages = pgTable(
  'service_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    // A photo's public R2 URL; a video's HLS manifest on Stream.
    url: varchar('url', { length: 2048 }).notNull(),
    storageKey: varchar('storage_key', { length: 1024 }),
    sortOrder: integer('sort_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    kind: text('kind').$type<ServiceMediaKind>().default('image').notNull(),
    source: text('source').$type<ServiceMediaSource>().default('upload').notNull(),
    consentConfirmedAt: timestamp('consent_confirmed_at', { withTimezone: true }),
    uploadedBy: varchar('uploaded_by', { length: 100 }),
    videoUid: varchar('video_uid', { length: 64 }),
    videoStatus: text('video_status').$type<VideoStatus>(),
    videoError: varchar('video_error', { length: 200 }),
    durationSecs: integer('duration_secs'),
    posterUrl: varchar('poster_url', { length: 2048 }),
  },
  (table) => [
    index('service_images_service_id_idx').on(table.serviceId),
    uniqueIndex('service_images_video_uid_idx')
      .on(table.videoUid)
      .where(sql`${table.videoUid} IS NOT NULL`),
    check('service_images_kind_check', sql`${table.kind} in ('image', 'video')`),
    check('service_images_source_check', sql`${table.source} in ('upload', 'ai')`),
    check(
      'service_images_video_status_check',
      sql`${table.videoStatus} in ('processing', 'ready', 'error')`
    ),
  ]
)

// Composition of a package. `packageId` is a services row with
// category = 'package'; `serviceId` is one of the plain services it bundles.
// Members are restrict-deleted so a package can never silently lose contents,
// and the package's own price is independent — the members are read only to
// itemize the contents and compute savings against their current prices.
export const servicePackageItems = pgTable(
  'service_package_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    packageId: uuid('package_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('service_package_items_package_id_idx').on(table.packageId),
    index('service_package_items_service_id_idx').on(table.serviceId),
    uniqueIndex('service_package_items_package_service_key').on(
      table.packageId,
      table.serviceId
    ),
  ]
)

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    // Deprecated in favour of `booking_items`, and nullable so it can be
    // dropped without another schema change. Still written with the first
    // item so every existing reader keeps working; see 0024.
    serviceId: uuid('service_id').references(() => services.id, {
      onDelete: 'restrict',
    }),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => userVehicles.id, { onDelete: 'restrict' }),
    bookingType: bookingTypeEnum('booking_type').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    // The sum of the items' durations, snapshot at write time. The overlap
    // check reads this rather than joining `services`, so a vendor editing a
    // duration cannot move an existing booking's window.
    durationMins: integer('duration_mins').notNull(),
    status: bookingStatusEnum('status').default('pending').notNull(),
    // `amount` is what the customer is actually charged — payments.amount, the
    // Razorpay order and the "Pay Now" button all read it. The pre-discount
    // figure lives in `subtotalAmount`, and the invariant is
    //   amount = subtotalAmount - discountAmount.
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    subtotalAmount: decimal('subtotal_amount', {
      precision: 10,
      scale: 2,
    }).notNull(),
    discountAmount: decimal('discount_amount', { precision: 10, scale: 2 })
      .default('0.00')
      .notNull(),
    discountId: uuid('discount_id').references(() => discounts.id, {
      onDelete: 'set null',
    }),
    // Snapshots taken at booking time. The code is denormalized so the receipt
    // and the admin booking list need no join; the funding is denormalized so
    // an admin editing the code later cannot retroactively change what this
    // garage was owed.
    discountCode: varchar('discount_code', { length: 40 }),
    discountFundedBy: discountFundedByEnum('discount_funded_by'),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    lat: real('lat'),
    lng: real('lng'),
    address: text('address'),
    cancelledBy: cancelledByEnum('cancelled_by'),
    cancellationReason: text('cancellation_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    // Only on an admin cancellation: whose call it was. See the enum.
    cancelledOnBehalfOf: cancelledOnBehalfOfEnum('cancelled_on_behalf_of'),
    // Set when ops marks an accepted booking as a no-show, which also cancels
    // it. Null on every other booking, cancelled or not.
    noShow: noShowPartyEnum('no_show'),
    noShowMarkedAt: timestamp('no_show_marked_at', { withTimezone: true }),
    // Reschedule chain. `originalBookingId` points to the first booking in the
    // chain (null on the original itself); every reschedule shares the same
    // root. `rescheduleCount` is that booking's position in the chain (0 for
    // the original, 1 for the first reschedule, ...), mirroring the count of
    // booking_reschedules rows for the chain.
    originalBookingId: uuid('original_booking_id'),
    rescheduledFromId: uuid('rescheduled_from_id'),
    rescheduleCount: integer('reschedule_count').default(0).notNull(),
    // Which *person* moved the job, not which company. With a team, "who
    // accepted this?" is otherwise unanswerable, and backfilling it later is
    // impossible. Written by the vendor action handlers from the authenticated
    // user; null on every booking that predates the team model.
    acceptedBy: uuid('accepted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedBy: uuid('completed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    // When each step of the job happened, written by the same conditional
    // update that moves the status (see 0028). Null on bookings that never
    // reached the step, and on every booking from before the column existed —
    // an old job has no recorded time rather than a made-up one.
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // Pickup & drop (0037). Only a 'pickup' booking has any of these (CHECK).
    // The handover steps, each written by the conditional update that takes
    // it (lib/pickup.ts pickupStepRefusal): Picked up and At garage while the
    // booking is confirmed, then the normal work (in progress), then Out for
    // delivery and Delivered, which completes it.
    pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
    atGarageAt: timestamp('at_garage_at', { withTimezone: true }),
    outForDeliveryAt: timestamp('out_for_delivery_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    // The customer's 4-digit handover codes, made by the server when the
    // booking is written. The garage types the pickup code to take the car
    // and the delivery code to hand it back; only the customer's own booking
    // payload carries them — never the garage's, never admin's. Plain, not
    // hashed, because the customer's app has to show them. Wrong tries are
    // counted, and at MAX_CODE_ATTEMPTS the step needs Detlio (an admin
    // override, which records who).
    pickupCode: varchar('pickup_code', { length: 4 }),
    deliveryCode: varchar('delivery_code', { length: 4 }),
    pickupCodeAttempts: smallint('pickup_code_attempts').default(0).notNull(),
    deliveryCodeAttempts: smallint('delivery_code_attempts').default(0).notNull(),
    // Set when Detlio confirmed a code step in admin because the customer
    // could not give the code: the admin's name, like booking_notes.author.
    pickupOverrideBy: varchar('pickup_override_by', { length: 100 }),
    deliveryOverrideBy: varchar('delivery_override_by', { length: 100 }),
    // The customer closed the "Rate your wash" card on Home without rating.
    // Only hides the prompt: they can still review from the booking.
    reviewPromptDismissedAt: timestamp('review_prompt_dismissed_at', {
      withTimezone: true,
    }),
    // Marked "Test" by ops (0032): left out of the pilot numbers, and
    // deletable through the test-data reset's dry run. Set on every booking
    // of the reschedule chain at once, and copied onto the booking a
    // reschedule writes. Display and stats only: it never changes slots,
    // refunds or receipts. `markedTestBy` is a name, like booking_notes.author.
    markedTestAt: timestamp('marked_test_at', { withTimezone: true }),
    markedTestBy: varchar('marked_test_by', { length: 100 }),
    // The garage's deadline to answer (0042, lib/response-deadline.ts): set
    // when the booking becomes paid and pending (the payment landing, or the
    // customer's reschedule back to pending), from GARAGE_RESPONSE_MINUTES of
    // its opening hours, never later than an hour before the slot (with a
    // 15-minute floor from payment). Null on every booking from before 0042,
    // on unpaid ones and on a time the garage suggested itself: no deadline,
    // never backfilled.
    respondBy: timestamp('respond_by', { withTimezone: true }),
    // Set only by the pending-digest cron's auto-cancel (AUTO_CANCEL_UNANSWERED)
    // when the garage did not answer by `respondBy`: the booking was cancelled
    // as the garage's ('vendor'), refunded in full, "Not accepted in time".
    // Its own column, not the reason text, so admin, the garage, the customer
    // and the morning roll-up tell it apart from a garage pressing Reject.
    responseMissedAt: timestamp('response_missed_at', { withTimezone: true }),
    // Detlio waived the photo standard on this booking (0045): Start and
    // Complete no longer wait for the garage's photos. The admin's typed
    // name and the reason, like the Bin's; all three or none (CHECK).
    photosWaivedAt: timestamp('photos_waived_at', { withTimezone: true }),
    photosWaivedBy: varchar('photos_waived_by', { length: 100 }),
    photosWaivedReason: varchar('photos_waived_reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('bookings_user_id_idx').on(table.userId),
    // Home and Updates read one customer's bookings, newest first, on every
    // open.
    index('bookings_user_scheduled_at_idx').on(
      table.userId,
      table.scheduledAt.desc()
    ),
    index('bookings_vendor_id_idx').on(table.vendorId),
    index('bookings_vendor_scheduled_at_idx').on(
      table.vendorId,
      table.scheduledAt
    ),
    index('bookings_status_idx').on(table.status),
    index('bookings_original_booking_id_idx').on(table.originalBookingId),
    // Finds the booking a cancelled one was moved to: a moved booking's payment
    // went with it, so the refunds list must not count it as owed. See 0029.
    index('bookings_rescheduled_from_id_idx').on(table.rescheduledFromId),
    index('bookings_discount_id_idx').on(table.discountId),
    index('bookings_marked_test_at_idx')
      .on(table.markedTestAt)
      .where(sql`${table.markedTestAt} is not null`),
    // An on-behalf-of or a no-show without an admin cancellation would be a
    // record of something nobody did. See 0026 for why the comparison is on
    // ::text.
    check(
      'bookings_cancelled_on_behalf_of_admin_check',
      sql`${table.cancelledOnBehalfOf} is null or ${table.cancelledBy}::text = 'admin'`
    ),
    check(
      'bookings_no_show_admin_check',
      sql`${table.noShow} is null or ${table.cancelledBy}::text = 'admin'`
    ),
    // Handover steps and codes belong to pickup & drop only (0037; ::text
    // for the same reason as above: 'pickup' is added in the same file).
    check(
      'bookings_pickup_fields_check',
      sql`${table.bookingType}::text = 'pickup' or (${table.pickupCode} is null and ${table.deliveryCode} is null and ${table.pickedUpAt} is null and ${table.atGarageAt} is null and ${table.outForDeliveryAt} is null and ${table.deliveredAt} is null)`
    ),
    // The pending-digest sweep reads paid pending bookings by their deadline
    // (0042); the morning roll-up counts yesterday's auto-cancels.
    index('bookings_respond_by_pending_idx')
      .on(table.respondBy)
      .where(sql`${table.status} = 'pending' and ${table.respondBy} is not null`),
    index('bookings_response_missed_at_idx')
      .on(table.responseMissedAt)
      .where(sql`${table.responseMissedAt} is not null`),
    // Only the auto-cancel sets it, and it cancels as the garage (0042).
    check(
      'bookings_response_missed_check',
      sql`${table.responseMissedAt} is null or (${table.status}::text = 'cancelled' and ${table.cancelledBy}::text = 'vendor' and ${table.respondBy} is not null)`
    ),
    check(
      'bookings_photos_waived_check',
      sql`(${table.photosWaivedAt} is null and ${table.photosWaivedBy} is null and ${table.photosWaivedReason} is null) or (${table.photosWaivedAt} is not null and ${table.photosWaivedBy} is not null and ${table.photosWaivedReason} is not null)`
    ),
    check(
      'bookings_handover_codes_check',
      sql`(${table.pickupCode} is null or ${table.pickupCode} ~ '^[0-9]{4}$') and (${table.deliveryCode} is null or ${table.deliveryCode} ~ '^[0-9]{4}$')`
    ),
  ]
)

// The ops team's own notes on a booking: complaints, calls made, what was
// agreed. Internal only — no customer or garage payload ever includes them.
//
// `author` is a name, not a user id: the break-glass admin login has no users
// row, and a note has to say who wrote it either way.
export const bookingNotes = pgTable(
  'booking_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    author: varchar('author', { length: 100 }).notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('booking_notes_booking_id_created_at_idx').on(
      table.bookingId,
      table.createdAt
    ),
  ]
)

// Photos a garage takes of a job: the car before the work and after it. They
// are evidence if a customer later disputes what was done, so a row is never
// edited — a wrong photo is removed and another taken — and the garage can
// only add or remove them for a week after the job is finished (see
// lib/job-records.ts for the rules).
//
// `storage_key` is the object in R2, under vendors/<vendorId>/job-photos/
// <bookingId>/, which is how the API knows a key it is handed belongs to this
// booking. `uploaded_by` is the person, not the company, for the same reason
// as bookings.accepted_by.
export const jobPhotos = pgTable(
  'job_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    stage: jobPhotoStageEnum('stage').notNull(),
    storageKey: text('storage_key').notNull(),
    url: text('url').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Whose photo it is (0045): the garage's (every row before 0045) or the
    // customer's own record of the car. Only the garage's count toward the
    // photo standard (lib/job-photo-standards.ts).
    uploadedByRole: text('uploaded_by_role').$type<PhotoRole>().default('garage').notNull(),
    // The guided angle it was taken from (0045), or null for an extra photo.
    angle: text('angle').$type<PhotoAngle>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Every read is "this booking's photos, by stage, oldest first", and the
    // per-stage cap counts the same rows.
    index('job_photos_booking_stage_created_at_idx').on(
      table.bookingId,
      table.stage,
      table.createdAt
    ),
    // The gates and the per-side caps count one side's photos of a stage
    // (0045); photo compliance counts the garage's per job.
    index('job_photos_booking_role_stage_idx').on(
      table.bookingId,
      table.uploadedByRole,
      table.stage
    ),
    check('job_photos_uploaded_by_role_check', sql`${table.uploadedByRole} in ('garage', 'customer')`),
    check(
      'job_photos_angle_check',
      sql`${table.angle} is null or ${table.angle} in ('front', 'back', 'left', 'right', 'interior')`
    ),
  ]
)

// Money asked of the customer after checkout. Today that is only the final
// bill of an inspection job: the customer prepaid the inspection fee, the
// garage looked at the car and did the work, and this is what it came to.
//
// The figures are snapshots, written once. `paid_before` is what the booking
// already covered toward the bill when it was raised: its price before any
// promo discount, once its payment landed (creditAtBooking in
// lib/final-bill.ts), so a discount is never charged back. `amount_due` is
// max(0, total_amount − paid_before), what is left to pay in the app. A bill
// that comes to no more than that is 'not_needed': there is nothing to pay
// and nothing is refunded (the inspection fee is the minimum), but the record
// of what the work cost is kept.
//
// A garage can replace an unpaid bill: the old row is cancelled and a new one
// written, so the history of what the customer was shown survives. At most
// one bill per booking is ever live (partial unique index below). The
// Razorpay ids are unique because they are how the webhook finds the bill
// when the app never comes back to confirm it.
export const bookingCharges = pgTable(
  'booking_charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    kind: bookingChargeKindEnum('kind').notNull(),
    totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
    paidBefore: decimal('paid_before', { precision: 10, scale: 2 }).notNull(),
    amountDue: decimal('amount_due', { precision: 10, scale: 2 }).notNull(),
    // [{ description, amount }], as the garage typed them. Amounts are decimal
    // strings, like every other money column.
    lines: jsonb('lines')
      .$type<Array<{ description: string; amount: string }>>()
      .notNull(),
    note: text('note'),
    status: bookingChargeStatusEnum('status').notNull(),
    gatewayOrderId: varchar('gateway_order_id', { length: 255 }).unique(),
    gatewayPaymentId: varchar('gateway_payment_id', { length: 255 }).unique(),
    // The Razorpay mode of the bill's order (see GATEWAY_MODES), from 0032.
    gatewayMode: gatewayModeColumn(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    // Extra work only (0041): up to three photos of what the garage found,
    // uploaded into the booking's job-photos folder. Empty on a final bill.
    photos: jsonb('photos')
      .$type<Array<{ storageKey: string; url: string }>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    // When and why it stopped standing (0041; see CHARGE_CANCEL_REASONS).
    // Null on rows that never did, and on ones cancelled before 0041.
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason').$type<ChargeCancelReason>(),
    // Money given back on this bill: a paid bill on a booking that was then
    // cancelled, or a payment that landed on a replaced or withdrawn bill.
    // The bill's status is left as it is — it records what happened to the
    // bill, and the refund is recorded beside it.
    ...refundColumns(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('booking_charges_booking_id_idx').on(table.bookingId),
    // One live final bill per booking. Replacing one cancels the old row in
    // the same transaction, so two garage members raising a bill at once
    // cannot both succeed.
    uniqueIndex('booking_charges_one_live_final_bill')
      .on(table.bookingId)
      .where(sql`${table.kind} = 'final_bill' and ${table.status} <> 'cancelled'`),
    gatewayModeCheck('booking_charges_gateway_mode_check', table.gatewayMode),
    check(
      'booking_charges_cancel_reason_check',
      sql`${table.cancelReason} is null or (${table.status} = 'cancelled' and ${table.cancelReason} in ('replaced', 'withdrawn', 'declined', 'booking_closed'))`
    ),
    // At most three photos, and only on extra work (::text: 'extra_work' is
    // added in the same migration).
    check(
      'booking_charges_photos_check',
      sql`jsonb_typeof(${table.photos}) = 'array' and jsonb_array_length(${table.photos}) <= 3 and (${table.kind}::text = 'extra_work' or jsonb_array_length(${table.photos}) = 0)`
    ),
  ]
)

// The services a booking was actually sold, one row each.
//
// Name, price and duration are snapshots, not joins: a vendor renaming or
// repricing a service afterwards must not change what a past booking says it
// charged. `amount` is the pre-discount line price — the discount is resolved
// against the order total and lives on the booking, so the lines always sum to
// `bookings.subtotal_amount`.
export const bookingItems = pgTable(
  'booking_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 255 }).notNull(),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    durationMins: integer('duration_mins').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('booking_items_booking_id_idx').on(table.bookingId),
    index('booking_items_service_id_idx').on(table.serviceId),
    // A service appears at most once per booking. There is no quantity
    // concept: two coats of polish is a different service, not the same one
    // twice.
    uniqueIndex('booking_items_booking_service_key').on(
      table.bookingId,
      table.serviceId
    ),
  ]
)

// One row per successful reschedule. This is the source of truth for the
// "max 2 reschedules" cap: the count for a chain equals the number of rows
// whose originalBookingId matches the chain root.
export const bookingReschedules = pgTable(
  'booking_reschedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    originalBookingId: uuid('original_booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    fromBookingId: uuid('from_booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    toBookingId: uuid('to_booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason'),
    // Set when the move was the customer picking one of the garage's
    // suggested times (0041). Such a move is the garage's doing, so it does
    // not count toward the customer's two reschedules.
    proposalId: uuid('proposal_id').references(() => bookingTimeProposals.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('booking_reschedules_original_idx').on(table.originalBookingId),
  ]
)

// Other times a garage suggested instead of declining a booking (0041).
//
// On a pending, paid booking the garage can offer one to three of its own
// free slots for the same job. The customer picks one, which moves the
// booking there through the reschedule path, already accepted; or says none
// work, which cancels it as the garage's decline with a full refund. Left
// unanswered, it expires at `expires_at` (the earliest option less its
// booking type's notice, or 12 hours, whichever is sooner) and the booking is
// cancelled the same way by the pending-digest cron. Rules in
// lib/time-proposals.ts.
//
// `slots` are ISO start times, soonest first. One open proposal per booking
// (partial unique index). `result_booking_id` is the booking a pick moved
// to. The row cascades with its booking, so the test-data reset and
// account deletion take it with the chain.
export const bookingTimeProposals = pgTable(
  'booking_time_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    slots: jsonb('slots').$type<string[]>().notNull(),
    note: varchar('note', { length: 200 }),
    status: text('status').$type<TimeProposalStatus>().default('open').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // The person at the garage who suggested them, like accepted_by.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    chosenSlot: timestamp('chosen_slot', { withTimezone: true }),
    resultBookingId: uuid('result_booking_id').references(() => bookings.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('booking_time_proposals_booking_id_idx').on(table.bookingId),
    uniqueIndex('booking_time_proposals_one_open')
      .on(table.bookingId)
      .where(sql`${table.status} = 'open'`),
    // The cron's sweep reads open ones by when they run out.
    index('booking_time_proposals_open_expires_idx')
      .on(table.expiresAt)
      .where(sql`${table.status} = 'open'`),
    check(
      'booking_time_proposals_status_check',
      sql`${table.status} in ('open', 'accepted', 'declined', 'expired', 'withdrawn', 'closed')`
    ),
    check(
      'booking_time_proposals_slots_check',
      sql`jsonb_typeof(${table.slots}) = 'array' and jsonb_array_length(${table.slots}) between 1 and 3`
    ),
    check(
      'booking_time_proposals_resolved_check',
      sql`(${table.status} = 'open') = (${table.resolvedAt} is null)`
    ),
    check(
      'booking_time_proposals_chosen_check',
      sql`(${table.status} = 'accepted') = (${table.chosenSlot} is not null)`
    ),
  ]
)

// An admin-created promo code. Every discount requires the customer to type
// its code — there are no automatic, code-less discounts, and a booking can
// carry at most one code (see discountRedemptions.bookingId).
//
// The effect columns are nullable because only one kind applies at a time;
// which one is required is enforced by check constraints in the migration and
// by the create/update Zod schemas.
export const discounts = pgTable(
  'discounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 40 }).notNull(),
    description: text('description'),
    discountType: discountTypeEnum('discount_type').notNull(),
    // 20.00 = 20%. Capped at 99 so a booking always has ≥ ₹1 left to charge.
    percentOff: decimal('percent_off', { precision: 5, scale: 2 }),
    amountOff: decimal('amount_off', { precision: 10, scale: 2 }),
    // Ceiling on a percentage effect; null = uncapped.
    maxDiscountAmount: decimal('max_discount_amount', {
      precision: 10,
      scale: 2,
    }),
    minOrderAmount: decimal('min_order_amount', { precision: 10, scale: 2 }),
    // null = unlimited on both limits; 1 = once per customer.
    perUserLimit: integer('per_user_limit'),
    totalUsageLimit: integer('total_usage_limit'),
    // null = valid at every garage.
    vendorId: uuid('vendor_id').references(() => vendors.id, {
      onDelete: 'cascade',
    }),
    fundedBy: discountFundedByEnum('funded_by').default('platform').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    // Off switch that preserves history — prefer it over delete.
    isActive: boolean('is_active').default(true).notNull(),
    // ─── Offers on Home (0031) ───────────────────────────────────────────────
    // An admin can show a code as an offer card on the customer Home. The
    // card's title is `homeTitle`; everything else on it (cap, code, end
    // date) is generated from the columns above, so it can never misstate a
    // limit. Shown only with an end date. See lib/offers.ts.
    showOnHome: boolean('show_on_home').default(false).notNull(),
    homeTitle: varchar('home_title', { length: 40 }),
    // 0 Normal, 1 High, 2 Top. Higher shows first.
    homePriority: smallint('home_priority').default(0).notNull(),
    // Who SEES the offer on Home — never who may use the code at checkout.
    // Anything but 'everyone' is ignored, and refused on save, while the
    // HOME_OFFER_TARGETING switch is off. Text with a CHECK, not an enum,
    // so a new audience needs no ALTER TYPE.
    homeAudience: text('home_audience')
      .$type<HomeAudience>()
      .default('everyone')
      .notNull(),
    // 'near_this_garage' only: how many km from the garage counts as near.
    homeAudienceRadiusKm: smallint('home_audience_radius_km'),
    // 'car_type' only: which car types see it.
    homeAudienceVehicleTypes: text('home_audience_vehicle_types')
      .array()
      .$type<Array<'hatchback' | 'sedan' | 'suv'>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // The case-insensitive unique index on lower(code) lives in the migration:
    // drizzle cannot express a functional index here. Do not add a plain
    // unique() to `code` — it would disagree with the database.
    index('discounts_is_active_idx').on(table.isActive),
    index('discounts_vendor_id_idx').on(table.vendorId),
    index('discounts_on_home_idx')
      .on(table.endsAt)
      .where(sql`${table.showOnHome} and ${table.isActive}`),
    check(
      'discounts_home_fields_check',
      sql`not ${table.showOnHome} or (char_length(btrim(coalesce(${table.homeTitle}, ''))) between 3 and 40 and ${table.endsAt} is not null)`
    ),
    check(
      'discounts_home_priority_check',
      sql`${table.homePriority} between 0 and 2`
    ),
    // The garage audiences need a garage; the radius belongs to
    // 'near_this_garage' alone and the car types to 'car_type' alone.
    check(
      'discounts_home_audience_check',
      sql`${table.homeAudience} in ('everyone', 'new_customers', 'booked_this_garage', 'near_this_garage', 'wash_due', 'car_type')
        and (${table.homeAudience} not in ('booked_this_garage', 'near_this_garage') or ${table.vendorId} is not null)
        and ((${table.homeAudience} = 'near_this_garage') = (${table.homeAudienceRadiusKm} is not null))
        and (${table.homeAudienceRadiusKm} is null or ${table.homeAudienceRadiusKm} between 1 and 50)
        and ((${table.homeAudience} = 'car_type') = (${table.homeAudienceVehicleTypes} is not null))
        and (${table.homeAudienceVehicleTypes} is null or (cardinality(${table.homeAudienceVehicleTypes}) >= 1 and ${table.homeAudienceVehicleTypes} <@ array['hatchback', 'sedan', 'suv']::text[]))`
    ),
  ]
)

// Append-only audit: one row per booking that used a code. The unique
// bookingId is what enforces "one code per booking", and the RESTRICT on
// discountId is what stops a redeemed code being deleted out from under it.
export const discountRedemptions = pgTable(
  'discount_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    discountId: uuid('discount_id')
      .notNull()
      .references(() => discounts.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    discountAmount: decimal('discount_amount', {
      precision: 10,
      scale: 2,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('discount_redemptions_discount_id_idx').on(table.discountId),
    index('discount_redemptions_user_discount_idx').on(
      table.userId,
      table.discountId
    ),
  ]
)

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    gateway: paymentGatewayEnum('gateway').notNull(),
    gatewayTxnId: varchar('gateway_txn_id', { length: 255 }),
    // The Razorpay mode of the order this was paid through (see
    // GATEWAY_MODES), from 0032. A reschedule copies it with the payment.
    gatewayMode: gatewayModeColumn(),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    status: paymentStatusEnum('status').default('pending').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    // A full refund also moves `status` to 'refunded'; a part refund leaves
    // it 'paid'. A reschedule copies the payment to the new booking but never
    // these: a moved booking is not refunded, its payment goes with it.
    ...refundColumns(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('payments_booking_id_idx').on(table.bookingId),
    index('payments_status_idx').on(table.status),
    gatewayModeCheck('payments_gateway_mode_check', table.gatewayMode),
  ]
)

// A booking that has been validated and priced but not yet paid for.
//
// Bookings used to be written before Razorpay opened, so abandoning the
// checkout sheet left a live request in front of the garage, a held promo code
// and a vehicle lock that blocked the customer's own retry. The intent holds
// none of those: it is inert until the money lands, at which point
// `confirmIntent` turns it into a booking + a paid payment in one transaction.
//
// Every priced figure is snapshotted here rather than recomputed at capture
// time, so a vendor editing a price or duration mid-checkout cannot change what
// the customer already agreed to pay.
export const bookingIntents = pgTable(
  'booking_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => userVehicles.id, { onDelete: 'restrict' }),
    bookingType: bookingTypeEnum('booking_type').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    serviceDurationMins: integer('service_duration_mins').notNull(),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    subtotalAmount: decimal('subtotal_amount', {
      precision: 10,
      scale: 2,
    }).notNull(),
    discountAmount: decimal('discount_amount', { precision: 10, scale: 2 })
      .default('0.00')
      .notNull(),
    discountId: uuid('discount_id').references(() => discounts.id, {
      onDelete: 'set null',
    }),
    discountCode: varchar('discount_code', { length: 40 }),
    discountFundedBy: discountFundedByEnum('discount_funded_by'),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    lat: real('lat'),
    lng: real('lng'),
    address: text('address'),
    // The Razorpay order id. Unique because it is how the webhook finds this
    // intent when the client never comes back to confirm it.
    gatewayTxnId: varchar('gateway_txn_id', { length: 255 }).unique(),
    // The Razorpay mode of that order (see GATEWAY_MODES), from 0032. Copied
    // onto the payment when the intent becomes a booking.
    gatewayMode: gatewayModeColumn(),
    status: bookingIntentStatusEnum('status').default('pending').notNull(),
    // Set when the intent is consumed. Its presence *is* the idempotency
    // record: the client callback and the webhook both confirm, and whichever
    // arrives second returns this booking instead of creating a second one.
    bookingId: uuid('booking_id').references(() => bookings.id, {
      onDelete: 'set null',
    }),
    // Only set on 'failed': the captured Razorpay payment awaiting a manual
    // refund, and why the booking could not be written.
    paymentRef: varchar('payment_ref', { length: 255 }),
    failureReason: varchar('failure_reason', { length: 255 }),
    // The refund of that captured payment, once ops has done it. The intent
    // stays 'failed': that is what happened to the checkout.
    ...refundColumns(),
    // An unpaid intent past this point is dead. Nothing needs to collect them —
    // they hold no resource — so expiry is enforced on read, not by a job.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('booking_intents_user_id_idx').on(table.userId),
    index('booking_intents_status_idx').on(table.status),
    gatewayModeCheck('booking_intents_gateway_mode_check', table.gatewayMode),
  ]
)

// Every refund ops records, one row each. The refund columns on payments,
// booking_intents and booking_charges carry the running total and the latest
// refund, which is what the lists read; a later part refund overwrites the
// latest one there. This keeps all of them, so a Razorpay refund id is
// checked against every refund ever recorded, not only the latest on each
// row — and the unique index makes that hold under two people at once.
//
// `target_id` is the booking's id for its payment, the checkout's, or the
// bill's, as `kind` says (no FK: it points into one of three tables).
// `refunded_before` is the running total this refund was recorded against.
// One refund per starting total is what the conditional write on the money
// row already guarantees; the second unique index holds it here too, so a
// retried request can never leave two records of one refund.
export const refundRecords = pgTable(
  'refund_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: refundKindEnum('kind').notNull(),
    targetId: uuid('target_id').notNull(),
    // Null for a checkout: there is no booking.
    bookingId: uuid('booking_id').references(() => bookings.id, {
      onDelete: 'cascade',
    }),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    refundedBefore: decimal('refunded_before', { precision: 10, scale: 2 }).notNull(),
    refundRef: varchar('refund_ref', { length: 64 }),
    refundNote: text('refund_note'),
    recordedBy: varchar('recorded_by', { length: 100 }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // How it came to be recorded (0036): 'recorded' by ops after doing it by
    // hand (Mark refunded), 'razorpay' found on the payment in Razorpay with
    // no record here, or sent by the app itself, 'admin' (Refund now) or
    // 'auto' (AUTO_REFUNDS). See RefundSource in lib/refunds.ts.
    source: text('source').$type<RefundSource>().default('recorded').notNull(),
    // Where Razorpay says it stands: pending until its refund.processed or
    // refund.failed webhook; null when nobody asked. A failed row moved no
    // money: the money row's total was put back, and every reader of the
    // history leaves it out (STANDING_REFUND in refunds.repository).
    gatewayStatus: text('gateway_status').$type<GatewayRefundStatus>(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    failureReason: varchar('failure_reason', { length: 300 }),
  },
  (table) => [
    uniqueIndex('refund_records_refund_ref_key').on(table.refundRef),
    // A booking's refunds, for the Updates feed.
    index('refund_records_booking_id_idx').on(table.bookingId),
    // A failed refund put the running total back, so the retry starts from
    // the same total: failed rows are left out of this one.
    uniqueIndex('refund_records_kind_target_before_key')
      .on(table.kind, table.targetId, table.refundedBefore)
      .where(sql`${table.gatewayStatus} IS DISTINCT FROM 'failed'`),
    // The automatic mode's daily cap adds up the day's automatic refunds.
    index('refund_records_auto_recorded_at_idx')
      .on(table.recordedAt)
      .where(sql`${table.source} = 'auto'`),
    check('refund_records_amount_check', sql`${table.amount} > 0`),
    check(
      'refund_records_source_check',
      sql`${table.source} in ('recorded', 'razorpay', 'admin', 'auto')`
    ),
    check(
      'refund_records_gateway_status_check',
      sql`${table.gatewayStatus} in ('pending', 'processed', 'failed')`
    ),
    // A pending or processed refund is a real Razorpay refund with its id;
    // only one Razorpay refused outright has none.
    check(
      'refund_records_gateway_ref_check',
      sql`${table.gatewayStatus} IS NULL OR ${table.gatewayStatus} = 'failed' OR ${table.refundRef} IS NOT NULL`
    ),
  ]
)

// The IST days the automatic mode's daily cap (AUTO_REFUND_DAILY_CAP_INR)
// was reached (0036). Written once a day, by whichever automatic refund
// found the cap reached first: that row is what stops automatic refunds for
// the rest of the day and what sends the team its one alert about it.
export const autoRefundCapDays = pgTable('auto_refund_cap_days', {
  day: date('day').primaryKey(),
  reachedAt: timestamp('reached_at', { withTimezone: true }).defaultNow().notNull(),
  capAmount: decimal('cap_amount', { precision: 10, scale: 2 }).notNull(),
  sentAmount: decimal('sent_amount', { precision: 10, scale: 2 }).notNull(),
})

// The customer's receipt numbers: "DTL/26-27/000123", consecutive within each
// Indian financial year (see formatReceiptSerial in lib/receipts.ts). The
// consumer rules ask for a consecutive serial unique for the year, so a number
// is issued once and kept for good: never reused, never renumbered, even if
// the booking is later cancelled or refunded (the receipt then shows that).
//
// One per reschedule chain, keyed by the chain's first booking: a reschedule
// carries the same payment to a new booking, and the receipt (on whichever
// booking is current) is still for that one payment. `issued_at` is when the
// payment first went through; its financial year is the number's.
//
// Issued by allocateReceiptNumber (bookings.repository.ts) in the same
// transaction as the payment going through, from receipt_counters below. A
// final bill paid later is on the same receipt and takes no number of its
// own. 0030 numbered the receipts that already existed.
export const receiptNumbers = pgTable(
  'receipt_numbers',
  {
    rootBookingId: uuid('root_booking_id')
      .primaryKey()
      .references(() => bookings.id),
    financialYear: text('financial_year').notNull(),
    seq: integer('seq').notNull(),
    number: text('number').notNull().unique(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('receipt_numbers_financial_year_seq_key').on(
      table.financialYear,
      table.seq
    ),
    check('receipt_numbers_seq_check', sql`${table.seq} > 0`),
    // Sixteen characters is the most the consumer rules allow.
    check(
      'receipt_numbers_number_length_check',
      sql`char_length(${table.number}) <= 16`
    ),
  ]
)

// The last serial issued in each financial year. A counter row rather than a
// Postgres SEQUENCE because a sequence never gives a number back: a rolled-back
// payment would leave a gap in the series. Bumped with UPDATE … RETURNING
// inside the payment's transaction, so a rollback returns the number too; the
// row lock that takes is the last lock in every transaction (see the lock
// order in bookings.repository.ts).
export const receiptCounters = pgTable('receipt_counters', {
  financialYear: text('financial_year').primaryKey(),
  lastSeq: integer('last_seq').notNull(),
})

// One row per destructive admin action, written in the same transaction as
// the action (see 0032). Today that is only the test-data reset. Append-only:
// a trigger refuses UPDATE and DELETE. Deliberately no foreign keys, because
// the rows it describes are the ones the action deletes. `detail` names
// bookings, customers and garages by id and reference, never by phone.
// `actorName` is the name the person typed: the shared admin login cannot
// say who they are, so `actorSub` alone would always read 'admin'.
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').notNull(),
    actorSub: text('actor_sub').notNull(),
    actorName: varchar('actor_name', { length: 100 }).notNull(),
    summary: jsonb('summary').notNull(),
    detail: jsonb('detail').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('admin_audit_log_created_at_idx').on(table.createdAt)]
)

// A receipt number issued on test data that the reset then deleted, in a
// financial year that also has real receipts (see 0032). The number is never
// given out again (the year's counter is left alone) and stays on record
// here, so the year's series is complete without renumbering anything. A
// year whose receipts were all test data restarts instead: its numbers,
// voids and counter go, and the next receipt is 000001.
//
// `rootBookingId` has no foreign key: the booking is gone.
export const receiptNumberVoids = pgTable(
  'receipt_number_voids',
  {
    financialYear: text('financial_year').notNull(),
    seq: integer('seq').notNull(),
    number: text('number').notNull().unique(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    rootBookingId: uuid('root_booking_id').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    reason: text('reason').notNull(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => adminAuditLog.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ name: 'receipt_number_voids_pkey', columns: [table.financialYear, table.seq] }),
    check('receipt_number_voids_seq_check', sql`${table.seq} > 0`),
    check(
      'receipt_number_voids_number_length_check',
      sql`char_length(${table.number}) <= 16`
    ),
  ]
)

// The same lines as booking_items, held against an unpaid intent. Copied
// verbatim into booking_items by `consumeIntent`, so what the customer saw in
// the Razorpay sheet is what the booking ends up recording.
export const bookingIntentItems = pgTable(
  'booking_intent_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    intentId: uuid('intent_id')
      .notNull()
      .references(() => bookingIntents.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 255 }).notNull(),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    durationMins: integer('duration_mins').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('booking_intent_items_intent_id_idx').on(table.intentId),
    uniqueIndex('booking_intent_items_intent_service_key').on(
      table.intentId,
      table.serviceId
    ),
  ]
)

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('reviews_vendor_id_idx').on(table.vendorId),
    index('reviews_user_id_idx').on(table.userId),
  ]
)

// A short message from the Detlio team on the customer's Home and Updates:
// "Slot may move: rain". To every customer ('all'), or to customers with an
// upcoming booking between `bookingFrom` and `bookingTo` (optionally at one
// garage). Live while `isActive` and now is in [startsAt, endsAt). Never
// deleted: "End now" sets `endsAt` on a live one and clears `isActive` on a
// scheduled one (lib/notices.ts). Not the legal change-notice channel.
//
// `createdBy` is a name, like booking_notes.author: the break-glass admin
// login has no users row. The CHECKs are in 0031_home_hub.sql.
export const notices = pgTable(
  'notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 60 }).notNull(),
    body: varchar('body', { length: 200 }).notNull(),
    linkUrl: varchar('link_url', { length: 2048 }),
    linkLabel: varchar('link_label', { length: 30 }),
    audience: noticeAudienceEnum('audience').default('all').notNull(),
    vendorId: uuid('vendor_id').references(() => vendors.id, {
      onDelete: 'cascade',
    }),
    bookingFrom: timestamp('booking_from', { withTimezone: true }),
    bookingTo: timestamp('booking_to', { withTimezone: true }),
    startsAt: timestamp('starts_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: varchar('created_by', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('notices_live_idx')
      .on(table.startsAt, table.endsAt)
      .where(sql`${table.isActive}`),
    check('notices_window_check', sql`${table.endsAt} > ${table.startsAt}`),
    check(
      'notices_audience_check',
      sql`(${table.audience} = 'all' and ${table.bookingFrom} is null and ${table.bookingTo} is null and ${table.vendorId} is null) or (${table.audience} = 'with_booking_between' and ${table.bookingFrom} is not null and ${table.bookingTo} is not null and ${table.bookingTo} > ${table.bookingFrom})`
    ),
    check(
      'notices_link_pair_check',
      sql`(${table.linkUrl} is null) = (${table.linkLabel} is null)`
    ),
    check(
      'notices_link_url_check',
      sql`${table.linkUrl} is null or (${table.linkUrl} ~ '^(https://[^/]|/([^/]|$))' and strpos(${table.linkUrl}, chr(92)) = 0 and ${table.linkUrl} !~ '[[:space:]]')`
    ),
  ]
)

// A customer's × on a notice, kept on the server so it holds on every device.
export const noticeDismissals = pgTable(
  'notice_dismissals',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    noticeId: uuid('notice_id')
      .notNull()
      .references(() => notices.id, { onDelete: 'cascade' }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'notice_dismissals_pkey',
      columns: [table.userId, table.noticeId],
    }),
  ]
)

// A customer's × on an offer: hidden from their Home for good. The code itself
// still works at checkout.
export const offerDismissals = pgTable(
  'offer_dismissals',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    discountId: uuid('discount_id')
      .notNull()
      .references(() => discounts.id, { onDelete: 'cascade' }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'offer_dismissals_pkey',
      columns: [table.userId, table.discountId],
    }),
  ]
)

/**
 * The complaint's number (C-000123 as printed). A sequence, so customers
 * complaining at the same moment never wait on each other; a rolled-back
 * insert leaves a gap, which a complaint number can live with (a receipt
 * number cannot: see receiptCounters). Owned by complaints.number.
 */
export const complaintNumberSeq = pgSequence('complaint_number_seq', {
  startWith: 1,
  maxValue: 2147483647,
})

// A customer's complaint, with its number and the response clock: acknowledge
// within 24 hours, resolve within 7 days of `createdAt` (lib/complaints.ts).
// Raised from a booking's Help sheet (booking and garage attached, always the
// customer's own booking) or from the Contact page (neither).
//
// Nothing it points at can take it with it: the account, the booking and the
// garage each set their column to null when deleted, and the snapshot
// columns (name, phone, booking reference, garage name) keep what it was
// about. `resolutionNote` is what the customer reads; `adminNote` is the
// team's and never leaves admin. The CHECKs are in 0035_complaints.sql.
export const complaints = pgTable(
  'complaints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: integer('number')
      .notNull()
      .default(sql`nextval('complaint_number_seq')`),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    customerName: varchar('customer_name', { length: 255 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    bookingRef: varchar('booking_ref', { length: 8 }),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    garageName: varchar('garage_name', { length: 255 }),
    category: text('category').$type<ComplaintCategory>().notNull(),
    message: varchar('message', { length: 1000 }).notNull(),
    status: text('status')
      .$type<ComplaintStatus>()
      .default('open')
      .notNull(),
    resolutionNote: varchar('resolution_note', { length: 1000 }),
    adminNote: varchar('admin_note', { length: 2000 }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: varchar('acknowledged_by', { length: 100 }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: varchar('resolved_by', { length: 100 }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: varchar('closed_by', { length: 100 }),
    // Where it came from (0039): 'app' when the customer raised it, else how
    // the team heard it (phone, WhatsApp, email, in person, other).
    source: text('source').$type<ComplaintSource>().default('app').notNull(),
    // When Detlio received it: the clock starts here. The moment it was made
    // for an app complaint; up to 7 days back for one the team logs.
    receivedAt: timestamp('received_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // The name the team member typed when logging it; null for 'app'.
    loggedBy: varchar('logged_by', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('complaints_number_unique').on(table.number),
    index('complaints_status_created_at_idx').on(table.status, table.createdAt),
    index('complaints_status_received_at_idx').on(table.status, table.receivedAt),
    index('complaints_created_at_idx').on(table.createdAt),
    index('complaints_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('complaints_booking_id_idx')
      .on(table.bookingId)
      .where(sql`${table.bookingId} is not null`),
    index('complaints_vendor_id_idx')
      .on(table.vendorId)
      .where(sql`${table.vendorId} is not null`),
    check('complaints_number_check', sql`${table.number} > 0`),
    check(
      'complaints_category_check',
      sql`${table.category} in ('payment_or_refund', 'service_quality', 'garage_no_show', 'damage', 'app_problem', 'other')`
    ),
    check(
      'complaints_status_check',
      sql`${table.status} in ('open', 'acknowledged', 'resolved', 'closed')`
    ),
    check('complaints_message_check', sql`char_length(btrim(${table.message})) > 0`),
    check(
      'complaints_acknowledged_check',
      sql`(${table.status} = 'open') = (${table.acknowledgedAt} is null)`
    ),
    check(
      'complaints_resolved_check',
      sql`${table.status} <> 'resolved' or (${table.resolvedAt} is not null and ${table.resolutionNote} is not null and char_length(btrim(${table.resolutionNote})) > 0)`
    ),
    check(
      'complaints_resolved_at_check',
      sql`${table.resolvedAt} is null or ${table.status} in ('resolved', 'closed')`
    ),
    check(
      'complaints_closed_check',
      sql`(${table.status} = 'closed') = (${table.closedAt} is not null)`
    ),
    check(
      'complaints_source_check',
      sql`${table.source} in ('app', 'phone', 'whatsapp', 'email', 'in_person', 'other')`
    ),
    check(
      'complaints_logged_by_check',
      sql`(${table.source} = 'app') = (${table.loggedBy} is null) and (${table.loggedBy} is null or char_length(btrim(${table.loggedBy})) > 0)`
    ),
    check('complaints_received_at_check', sql`${table.receivedAt} <= ${table.createdAt}`),
  ]
)

// The garages a customer saved with the heart (0039). Personal data: only
// the customer reads it (GET /users/me/favourites). Both keys cascade, so
// deleting the account or the garage takes the rows with it; the pilot reset
// never touches it (it is not test data).
export const userFavouriteVendors = pgTable(
  'user_favourite_vendors',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'user_favourite_vendors_pkey',
      columns: [table.userId, table.vendorId],
    }),
    index('user_favourite_vendors_vendor_id_idx').on(table.vendorId),
  ]
)

// A transfer Detlio made to a garage, by bank or UPI, recorded from admin's
// Payouts (0038). `coversFrom`–`coversUpTo` are the bookings it paid: every
// one that was payable when it was recorded. What it paid, booking by
// booking, is vendorPayoutItems. The CHECKs are in 0038_garage_payouts.sql.
export type PayoutMethod = 'bank' | 'upi' | 'other'

export const vendorPayouts = pgTable(
  'vendor_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'restrict' }),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    method: text('method').$type<PayoutMethod>().notNull(),
    reference: varchar('reference', { length: 80 }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
    coversFrom: timestamp('covers_from', { withTimezone: true }).notNull(),
    coversUpTo: timestamp('covers_up_to', { withTimezone: true }).notNull(),
    note: varchar('note', { length: 500 }),
    recordedBy: varchar('recorded_by', { length: 100 }).notNull(),
    recordedBySub: varchar('recorded_by_sub', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('vendor_payouts_vendor_id_reference_key').on(table.vendorId, table.reference),
    index('vendor_payouts_vendor_id_paid_at_idx').on(table.vendorId, table.paidAt),
    check('vendor_payouts_amount_check', sql`${table.amount} > 0`),
    check('vendor_payouts_method_check', sql`${table.method} in ('bank', 'upi', 'other')`),
  ]
)

// What one payout paid on one booking (a reschedule chain, keyed by its
// first booking), with the figures it was paid on, so a statement never
// changes after the money has gone. A booking's balance is what it earns now
// less the `amount`s already paid on it (lib/payouts.ts): never paid twice,
// and a refund after a payout comes off the next one. RESTRICT on the
// booking: the reset and Delete forever remove an item only with its payout.
export type PayoutItemKind = 'job' | 'customer_no_show' | 'none'

export const vendorPayoutItems = pgTable(
  'vendor_payout_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    payoutId: uuid('payout_id')
      .notNull()
      .references(() => vendorPayouts.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    bookingRef: varchar('booking_ref', { length: 8 }).notNull(),
    kind: text('kind').$type<PayoutItemKind>().notNull(),
    payableFrom: timestamp('payable_from', { withTimezone: true }).notNull(),
    price: decimal('price', { precision: 10, scale: 2 }).notNull(),
    detlioPromo: decimal('detlio_promo', { precision: 10, scale: 2 }).notNull(),
    garagePromo: decimal('garage_promo', { precision: 10, scale: 2 }).notNull(),
    refunds: decimal('refunds', { precision: 10, scale: 2 }).notNull(),
    commission: decimal('commission', { precision: 10, scale: 2 }).notNull(),
    freePosition: smallint('free_position'),
    garageShare: decimal('garage_share', { precision: 10, scale: 2 }).notNull(),
    heldByGarage: decimal('held_by_garage', { precision: 10, scale: 2 }).notNull(),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [
    unique('vendor_payout_items_payout_id_booking_id_key').on(table.payoutId, table.bookingId),
    index('vendor_payout_items_booking_id_idx').on(table.bookingId),
    check('vendor_payout_items_amount_check', sql`${table.amount} <> 0`),
    check('vendor_payout_items_kind_check', sql`${table.kind} in ('job', 'customer_no_show', 'none')`),
  ]
)

// Where a garage's money goes (0038): a bank account (number and IFSC
// together) and/or a UPI id. Admin-only: no garage or customer payload ever
// carries it, and lists show it masked (lib/payouts.ts maskAccount).
export const vendorPayoutAccounts = pgTable('vendor_payout_accounts', {
  vendorId: uuid('vendor_id')
    .primaryKey()
    .references(() => vendors.id, { onDelete: 'cascade' }),
  accountName: varchar('account_name', { length: 100 }),
  accountNumber: varchar('account_number', { length: 18 }),
  ifsc: varchar('ifsc', { length: 11 }),
  upiId: varchar('upi_id', { length: 100 }),
  updatedBy: varchar('updated_by', { length: 100 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Garage documents (0043, lib/vendor-documents.ts, modules/vendor-documents):
// one row per garage per type, the current upload and where its review
// stands. Re-uploading replaces the row's files (the old objects are deleted
// from the private bucket after the commit; no history of ID or bank proof
// is kept), bumps `version` and puts it back to pending. A review must name
// the version the admin opened. The files are in vendor_document_files.
// Never on a public or customer payload; customers get one boolean,
// `documentsVerified`. The CHECKs are in 0043_garage_documents.sql.
export const vendorDocuments = pgTable(
  'vendor_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    type: text('type').$type<DocumentType>().notNull(),
    status: text('status').$type<DocumentStatus>().notNull().default('pending'),
    version: integer('version').notNull().default(1),
    // Trade licence only (CHECK).
    expiresOn: date('expires_on'),
    // 'garage', or the name the admin typed when uploading on its behalf.
    uploadedBy: varchar('uploaded_by', { length: 100 }).notNull(),
    // The session that uploaded it: a user id, or 'admin' for the shared login.
    uploadedBySub: varchar('uploaded_by_sub', { length: 100 }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    // The admin's typed name, as the Bin records it.
    reviewedBy: varchar('reviewed_by', { length: 100 }),
    reviewedBySub: varchar('reviewed_by_sub', { length: 100 }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    // Shown to the garage. Required exactly when rejected (CHECK).
    rejectionReason: varchar('rejection_reason', { length: 300 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('vendor_documents_vendor_id_type_key').on(table.vendorId, table.type),
    index('vendor_documents_pending_idx')
      .on(table.vendorId)
      .where(sql`${table.status} = 'pending'`),
    check(
      'vendor_documents_type_check',
      sql`${table.type} in ('shop_photo', 'owner_id', 'bank_proof', 'agreement', 'gst_certificate', 'trade_licence')`
    ),
    check('vendor_documents_status_check', sql`${table.status} in ('pending', 'approved', 'rejected')`),
  ]
)

// A document's files in the private bucket: its front, and a back when it
// has one. Cascades with its document; the objects are removed by the API
// after the commit, best effort.
export const vendorDocumentFiles = pgTable(
  'vendor_document_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => vendorDocuments.id, { onDelete: 'cascade' }),
    side: text('side').$type<DocumentSide>().notNull(),
    storageKey: varchar('storage_key', { length: 512 }).notNull(),
    contentType: text('content_type').$type<DocumentContentType>().notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('vendor_document_files_document_id_side_key').on(table.documentId, table.side),
    uniqueIndex('vendor_document_files_storage_key_key').on(table.storageKey),
    check('vendor_document_files_side_check', sql`${table.side} in ('front', 'back')`),
  ]
)

// Browser notifications (0044, lib/push.ts, modules/push): one row per
// browser that turned them on. `endpoint` is the push service's URL for that
// browser (FCM, Mozilla, Apple, Windows; checked against an allow-list before
// it is stored or sent to) and, with the two keys, what web-push needs to
// encrypt a message only that browser can read. A device identifier, never
// logged. `audience` says which app it came from: a customer's (detlio.com)
// or a garage seat's (vendor.detlio.com, with the garage it was turned on
// for, from resolveTenant). A garage subscription is only sent to while its
// user still holds an active seat there and the garage is not in the Bin;
// the user's or the garage's deletion removes it. Removed when the push
// service answers 404/410 (the browser dropped it) or the person turns it
// off. The CHECKs are in 0044_push_notifications.sql.
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpoint: varchar('endpoint', { length: 1024 }).notNull(),
    p256dh: varchar('p256dh', { length: 200 }).notNull(),
    auth: varchar('auth', { length: 100 }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    audience: text('audience').$type<PushAudience>().notNull(),
    // Garage subscriptions only (CHECK): the garage the seat turned it on for.
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'cascade' }),
    // "Chrome on Android": shown on the Notifications screen, never the raw
    // user agent.
    deviceLabel: varchar('device_label', { length: 60 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    // Failed sends in a row (not 404/410, which remove the row at once).
    failureCount: integer('failure_count').default(0).notNull(),
  },
  (table) => [
    uniqueIndex('push_subscriptions_endpoint_key').on(table.endpoint),
    index('push_subscriptions_user_id_idx').on(table.userId),
    index('push_subscriptions_vendor_id_idx')
      .on(table.vendorId)
      .where(sql`${table.vendorId} is not null`),
    check('push_subscriptions_audience_check', sql`${table.audience} in ('customer', 'garage')`),
    check(
      'push_subscriptions_vendor_check',
      sql`(${table.audience} = 'garage') = (${table.vendorId} is not null)`
    ),
  ]
)

// The scheduled notifications already sent (0044): a customer's reminder
// the evening before and an hour before, a garage's "accept within 10 min".
// One row per booking per kind (unique), claimed before the send, so a cron
// run that overlaps another sends nothing twice. Cascades with the booking.
export const notificationSends = pgTable(
  'notification_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ScheduledPushKind>().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('notification_sends_booking_id_kind_key').on(table.bookingId, table.kind),
    check(
      'notification_sends_kind_check',
      sql`${table.kind} in ('day_before', 'hour_before', 'respond_soon')`
    ),
  ]
)

// Cached geocoding responses, keyed "{provider}:{op}:{normalised-input}". Lives
// in Postgres rather than process memory because the API is serverless — an
// in-process cache would be cold on most requests and would multiply by
// instance count, which is the opposite of what a free-tier budget wants.
// TTL is applied on read against createdAt; see geo.repository.ts.
export const geoCache = pgTable(
  'geo_cache',
  {
    cacheKey: varchar('cache_key', { length: 512 }).primaryKey(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('geo_cache_created_at_idx').on(table.createdAt)]
)

// First-party usage events for admin's Funnel (0040, lib/analytics.ts): an
// allow-listed name, an anonymous visit id kept in the browser tab's
// sessionStorage (null on the API's own booking_paid/booking_cancelled), the
// signed-in customer only when signed in, allow-listed props, the path
// without its query or ids, and a device class from the window's width.
// Kept 180 days. The CHECKs are in 0040_analytics_events.sql.
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    name: text('name').$type<AnalyticsEventName>().notNull(),
    visitId: uuid('visit_id'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    props: jsonb('props').$type<Record<string, string | number>>().default({}).notNull(),
    path: varchar('path', { length: 200 }),
    device: text('device').$type<DeviceClass>(),
    appVersion: varchar('app_version', { length: 32 }),
  },
  (table) => [
    index('analytics_events_name_occurred_at_idx').on(table.name, table.occurredAt),
    index('analytics_events_occurred_at_idx').on(table.occurredAt),
    index('analytics_events_user_id_idx')
      .on(table.userId)
      .where(sql`${table.userId} is not null`),
    check(
      'analytics_events_name_check',
      sql`${table.name} in ('app_open', 'home_view', 'garage_list_view', 'search', 'map_view', 'garage_view', 'service_add', 'checkout_start', 'slot_select', 'address_select', 'pay_click', 'booking_paid', 'booking_cancelled', 'review_submit', 'complaint_submit', 'help_view', 'favourite_add', 'favourite_remove')`
    ),
    check(
      'analytics_events_device_check',
      sql`${table.device} is null or ${table.device} in ('phone', 'tablet', 'desktop')`
    ),
    check(
      'analytics_events_props_check',
      sql`jsonb_typeof(${table.props}) = 'object' and ${table.props} - array['vendorId', 'mode', 'category', 'serviceCount', 'amountBucket', 'source', 'step', 'queryLength', 'cancelledBy']::text[] = '{}'::jsonb`
    ),
    check(
      'analytics_events_visit_check',
      sql`(${table.name} in ('booking_paid', 'booking_cancelled')) = (${table.visitId} is null)`
    ),
  ]
)

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  addresses: many(userAddresses),
  vehicles: many(userVehicles),
  ownedVendors: many(vendors),
  memberships: many(userMemberMapping, { relationName: 'memberUser' }),
  bookings: many(bookings),
  reviews: many(reviews),
}))

export const userMemberMappingRelations = relations(
  userMemberMapping,
  ({ one }) => ({
    vendor: one(vendors, {
      fields: [userMemberMapping.vendorId],
      references: [vendors.id],
    }),
    // Both sides point at `users`, so each needs an explicit relationName.
    user: one(users, {
      fields: [userMemberMapping.userId],
      references: [users.id],
      relationName: 'memberUser',
    }),
    addedByUser: one(users, {
      fields: [userMemberMapping.addedBy],
      references: [users.id],
      relationName: 'memberAddedBy',
    }),
  })
)

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}))

export const userAddressesRelations = relations(userAddresses, ({ one }) => ({
  user: one(users, {
    fields: [userAddresses.userId],
    references: [users.id],
  }),
}))

export const userVehiclesRelations = relations(
  userVehicles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [userVehicles.userId],
      references: [users.id],
    }),
    bookings: many(bookings),
  })
)

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  owner: one(users, {
    fields: [vendors.ownerId],
    references: [users.id],
  }),
  members: many(userMemberMapping),
  workingHours: many(vendorWorkingHours),
  closures: many(vendorClosures),
  serviceAreas: many(vendorServiceAreas),
  photos: many(vendorPhotos),
  services: many(services),
  bookings: many(bookings),
  reviews: many(reviews),
}))

export const vendorWorkingHoursRelations = relations(
  vendorWorkingHours,
  ({ one }) => ({
    vendor: one(vendors, {
      fields: [vendorWorkingHours.vendorId],
      references: [vendors.id],
    }),
  })
)

export const vendorClosuresRelations = relations(vendorClosures, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorClosures.vendorId],
    references: [vendors.id],
  }),
}))

export const vendorServiceAreasRelations = relations(
  vendorServiceAreas,
  ({ one }) => ({
    vendor: one(vendors, {
      fields: [vendorServiceAreas.vendorId],
      references: [vendors.id],
    }),
  })
)

export const vendorPhotosRelations = relations(vendorPhotos, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorPhotos.vendorId],
    references: [vendors.id],
  }),
}))

export const servicesRelations = relations(services, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [services.vendorId],
    references: [vendors.id],
  }),
  bookings: many(bookings),
  images: many(serviceImages),
  // Both sides of the composition point at `services`, so each needs an
  // explicit relationName for drizzle to tell them apart. `packageItems` =
  // what this package contains; `includedInPackages` = which packages contain
  // this service (used to warn before deactivating a bundled service).
  packageItems: many(servicePackageItems, { relationName: 'packageItems' }),
  includedInPackages: many(servicePackageItems, {
    relationName: 'serviceInPackages',
  }),
}))

export const serviceImagesRelations = relations(serviceImages, ({ one }) => ({
  service: one(services, {
    fields: [serviceImages.serviceId],
    references: [services.id],
  }),
}))

export const servicePackageItemsRelations = relations(
  servicePackageItems,
  ({ one }) => ({
    package: one(services, {
      fields: [servicePackageItems.packageId],
      references: [services.id],
      relationName: 'packageItems',
    }),
    service: one(services, {
      fields: [servicePackageItems.serviceId],
      references: [services.id],
      relationName: 'serviceInPackages',
    }),
  })
)

export const discountsRelations = relations(discounts, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [discounts.vendorId],
    references: [vendors.id],
  }),
  redemptions: many(discountRedemptions),
}))

export const discountRedemptionsRelations = relations(
  discountRedemptions,
  ({ one }) => ({
    discount: one(discounts, {
      fields: [discountRedemptions.discountId],
      references: [discounts.id],
    }),
    booking: one(bookings, {
      fields: [discountRedemptions.bookingId],
      references: [bookings.id],
    }),
    user: one(users, {
      fields: [discountRedemptions.userId],
      references: [users.id],
    }),
  })
)

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  items: many(bookingItems),
  user: one(users, {
    fields: [bookings.userId],
    references: [users.id],
  }),
  discount: one(discounts, {
    fields: [bookings.discountId],
    references: [discounts.id],
  }),
  vendor: one(vendors, {
    fields: [bookings.vendorId],
    references: [vendors.id],
  }),
  service: one(services, {
    fields: [bookings.serviceId],
    references: [services.id],
  }),
  vehicle: one(userVehicles, {
    fields: [bookings.vehicleId],
    references: [userVehicles.id],
  }),
  payment: one(payments, {
    fields: [bookings.id],
    references: [payments.bookingId],
  }),
  review: one(reviews, {
    fields: [bookings.id],
    references: [reviews.bookingId],
  }),
  notes: many(bookingNotes),
  photos: many(jobPhotos),
  charges: many(bookingCharges),
  refundRecords: many(refundRecords),
  timeProposals: many(bookingTimeProposals, { relationName: 'proposalBooking' }),
}))

export const bookingTimeProposalsRelations = relations(bookingTimeProposals, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingTimeProposals.bookingId],
    references: [bookings.id],
    relationName: 'proposalBooking',
  }),
}))

export const bookingNotesRelations = relations(bookingNotes, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingNotes.bookingId],
    references: [bookings.id],
  }),
}))

export const jobPhotosRelations = relations(jobPhotos, ({ one }) => ({
  booking: one(bookings, {
    fields: [jobPhotos.bookingId],
    references: [bookings.id],
  }),
}))

export const bookingChargesRelations = relations(bookingCharges, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingCharges.bookingId],
    references: [bookings.id],
  }),
}))

export const bookingIntentsRelations = relations(bookingIntents, ({ one, many }) => ({
  items: many(bookingIntentItems),
  service: one(services, {
    fields: [bookingIntents.serviceId],
    references: [services.id],
  }),
  vehicle: one(userVehicles, {
    fields: [bookingIntents.vehicleId],
    references: [userVehicles.id],
  }),
  booking: one(bookings, {
    fields: [bookingIntents.bookingId],
    references: [bookings.id],
  }),
}))

export const bookingItemsRelations = relations(bookingItems, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingItems.bookingId],
    references: [bookings.id],
  }),
  service: one(services, {
    fields: [bookingItems.serviceId],
    references: [services.id],
  }),
}))

export const bookingIntentItemsRelations = relations(
  bookingIntentItems,
  ({ one }) => ({
    intent: one(bookingIntents, {
      fields: [bookingIntentItems.intentId],
      references: [bookingIntents.id],
    }),
    service: one(services, {
      fields: [bookingIntentItems.serviceId],
      references: [services.id],
    }),
  })
)

export const paymentsRelations = relations(payments, ({ one }) => ({
  booking: one(bookings, {
    fields: [payments.bookingId],
    references: [bookings.id],
  }),
}))

export const reviewsRelations = relations(reviews, ({ one }) => ({
  booking: one(bookings, {
    fields: [reviews.bookingId],
    references: [bookings.id],
  }),
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
  vendor: one(vendors, {
    fields: [reviews.vendorId],
    references: [vendors.id],
  }),
}))

export const refundRecordsRelations = relations(refundRecords, ({ one }) => ({
  booking: one(bookings, {
    fields: [refundRecords.bookingId],
    references: [bookings.id],
  }),
}))

export const noticesRelations = relations(notices, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [notices.vendorId],
    references: [vendors.id],
  }),
  dismissals: many(noticeDismissals),
}))

export const noticeDismissalsRelations = relations(
  noticeDismissals,
  ({ one }) => ({
    notice: one(notices, {
      fields: [noticeDismissals.noticeId],
      references: [notices.id],
    }),
    user: one(users, {
      fields: [noticeDismissals.userId],
      references: [users.id],
    }),
  })
)

export const offerDismissalsRelations = relations(
  offerDismissals,
  ({ one }) => ({
    discount: one(discounts, {
      fields: [offerDismissals.discountId],
      references: [discounts.id],
    }),
    user: one(users, {
      fields: [offerDismissals.userId],
      references: [users.id],
    }),
  })
)

export const complaintsRelations = relations(complaints, ({ one }) => ({
  user: one(users, {
    fields: [complaints.userId],
    references: [users.id],
  }),
  booking: one(bookings, {
    fields: [complaints.bookingId],
    references: [bookings.id],
  }),
  vendor: one(vendors, {
    fields: [complaints.vendorId],
    references: [vendors.id],
  }),
}))
