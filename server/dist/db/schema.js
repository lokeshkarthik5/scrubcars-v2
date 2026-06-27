import { relations } from "drizzle-orm";
import { boolean, decimal, index, integer, pgEnum, pgTable, real, text, time, timestamp, uniqueIndex, uuid, varchar, } from "drizzle-orm/pg-core";
// ─── Enums ───────────────────────────────────────────────────────────────────
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const otpPurposeEnum = pgEnum("otp_purpose", [
    "login",
    "register",
    "vendor_onboard",
]);
export const vehicleTypeEnum = pgEnum("vehicle_type", [
    "sedan",
    "suv",
    "hatchback",
]);
export const vendorStatusEnum = pgEnum("vendor_status", [
    "pending",
    "active",
    "suspended",
]);
export const serviceCategoryEnum = pgEnum("service_category", [
    "car_wash",
    "detailing",
    "coating",
    "scratch_removal",
]);
export const bookingTypeEnum = pgEnum("booking_type", ["doorstep", "dropin"]);
export const bookingStatusEnum = pgEnum("booking_status", [
    "pending",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["online", "cash"]);
export const paymentGatewayEnum = pgEnum("payment_gateway", [
    "razorpay",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
    "pending",
    "paid",
    "failed",
    "refunded",
    "collected",
]);
// ─── Tables ──────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull().unique(),
    email: varchar("email", { length: 255 }),
    phoneVerified: boolean("phone_verified").default(false).notNull(),
    isCustomer: boolean("is_customer").default(true).notNull(),
    isVendorOwner: boolean("is_vendor_owner").default(false).notNull(),
    isAdmin: boolean("is_admin").default(false).notNull(),
    status: userStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => [index("users_phone_idx").on(table.phone)]);
export const otpVerifications = pgTable("otp_verifications", {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: varchar("phone", { length: 20 }).notNull(),
    otpCode: varchar("otp_code", { length: 10 }).notNull(),
    purpose: otpPurposeEnum("purpose").notNull(),
    verified: boolean("verified").default(false).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => [
    index("otp_verifications_phone_idx").on(table.phone),
    index("otp_verifications_expires_at_idx").on(table.expiresAt),
]);
export const refreshTokens = pgTable("refresh_tokens", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    revoked: boolean("revoked").default(false).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => [
    index("refresh_tokens_user_id_idx").on(table.userId),
    index("refresh_tokens_token_hash_idx").on(table.tokenHash),
    index("refresh_tokens_expires_at_idx").on(table.expiresAt),
]);
export const userAddresses = pgTable("user_addresses", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 100 }).notNull(),
    address: text("address").notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => [index("user_addresses_user_id_idx").on(table.userId)]);
export const userVehicles = pgTable("user_vehicles", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    make: varchar("make", { length: 100 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    color: varchar("color", { length: 50 }),
    licensePlate: varchar("license_plate", { length: 20 }),
    vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
}, (table) => [index("user_vehicles_user_id_idx").on(table.userId)]);
export const vendors = pgTable("vendors", {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    businessName: varchar("business_name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    address: text("address").notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    doorstepEnabled: boolean("doorstep_enabled").default(false).notNull(),
    dropinEnabled: boolean("dropin_enabled").default(false).notNull(),
    slotIntervalMins: integer("slot_interval_mins").default(30).notNull(),
    status: vendorStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => [
    index("vendors_owner_id_idx").on(table.ownerId),
    index("vendors_status_idx").on(table.status),
]);
export const vendorWorkingHours = pgTable("vendor_working_hours", {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    openTime: time("open_time").notNull(),
    closeTime: time("close_time").notNull(),
    isClosed: boolean("is_closed").default(false).notNull(),
}, (table) => [
    index("vendor_working_hours_vendor_id_idx").on(table.vendorId),
    uniqueIndex("vendor_working_hours_vendor_day_idx").on(table.vendorId, table.dayOfWeek),
]);
export const vendorServiceAreas = pgTable("vendor_service_areas", {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
    areaName: varchar("area_name", { length: 255 }).notNull(),
    pincode: varchar("pincode", { length: 10 }).notNull(),
    radiusKm: real("radius_km"),
}, (table) => [
    index("vendor_service_areas_vendor_id_idx").on(table.vendorId),
]);
export const vendorPhotos = pgTable("vendor_photos", {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 2048 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => [index("vendor_photos_vendor_id_idx").on(table.vendorId)]);
export const services = pgTable("services", {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    category: serviceCategoryEnum("category").notNull(),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    durationMins: integer("duration_mins").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
    index("services_vendor_id_idx").on(table.vendorId),
    index("services_category_idx").on(table.category),
]);
export const bookings = pgTable("bookings", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
        .notNull()
        .references(() => services.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
        .notNull()
        .references(() => userVehicles.id, { onDelete: "restrict" }),
    bookingType: bookingTypeEnum("booking_type").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: bookingStatusEnum("status").default("pending").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    lat: real("lat"),
    lng: real("lng"),
    address: text("address"),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => [
    index("bookings_user_id_idx").on(table.userId),
    index("bookings_vendor_id_idx").on(table.vendorId),
    index("bookings_vendor_scheduled_at_idx").on(table.vendorId, table.scheduledAt),
    index("bookings_status_idx").on(table.status),
]);
export const payments = pgTable("payments", {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
        .notNull()
        .unique()
        .references(() => bookings.id, { onDelete: "cascade" }),
    gateway: paymentGatewayEnum("gateway").notNull(),
    gatewayTxnId: varchar("gateway_txn_id", { length: 255 }),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("INR").notNull(),
    status: paymentStatusEnum("status").default("pending").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => [
    index("payments_booking_id_idx").on(table.bookingId),
    index("payments_status_idx").on(table.status),
]);
export const reviews = pgTable("reviews", {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
        .notNull()
        .unique()
        .references(() => bookings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => [
    index("reviews_vendor_id_idx").on(table.vendorId),
    index("reviews_user_id_idx").on(table.userId),
]);
// ─── Relations ───────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
    refreshTokens: many(refreshTokens),
    addresses: many(userAddresses),
    vehicles: many(userVehicles),
    ownedVendors: many(vendors),
    bookings: many(bookings),
    reviews: many(reviews),
}));
export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
    user: one(users, {
        fields: [refreshTokens.userId],
        references: [users.id],
    }),
}));
export const userAddressesRelations = relations(userAddresses, ({ one }) => ({
    user: one(users, {
        fields: [userAddresses.userId],
        references: [users.id],
    }),
}));
export const userVehiclesRelations = relations(userVehicles, ({ one, many }) => ({
    user: one(users, {
        fields: [userVehicles.userId],
        references: [users.id],
    }),
    bookings: many(bookings),
}));
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
}));
export const vendorWorkingHoursRelations = relations(vendorWorkingHours, ({ one }) => ({
    vendor: one(vendors, {
        fields: [vendorWorkingHours.vendorId],
        references: [vendors.id],
    }),
}));
export const vendorServiceAreasRelations = relations(vendorServiceAreas, ({ one }) => ({
    vendor: one(vendors, {
        fields: [vendorServiceAreas.vendorId],
        references: [vendors.id],
    }),
}));
export const vendorPhotosRelations = relations(vendorPhotos, ({ one }) => ({
    vendor: one(vendors, {
        fields: [vendorPhotos.vendorId],
        references: [vendors.id],
    }),
}));
export const servicesRelations = relations(services, ({ one, many }) => ({
    vendor: one(vendors, {
        fields: [services.vendorId],
        references: [vendors.id],
    }),
    bookings: many(bookings),
}));
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
}));
export const paymentsRelations = relations(payments, ({ one }) => ({
    booking: one(bookings, {
        fields: [payments.bookingId],
        references: [bookings.id],
    }),
}));
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
}));
