import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  decimal,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

// ─── Enums ───────────────────────────────────────────────────────────────────

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

export const bookingTypeEnum = pgEnum('booking_type', ['doorstep', 'dropin'])

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
// 'user' means the customer cancelled it.
export const cancelledByEnum = pgEnum('cancelled_by', ['user', 'vendor'])

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
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
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
  },
  (table) => [index('user_vehicles_user_id_idx').on(table.userId)]
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
    lat: real('lat'),
    lng: real('lng'),
    whatsapp: varchar('whatsapp', { length: 20 }),
    email: varchar('email', { length: 255 }),
    yearsInOperation: varchar('years_in_operation', { length: 20 }),
    mapsUrl: varchar('maps_url', { length: 2048 }),
    pickup: vendorPickupEnum('pickup'),
    pickupRadiusKm: real('pickup_radius_km'),
    bays: integer('bays'),
    jobsPerDay: integer('jobs_per_day'),
    vehicleTypes: text('vehicle_types').array().notNull().default([]),
    notes: text('notes'),
    isVerified: boolean('is_verified').default(false).notNull(),
    doorstepEnabled: boolean('doorstep_enabled').default(false).notNull(),
    dropinEnabled: boolean('dropin_enabled').default(false).notNull(),
    slotIntervalMins: integer('slot_interval_mins').default(30).notNull(),
    status: vendorStatusEnum('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('vendors_owner_id_idx').on(table.ownerId),
    index('vendors_status_idx').on(table.status),
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

// Photos of the work a service produces, shown in the service details popup on
// the garage page. Capped per service in the service layer (see
// MAX_IMAGES_PER_SERVICE) rather than by a constraint, so the limit can move
// without a migration. Cascade-deleted with the service; the underlying R2
// objects are removed best-effort alongside.
export const serviceImages = pgTable(
  'service_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    url: varchar('url', { length: 2048 }).notNull(),
    storageKey: varchar('storage_key', { length: 1024 }),
    sortOrder: integer('sort_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('service_images_service_id_idx').on(table.serviceId)]
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
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => userVehicles.id, { onDelete: 'restrict' }),
    bookingType: bookingTypeEnum('booking_type').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('bookings_user_id_idx').on(table.userId),
    index('bookings_vendor_id_idx').on(table.vendorId),
    index('bookings_vendor_scheduled_at_idx').on(
      table.vendorId,
      table.scheduledAt
    ),
    index('bookings_status_idx').on(table.status),
    index('bookings_original_booking_id_idx').on(table.originalBookingId),
    index('bookings_discount_id_idx').on(table.discountId),
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('booking_reschedules_original_idx').on(table.originalBookingId),
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
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    status: paymentStatusEnum('status').default('pending').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('payments_booking_id_idx').on(table.bookingId),
    index('payments_status_idx').on(table.status),
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

export const bookingsRelations = relations(bookings, ({ one }) => ({
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
}))

export const bookingIntentsRelations = relations(bookingIntents, ({ one }) => ({
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
