import { relations } from 'drizzle-orm'
import {
  boolean,
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

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'paid',
  'failed',
  'refunded',
  'collected',
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
    isAdmin: boolean('is_admin').default(false).notNull(),
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
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
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
  bookings: many(bookings),
  reviews: many(reviews),
}))

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
  // Both sides of the composition point at `services`, so each needs an
  // explicit relationName for drizzle to tell them apart. `packageItems` =
  // what this package contains; `includedInPackages` = which packages contain
  // this service (used to warn before deactivating a bundled service).
  packageItems: many(servicePackageItems, { relationName: 'packageItems' }),
  includedInPackages: many(servicePackageItems, {
    relationName: 'serviceInPackages',
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

export const bookingsRelations = relations(bookings, ({ one }) => ({
  user: one(users, {
    fields: [bookings.userId],
    references: [users.id],
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
