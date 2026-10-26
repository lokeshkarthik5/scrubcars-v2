/**
 * Deterministic fixture data for the E2E suite.
 *
 * Unlike the development seed next door, this one pins every id (see
 * e2e-ids.ts) and inserts rather than upserts: it assumes a database that was
 * just dropped and migrated, and it is the only writer. `bun run e2e:reset`
 * runs the two together.
 *
 * Two rules shape the data:
 *
 *   1. Every concern gets its own customer. The suite runs specs in parallel
 *      against one database, so shared mutable rows would flake.
 *   2. Anything time-sensitive is computed from `now` at seed time, never
 *      hardcoded. The 2-hour cancellation cutoff is measured against the
 *      clock, so a fixed timestamp would decay into a different test overnight.
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../index.js'
import {
  adminAuditLog,
  adminLogins,
  bookingCharges,
  bookingIntentItems,
  bookingIntents,
  bookingItems,
  bookingNotes,
  bookingReschedules,
  bookings,
  discountRedemptions,
  discounts,
  jobPhotos,
  notices,
  payments,
  receiptCounters,
  receiptNumbers,
  receiptNumberVoids,
  refundRecords,
  reviews,
  servicePackageItems,
  services,
  userAddresses,
  userMemberMapping,
  userVehicles,
  users,
  vendorClosures,
  vendorDocuments,
  vendorPayoutAccounts,
  vendorPhotos,
  vendorServiceAreas,
  vendorWorkingHours,
  vendors,
  vehicleServiceReminders,
} from '../schema.js'
import {
  BOOKING_INTENTS,
  BOOKINGS,
  CHARGES,
  CUSTOMERS,
  DATA_RESET,
  DISCOUNTS,
  FILLER_VENDOR_COUNT,
  DOORSTEP_JOB_PIN,
  HOME_PROMO_PIN,
  NOTICES,
  ORIGIN,
  OTP_LIMITED_CUSTOMER,
  PICKUP_HOME,
  PICKUP_PIN,
  PROPOSALS_PIN,
  DOCUMENTS_PIN,
  RESPONSE_OTHER_PIN,
  SLOT_ALERTS_PIN,
  RESPONSE_PIN,
  REVIEWS,
  SERVICES,
  STAFF,
  STATS,
  UNSET_RADIUS_COVERED,
  UNSET_RADIUS_OUTSIDE,
  UNSET_RADIUS_PIN,
  VEHICLES,
  ADDRESSES,
  VENDORS,
  fillerVendorId,
  SERVICE_REMINDERS,
  CONTACT_DOORSTEP,
  CONTACT_GARAGE,
  ADMIN_LOGINS,
} from './e2e-ids.js'
import { hashPassword } from '../../lib/passwords.js'

// ─── time helpers ───────────────────────────────────────────────────────────

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

const now = new Date()

/**
 * Tomorrow at 10:00 IST.
 *
 * Specs pick the "Tmrw" chip rather than "Today" so a run at 21:50 behaves the
 * same as one at 09:00, and so every seeded booking sits comfortably outside
 * the 2-hour cancel/reschedule cutoff.
 */
function tomorrowAt(hour: number): Date {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  // The API treats slots as IST (+05:30); building the date in UTC terms keeps
  // the seed independent of the seeding machine's timezone. IST is UTC+5:30,
  // so 10:00 IST is 04:30 UTC — hence hour-6 with 30 minutes, not hour-5.
  d.setUTCHours(hour - 6, 30, 0, 0)
  return d
}

/** Some days from now at an IST hour, built the way tomorrowAt is. */
function daysAheadAt(days: number, hour: number): Date {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  d.setUTCHours(hour - 6, 30, 0, 0)
  return d
}

/** Inside the 2-hour cutoff. The only way to reach the WINDOW_PASSED branches. */
const insideCutoff = () => new Date(now.getTime() + 1 * HOUR)

/** Already started: a pending job here can no longer be accepted. */
const anHourAgo = () => new Date(now.getTime() - 1 * HOUR)

/** Well past its start: an accepted job here can be marked as a no-show. */
const twoHoursAgo = () => new Date(now.getTime() - 2 * HOUR)

const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * HOUR)
const hoursAgo = (n: number) => new Date(now.getTime() - n * HOUR)

/** An IST calendar date some days from now, as vendor_closures stores it. */
const istDate = (offsetDays: number) =>
  new Date(now.getTime() + offsetDays * 24 * HOUR).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  })

// ─── people ─────────────────────────────────────────────────────────────────

async function seedPeople() {
  await db.insert(users).values([
    ...Object.values(CUSTOMERS).map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      isCustomer: true,
      isVendorOwner: false,
      phoneVerified: true,
      status: 'active' as const,
    })),
    {
      id: OTP_LIMITED_CUSTOMER.id,
      name: OTP_LIMITED_CUSTOMER.name,
      phone: OTP_LIMITED_CUSTOMER.phone,
      isCustomer: true,
      isVendorOwner: false,
      phoneVerified: true,
      status: 'active' as const,
    },
    ...Object.values(STAFF).map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      isCustomer: false,
      isVendorOwner: true,
      phoneVerified: true,
      status: 'active' as const,
    })),
  ])

  // The booking customer carries all three vehicle types: the tiered service is
  // priced for hatchback and sedan but not SUV, which is what makes the
  // unpriced-CTA case reachable by switching cars rather than switching users.
  await db.insert(userVehicles).values([
    { id: VEHICLES.hatchback, userId: CUSTOMERS.book.id, make: 'Maruti', model: 'Swift',
      color: 'Red', licensePlate: 'TN01AA0001', vehicleType: 'hatchback', isDefault: true },
    { id: VEHICLES.suv, userId: CUSTOMERS.book.id, make: 'Tata', model: 'Harrier',
      color: 'White', licensePlate: 'TN01AA0002', vehicleType: 'suv', isDefault: false },
    { id: VEHICLES.sedan, userId: CUSTOMERS.book.id, make: 'Honda', model: 'City',
      color: 'Silver', licensePlate: 'TN01AA0003', vehicleType: 'sedan', isDefault: false },
    // Everyone else gets exactly one car, so checkout auto-selects it and those
    // specs don't have to care about the vehicle step at all. The id is pinned
    // because bookings.vehicle_id is NOT NULL and the fixture bookings below
    // have to name it.
    // Two cars, because deleting one is the point: VEHICLES.booked is named by
    // BOOKINGS.vehicleArchive and must survive as an archived row, while the
    // spare is on nothing and must be deleted outright.
    { id: VEHICLES.booked, userId: CUSTOMERS.vehicles.id, make: 'Skoda', model: 'Slavia',
      color: 'Grey', licensePlate: 'TN03CC0001', vehicleType: 'sedan', isDefault: true },
    { id: VEHICLES.spare, userId: CUSTOMERS.vehicles.id, make: 'Renault', model: 'Kwid',
      color: 'Green', licensePlate: 'TN03CC0002', vehicleType: 'hatchback', isDefault: false },
    ...[CUSTOMERS.cancel, CUSTOMERS.reschedule, CUSTOMERS.review, CUSTOMERS.payLater,
        CUSTOMERS.coupons, CUSTOMERS.browse, CUSTOMERS.journey,
        CUSTOMERS.vendorJob, CUSTOMERS.vendorReject, CUSTOMERS.vendorDoorstep,
        CUSTOMERS.vendorLate,
        CUSTOMERS.logout, CUSTOMERS.session, CUSTOMERS.doorstep,
        CUSTOMERS.journeyCancel, CUSTOMERS.journeyMove, CUSTOMERS.adminOps,
        CUSTOMERS.intents, CUSTOMERS.intentsStranger, CUSTOMERS.pilotStats,
        CUSTOMERS.capacityHolder, CUSTOMERS.scheduling,
        CUSTOMERS.raceFirst, CUSTOMERS.raceSecond, CUSTOMERS.payLaterFull,
        CUSTOMERS.billPayer, CUSTOMERS.billSmall, CUSTOMERS.billStranger,
        CUSTOMERS.jobRecords, CUSTOMERS.billWebhook, CUSTOMERS.refunds,
        CUSTOMERS.receipts, CUSTOMERS.receiptsStranger, CUSTOMERS.myBookings,
        CUSTOMERS.bookAgain, CUSTOMERS.dataReset, CUSTOMERS.dataResetUi,
        CUSTOMERS.binPaid, CUSTOMERS.binHard, CUSTOMERS.binTomb, CUSTOMERS.binBrowse,
        CUSTOMERS.complaints, CUSTOMERS.payouts].map((c, i) => ({
      id: c.vehicleId as string,
      userId: c.id, make: 'Hyundai', model: 'i20', color: 'Blue',
      licensePlate: `TN02BB${String(i).padStart(4, '0')}`,
      vehicleType: 'hatchback' as const, isDefault: true,
    })),
  ])

  // CUSTOMERS.profile deliberately has no vehicle and no address: the profile
  // spec adds them, and asserting "added" is only meaningful from empty.
  await db.insert(userAddresses).values([
    ...[CUSTOMERS.book, CUSTOMERS.cancel, CUSTOMERS.reschedule, CUSTOMERS.review,
     CUSTOMERS.payLater, CUSTOMERS.coupons, CUSTOMERS.browse,
     CUSTOMERS.journey, CUSTOMERS.vendorJob, CUSTOMERS.vendorReject,
     CUSTOMERS.logout, CUSTOMERS.session, CUSTOMERS.vehicles,
     CUSTOMERS.journeyCancel, CUSTOMERS.journeyMove, CUSTOMERS.bookAgain].map((c) => ({
      userId: c.id, label: 'Home', address: '14, Gandhi Nagar, Adyar',
      city: 'Chennai', lat: ORIGIN.lat, lng: ORIGIN.lng, isDefault: true,
    })),
    // The doorstep fixture's pair. The default one is pinned at ORIGIN, which
    // is MAIN's own location and so comfortably inside its 15 km radius. The
    // other has no coordinates at all — the state the booking page has to
    // notice and prompt for, since the server cannot run a coverage check
    // without them.
    { id: ADDRESSES.doorstepPinned, userId: CUSTOMERS.doorstep.id, label: 'Home',
      address: '14, Gandhi Nagar, Adyar', city: 'Chennai',
      lat: ORIGIN.lat, lng: ORIGIN.lng, geoSource: 'map_pin', isDefault: true },
    { id: ADDRESSES.doorstepUnpinned, userId: CUSTOMERS.doorstep.id, label: 'Office',
      address: '9, Mount Road, Guindy', city: 'Chennai',
      lat: null, lng: null, geoSource: 'unset', isDefault: false },
  ])
}

// ─── garages ────────────────────────────────────────────────────────────────

/** Open every day across the given window. */
const hoursFor = (vendorId: string, openTime: string, closeTime: string) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    vendorId, dayOfWeek, openTime, closeTime, isClosed: false,
  }))

async function seedVendorRows() {
  await db.insert(vendors).values([
    {
      id: VENDORS.main.id, ownerId: STAFF.owner.id, businessName: VENDORS.main.name,
      phone: '9000001001', address: '1, Test Street, Adyar', city: 'Chennai', pincode: '600020',
      lat: ORIGIN.lat, lng: ORIGIN.lng, geoSource: 'map_pin', geoConfirmedAt: now,
      vehicleTypes: ['hatchback', 'sedan', 'suv'],
      // Both modes on, so the Drop In / Doorstep toggle actually renders. A
      // vendor with one mode hides it entirely, which is its own test case.
      isVerified: true, doorstepEnabled: true, dropinEnabled: true,
      // Room to spare on purpose. Many specs book tomorrow's first free slot
      // here, and a dozen fixture bookings sit on tomorrow already: with a
      // realistic bay count, the third spec to pick 06:00 would find it full.
      // Capacity itself is tried on CAPACITY, which has one bay.
      slotIntervalMins: 30, status: 'active', bays: 50, jobsPerDay: null,
      doorstepRadiusKm: 15,
    },
    {
      id: VENDORS.second.id, ownerId: STAFF.owner.id, businessName: VENDORS.second.name,
      phone: '9000001005', address: '2, Second Street, T Nagar', city: 'Chennai', pincode: '600017',
      lat: ORIGIN.lat + 0.02, lng: ORIGIN.lng + 0.02, geoSource: 'map_pin', geoConfirmedAt: now,
      vehicleTypes: ['hatchback', 'sedan'],
      isVerified: true, doorstepEnabled: false, dropinEnabled: true,
      slotIntervalMins: 30, status: 'active',
    },
    {
      id: VENDORS.narrow.id, ownerId: STAFF.narrowOwner.id, businessName: VENDORS.narrow.name,
      phone: '9000001004', address: '3, Short Day Road, Velachery', city: 'Chennai', pincode: '600042',
      lat: ORIGIN.lat - 0.03, lng: ORIGIN.lng - 0.01, geoSource: 'map_pin', geoConfirmedAt: now,
      vehicleTypes: ['hatchback', 'sedan', 'suv'],
      isVerified: true, doorstepEnabled: false, dropinEnabled: true,
      slotIntervalMins: 30, status: 'active',
    },
    // The scheduling garages. Spread south-west, well past every filler, so
    // they never come between MAIN and the fillers in a distance sort.
    ...[
      { id: VENDORS.capacity.id, name: VENDORS.capacity.name, ownerId: STAFF.scheduleOwner.id,
        bays: 1 },
      { id: VENDORS.holiday.id, name: VENDORS.holiday.name, ownerId: STAFF.scheduleOwner.id },
      { id: VENDORS.paused.id, name: VENDORS.paused.name, ownerId: STAFF.scheduleOwner.id,
        bookingsPausedAt: daysAgo(1), bookingsPausedReason: 'Closed for renovation' },
      { id: VENDORS.timeOff.id, name: VENDORS.timeOff.name, ownerId: STAFF.scheduleOwner.id },
      { id: VENDORS.opsEdit.id, name: VENDORS.opsEdit.name, ownerId: STAFF.narrowOwner.id },
      { id: VENDORS.lastBay.id, name: VENDORS.lastBay.name, ownerId: STAFF.scheduleOwner.id,
        bays: 1 },
    ].map(({ name, ...garage }, i) => ({
      ...garage,
      businessName: name,
      phone: `900003${String(i).padStart(4, '0')}`,
      address: `${i + 1}, Schedule Street, Tambaram`, city: 'Chennai', pincode: '600045',
      lat: ORIGIN.lat - 0.25 - i * 0.01, lng: ORIGIN.lng - 0.15,
      geoSource: 'map_pin' as const, geoConfirmedAt: now,
      vehicleTypes: ['hatchback', 'sedan', 'suv'],
      isVerified: true, doorstepEnabled: false, dropinEnabled: true,
      slotIntervalMins: 30, status: 'active' as const,
    })),
    // Inspection jobs and final bills. Further south-west than the
    // scheduling garages, for the same reason: it never comes between MAIN
    // and the fillers in a distance sort. A few bays, so its seeded jobs never
    // look like a full garage.
    {
      id: VENDORS.inspect.id, ownerId: STAFF.inspectOwner.id, businessName: VENDORS.inspect.name,
      phone: '9000003100', address: '1, Inspection Road, Chromepet', city: 'Chennai',
      pincode: '600044', lat: ORIGIN.lat - 0.35, lng: ORIGIN.lng - 0.15,
      geoSource: 'map_pin' as const, geoConfirmedAt: now,
      vehicleTypes: ['hatchback', 'sedan', 'suv'],
      isVerified: true, doorstepEnabled: false, dropinEnabled: true,
      slotIntervalMins: 30, status: 'active' as const, bays: 5,
    },
    // Refunds and no-show money. Further south-west again, out of every
    // distance sort that matters, and booked by nobody but the seed.
    {
      id: VENDORS.refunds.id, ownerId: STAFF.refundsOwner.id, businessName: VENDORS.refunds.name,
      phone: '9000003200', address: '1, Refund Road, Pallavaram', city: 'Chennai',
      pincode: '600043', lat: ORIGIN.lat - 0.45, lng: ORIGIN.lng - 0.15,
      geoSource: 'map_pin' as const, geoConfirmedAt: now,
      vehicleTypes: ['hatchback', 'sedan', 'suv'],
      isVerified: true, doorstepEnabled: false, dropinEnabled: true,
      slotIntervalMins: 30, status: 'active' as const, bays: 5,
    },
    // Volume for listing, sorting and infinite scroll. Spread north-east so
    // distance ordering from ORIGIN is strictly increasing and therefore
    // assertable.
    ...Array.from({ length: FILLER_VENDOR_COUNT }, (_, i) => ({
      id: fillerVendorId(i), ownerId: STAFF.narrowOwner.id,
      businessName: `Filler Garage ${String(i + 1).padStart(2, '0')}`,
      phone: `900002${String(i).padStart(4, '0')}`,
      address: `${i + 1}, Filler Lane`, city: 'Chennai', pincode: '600001',
      lat: ORIGIN.lat + 0.05 + i * 0.01, lng: ORIGIN.lng + 0.05 + i * 0.01,
      geoSource: 'map_pin' as const, geoConfirmedAt: now,
      vehicleTypes: ['hatchback', 'sedan'],
      isVerified: true, doorstepEnabled: false, dropinEnabled: true,
      slotIntervalMins: 30, status: 'active' as const,
    })),
  ])

  await db.insert(vendorWorkingHours).values([
    // 06:00–22:00 is wide on purpose: it guarantees tomorrow has capacity for
    // even the longest cart, whatever time the suite happens to run.
    ...hoursFor(VENDORS.main.id, '06:00:00', '22:00:00'),
    ...hoursFor(VENDORS.second.id, '09:00:00', '18:00:00'),
    // 09:00–11:00 is a two-hour day. One 90-minute service fits; two do not.
    ...hoursFor(VENDORS.narrow.id, '09:00:00', '11:00:00'),
    ...Array.from({ length: FILLER_VENDOR_COUNT }, (_, i) =>
      hoursFor(fillerVendorId(i), '09:00:00', '18:00:00')).flat(),
    // As wide as MAIN's, so tomorrow at 10:00 is a real slot whenever the
    // suite runs.
    ...[VENDORS.capacity, VENDORS.holiday, VENDORS.paused, VENDORS.timeOff, VENDORS.lastBay,
        VENDORS.inspect, VENDORS.refunds]
      .flatMap((v) => hoursFor(v.id, '06:00:00', '22:00:00')),
    // Saturday ends at 13:00; the admin spec checks a save leaves it there.
    ...hoursFor(VENDORS.opsEdit.id, '09:00:00', '18:00:00').map((day) =>
      day.dayOfWeek === 6 ? { ...day, closeTime: '13:00:00' } : day),
  ])

  // Tomorrow is a holiday at HOLIDAY, so a day its weekly hours call open
  // offers nothing and refuses checkout.
  await db.insert(vendorClosures).values({
    vendorId: VENDORS.holiday.id, date: istDate(1), reason: 'Family function',
  })

  await db.insert(vendorServiceAreas).values([
    { vendorId: VENDORS.main.id, areaName: 'Adyar', pincode: '600020' },
    { vendorId: VENDORS.main.id, areaName: 'Besant Nagar', pincode: '600090' },
    { vendorId: VENDORS.second.id, areaName: 'T Nagar', pincode: '600017' },
  ])

  // The garage page has a Photos tab; without rows it renders an empty state
  // and the tab test proves nothing.
  await db.insert(vendorPhotos).values([
    { vendorId: VENDORS.main.id, url: 'https://placehold.co/600x400/png?text=Bay+1', sortOrder: 0 },
    { vendorId: VENDORS.main.id, url: 'https://placehold.co/600x400/png?text=Bay+2', sortOrder: 1 },
  ])
}

async function seedServiceRows() {
  await db.insert(services).values([
    { id: SERVICES.wash.id, vendorId: VENDORS.main.id, name: SERVICES.wash.name,
      description: 'A quick exterior wash.', category: 'car_wash', pricingType: 'flat',
      price: SERVICES.wash.price, durationMins: SERVICES.wash.durationMins, isActive: true },

    // priceSuv left null: an SUV owner sees this line as unpriced and the CTA
    // switches to "Remove the unpriced service".
    { id: SERVICES.tiered.id, vendorId: VENDORS.main.id, name: SERVICES.tiered.name,
      description: 'Priced by vehicle size.', category: 'detailing', pricingType: 'per_vehicle',
      price: SERVICES.tiered.priceHatchback,
      priceHatchback: SERVICES.tiered.priceHatchback,
      priceSedan: SERVICES.tiered.priceSedan,
      priceSuv: SERVICES.tiered.priceSuv,
      durationMins: SERVICES.tiered.durationMins, isActive: true },

    { id: SERVICES.detail.id, vendorId: VENDORS.main.id, name: SERVICES.detail.name,
      description: 'The long one.', category: 'detailing', pricingType: 'flat',
      price: SERVICES.detail.price, durationMins: SERVICES.detail.durationMins, isActive: true },

    // Quoted after inspection, so payableAmount is null and the CTA reads
    // "Confirm booking" instead of "Pay Now".
    { id: SERVICES.inspect.id, vendorId: VENDORS.main.id, name: SERVICES.inspect.name,
      description: 'Priced after we look at it.', category: 'scratch_removal',
      pricingType: 'on_inspection', price: SERVICES.inspect.price,
      durationMins: SERVICES.inspect.durationMins, isActive: true },

    { id: SERVICES.packageDeal.id, vendorId: VENDORS.main.id, name: SERVICES.packageDeal.name,
      description: 'Wash plus full detail.', category: 'package', pricingType: 'flat',
      price: SERVICES.packageDeal.price, durationMins: SERVICES.packageDeal.durationMins,
      isActive: true },

    { id: SERVICES.inactive.id, vendorId: VENDORS.main.id, name: SERVICES.inactive.name,
      description: 'Withdrawn from sale.', category: 'coating', pricingType: 'flat',
      price: SERVICES.inactive.price, durationMins: SERVICES.inactive.durationMins,
      isActive: false },

    { id: SERVICES.secondOnly.id, vendorId: VENDORS.second.id, name: SERVICES.secondOnly.name,
      category: 'car_wash', pricingType: 'flat', price: SERVICES.secondOnly.price,
      durationMins: SERVICES.secondOnly.durationMins, isActive: true },

    { id: SERVICES.narrowA.id, vendorId: VENDORS.narrow.id, name: SERVICES.narrowA.name,
      category: 'car_wash', pricingType: 'flat', price: SERVICES.narrowA.price,
      durationMins: SERVICES.narrowA.durationMins, isActive: true },
    { id: SERVICES.narrowB.id, vendorId: VENDORS.narrow.id, name: SERVICES.narrowB.name,
      category: 'detailing', pricingType: 'flat', price: SERVICES.narrowB.price,
      durationMins: SERVICES.narrowB.durationMins, isActive: true },

    ...[
      { service: SERVICES.capacityWash, vendorId: VENDORS.capacity.id },
      { service: SERVICES.holidayWash, vendorId: VENDORS.holiday.id },
      { service: SERVICES.pausedWash, vendorId: VENDORS.paused.id },
      { service: SERVICES.timeOffWash, vendorId: VENDORS.timeOff.id },
      { service: SERVICES.lastBayWash, vendorId: VENDORS.lastBay.id },
    ].map(({ service, vendorId }) => ({
      id: service.id, vendorId, name: service.name, category: 'car_wash' as const,
      pricingType: 'flat' as const, price: service.price,
      durationMins: service.durationMins, isActive: true,
    })),

    // Priced on inspection: the ₹299 is the fee, and the work is billed
    // after. Every booking on it can get a final bill.
    { id: SERVICES.inspectFee.id, vendorId: VENDORS.inspect.id, name: SERVICES.inspectFee.name,
      description: 'We look at the dent and quote the repair.', category: 'scratch_removal',
      pricingType: 'on_inspection', price: SERVICES.inspectFee.price,
      durationMins: SERVICES.inspectFee.durationMins, isActive: true },

    { id: SERVICES.refundsWash.id, vendorId: VENDORS.refunds.id, name: SERVICES.refundsWash.name,
      category: 'car_wash', pricingType: 'flat', price: SERVICES.refundsWash.price,
      durationMins: SERVICES.refundsWash.durationMins, isActive: true },

    // One service per filler garage, so they are bookable and not just names.
    ...Array.from({ length: FILLER_VENDOR_COUNT }, (_, i) => ({
      vendorId: fillerVendorId(i), name: 'Standard Wash', category: 'car_wash' as const,
      pricingType: 'flat' as const, price: `${399 + i * 50}.00`, durationMins: 30, isActive: true,
    })),
  ])

  await db.insert(servicePackageItems).values([
    { packageId: SERVICES.packageDeal.id, serviceId: SERVICES.wash.id, sortOrder: 0 },
    { packageId: SERVICES.packageDeal.id, serviceId: SERVICES.detail.id, sortOrder: 1 },
  ])
}

// ─── membership ─────────────────────────────────────────────────────────────

async function seedMembership() {
  await db.insert(userMemberMapping).values([
    { vendorId: VENDORS.main.id, userId: STAFF.owner.id, role: 'vendor_admin', status: 'active' },
    { vendorId: VENDORS.second.id, userId: STAFF.owner.id, role: 'vendor_admin', status: 'active' },
    { vendorId: VENDORS.narrow.id, userId: STAFF.narrowOwner.id, role: 'vendor_admin', status: 'active' },
    // An operator on MAIN only. The nav must hide earnings/services/settings
    // for this role, and direct navigation must be refused.
    { vendorId: VENDORS.main.id, userId: STAFF.operator.id, role: 'vendor_operator', status: 'active' },
    ...[VENDORS.capacity, VENDORS.holiday, VENDORS.paused, VENDORS.timeOff, VENDORS.lastBay].map((v) => ({
      vendorId: v.id, userId: STAFF.scheduleOwner.id, role: 'vendor_admin' as const,
      status: 'active' as const,
    })),
    { vendorId: VENDORS.opsEdit.id, userId: STAFF.narrowOwner.id, role: 'vendor_admin', status: 'active' },
    { vendorId: VENDORS.inspect.id, userId: STAFF.inspectOwner.id, role: 'vendor_admin', status: 'active' },
    { vendorId: VENDORS.refunds.id, userId: STAFF.refundsOwner.id, role: 'vendor_admin', status: 'active' },
    // Platform scope: the CHECK constraint requires vendorId to be null here.
    { vendorId: null, userId: STAFF.superAdmin.id, role: 'super_admin', status: 'active' },
  ])
}

// ─── discounts ──────────────────────────────────────────────────────────────

async function seedDiscountRows() {
  const yearAhead = new Date(now.getTime() + 365 * 24 * HOUR)

  await db.insert(discounts).values([
    { id: DISCOUNTS.percentCapped.id, code: DISCOUNTS.percentCapped.code,
      description: '20% off, capped at ₹200', discountType: 'percentage',
      percentOff: DISCOUNTS.percentCapped.percentOff,
      maxDiscountAmount: DISCOUNTS.percentCapped.maxDiscountAmount,
      fundedBy: 'platform', startsAt: daysAgo(1), endsAt: yearAhead, isActive: true },

    { id: DISCOUNTS.fixedMinOrder.id, code: DISCOUNTS.fixedMinOrder.code,
      description: '₹100 off orders above ₹1000', discountType: 'fixed',
      amountOff: DISCOUNTS.fixedMinOrder.amountOff,
      minOrderAmount: DISCOUNTS.fixedMinOrder.minOrderAmount,
      fundedBy: 'platform', startsAt: daysAgo(1), endsAt: yearAhead, isActive: true },

    { id: DISCOUNTS.expired.id, code: DISCOUNTS.expired.code, description: 'Lapsed last week',
      discountType: 'percentage', percentOff: '10.00', fundedBy: 'platform',
      startsAt: daysAgo(30), endsAt: daysAgo(7), isActive: true },

    // Scoped to SECOND, so applying it at MAIN must be refused.
    { id: DISCOUNTS.otherVendor.id, code: DISCOUNTS.otherVendor.code,
      description: 'Second garage only', discountType: 'percentage', percentOff: '15.00',
      vendorId: VENDORS.second.id, fundedBy: 'vendor',
      startsAt: daysAgo(1), endsAt: yearAhead, isActive: true },

    { id: DISCOUNTS.exhaustedTotal.id, code: DISCOUNTS.exhaustedTotal.code,
      description: 'Single global use, already spent', discountType: 'percentage',
      percentOff: '10.00', totalUsageLimit: 1, fundedBy: 'platform',
      startsAt: daysAgo(1), endsAt: yearAhead, isActive: true },

    { id: DISCOUNTS.exhaustedPerUser.id, code: DISCOUNTS.exhaustedPerUser.code,
      description: 'One per customer, already used by the coupon customer',
      discountType: 'percentage', percentOff: '10.00', perUserLimit: 1,
      fundedBy: 'platform', startsAt: daysAgo(1), endsAt: yearAhead, isActive: true },

    { id: DISCOUNTS.vendorFunded.id, code: DISCOUNTS.vendorFunded.code,
      description: 'Funded by the garage, not the platform', discountType: 'percentage',
      percentOff: DISCOUNTS.vendorFunded.percentOff, fundedBy: 'vendor',
      startsAt: daysAgo(1), endsAt: yearAhead, isActive: true },

    { id: DISCOUNTS.toDeactivate.id, code: DISCOUNTS.toDeactivate.code,
      description: 'Active until the admin spec switches it off',
      discountType: 'percentage', percentOff: '5.00', fundedBy: 'platform',
      startsAt: daysAgo(1), endsAt: yearAhead, isActive: true },
  ])
}

// ─── bookings ───────────────────────────────────────────────────────────────

type BookingSpec = {
  id: string
  userId: string
  vendorId?: string
  /** Required: bookings.vehicle_id is NOT NULL. */
  vehicleId: string
  scheduledAt: Date
  /** 'rescheduled' is the old way a move retired a booking; a fixture keeps it. */
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled'
  items: Array<{ id: string; name: string; amount: string; durationMins: number }>
  discount?: { id: string; code: string; amount: string; fundedBy: 'platform' | 'vendor' }
  /**
   * `paidAt` defaults to a day ago for a paid (or since refunded) one. A
   * refunded one carries the refund as ops records it: the running total on
   * the payment and a refund_records row (see 0029).
   */
  payment?: {
    status: 'pending' | 'paid' | 'refunded'
    txnId?: string
    paidAt?: Date
    refund?: { ref: string; at: Date }
    /** The Razorpay mode (0032); left null, as on a payment from before it. */
    gatewayMode?: 'live' | 'test' | 'fake'
  }
  /** Marked "Test" by ops (0032), at this time. */
  markedTestAt?: Date
  rescheduleCount?: number
  /** Defaults to now. Set it back to make a booking that has been waiting. */
  createdAt?: Date
  /** Defaults to an at-garage job. A doorstep one carries where to go. */
  doorstep?: { address: string; lat: number; lng: number }
  /** When the garage accepted and started it, for a job already under way. */
  acceptedAt?: Date
  startedAt?: Date
  /** When it was finished. Left null, as on a job from before 0028, unless set. */
  completedAt?: Date
  /**
   * How a cancelled booking ended, as the app's own writes leave it: who
   * cancelled, whose call an admin one was, and a no-show. The database
   * holds a no-show or an on-behalf-of to an admin cancellation (0026).
   */
  cancellation?: {
    by: 'user' | 'vendor' | 'admin'
    onBehalfOf?: 'customer' | 'garage' | 'detlio'
    noShow?: 'customer' | 'garage'
    reason?: string
    at: Date
  }
  /** Written by a reschedule: the booking this one was moved from. */
  rescheduledFromId?: string
  /** The garage's deadline to accept (0042). Null unless set, as on every booking from before it. */
  respondBy?: Date
}

/**
 * Writes a booking plus its line items, and optionally its payment row.
 *
 * A paid payment is written directly, as a row written by hand would be, and
 * gets no receipt number: nothing reads one until a receipt is opened, and
 * the receipt read issues the missing number then (its safety net), which is
 * the path receipts.spec exercises. Issuing them here instead would number
 * forty-odd bookings no spec looks at, and leave the safety net untested.
 *
 * `amount` is derived the way the API derives it — subtotal minus discount —
 * rather than being stated separately, so a fixture can never disagree with
 * the invariant the specs assert.
 */
async function insertBooking(spec: BookingSpec) {
  const subtotal = spec.items.reduce((sum, i) => sum + Number(i.amount), 0)
  const discountAmount = Number(spec.discount?.amount ?? 0)
  const durationMins = spec.items.reduce((sum, i) => sum + i.durationMins, 0)

  await db.insert(bookings).values({
    id: spec.id,
    userId: spec.userId,
    vendorId: spec.vendorId ?? VENDORS.main.id,
    vehicleId: spec.vehicleId,
    bookingType: spec.doorstep ? 'doorstep' : 'dropin',
    address: spec.doorstep?.address ?? null,
    lat: spec.doorstep?.lat ?? null,
    lng: spec.doorstep?.lng ?? null,
    scheduledAt: spec.scheduledAt,
    durationMins,
    status: spec.status,
    subtotalAmount: subtotal.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    amount: (subtotal - discountAmount).toFixed(2),
    discountId: spec.discount?.id ?? null,
    discountCode: spec.discount?.code ?? null,
    discountFundedBy: spec.discount?.fundedBy ?? null,
    paymentMethod: 'online',
    rescheduleCount: spec.rescheduleCount ?? 0,
    ...(spec.createdAt && { createdAt: spec.createdAt }),
    acceptedAt: spec.acceptedAt ?? null,
    startedAt: spec.startedAt ?? null,
    completedAt: spec.completedAt ?? null,
    ...(spec.cancellation && {
      cancelledBy: spec.cancellation.by,
      cancelledOnBehalfOf: spec.cancellation.onBehalfOf ?? null,
      cancellationReason: spec.cancellation.reason ?? null,
      cancelledAt: spec.cancellation.at,
      noShow: spec.cancellation.noShow ?? null,
      noShowMarkedAt: spec.cancellation.noShow ? spec.cancellation.at : null,
    }),
    ...(spec.rescheduledFromId && {
      rescheduledFromId: spec.rescheduledFromId,
      originalBookingId: spec.rescheduledFromId,
    }),
    ...(spec.markedTestAt && { markedTestAt: spec.markedTestAt, markedTestBy: 'E2E seed' }),
    ...(spec.respondBy && { respondBy: spec.respondBy }),
  })

  await db.insert(bookingItems).values(
    spec.items.map((item, sortOrder) => ({
      bookingId: spec.id,
      serviceId: item.id,
      name: item.name,
      amount: item.amount,
      durationMins: item.durationMins,
      sortOrder,
    }))
  )

  if (spec.payment) {
    const paidAmount = (subtotal - discountAmount).toFixed(2)
    const refund = spec.payment.refund
    await db.insert(payments).values({
      bookingId: spec.id,
      gateway: 'razorpay',
      gatewayTxnId: spec.payment.txnId ?? null,
      gatewayMode: spec.payment.gatewayMode ?? null,
      amount: paidAmount,
      currency: 'INR',
      status: spec.payment.status,
      paidAt: spec.payment.status === 'pending' ? null : (spec.payment.paidAt ?? daysAgo(1)),
      // Only a full refund is seeded: it is what moves a payment to 'refunded'.
      ...(refund && {
        refundedAmount: paidAmount,
        refundRef: refund.ref,
        refundedAt: refund.at,
        refundedBy: 'E2E seed',
      }),
    })
    if (refund) {
      await db.insert(refundRecords).values({
        kind: 'booking',
        targetId: spec.id,
        bookingId: spec.id,
        amount: paidAmount,
        refundedBefore: '0.00',
        refundRef: refund.ref,
        recordedBy: 'E2E seed',
        recordedAt: refund.at,
      })
    }
  }

  if (spec.discount) {
    await db.insert(discountRedemptions).values({
      discountId: spec.discount.id,
      bookingId: spec.id,
      userId: spec.userId,
      code: spec.discount.code,
      discountAmount: discountAmount.toFixed(2),
    })
  }
}

const washItem = {
  id: SERVICES.wash.id, name: SERVICES.wash.name,
  amount: SERVICES.wash.price, durationMins: SERVICES.wash.durationMins,
}
const detailItem = {
  id: SERVICES.detail.id, name: SERVICES.detail.name,
  amount: SERVICES.detail.price, durationMins: SERVICES.detail.durationMins,
}
/** Sold before the garage withdrew it (isActive false): history only. */
const retiredItem = {
  id: SERVICES.inactive.id, name: SERVICES.inactive.name,
  amount: SERVICES.inactive.price, durationMins: SERVICES.inactive.durationMins,
}

async function seedBookingRows() {
  await insertBooking({ id: BOOKINGS.cancellable, userId: CUSTOMERS.cancel.id, vehicleId: CUSTOMERS.cancel.vehicleId,
    scheduledAt: tomorrowAt(10), status: 'confirmed', items: [washItem],
    payment: { status: 'paid', txnId: 'pay_seed_cancellable' } })

  // Exists only so VEHICLES.booked is referenced. Completed rather than
  // upcoming, so the garage spec cannot delete it by cancelling first — the
  // car has to be removable while real history still names it.
  await insertBooking({ id: BOOKINGS.vehicleArchive, userId: CUSTOMERS.vehicles.id,
    vehicleId: VEHICLES.booked, scheduledAt: daysAgo(3), status: 'completed',
    items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_vehicle_archive' } })

  await insertBooking({ id: BOOKINGS.cancellableNoReason, userId: CUSTOMERS.cancel.id,
    vehicleId: CUSTOMERS.cancel.vehicleId, scheduledAt: tomorrowAt(18), status: 'confirmed',
    items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_cancel_noreason' } })

  // now + 1h: inside the 2-hour cutoff. Cancelling must be refused with
  // CANCELLATION_WINDOW_PASSED. Unreachable through the UI — the slot picker
  // never offers a time this close — so it has to be written directly.
  await insertBooking({ id: BOOKINGS.cancelTooLate, userId: CUSTOMERS.cancel.id, vehicleId: CUSTOMERS.cancel.vehicleId,
    scheduledAt: insideCutoff(), status: 'confirmed', items: [washItem],
    payment: { status: 'paid', txnId: 'pay_seed_toolate' } })

  await insertBooking({ id: BOOKINGS.cancelWrongStatus, userId: CUSTOMERS.cancel.id, vehicleId: CUSTOMERS.cancel.vehicleId,
    scheduledAt: tomorrowAt(12), status: 'in_progress', items: [washItem],
    payment: { status: 'paid', txnId: 'pay_seed_inprogress' } })

  // Paid AND discounted: rescheduling must carry both across to the new
  // booking, without writing a second redemption row.
  await insertBooking({ id: BOOKINGS.reschedulable, userId: CUSTOMERS.reschedule.id, vehicleId: CUSTOMERS.reschedule.vehicleId,
    scheduledAt: tomorrowAt(11), status: 'confirmed', items: [washItem, detailItem],
    discount: { id: DISCOUNTS.percentCapped.id, code: DISCOUNTS.percentCapped.code,
      amount: '200.00', fundedBy: 'platform' },
    // Test mode and marked Test, so the spec can see a move carry both.
    markedTestAt: daysAgo(1),
    payment: { status: 'paid', txnId: 'pay_seed_reschedulable', gatewayMode: 'test' } })

  await insertBooking({ id: BOOKINGS.rescheduleExhausted, userId: CUSTOMERS.reschedule.id, vehicleId: CUSTOMERS.reschedule.vehicleId,
    scheduledAt: tomorrowAt(13), status: 'confirmed', items: [washItem],
    payment: { status: 'paid', txnId: 'pay_seed_exhausted' }, rescheduleCount: 2 })

  await insertBooking({ id: BOOKINGS.rescheduleTooLate, userId: CUSTOMERS.reschedule.id, vehicleId: CUSTOMERS.reschedule.vehicleId,
    scheduledAt: insideCutoff(), status: 'confirmed', items: [washItem],
    payment: { status: 'paid', txnId: 'pay_seed_rs_toolate' } })

  await insertBooking({ id: BOOKINGS.reviewable, userId: CUSTOMERS.review.id, vehicleId: CUSTOMERS.review.vehicleId,
    scheduledAt: daysAgo(2), status: 'completed', items: [washItem],
    payment: { status: 'paid', txnId: 'pay_seed_reviewable' } })

  await insertBooking({ id: BOOKINGS.alreadyReviewed, userId: CUSTOMERS.review.id, vehicleId: CUSTOMERS.review.vehicleId,
    scheduledAt: daysAgo(5), status: 'completed', items: [detailItem],
    payment: { status: 'paid', txnId: 'pay_seed_reviewed' } })

  // Pending with an unpaid payment row: the legacy createPaymentOrder path on
  // /bookings/[id], which is a different code path from checkout's intent flow.
  await insertBooking({ id: BOOKINGS.unpaid, userId: CUSTOMERS.payLater.id, vehicleId: CUSTOMERS.payLater.vehicleId,
    scheduledAt: tomorrowAt(15), status: 'pending', items: [washItem],
    payment: { status: 'pending' } })

  await insertBooking({ id: BOOKINGS.vendorIncoming, userId: CUSTOMERS.vendorJob.id,
    vehicleId: CUSTOMERS.vendorJob.vehicleId, scheduledAt: tomorrowAt(16), status: 'pending',
    items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_incoming' } })

  await insertBooking({ id: BOOKINGS.vendorRejectable, userId: CUSTOMERS.vendorReject.id,
    vehicleId: CUSTOMERS.vendorReject.vehicleId, scheduledAt: tomorrowAt(17), status: 'pending',
    items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_rejectable' } })

  // Pending, so the 2-hour cutoff does not apply: only an accepted booking is
  // held to it.
  await insertBooking({ id: BOOKINGS.cancelPendingSoon, userId: CUSTOMERS.cancel.id,
    vehicleId: CUSTOMERS.cancel.vehicleId, scheduledAt: insideCutoff(), status: 'pending',
    items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_pending_soon' } })

  await insertBooking({ id: BOOKINGS.reschedulePendingSoon, userId: CUSTOMERS.reschedule.id,
    vehicleId: CUSTOMERS.reschedule.vehicleId, scheduledAt: insideCutoff(), status: 'pending',
    items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_move_soon' } })

  await insertBooking({ id: BOOKINGS.vendorStarted, userId: CUSTOMERS.vendorLate.id,
    vehicleId: CUSTOMERS.vendorLate.vehicleId, scheduledAt: anHourAgo(), status: 'pending',
    items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_started' } })

  await insertBooking({ id: BOOKINGS.vendorDoorstep, userId: CUSTOMERS.vendorDoorstep.id,
    vehicleId: CUSTOMERS.vendorDoorstep.vehicleId, scheduledAt: tomorrowAt(18), status: 'pending',
    items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_doorstep_job' },
    doorstep: { address: '7, Lake View Road, Adyar', ...DOORSTEP_JOB_PIN } })

  // Lives on SECOND. While MAIN is the active tenant this must never be
  // visible — that is the whole point of the tenancy spec.
  await insertBooking({ id: BOOKINGS.secondTenant, userId: CUSTOMERS.book.id, vehicleId: VEHICLES.hatchback,
    vendorId: VENDORS.second.id, scheduledAt: tomorrowAt(14), status: 'confirmed',
    items: [{ id: SERVICES.secondOnly.id, name: SERVICES.secondOnly.name,
      amount: SERVICES.secondOnly.price, durationMins: SERVICES.secondOnly.durationMins }],
    payment: { status: 'paid', txnId: 'pay_seed_second' } })

  // The one job in CAPACITY's only bay tomorrow: 10:00–10:30. Paid, because
  // only paid bookings hold capacity — the same ones the garage can see.
  await insertBooking({ id: BOOKINGS.capacityHeld, userId: CUSTOMERS.capacityHolder.id,
    vehicleId: CUSTOMERS.capacityHolder.vehicleId, vendorId: VENDORS.capacity.id,
    scheduledAt: tomorrowAt(10), status: 'confirmed',
    items: [{ id: SERVICES.capacityWash.id, name: SERVICES.capacityWash.name,
      amount: SERVICES.capacityWash.price, durationMins: SERVICES.capacityWash.durationMins }],
    payment: { status: 'paid', txnId: 'pay_seed_capacity_held' } })

  // Booked the old way, unpaid, at the time capacityHeld fills. Holds nothing
  // while unpaid — which is why paying for it has to be checked.
  await insertBooking({ id: BOOKINGS.payLaterFull, userId: CUSTOMERS.payLaterFull.id,
    vehicleId: CUSTOMERS.payLaterFull.vehicleId, vendorId: VENDORS.capacity.id,
    scheduledAt: tomorrowAt(10), status: 'pending',
    items: [{ id: SERVICES.capacityWash.id, name: SERVICES.capacityWash.name,
      amount: SERVICES.capacityWash.price, durationMins: SERVICES.capacityWash.durationMins }],
    payment: { status: 'pending' } })

  // Admin booking ops. One customer for the lot, since one spec file drives
  // them all in order; each booking has a reference of its own so the search
  // spec can find exactly one.
  const opsCustomer = { userId: CUSTOMERS.adminOps.id, vehicleId: CUSTOMERS.adminOps.vehicleId }
  // Paid a day before it was booked, as insertBooking dates every payment:
  // the wait is counted from the later of the two, so from the booking here.
  await insertBooking({ id: BOOKINGS.adminOpsWaiting, ...opsCustomer, scheduledAt: tomorrowAt(9),
    status: 'pending', items: [washItem], createdAt: new Date(now.getTime() - 45 * MINUTE),
    payment: { status: 'paid', txnId: 'pay_seed_ops_waiting' } })
  await insertBooking({ id: BOOKINGS.adminOpsNotes, ...opsCustomer, scheduledAt: tomorrowAt(11),
    status: 'confirmed', items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_ops_notes' } })
  await insertBooking({ id: BOOKINGS.adminOpsCancel, ...opsCustomer, scheduledAt: tomorrowAt(12),
    status: 'confirmed', items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_ops_cancel' } })
  await insertBooking({ id: BOOKINGS.adminOpsNoShow, ...opsCustomer, scheduledAt: twoHoursAgo(),
    status: 'confirmed', items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_ops_noshow' } })
  await insertBooking({ id: BOOKINGS.adminOpsTooEarly, ...opsCustomer, scheduledAt: tomorrowAt(13),
    status: 'confirmed', items: [washItem], payment: { status: 'paid', txnId: 'pay_seed_ops_early' } })

  // The job-records journey's four jobs at INSPECT, each paid ₹299 for the
  // inspection. Three are under way, so the garage can bill them now; the
  // fourth is waiting to be accepted, so its every step is the portal's.
  const inspectItem = {
    id: SERVICES.inspectFee.id, name: SERVICES.inspectFee.name,
    amount: SERVICES.inspectFee.price, durationMins: SERVICES.inspectFee.durationMins,
  }
  const underWay = {
    vendorId: VENDORS.inspect.id, scheduledAt: anHourAgo(), status: 'in_progress' as const,
    items: [inspectItem], acceptedAt: twoHoursAgo(), startedAt: anHourAgo(),
  }
  await insertBooking({ id: BOOKINGS.billDue, userId: CUSTOMERS.billPayer.id,
    vehicleId: CUSTOMERS.billPayer.vehicleId, ...underWay,
    payment: { status: 'paid', txnId: 'pay_seed_bill_due' } })
  await insertBooking({ id: BOOKINGS.billNone, userId: CUSTOMERS.billSmall.id,
    vehicleId: CUSTOMERS.billSmall.vehicleId, ...underWay,
    payment: { status: 'paid', txnId: 'pay_seed_bill_none' } })
  await insertBooking({ id: BOOKINGS.billWebhook, userId: CUSTOMERS.billWebhook.id,
    vehicleId: CUSTOMERS.billWebhook.vehicleId, ...underWay,
    payment: { status: 'paid', txnId: 'pay_seed_bill_webhook' } })
  await insertBooking({ id: BOOKINGS.jobRecords, userId: CUSTOMERS.jobRecords.id,
    vehicleId: CUSTOMERS.jobRecords.vehicleId, vendorId: VENDORS.inspect.id,
    scheduledAt: tomorrowAt(11), status: 'pending', items: [inspectItem],
    payment: { status: 'paid', txnId: 'pay_seed_job_records' } })

  // The refunds journey's bookings at REFUNDS, each a paid ₹499 wash for
  // CUSTOMERS.refunds. Cancelled the way the app itself cancels them, so the
  // refunds list has to tell them apart by the same rules it uses in
  // production.
  const refundsCustomer = {
    userId: CUSTOMERS.refunds.id, vehicleId: CUSTOMERS.refunds.vehicleId, vendorId: VENDORS.refunds.id,
    items: [{ id: SERVICES.refundsWash.id, name: SERVICES.refundsWash.name,
      amount: SERVICES.refundsWash.price, durationMins: SERVICES.refundsWash.durationMins }],
  }
  const detlioCancel = (at: Date) => ({
    by: 'admin' as const, onBehalfOf: 'detlio' as const,
    reason: 'Garage closed for the day', at,
  })
  // Paid four days ago and cancelled three days ago: owed, and late enough
  // for the amber age on the Refunds page.
  await insertBooking({ id: BOOKINGS.refundDetlio, ...refundsCustomer, scheduledAt: daysAgo(2),
    status: 'cancelled', cancellation: detlioCancel(daysAgo(3)),
    payment: { status: 'paid', txnId: 'pay_seed_refund_detlio', paidAt: daysAgo(4) } })
  await insertBooking({ id: BOOKINGS.refundDetlioStays, ...refundsCustomer, scheduledAt: tomorrowAt(11),
    status: 'cancelled', cancellation: detlioCancel(anHourAgo()),
    payment: { status: 'paid', txnId: 'pay_seed_refund_stays', paidAt: daysAgo(1) } })
  // Accepted and then not turned up for, by each side. Ops marks a no-show
  // as an admin cancellation on Detlio's own account.
  await insertBooking({ id: BOOKINGS.refundCustomerNoShow, ...refundsCustomer, scheduledAt: twoHoursAgo(),
    status: 'cancelled', acceptedAt: daysAgo(1),
    cancellation: { by: 'admin', onBehalfOf: 'detlio', noShow: 'customer', at: anHourAgo() },
    payment: { status: 'paid', txnId: 'pay_seed_refund_cust_noshow' } })
  await insertBooking({ id: BOOKINGS.refundGarageNoShow, ...refundsCustomer, scheduledAt: twoHoursAgo(),
    status: 'cancelled', acceptedAt: daysAgo(1),
    cancellation: { by: 'admin', onBehalfOf: 'detlio', noShow: 'garage', at: anHourAgo() },
    payment: { status: 'paid', txnId: 'pay_seed_refund_garage_noshow' } })
  // A move, as rescheduleBookingWithPayment leaves it: the old row cancelled
  // by the customer with its payment still 'paid', and a new row carrying a
  // copy of that payment.
  await insertBooking({ id: BOOKINGS.refundMovedFrom, ...refundsCustomer, scheduledAt: tomorrowAt(12),
    status: 'cancelled',
    cancellation: { by: 'user', reason: 'Rescheduled to a new slot by the customer', at: anHourAgo() },
    payment: { status: 'paid', txnId: 'pay_seed_refund_moved' } })
  await insertBooking({ id: BOOKINGS.refundMovedTo, ...refundsCustomer, scheduledAt: tomorrowAt(14),
    status: 'pending', rescheduledFromId: BOOKINGS.refundMovedFrom, rescheduleCount: 1,
    payment: { status: 'paid', txnId: 'pay_seed_refund_moved' } })
  // Declined by the garage an hour ago: owed, and refunded with Refund now.
  await insertBooking({ id: BOOKINGS.refundSendNow, ...refundsCustomer, scheduledAt: tomorrowAt(15),
    status: 'cancelled', cancellation: { by: 'vendor', reason: 'Fully booked that day', at: anHourAgo() },
    payment: { status: 'paid', txnId: 'pay_seed_refund_send', paidAt: daysAgo(1) } })

  // The receipt spec's bookings at MAIN. A completed one with two services
  // and a promo code, and one the garage declined that ops then refunded in
  // full, both CUSTOMERS.receipts'. Like every seed, neither has a receipt
  // number: the spec's first open issues it. The third is the stranger's,
  // with nothing paid, so it has no receipt to give.
  const receiptsCustomer = { userId: CUSTOMERS.receipts.id, vehicleId: CUSTOMERS.receipts.vehicleId }
  await insertBooking({ id: BOOKINGS.receiptPaid, ...receiptsCustomer, scheduledAt: daysAgo(1),
    status: 'completed', items: [washItem, detailItem],
    discount: { id: DISCOUNTS.percentCapped.id, code: DISCOUNTS.percentCapped.code,
      amount: '200.00', fundedBy: 'platform' },
    payment: { status: 'paid', txnId: 'pay_seed_receipt_paid', paidAt: daysAgo(2) } })
  await insertBooking({ id: BOOKINGS.receiptRefunded, ...receiptsCustomer, scheduledAt: daysAgo(1),
    status: 'cancelled', items: [washItem],
    cancellation: { by: 'vendor', reason: 'Fully booked that day', at: daysAgo(2) },
    payment: { status: 'refunded', txnId: 'pay_seed_receipt_refunded', paidAt: daysAgo(3),
      refund: { ref: 'rfnd_E2ERECEIPT0001', at: daysAgo(1) } } })
  await insertBooking({ id: BOOKINGS.receiptUnpaid, userId: CUSTOMERS.receiptsStranger.id,
    vehicleId: CUSTOMERS.receiptsStranger.vehicleId, scheduledAt: tomorrowAt(19), status: 'pending',
    items: [washItem], payment: { status: 'pending' } })

  // My bookings, for CUSTOMERS.myBookings at MAIN. Each a different service,
  // so the spec can read each tab's order off the cards. Nothing here is
  // owed a refund: the cancelled ones were never paid, or were moved.
  const history = { userId: CUSTOMERS.myBookings.id, vehicleId: CUSTOMERS.myBookings.vehicleId }
  const tieredItem = {
    id: SERVICES.tiered.id, name: SERVICES.tiered.name,
    amount: SERVICES.tiered.priceHatchback, durationMins: SERVICES.tiered.durationMins,
  }
  const inspectionItem = {
    id: SERVICES.inspect.id, name: SERVICES.inspect.name,
    amount: SERVICES.inspect.price, durationMins: SERVICES.inspect.durationMins,
  }
  const packageItem = {
    id: SERVICES.packageDeal.id, name: SERVICES.packageDeal.name,
    amount: SERVICES.packageDeal.price, durationMins: SERVICES.packageDeal.durationMins,
  }
  await insertBooking({ id: BOOKINGS.historyUpcomingSoon, ...history, scheduledAt: tomorrowAt(8),
    status: 'pending', items: [washItem], payment: { status: 'pending' } })
  await insertBooking({ id: BOOKINGS.historyUpcomingLater, ...history, scheduledAt: tomorrowAt(15),
    status: 'confirmed', items: [tieredItem],
    payment: { status: 'paid', txnId: 'pay_seed_history_later' } })
  // A move, as rescheduleBookingWithPayment leaves it (see refundMovedFrom).
  await insertBooking({ id: BOOKINGS.historyMovedFrom, ...history, scheduledAt: tomorrowAt(10),
    status: 'cancelled', items: [inspectionItem],
    cancellation: { by: 'user', reason: 'Rescheduled to a new slot by the customer', at: anHourAgo() },
    payment: { status: 'paid', txnId: 'pay_seed_history_moved' } })
  await insertBooking({ id: BOOKINGS.historyMovedTo, ...history, scheduledAt: tomorrowAt(12),
    status: 'pending', items: [inspectionItem], rescheduledFromId: BOOKINGS.historyMovedFrom,
    rescheduleCount: 1, payment: { status: 'paid', txnId: 'pay_seed_history_moved' } })
  await insertBooking({ id: BOOKINGS.historyDeclined, ...history, scheduledAt: daysAgo(1),
    status: 'cancelled', items: [packageItem],
    cancellation: { by: 'vendor', reason: 'Fully booked that day', at: daysAgo(2) },
    payment: { status: 'pending' } })
  await insertBooking({ id: BOOKINGS.historyCompleted, ...history, scheduledAt: daysAgo(3),
    status: 'completed', items: [detailItem],
    payment: { status: 'paid', txnId: 'pay_seed_history_completed' } })
  await insertBooking({ id: BOOKINGS.historyLegacyMoved, ...history, scheduledAt: daysAgo(2),
    status: 'rescheduled', items: [retiredItem], payment: { status: 'pending' } })

  // Book again, for CUSTOMERS.bookAgain at MAIN. All over, none owed.
  const rebook = { userId: CUSTOMERS.bookAgain.id, vehicleId: CUSTOMERS.bookAgain.vehicleId }
  await insertBooking({ id: BOOKINGS.rebookDoorstep, ...rebook, scheduledAt: daysAgo(4),
    status: 'completed', items: [detailItem, washItem],
    doorstep: { address: '14, Gandhi Nagar, Adyar', lat: ORIGIN.lat, lng: ORIGIN.lng },
    payment: { status: 'paid', txnId: 'pay_seed_rebook_doorstep' } })
  await insertBooking({ id: BOOKINGS.rebookPartlyRetired, ...rebook, scheduledAt: daysAgo(2),
    status: 'cancelled', items: [washItem, retiredItem],
    cancellation: { by: 'user', reason: 'Plans changed', at: daysAgo(3) },
    payment: { status: 'pending' } })
  await insertBooking({ id: BOOKINGS.rebookAllRetired, ...rebook, scheduledAt: daysAgo(6),
    status: 'completed', items: [retiredItem],
    payment: { status: 'paid', txnId: 'pay_seed_rebook_retired' } })

  // The chain behind rescheduleExhausted. rescheduleCount is denormalised onto
  // the booking, but booking_reschedules is the source of truth, so both have
  // to agree or the cap test would pass for the wrong reason.
  await db.insert(bookingReschedules).values([
    { originalBookingId: BOOKINGS.rescheduleExhausted, fromBookingId: BOOKINGS.rescheduleExhausted,
      toBookingId: BOOKINGS.rescheduleExhausted, userId: CUSTOMERS.reschedule.id, reason: 'seed 1' },
    { originalBookingId: BOOKINGS.rescheduleExhausted, fromBookingId: BOOKINGS.rescheduleExhausted,
      toBookingId: BOOKINGS.rescheduleExhausted, userId: CUSTOMERS.reschedule.id, reason: 'seed 2' },
  ])

  await db.insert(reviews).values({
    id: REVIEWS.existing, bookingId: BOOKINGS.alreadyReviewed, userId: CUSTOMERS.review.id,
    vendorId: VENDORS.main.id, rating: 4, comment: 'Solid work, seeded.',
  })
}

/**
 * A checkout whose payment landed after its car was booked elsewhere: money
 * taken, no booking. What the intent-status read reports as failed with a
 * refund message — and, being CUSTOMERS.intents', what every other customer
 * must get a 404 for.
 */
async function seedIntentRows() {
  await db.insert(bookingIntents).values({
    id: BOOKING_INTENTS.failed,
    userId: CUSTOMERS.intents.id,
    vendorId: VENDORS.main.id,
    serviceId: SERVICES.wash.id,
    vehicleId: CUSTOMERS.intents.vehicleId,
    bookingType: 'dropin',
    scheduledAt: tomorrowAt(10),
    serviceDurationMins: SERVICES.wash.durationMins,
    amount: SERVICES.wash.price,
    subtotalAmount: SERVICES.wash.price,
    paymentMethod: 'online',
    gatewayTxnId: 'order_seed_intent_failed',
    status: 'failed',
    paymentRef: 'pay_seed_intent_failed',
    failureReason: 'vehicle_double_booked',
    expiresAt: new Date(now.getTime() + 30 * MINUTE),
  })
  await db.insert(bookingIntentItems).values({
    intentId: BOOKING_INTENTS.failed,
    serviceId: SERVICES.wash.id,
    name: SERVICES.wash.name,
    amount: SERVICES.wash.price,
    durationMins: SERVICES.wash.durationMins,
    sortOrder: 0,
  })

  // The refunds journey's checkout: paid for a time REFUNDS had already
  // filled, so no booking — a refund owed with no booking to hang it on.
  await db.insert(bookingIntents).values({
    id: BOOKING_INTENTS.refundOwed,
    userId: CUSTOMERS.refunds.id,
    vendorId: VENDORS.refunds.id,
    serviceId: SERVICES.refundsWash.id,
    vehicleId: CUSTOMERS.refunds.vehicleId,
    bookingType: 'dropin',
    scheduledAt: tomorrowAt(15),
    serviceDurationMins: SERVICES.refundsWash.durationMins,
    amount: SERVICES.refundsWash.price,
    subtotalAmount: SERVICES.refundsWash.price,
    paymentMethod: 'online',
    gatewayTxnId: 'order_seed_refund_checkout',
    status: 'failed',
    paymentRef: 'pay_seed_refund_checkout',
    failureReason: 'slot_full',
    expiresAt: new Date(now.getTime() + 30 * MINUTE),
  })
  await db.insert(bookingIntentItems).values({
    intentId: BOOKING_INTENTS.refundOwed,
    serviceId: SERVICES.refundsWash.id,
    name: SERVICES.refundsWash.name,
    amount: SERVICES.refundsWash.price,
    durationMins: SERVICES.refundsWash.durationMins,
    sortOrder: 0,
  })
}

/**
 * Burns the single global use of USEDUP against a booking that already exists,
 * so the code is genuinely exhausted rather than merely configured to be.
 */
async function exhaustDiscounts() {
  await db.insert(discountRedemptions).values([
    { discountId: DISCOUNTS.exhaustedTotal.id, bookingId: BOOKINGS.reviewable,
      userId: CUSTOMERS.review.id, code: DISCOUNTS.exhaustedTotal.code, discountAmount: '49.90' },
    { discountId: DISCOUNTS.exhaustedPerUser.id, bookingId: BOOKINGS.alreadyReviewed,
      userId: CUSTOMERS.coupons.id, code: DISCOUNTS.exhaustedPerUser.code, discountAmount: '199.90' },
  ])
}

/**
 * The Home hub's fixtures (specs/users/home-api.spec.ts, the Home screen's
 * home.spec.ts and updates.spec.ts, and the admin notices and discount
 * specs): a garage of their own far from ORIGIN, two codes shown on Home
 * only to customers who booked it or stand near it, booking-window notices
 * each about one customer's slot, and one customer per state of Home.
 * Nothing here reaches any other customer's Home: there is no 'everyone'
 * offer and no 'all' notice.
 */
async function seedHomeHubRows() {
  const garage = VENDORS.homePromo.id

  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.narrowOwner.id, businessName: VENDORS.homePromo.name,
    phone: '9000003300', address: '1, Hub Road, Katpadi', city: 'Vellore', pincode: '632007',
    lat: HOME_PROMO_PIN.lat, lng: HOME_PROMO_PIN.lng, geoSource: 'map_pin', geoConfirmedAt: now,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: true, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 30, status: 'active', bays: 5,
  })
  await db.insert(vendorWorkingHours).values(hoursFor(garage, '06:00:00', '22:00:00'))
  await db.insert(services).values([
    { id: SERVICES.homePromoWash.id, vendorId: garage, name: SERVICES.homePromoWash.name,
      category: 'car_wash', pricingType: 'flat', price: SERVICES.homePromoWash.price,
      durationMins: SERVICES.homePromoWash.durationMins, isActive: true },
    { id: SERVICES.homePromoInspect.id, vendorId: garage, name: SERVICES.homePromoInspect.name,
      category: 'scratch_removal', pricingType: 'on_inspection', price: SERVICES.homePromoInspect.price,
      durationMins: SERVICES.homePromoInspect.durationMins, isActive: true },
  ])

  // One car each; CUSTOMERS.homeWash has two, both on an explicit 10-day
  // interval so the October–December default never decides the assertion.
  await db.insert(userVehicles).values([
    ...[CUSTOMERS.homeOffer, CUSTOMERS.homeBill, CUSTOMERS.homeUpdates, CUSTOMERS.homeNotice,
        CUSTOMERS.homeClosed, CUSTOMERS.homeBell, CUSTOMERS.homeTile].map((c, i) => ({
      id: c.vehicleId as string, userId: c.id, make: 'Maruti', model: 'Baleno', color: 'Grey',
      licensePlate: `TN23HH${String(i).padStart(4, '0')}`, vehicleType: 'hatchback' as const,
      isDefault: true,
    })),
    { id: CUSTOMERS.homeWash.vehicleId, userId: CUSTOMERS.homeWash.id, make: 'Honda', model: 'Amaze',
      color: 'White', licensePlate: 'TN23HW0001', vehicleType: 'sedan', isDefault: true,
      washIntervalDays: 10 },
    { id: VEHICLES.homeWashSecond, userId: CUSTOMERS.homeWash.id, make: 'Tata', model: 'Nexon',
      color: 'Blue', licensePlate: 'TN23HW0002', vehicleType: 'suv', isDefault: false,
      washIntervalDays: 10 },
    { id: CUSTOMERS.homeScreenWash.vehicleId, userId: CUSTOMERS.homeScreenWash.id, make: 'Honda',
      model: 'Amaze', color: 'White', licensePlate: 'TN23HW0003', vehicleType: 'sedan',
      isDefault: true, washIntervalDays: 10 },
    { id: VEHICLES.homeScreenWashSecond, userId: CUSTOMERS.homeScreenWash.id, make: 'Tata',
      model: 'Nexon', color: 'Blue', licensePlate: 'TN23HW0004', vehicleType: 'suv',
      isDefault: false, washIntervalDays: 10 },
  ])

  // Ends at midnight IST thirty days out, so the card reads "Till <the day before>".
  const endKey = new Date(now.getTime() + 30 * 24 * HOUR).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  })
  const endsAt = new Date(`${endKey}T00:00:00+05:30`)
  await db.insert(discounts).values([
    { id: DISCOUNTS.homeBooked.id, code: DISCOUNTS.homeBooked.code,
      description: 'Home hub fixture: customers who booked Hub Promo', discountType: 'percentage',
      percentOff: '25.00', maxDiscountAmount: '150.00', vendorId: garage, fundedBy: 'platform',
      startsAt: daysAgo(1), endsAt, isActive: true,
      showOnHome: true, homeTitle: DISCOUNTS.homeBooked.homeTitle, homePriority: 2,
      homeAudience: 'booked_this_garage' },
    { id: DISCOUNTS.homeNear.id, code: DISCOUNTS.homeNear.code,
      description: 'Home hub fixture: customers near Hub Promo', discountType: 'fixed',
      amountOff: '75.00', vendorId: garage, fundedBy: 'vendor',
      startsAt: daysAgo(1), endsAt, isActive: true,
      showOnHome: true, homeTitle: DISCOUNTS.homeNear.homeTitle, homePriority: 0,
      homeAudience: 'near_this_garage', homeAudienceRadiusKm: 10 },
  ])

  const wash = {
    id: SERVICES.homePromoWash.id, name: SERVICES.homePromoWash.name,
    amount: SERVICES.homePromoWash.price, durationMins: SERVICES.homePromoWash.durationMins,
  }
  const at = { vendorId: garage, items: [wash] }

  await insertBooking({ ...at, id: BOOKINGS.homeOfferDone, userId: CUSTOMERS.homeOffer.id,
    vehicleId: CUSTOMERS.homeOffer.vehicleId, scheduledAt: daysAgo(3), createdAt: daysAgo(5),
    status: 'completed', acceptedAt: daysAgo(4), startedAt: daysAgo(3), completedAt: daysAgo(3),
    payment: { status: 'paid', txnId: 'pay_seed_home_offer', paidAt: daysAgo(5) } })

  // Finished five hours ago, with ₹800 of the final bill still to pay: the
  // bill card wins over "Rate your wash", which would otherwise show.
  await insertBooking({ id: BOOKINGS.homeBillJob, userId: CUSTOMERS.homeBill.id,
    vehicleId: CUSTOMERS.homeBill.vehicleId, vendorId: garage, scheduledAt: hoursAgo(8),
    createdAt: daysAgo(2), status: 'completed', acceptedAt: daysAgo(1), startedAt: hoursAgo(8),
    completedAt: hoursAgo(5),
    items: [{ id: SERVICES.homePromoInspect.id, name: SERVICES.homePromoInspect.name,
      amount: SERVICES.homePromoInspect.price, durationMins: SERVICES.homePromoInspect.durationMins }],
    payment: { status: 'paid', txnId: 'pay_seed_home_bill', paidAt: daysAgo(2) } })
  await db.insert(bookingCharges).values({
    id: CHARGES.homeBill, bookingId: BOOKINGS.homeBillJob, kind: 'final_bill',
    totalAmount: '1099.00', paidBefore: '299.00', amountDue: '800.00',
    lines: [{ description: 'Dent repair, front door', amount: '1099.00' }],
    status: 'due', createdAt: hoursAgo(4), updatedAt: hoursAgo(4),
  })

  await insertBooking({ ...at, id: BOOKINGS.homeWashFirst, userId: CUSTOMERS.homeWash.id,
    vehicleId: CUSTOMERS.homeWash.vehicleId, scheduledAt: daysAgo(8), createdAt: daysAgo(9),
    status: 'completed', completedAt: daysAgo(8),
    payment: { status: 'paid', txnId: 'pay_seed_home_wash_1', paidAt: daysAgo(9) } })
  await insertBooking({ ...at, id: BOOKINGS.homeWashSecond, userId: CUSTOMERS.homeWash.id,
    vehicleId: VEHICLES.homeWashSecond, scheduledAt: daysAgo(13), createdAt: daysAgo(14),
    status: 'completed', completedAt: daysAgo(13),
    payment: { status: 'paid', txnId: 'pay_seed_home_wash_2', paidAt: daysAgo(14) } })

  // Done ten hours ago; Updates last opened before it was accepted.
  await insertBooking({ ...at, id: BOOKINGS.homeUpdatesDone, userId: CUSTOMERS.homeUpdates.id,
    vehicleId: CUSTOMERS.homeUpdates.vehicleId, scheduledAt: hoursAgo(11), createdAt: daysAgo(3),
    status: 'completed', acceptedAt: daysAgo(2), startedAt: hoursAgo(11), completedAt: hoursAgo(10),
    payment: { status: 'paid', txnId: 'pay_seed_home_updates', paidAt: daysAgo(3) } })
  await db.update(users).set({ updatesSeenAt: daysAgo(2.5) }).where(eq(users.id, CUSTOMERS.homeUpdates.id))

  const noticeSlot = daysAheadAt(2, 10)
  await insertBooking({ ...at, id: BOOKINGS.homeNoticeUpcoming, userId: CUSTOMERS.homeNotice.id,
    vehicleId: CUSTOMERS.homeNotice.vehicleId, scheduledAt: noticeSlot, createdAt: daysAgo(1),
    status: 'confirmed', acceptedAt: hoursAgo(1),
    payment: { status: 'paid', txnId: 'pay_seed_home_notice', paidAt: daysAgo(1) } })
  await db.insert(notices).values({
    id: NOTICES.homeRain, title: 'Slot may move: rain',
    body: 'Heavy rain is forecast. The garage may call you to move your time.',
    audience: 'with_booking_between', vendorId: garage,
    bookingFrom: new Date(noticeSlot.getTime() - HOUR), bookingTo: new Date(noticeSlot.getTime() + HOUR),
    startsAt: hoursAgo(1), endsAt: new Date(now.getTime() + 3 * 24 * HOUR), createdBy: 'E2E seed',
  })

  // A holiday on the very IST day of this booking, read off the booking
  // itself so a run near midnight cannot put the two on different days.
  const closedSlot = daysAheadAt(3, 10)
  await insertBooking({ ...at, id: BOOKINGS.homeClosedUpcoming, userId: CUSTOMERS.homeClosed.id,
    vehicleId: CUSTOMERS.homeClosed.vehicleId, scheduledAt: closedSlot, createdAt: daysAgo(1),
    status: 'confirmed', acceptedAt: hoursAgo(2),
    payment: { status: 'paid', txnId: 'pay_seed_home_closed', paidAt: daysAgo(1) } })
  await db.insert(vendorClosures).values({
    vendorId: garage,
    date: closedSlot.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    reason: 'Pongal',
  })

  // The Home screen's own customers (specs/users/home.spec.ts,
  // updates.spec.ts): the same states as above, on rows the API spec never
  // resets or changes.
  await insertBooking({ ...at, id: BOOKINGS.homeScreenWashFirst, userId: CUSTOMERS.homeScreenWash.id,
    vehicleId: CUSTOMERS.homeScreenWash.vehicleId, scheduledAt: daysAgo(8), createdAt: daysAgo(9),
    status: 'completed', completedAt: daysAgo(8),
    payment: { status: 'paid', txnId: 'pay_seed_home_screen_wash_1', paidAt: daysAgo(9) } })
  await insertBooking({ ...at, id: BOOKINGS.homeScreenWashSecond, userId: CUSTOMERS.homeScreenWash.id,
    vehicleId: VEHICLES.homeScreenWashSecond, scheduledAt: daysAgo(13), createdAt: daysAgo(14),
    status: 'completed', completedAt: daysAgo(13),
    payment: { status: 'paid', txnId: 'pay_seed_home_screen_wash_2', paidAt: daysAgo(14) } })

  // Done a day ago; Updates last opened before it was accepted.
  await insertBooking({ ...at, id: BOOKINGS.homeBellDone, userId: CUSTOMERS.homeBell.id,
    vehicleId: CUSTOMERS.homeBell.vehicleId, scheduledAt: hoursAgo(27), createdAt: daysAgo(3),
    status: 'completed', acceptedAt: daysAgo(2), startedAt: hoursAgo(27), completedAt: hoursAgo(26),
    payment: { status: 'paid', txnId: 'pay_seed_home_bell', paidAt: daysAgo(3) } })
  await db.update(users).set({ updatesSeenAt: daysAgo(2.5) }).where(eq(users.id, CUSTOMERS.homeBell.id))

  // A day after homeRain's window, so that notice's audience stays one
  // customer, and clear of the holiday above.
  const tileSlot = daysAheadAt(4, 15)
  await insertBooking({ ...at, id: BOOKINGS.homeTileUpcoming, userId: CUSTOMERS.homeTile.id,
    vehicleId: CUSTOMERS.homeTile.vehicleId, scheduledAt: tileSlot, createdAt: daysAgo(1),
    status: 'confirmed', acceptedAt: hoursAgo(1),
    payment: { status: 'paid', txnId: 'pay_seed_home_tile', paidAt: daysAgo(1) } })
  await db.insert(notices).values({
    id: NOTICES.homeTileNote, title: 'Water cut: slot may move',
    body: 'The garage has a water cut that day. It may call you to move your time.',
    audience: 'with_booking_between', vendorId: garage,
    bookingFrom: new Date(tileSlot.getTime() - HOUR), bookingTo: new Date(tileSlot.getTime() + HOUR),
    startsAt: hoursAgo(1), endsAt: new Date(now.getTime() + 5 * 24 * HOUR), createdBy: 'E2E seed',
  })
}

/**
 * The listing spec's doorstep fixture (specs/users/listing-radius.spec.ts): a
 * doorstep-only garage that left its travel radius empty, so it covers the
 * default 10 km, and a customer with one address inside that and one outside.
 * Far from ORIGIN and taking no drop-ins, so no other spec's list sees it.
 */
async function seedDoorstepReachRows() {
  const garage = VENDORS.unsetRadius.id

  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.narrowOwner.id, businessName: VENDORS.unsetRadius.name,
    phone: '9000005100', address: '1, Beach Road, White Town', city: 'Puducherry',
    pincode: '605001', lat: UNSET_RADIUS_PIN.lat, lng: UNSET_RADIUS_PIN.lng,
    geoSource: 'map_pin', geoConfirmedAt: now,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    // No doorstepRadiusKm and no drawn area: the default is the point.
    isVerified: true, doorstepEnabled: true, dropinEnabled: false,
    slotIntervalMins: 30, status: 'active', bays: 5,
    notes: VENDORS.unsetRadius.notes,
  })
  await db.insert(vendorWorkingHours).values(hoursFor(garage, '06:00:00', '22:00:00'))
  await db.insert(services).values({
    id: SERVICES.unsetRadiusWash.id, vendorId: garage, name: SERVICES.unsetRadiusWash.name,
    category: 'car_wash', pricingType: 'flat', price: SERVICES.unsetRadiusWash.price,
    durationMins: SERVICES.unsetRadiusWash.durationMins, isActive: true,
  })

  const customer = CUSTOMERS.doorstepReach
  await db.insert(userVehicles).values({
    id: customer.vehicleId, userId: customer.id, make: 'Hyundai', model: 'Venue', color: 'Black',
    licensePlate: 'PY01RR0001', vehicleType: 'hatchback', isDefault: true,
  })
  await db.insert(userAddresses).values([
    { id: ADDRESSES.reachCovered, userId: customer.id, label: 'Home',
      address: '3, Lake Road, Kalapet', city: 'Puducherry',
      lat: UNSET_RADIUS_COVERED.lat, lng: UNSET_RADIUS_COVERED.lng, geoSource: 'map_pin',
      isDefault: true },
    { id: ADDRESSES.reachOutside, userId: customer.id, label: 'Office',
      address: '8, ECR, Marakkanam Road', city: 'Puducherry',
      lat: UNSET_RADIUS_OUTSIDE.lat, lng: UNSET_RADIUS_OUTSIDE.lng, geoSource: 'map_pin',
      isDefault: false },
  ])
}

// ─── admin fixtures ─────────────────────────────────────────────────────────

/**
 * Garages no customer can find (pending, unverified): one owned by a customer
 * account, which DELETE /users/me must refuse to cascade into, the admin
 * editor's two (unpinned), with the rows their specs need (see
 * VENDORS.adminServices and VENDORS.adminEditor), and the garage list's
 * checklist garage (VENDORS.adminList), set up but for its services.
 */
async function seedAdminFixtureRows() {
  await db.insert(vendors).values([
    {
      id: VENDORS.ownerAccount.id, ownerId: CUSTOMERS.garageOwner.id,
      businessName: VENDORS.ownerAccount.name, phone: '9000003400',
      address: '1, Owner Street, Mylapore', city: 'Chennai', pincode: '600004',
      vehicleTypes: ['hatchback', 'sedan', 'suv'],
      isVerified: false, doorstepEnabled: false, dropinEnabled: true,
      slotIntervalMins: 30, status: 'pending',
    },
    {
      id: VENDORS.adminServices.id, ownerId: STAFF.narrowOwner.id,
      businessName: VENDORS.adminServices.name, phone: '9000003500',
      address: '1, Editor Street, Nungambakkam', city: 'Chennai', pincode: '600034',
      vehicleTypes: ['hatchback', 'sedan', 'suv'],
      isVerified: false, doorstepEnabled: false, dropinEnabled: true,
      slotIntervalMins: 30, status: 'pending',
    },
    {
      id: VENDORS.adminEditor.id, ownerId: STAFF.narrowOwner.id,
      businessName: VENDORS.adminEditor.name, phone: '9000003600',
      address: '2, Editor Street, Nungambakkam', city: 'Chennai', pincode: '600034',
      vehicleTypes: ['hatchback', 'sedan', 'suv'],
      isVerified: false, doorstepEnabled: false, dropinEnabled: true,
      doorstepRadiusKm: null, slotIntervalMins: 30, status: 'pending',
    },
    {
      id: VENDORS.adminList.id, ownerId: STAFF.narrowOwner.id,
      businessName: VENDORS.adminList.name, phone: '9000003700',
      address: '3, Editor Street, Nungambakkam', city: 'Chennai', pincode: '600034',
      lat: ORIGIN.lat + 0.01, lng: ORIGIN.lng - 0.03, geoSource: 'map_pin', geoConfirmedAt: now,
      vehicleTypes: ['Hatchback', 'Sedan', 'SUV / MUV'], bays: 2,
      isVerified: false, doorstepEnabled: false, dropinEnabled: true,
      slotIntervalMins: 30, status: 'pending',
    },
  ])
  await db.insert(vendorWorkingHours).values(
    hoursFor(VENDORS.adminList.id, '09:00:00', '18:00:00')
  )

  const garage = VENDORS.adminServices.id
  await db.insert(services).values([
    { id: SERVICES.adminFlat.id, vendorId: garage, name: SERVICES.adminFlat.name,
      category: 'car_wash', pricingType: 'flat', price: SERVICES.adminFlat.price,
      durationMins: SERVICES.adminFlat.durationMins, isActive: true },
    // No SUV price, as some garages' older per-vehicle services have.
    { id: SERVICES.adminTiered.id, vendorId: garage, name: SERVICES.adminTiered.name,
      category: 'detailing', pricingType: 'per_vehicle',
      price: SERVICES.adminTiered.priceHatchback,
      priceHatchback: SERVICES.adminTiered.priceHatchback,
      priceSedan: SERVICES.adminTiered.priceSedan,
      priceSuv: SERVICES.adminTiered.priceSuv,
      durationMins: SERVICES.adminTiered.durationMins, isActive: true },
    { id: SERVICES.adminHidden.id, vendorId: garage, name: SERVICES.adminHidden.name,
      category: 'coating', pricingType: 'per_vehicle',
      price: SERVICES.adminHidden.priceHatchback,
      priceHatchback: SERVICES.adminHidden.priceHatchback,
      priceSedan: SERVICES.adminHidden.priceSedan,
      priceSuv: SERVICES.adminHidden.priceSuv,
      durationMins: SERVICES.adminHidden.durationMins, isActive: false },
    { id: SERVICES.adminPackage.id, vendorId: garage, name: SERVICES.adminPackage.name,
      category: 'package', pricingType: 'flat', price: SERVICES.adminPackage.price,
      durationMins: SERVICES.adminPackage.durationMins, isActive: true },
  ])
  await db.insert(servicePackageItems).values({
    packageId: SERVICES.adminPackage.id, serviceId: SERVICES.adminFlat.id, sortOrder: 0,
  })

  await db.insert(services).values([
    { id: SERVICES.editorFoam.id, vendorId: VENDORS.adminEditor.id, name: SERVICES.editorFoam.name,
      category: 'car_wash', pricingType: 'per_vehicle',
      price: SERVICES.editorFoam.priceHatchback,
      priceHatchback: SERVICES.editorFoam.priceHatchback,
      priceSedan: SERVICES.editorFoam.priceSedan,
      priceSuv: SERVICES.editorFoam.priceSuv,
      durationMins: SERVICES.editorFoam.durationMins, isActive: true },
    { id: SERVICES.editorPolish.id, vendorId: VENDORS.adminEditor.id, name: SERVICES.editorPolish.name,
      category: 'detailing', pricingType: 'flat', price: SERVICES.editorPolish.price,
      durationMins: SERVICES.editorPolish.durationMins, isActive: true },
  ])
}

/**
 * The test-data reset's fixtures (specs/admin/data-reset-api.spec.ts and
 * data-reset.spec.ts): see BOOKINGS.reset* for what each is for. All at
 * VENDORS.reset, which no customer list shows and nobody else books, and
 * the receipt numbers in 22-23 and 23-24, years nothing else numbers in.
 */
async function seedDataResetRows() {
  const garage = VENDORS.reset.id
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.narrowOwner.id, businessName: VENDORS.reset.name,
    phone: '9000003800', address: '1, Reset Road, Guindy', city: 'Chennai', pincode: '600032',
    lat: ORIGIN.lat - 0.55, lng: ORIGIN.lng - 0.15, geoSource: 'map_pin', geoConfirmedAt: now,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    // Not verified: in no list a customer sees.
    isVerified: false, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 30, status: 'pending',
  })
  await db.insert(services).values({
    id: SERVICES.resetWash.id, vendorId: garage, name: SERVICES.resetWash.name,
    category: 'car_wash', pricingType: 'flat', price: SERVICES.resetWash.price,
    durationMins: SERVICES.resetWash.durationMins, isActive: true,
  })

  const wash = {
    id: SERVICES.resetWash.id, name: SERVICES.resetWash.name,
    amount: SERVICES.resetWash.price, durationMins: SERVICES.resetWash.durationMins,
  }
  const api = { userId: CUSTOMERS.dataReset.id, vehicleId: CUSTOMERS.dataReset.vehicleId, vendorId: garage }
  const ui = { userId: CUSTOMERS.dataResetUi.id, vehicleId: CUSTOMERS.dataResetUi.vehicleId, vendorId: garage }
  // Financial years 2022-23 and 2023-24, in IST mid-morning.
  const fy2223 = new Date('2022-06-10T05:00:00.000Z')
  const fy2324 = new Date('2023-06-10T05:00:00.000Z')

  // 22-23: declined, refunded in full, numbered, with its checkout, a note
  // and a photo.
  await insertBooking({ id: BOOKINGS.resetRefunded, ...api, scheduledAt: fy2223, createdAt: fy2223,
    status: 'cancelled', items: [wash],
    cancellation: { by: 'vendor', reason: 'Fully booked that day', at: fy2223 },
    payment: { status: 'refunded', txnId: 'pay_TestResetA1', paidAt: fy2223, gatewayMode: 'test',
      refund: { ref: 'rfnd_E2ERESET0001', at: fy2223 } } })
  await db.insert(bookingNotes).values({
    bookingId: BOOKINGS.resetRefunded, author: 'E2E seed', body: 'Team test booking.',
  })
  await db.insert(jobPhotos).values({
    bookingId: BOOKINGS.resetRefunded, stage: 'before',
    storageKey: `vendors/${garage}/job-photos/${BOOKINGS.resetRefunded}/seed.jpg`,
    url: `http://localhost:9000/detlio-e2e/vendors/${garage}/job-photos/${BOOKINGS.resetRefunded}/seed.jpg`,
  })

  // 23-24: a reschedule chain (test), a live payment, and a live payment
  // with no number yet.
  await insertBooking({ id: BOOKINGS.resetMovedFrom, ...api, scheduledAt: fy2324, createdAt: fy2324,
    status: 'cancelled', items: [wash],
    cancellation: { by: 'user', reason: 'Rescheduled to a new slot by the customer', at: fy2324 },
    payment: { status: 'paid', txnId: 'pay_TestResetB1', paidAt: fy2324, gatewayMode: 'test' } })
  await insertBooking({ id: BOOKINGS.resetMovedTo, ...api, scheduledAt: fy2324,
    createdAt: new Date(fy2324.getTime() + HOUR), status: 'completed', items: [wash],
    rescheduledFromId: BOOKINGS.resetMovedFrom, rescheduleCount: 1,
    payment: { status: 'paid', txnId: 'pay_TestResetB1', paidAt: fy2324, gatewayMode: 'test' } })
  await db.insert(bookingReschedules).values({
    originalBookingId: BOOKINGS.resetMovedFrom, fromBookingId: BOOKINGS.resetMovedFrom,
    toBookingId: BOOKINGS.resetMovedTo, userId: CUSTOMERS.dataReset.id, reason: 'seed',
  })
  await insertBooking({ id: BOOKINGS.resetLive, ...api, scheduledAt: fy2324,
    createdAt: new Date(fy2324.getTime() - HOUR), status: 'completed', items: [wash],
    payment: { status: 'paid', txnId: 'pay_LiveResetC1', paidAt: new Date(fy2324.getTime() - HOUR),
      gatewayMode: 'live' } })
  await insertBooking({ id: BOOKINGS.resetNextReceipt, ...api, scheduledAt: fy2324,
    createdAt: new Date(fy2324.getTime() + 2 * HOUR), status: 'completed', items: [wash],
    payment: { status: 'paid', txnId: 'pay_LiveResetE1', paidAt: new Date(fy2324.getTime() + 2 * HOUR),
      gatewayMode: 'live' } })

  // Paid before gateway_mode, with an id Razorpay is never asked about here.
  // The rest are older than the pilot card's 30 days, so they never move
  // its numbers while the specs delete them.
  await insertBooking({ id: BOOKINGS.resetUnknown, ...api, scheduledAt: daysAgo(44),
    createdAt: daysAgo(45), status: 'completed', items: [wash],
    payment: { status: 'paid', txnId: 'pay_OldResetD1', paidAt: daysAgo(45) } })
  await insertBooking({ id: BOOKINGS.resetSingle, ...api, scheduledAt: daysAgo(49),
    createdAt: daysAgo(50), status: 'completed', items: [wash],
    payment: { status: 'paid', txnId: 'pay_e2e_reset_single', paidAt: daysAgo(50), gatewayMode: 'fake' } })
  // Never paid, but its live order is open and the booking still on: a
  // late capture could land, so it is kept whatever is ticked.
  await insertBooking({ id: BOOKINGS.resetOpenOrder, ...api, scheduledAt: daysAgo(45),
    createdAt: daysAgo(46), status: 'pending', items: [wash],
    payment: { status: 'pending', txnId: 'order_LiveResetH1', gatewayMode: 'live' } })

  await insertBooking({ id: BOOKINGS.resetUiSingle, ...ui, scheduledAt: daysAgo(49),
    createdAt: daysAgo(50), status: 'completed', items: [wash],
    payment: { status: 'paid', txnId: 'pay_e2e_reset_ui_single', paidAt: daysAgo(50), gatewayMode: 'fake' } })
  await insertBooking({ id: BOOKINGS.resetUiMarked, ...ui, scheduledAt: daysAgo(48),
    createdAt: daysAgo(49), status: 'cancelled', items: [wash], markedTestAt: daysAgo(48),
    cancellation: { by: 'user', reason: 'Plans changed', at: daysAgo(48) },
    payment: { status: 'pending' } })
  await insertBooking({ id: BOOKINGS.resetUiKeep, ...ui, scheduledAt: daysAgo(47),
    createdAt: daysAgo(48), status: 'completed', items: [wash], markedTestAt: daysAgo(47),
    payment: { status: 'paid', txnId: 'pay_e2e_reset_ui_keep', paidAt: daysAgo(48), gatewayMode: 'fake' } })

  // Receipt numbers, as the app issues them: one per chain, on its first
  // booking. 22-23 holds resetRefunded's alone, plus a void from an earlier
  // run; 23-24 the live one's and the reschedule chain's.
  await db.insert(receiptNumbers).values([
    { rootBookingId: BOOKINGS.resetRefunded, financialYear: '22-23', seq: 1,
      number: 'DTL/22-23/000001', issuedAt: fy2223 },
    { rootBookingId: BOOKINGS.resetLive, financialYear: '23-24', seq: 1,
      number: 'DTL/23-24/000001', issuedAt: new Date(fy2324.getTime() - HOUR) },
    { rootBookingId: BOOKINGS.resetMovedFrom, financialYear: '23-24', seq: 2,
      number: 'DTL/23-24/000002', issuedAt: fy2324 },
  ])
  await db.insert(receiptCounters).values([
    { financialYear: '22-23', lastSeq: 2 },
    { financialYear: '23-24', lastSeq: 2 },
  ])
  await db.insert(adminAuditLog).values({
    id: DATA_RESET.earlierAudit, action: 'test_data_reset', actorSub: 'admin',
    actorName: 'E2E seed', summary: {}, detail: {},
  })
  await db.insert(receiptNumberVoids).values({
    financialYear: '22-23', seq: 2, number: 'DTL/22-23/000002', issuedAt: fy2223,
    rootBookingId: '00000000-0000-4000-8000-00000000dead', reason: 'Seeded earlier run',
    auditId: DATA_RESET.earlierAudit,
  })

  // Checkouts: resetRefunded's own, and two that never became a booking.
  const intent = {
    userId: CUSTOMERS.dataReset.id, vendorId: garage, serviceId: SERVICES.resetWash.id,
    vehicleId: CUSTOMERS.dataReset.vehicleId, bookingType: 'dropin' as const,
    serviceDurationMins: SERVICES.resetWash.durationMins, amount: SERVICES.resetWash.price,
    subtotalAmount: SERVICES.resetWash.price, paymentMethod: 'online' as const,
    gatewayMode: 'test' as const,
  }
  await db.insert(bookingIntents).values([
    { ...intent, id: BOOKING_INTENTS.resetOwn, scheduledAt: fy2223, createdAt: fy2223,
      expiresAt: fy2223, gatewayTxnId: 'order_TestResetA1', status: 'consumed',
      bookingId: BOOKINGS.resetRefunded },
    { ...intent, id: BOOKING_INTENTS.resetFailed, scheduledAt: fy2324, createdAt: fy2324,
      expiresAt: fy2324, gatewayTxnId: 'order_TestResetF1', status: 'failed',
      paymentRef: 'pay_TestResetF1', failureReason: 'slot_full',
      refundedAmount: SERVICES.resetWash.price, refundRef: 'rfnd_E2ERESET0002',
      refundedAt: fy2324, refundedBy: 'E2E seed' },
    { ...intent, id: BOOKING_INTENTS.resetAbandoned, scheduledAt: fy2324, createdAt: fy2324,
      expiresAt: fy2324, gatewayTxnId: 'order_TestResetG1', status: 'pending' },
  ])
  await db.insert(bookingIntentItems).values(
    [BOOKING_INTENTS.resetOwn, BOOKING_INTENTS.resetFailed, BOOKING_INTENTS.resetAbandoned].map(
      (intentId) => ({ intentId, ...{ serviceId: wash.id, name: wash.name, amount: wash.amount,
        durationMins: wash.durationMins }, sortOrder: 0 })
    )
  )
  await db.insert(refundRecords).values({
    kind: 'checkout', targetId: BOOKING_INTENTS.resetFailed, bookingId: null,
    amount: SERVICES.resetWash.price, refundedBefore: '0.00', refundRef: 'rfnd_E2ERESET0002',
    recordedBy: 'E2E seed', recordedAt: fy2324,
  })
}

/**
 * The service photo and video specs' garage: VENDORS.media and its services,
 * with no media at all, so each spec adds exactly what it asserts on.
 */
async function seedServiceMediaRows() {
  const garage = VENDORS.media.id
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.mediaOwner.id, businessName: VENDORS.media.name,
    phone: '9000003900', address: '1, Media Road, Porur', city: 'Chennai', pincode: '600116',
    lat: ORIGIN.lat - 0.65, lng: ORIGIN.lng - 0.15, geoSource: 'map_pin', geoConfirmedAt: now,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: true, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 30, status: 'active',
  })
  // The owner's seat is written here, after the garage row it points at:
  // seedMembership runs long before this garage exists.
  await db.insert(userMemberMapping).values({
    vendorId: garage, userId: STAFF.mediaOwner.id, role: 'vendor_admin', status: 'active',
  })
  await db.insert(vendorWorkingHours).values(hoursFor(garage, '09:00:00', '18:00:00'))
  await db.insert(services).values(
    ([
      [SERVICES.mediaPhoto, 'car_wash'],
      [SERVICES.mediaVideo, 'car_wash'],
      [SERVICES.mediaAi, 'coating'],
      [SERVICES.mediaRefused, 'detailing'],
      [SERVICES.mediaBike, 'others'],
    ] as const).map(([service, category]) => ({
      id: service.id, vendorId: garage, name: service.name, category,
      pricingType: 'flat' as const, price: service.price,
      durationMins: service.durationMins, isActive: true,
    }))
  )
}

/**
 * The garage Bin's fixtures (specs/admin/garage-bin.spec.ts); see VENDORS.bin*
 * for what each garage is for. All far south-west, past every other
 * single-purpose garage, and every booking older than the pilot card's 30
 * days except the two still to come, so nothing here moves another spec's
 * numbers.
 */
async function seedGarageBinRows() {
  const pin = (n: number) => ({
    lat: ORIGIN.lat - 0.75 - n * 0.01, lng: ORIGIN.lng - 0.15,
    geoSource: 'map_pin' as const, geoConfirmedAt: now,
  })
  const garage = {
    city: 'Chennai', pincode: '600116', vehicleTypes: ['hatchback', 'sedan', 'suv'],
    doorstepEnabled: false, dropinEnabled: true, slotIntervalMins: 30,
  }
  // Seeded in the Bin, as moving it there leaves a garage.
  const binned = {
    deletedAt: daysAgo(1), deletedByName: 'E2E seed', deletedReason: 'Test garage from setup',
  }
  await db.insert(vendors).values([
    { ...garage, ...pin(0), id: VENDORS.binTeam.id, ownerId: STAFF.binOwner.id,
      businessName: VENDORS.binTeam.name, phone: '9000004000', address: '1, Bin Road, Porur',
      isVerified: true, status: 'active' },
    { ...garage, ...pin(1), id: VENDORS.binOwnerLive.id, ownerId: STAFF.binOwner.id,
      businessName: VENDORS.binOwnerLive.name, phone: '9000004100', address: '2, Bin Road, Porur',
      isVerified: false, status: 'pending' },
    { ...garage, ...pin(2), id: VENDORS.binPaid.id, ownerId: STAFF.narrowOwner.id,
      businessName: VENDORS.binPaid.name, phone: '9000004200', address: '3, Bin Road, Porur',
      isVerified: false, status: 'pending' },
    { ...garage, ...pin(3), ...binned, id: VENDORS.binHard.id, ownerId: STAFF.narrowOwner.id,
      businessName: VENDORS.binHard.name, phone: '9000004300', address: '4, Bin Road, Porur',
      isVerified: false, status: 'pending' },
    { ...garage, ...pin(4), ...binned, id: VENDORS.binTomb.id, ownerId: STAFF.narrowOwner.id,
      businessName: VENDORS.binTomb.name, phone: '9000004400', address: '5, Bin Road, Porur',
      email: 'tomb@example.com', isVerified: false, status: 'pending' },
  ])
  await db.insert(vendorWorkingHours).values([
    ...hoursFor(VENDORS.binTeam.id, '06:00:00', '22:00:00'),
    ...hoursFor(VENDORS.binPaid.id, '06:00:00', '22:00:00'),
    ...hoursFor(VENDORS.binTomb.id, '09:00:00', '18:00:00'),
  ])
  await db.insert(userMemberMapping).values([
    { vendorId: VENDORS.binTeam.id, userId: STAFF.binOwner.id, role: 'vendor_admin', status: 'active' },
    { vendorId: VENDORS.binOwnerLive.id, userId: STAFF.binOwner.id, role: 'vendor_admin', status: 'active' },
    { vendorId: VENDORS.binTeam.id, userId: STAFF.binOperator.id, role: 'vendor_operator', status: 'active' },
    ...[VENDORS.binPaid, VENDORS.binHard, VENDORS.binTomb].map((v) => ({
      vendorId: v.id, userId: STAFF.narrowOwner.id, role: 'vendor_admin' as const, status: 'active' as const,
    })),
  ])
  const flat = (service: { id: string; name: string; price: string; durationMins: number }, vendorId: string) => ({
    id: service.id, vendorId, name: service.name, category: 'car_wash' as const,
    pricingType: 'flat' as const, price: service.price, durationMins: service.durationMins,
    isActive: true,
  })
  await db.insert(services).values([
    flat(SERVICES.binTeamWash, VENDORS.binTeam.id),
    flat(SERVICES.binPaidWash, VENDORS.binPaid.id),
    flat(SERVICES.binHardWash, VENDORS.binHard.id),
    { ...flat(SERVICES.binHardPackage, VENDORS.binHard.id), category: 'package' as const },
    flat(SERVICES.binTombWash, VENDORS.binTomb.id),
  ])
  // The package's member is ON DELETE RESTRICT: what made a garage with a
  // package undeletable before.
  await db.insert(servicePackageItems).values({
    packageId: SERVICES.binHardPackage.id, serviceId: SERVICES.binHardWash.id, sortOrder: 0,
  })
  await db.insert(vendorPhotos).values({
    vendorId: VENDORS.binHard.id, sortOrder: 0,
    url: `http://localhost:9000/detlio-e2e/vendors/${VENDORS.binHard.id}/photos/seed.jpg`,
    storageKey: `vendors/${VENDORS.binHard.id}/photos/seed.jpg`,
  })

  const item = (service: { id: string; name: string; price: string; durationMins: number }) => ({
    id: service.id, name: service.name, amount: service.price, durationMins: service.durationMins,
  })
  await insertBooking({ id: BOOKINGS.binPaidUpcoming, userId: CUSTOMERS.binPaid.id,
    vehicleId: CUSTOMERS.binPaid.vehicleId, vendorId: VENDORS.binPaid.id,
    scheduledAt: daysAheadAt(3, 10), createdAt: daysAgo(40), status: 'confirmed',
    acceptedAt: daysAgo(40), items: [item(SERVICES.binPaidWash)],
    payment: { status: 'paid', txnId: 'pay_e2e_bin_paid', paidAt: daysAgo(40), gatewayMode: 'fake' } })
  await insertBooking({ id: BOOKINGS.binUnpaidUpcoming, userId: CUSTOMERS.binPaid.id,
    vehicleId: CUSTOMERS.binPaid.vehicleId, vendorId: VENDORS.binPaid.id,
    scheduledAt: daysAheadAt(4, 10), createdAt: daysAgo(40), status: 'pending',
    items: [item(SERVICES.binPaidWash)], payment: { status: 'pending' } })
  await insertBooking({ id: BOOKINGS.binHardTest, userId: CUSTOMERS.binHard.id,
    vehicleId: CUSTOMERS.binHard.vehicleId, vendorId: VENDORS.binHard.id,
    scheduledAt: daysAgo(44), createdAt: daysAgo(45), status: 'completed',
    items: [item(SERVICES.binHardWash)],
    payment: { status: 'paid', txnId: 'pay_e2e_bin_hard', paidAt: daysAgo(45), gatewayMode: 'fake' } })
  await insertBooking({ id: BOOKINGS.binTombLive, userId: CUSTOMERS.binTomb.id,
    vehicleId: CUSTOMERS.binTomb.vehicleId, vendorId: VENDORS.binTomb.id,
    scheduledAt: daysAgo(44), createdAt: daysAgo(45), status: 'completed',
    items: [item(SERVICES.binTombWash)],
    payment: { status: 'paid', txnId: 'pay_LiveBinK1', paidAt: daysAgo(45), gatewayMode: 'live' } })
  await insertBooking({ id: BOOKINGS.binTombTest, userId: CUSTOMERS.binTomb.id,
    vehicleId: CUSTOMERS.binTomb.vehicleId, vendorId: VENDORS.binTomb.id,
    scheduledAt: daysAgo(42), createdAt: daysAgo(43), status: 'completed',
    items: [item(SERVICES.binTombWash)],
    payment: { status: 'paid', txnId: 'pay_e2e_bin_tomb', paidAt: daysAgo(43), gatewayMode: 'fake' } })

  // Abandoned unpaid, test mode, long expired: nothing could still land on it.
  await db.insert(bookingIntents).values({
    id: BOOKING_INTENTS.binAbandoned, userId: CUSTOMERS.binHard.id, vendorId: VENDORS.binHard.id,
    serviceId: SERVICES.binHardWash.id, vehicleId: CUSTOMERS.binHard.vehicleId,
    bookingType: 'dropin', serviceDurationMins: SERVICES.binHardWash.durationMins,
    amount: SERVICES.binHardWash.price, subtotalAmount: SERVICES.binHardWash.price,
    paymentMethod: 'online', gatewayMode: 'test', gatewayTxnId: 'order_TestBinG1',
    status: 'pending', scheduledAt: daysAgo(40), createdAt: daysAgo(41), expiresAt: daysAgo(41),
  })
  await db.insert(bookingIntentItems).values({
    intentId: BOOKING_INTENTS.binAbandoned, serviceId: SERVICES.binHardWash.id,
    name: SERVICES.binHardWash.name, amount: SERVICES.binHardWash.price,
    durationMins: SERVICES.binHardWash.durationMins, sortOrder: 0,
  })
}

// ─── complaints ─────────────────────────────────────────────────────────────

/**
 * The complaint journey's booking: a finished, paid job at MAIN, which
 * CUSTOMERS.complaints raises a complaint about from its Help sheet. After
 * the people, garages and services it names, like every booking.
 */
async function seedComplaintRows() {
  await insertBooking({ id: BOOKINGS.complaintDone, userId: CUSTOMERS.complaints.id,
    vehicleId: CUSTOMERS.complaints.vehicleId, scheduledAt: daysAgo(2), createdAt: daysAgo(3),
    status: 'completed', acceptedAt: daysAgo(3), startedAt: daysAgo(2), completedAt: daysAgo(2),
    items: [washItem],
    payment: { status: 'paid', txnId: 'pay_e2e_complaint_done', paidAt: daysAgo(3), gatewayMode: 'fake' } })
}

/**
 * The Statistics fixtures (specs/admin/statistics-api.spec.ts): see STATS for
 * each booking and the figures they add up to. All at VENDORS.stats, which no
 * customer list shows and nobody else books, so the spec can ask for that
 * garage alone and assert exact numbers.
 */
async function seedStatsRows() {
  const garage = VENDORS.stats.id
  const customer = CUSTOMERS.stats
  await db.insert(userVehicles).values({
    id: customer.vehicleId, userId: customer.id, make: 'Hyundai', model: 'Creta', color: 'Grey',
    licensePlate: 'TN09ST0001', vehicleType: 'suv', isDefault: true,
  })
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.narrowOwner.id, businessName: VENDORS.stats.name,
    phone: '9000004500', address: '1, Stats Street, Tambaram', city: 'Chennai', pincode: '600045',
    lat: ORIGIN.lat - 0.6, lng: ORIGIN.lng - 0.2, geoSource: 'map_pin', geoConfirmedAt: now,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    // Not verified: in no list a customer sees.
    isVerified: false, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 30, status: 'pending',
  })
  await db.insert(services).values([
    { id: SERVICES.statsWash.id, vendorId: garage, name: SERVICES.statsWash.name,
      category: 'car_wash', pricingType: 'flat', price: SERVICES.statsWash.price,
      durationMins: SERVICES.statsWash.durationMins, isActive: true },
    { id: SERVICES.statsDetail.id, vendorId: garage, name: SERVICES.statsDetail.name,
      category: 'detailing', pricingType: 'flat', price: SERVICES.statsDetail.price,
      durationMins: SERVICES.statsDetail.durationMins, isActive: true },
    { id: SERVICES.statsInspect.id, vendorId: garage, name: SERVICES.statsInspect.name,
      category: 'scratch_removal', pricingType: 'on_inspection', price: SERVICES.statsInspect.price,
      durationMins: SERVICES.statsInspect.durationMins, isActive: true },
  ])
  // Ended and switched off, so nobody can type them at checkout: they exist
  // for the two bookings that used them.
  await db.insert(discounts).values([
    { id: STATS.promo.id, code: STATS.promo.code, description: '₹200 off, paid by Detlio',
      discountType: 'fixed', amountOff: '200.00', vendorId: garage, fundedBy: 'platform',
      startsAt: daysAgo(40), endsAt: daysAgo(1), isActive: false },
    { id: STATS.garageDiscount.id, code: STATS.garageDiscount.code,
      description: '₹400 off, paid by the garage', discountType: 'fixed', amountOff: '400.00',
      vendorId: garage, fundedBy: 'vendor', startsAt: daysAgo(40), endsAt: daysAgo(1), isActive: false },
  ])

  const line = (service: { id: string; name: string; price: string; durationMins: number }) => ({
    id: service.id, name: service.name, amount: service.price, durationMins: service.durationMins,
  })
  const wash = line(SERVICES.statsWash)
  const base = { userId: customer.id, vehicleId: customer.vehicleId, vendorId: garage }
  // Made at 11:00 IST that many days ago; the slot is 10:00 the next day.
  const madeOn = (days: number) => daysAheadAt(-days, 11)
  const slotAfter = (days: number) => daysAheadAt(1 - days, 10)
  const paid = (days: number, n: number) =>
    ({ status: 'paid' as const, txnId: `pay_e2e_stats_${n}`, paidAt: madeOn(days) })
  const refunded = (days: number, n: number) => ({
    status: 'refunded' as const, txnId: `pay_e2e_stats_${n}`, paidAt: madeOn(days),
    refund: { ref: `rfnd_E2ESTATS${String(n).padStart(4, '0')}`, at: madeOn(days - 1) },
  })

  // Before the range: received 1–20, one a day from 61 days ago, then 21
  // and 22 in the period the range is compared with.
  const before: Array<[number, number]> = [
    ...Array.from({ length: 20 }, (_, i): [number, number] => [i + 1, 61 - i]),
    [21, 20],
    [22, 18],
  ]
  for (const [n, days] of before) {
    const id = STATS.received(n)
    const common = { ...base, id, items: [wash], createdAt: madeOn(days), scheduledAt: slotAfter(days) }
    if (n === 3 || n === 7) {
      await insertBooking({ ...common, status: 'cancelled', payment: refunded(days, n),
        cancellation: { by: 'vendor', reason: 'Fully booked that day', at: madeOn(days) } })
    } else if (n === 12) {
      await insertBooking({ ...common, status: 'cancelled', payment: refunded(days, n),
        cancellation: { by: 'user', reason: 'Plans changed', at: madeOn(days) } })
    } else {
      await insertBooking({ ...common, status: 'completed', payment: paid(days, n) })
    }
  }
  await insertBooking({ ...base, id: STATS.testOld, items: [wash], createdAt: madeOn(50),
    scheduledAt: slotAfter(50), status: 'completed', markedTestAt: madeOn(49),
    payment: { status: 'paid', txnId: 'pay_e2e_stats_test_old', paidAt: madeOn(50), gatewayMode: 'fake' } })
  await insertBooking({ ...base, id: STATS.unpaidOld, items: [wash], createdAt: madeOn(45),
    scheduledAt: slotAfter(45), status: 'cancelled', payment: { status: 'pending' },
    cancellation: { by: 'user', reason: 'Booked by mistake', at: madeOn(45) } })

  // In the range: 23 to 32, one a day from 12 days ago.
  const inRange = (n: number) => ({
    ...base, id: STATS.received(n), createdAt: madeOn(35 - n), scheduledAt: slotAfter(35 - n),
  })
  for (const n of [23, 24, 25, 26]) {
    await insertBooking({ ...inRange(n), items: [wash], status: 'completed', payment: paid(35 - n, n) })
  }
  await insertBooking({ ...inRange(27), items: [line(SERVICES.statsDetail)], status: 'completed',
    discount: { id: STATS.promo.id, code: STATS.promo.code, amount: '200.00', fundedBy: 'platform' },
    payment: paid(8, 27) })
  await insertBooking({ ...inRange(28), items: [line(SERVICES.statsDetail)], status: 'completed',
    discount: { id: STATS.garageDiscount.id, code: STATS.garageDiscount.code, amount: '400.00',
      fundedBy: 'vendor' },
    payment: paid(7, 28) })
  await insertBooking({ ...inRange(29), items: [line(SERVICES.statsInspect)], status: 'completed',
    payment: paid(6, 29) })
  await db.insert(bookingCharges).values({
    id: STATS.bill, bookingId: STATS.received(29), kind: 'final_bill',
    totalAmount: '1500.00', paidBefore: '300.00', amountDue: '1200.00',
    lines: [{ description: 'Scratch repair, rear door', amount: '1500.00' }],
    status: 'paid', paidAt: madeOn(5), createdAt: madeOn(5), updatedAt: madeOn(5),
  })
  // A stray payment: ₹1,300 paid on an earlier bill just as the garage
  // replaced it with the one above, and refunded in full. It paid for
  // nothing, so neither it nor its refund changes what was collected.
  await db.insert(bookingCharges).values({
    id: STATS.strayBill, bookingId: STATS.received(29), kind: 'final_bill',
    totalAmount: '1600.00', paidBefore: '300.00', amountDue: '1300.00',
    lines: [{ description: 'Scratch repair, rear door and bumper', amount: '1600.00' }],
    status: 'cancelled', gatewayOrderId: 'order_e2e_stats_stray_bill',
    gatewayPaymentId: 'pay_e2e_stats_stray_bill', paidAt: madeOn(5),
    refundedAmount: '1300.00', refundRef: 'rfnd_E2ESTATSB001', refundedAt: madeOn(4),
    refundedBy: 'E2E seed', createdAt: madeOn(6), updatedAt: madeOn(5),
  })
  await db.insert(refundRecords).values({
    kind: 'bill', targetId: STATS.strayBill, bookingId: STATS.received(29), amount: '1300.00',
    refundedBefore: '0.00', refundRef: 'rfnd_E2ESTATSB001', recordedBy: 'E2E seed',
    recordedAt: madeOn(4),
  })
  await insertBooking({ ...inRange(30), items: [wash], status: 'cancelled', payment: paid(5, 30),
    cancellation: { by: 'admin', noShow: 'customer', reason: 'Customer did not turn up', at: madeOn(4) } })
  await insertBooking({ ...inRange(31), items: [wash], status: 'cancelled', payment: refunded(4, 31),
    cancellation: { by: 'vendor', reason: 'Fully booked that day', at: madeOn(4) } })
  // Moved by the customer: the old row cancelled with its payment still
  // paid, the new one carrying it, as a reschedule leaves them.
  await insertBooking({ ...inRange(32), items: [wash], status: 'cancelled', payment: paid(3, 32),
    cancellation: { by: 'user', reason: 'Rescheduled to a new slot by the customer', at: madeOn(2) } })
  // The slot is two days on by the seeding machine's UTC date: between 18:30
  // and 24:00 UTC that is still tomorrow in India, never today, so it stays
  // after the spec's range (which ends today, IST) whenever CI runs.
  await insertBooking({ ...base, id: STATS.movedTo, items: [wash], createdAt: madeOn(2),
    scheduledAt: daysAheadAt(2, 10), status: 'confirmed', rescheduledFromId: STATS.received(32),
    rescheduleCount: 1, payment: paid(3, 32) })
  await db.insert(bookingReschedules).values({
    originalBookingId: STATS.received(32), fromBookingId: STATS.received(32),
    toBookingId: STATS.movedTo, userId: customer.id, reason: 'seed',
  })
  await insertBooking({ ...base, id: STATS.testInRange, items: [wash], createdAt: madeOn(8),
    scheduledAt: slotAfter(8), status: 'completed', markedTestAt: madeOn(7),
    payment: { status: 'paid', txnId: 'pay_e2e_stats_test_new', paidAt: madeOn(8), gatewayMode: 'fake' } })
  await insertBooking({ ...base, id: STATS.unpaidInRange, items: [wash], createdAt: madeOn(7),
    scheduledAt: slotAfter(7), status: 'cancelled', payment: { status: 'pending' },
    cancellation: { by: 'user', reason: 'Booked by mistake', at: madeOn(7) } })

  await db.insert(reviews).values([
    { id: STATS.reviews[0], bookingId: STATS.received(23), userId: customer.id, vendorId: garage,
      rating: 5, comment: 'Spotless.', createdAt: madeOn(10) },
    { id: STATS.reviews[1], bookingId: STATS.received(24), userId: customer.id, vendorId: garage,
      rating: 4, createdAt: madeOn(10) },
  ])

  // Two checkouts that never became a booking: one abandoned, one paid for
  // a slot that had filled, and refunded.
  const checkout = {
    userId: customer.id, vendorId: garage, serviceId: wash.id, vehicleId: customer.vehicleId,
    bookingType: 'dropin' as const, scheduledAt: slotAfter(6), serviceDurationMins: wash.durationMins,
    amount: wash.amount, subtotalAmount: wash.amount, paymentMethod: 'online' as const,
    createdAt: madeOn(6), expiresAt: new Date(madeOn(6).getTime() + 30 * MINUTE),
  }
  await db.insert(bookingIntents).values([
    { ...checkout, id: STATS.abandonedCheckout, gatewayTxnId: 'order_e2e_stats_abandoned',
      status: 'pending' },
    { ...checkout, id: STATS.failedCheckout, gatewayTxnId: 'order_e2e_stats_failed',
      status: 'failed', paymentRef: 'pay_e2e_stats_failed', failureReason: 'slot_full',
      refundedAmount: wash.amount, refundRef: 'rfnd_E2ESTATSF001', refundedAt: madeOn(5),
      refundedBy: 'E2E seed' },
  ])
  await db.insert(bookingIntentItems).values(
    [STATS.abandonedCheckout, STATS.failedCheckout].map((intentId) => ({
      intentId, serviceId: wash.id, name: wash.name, amount: wash.amount,
      durationMins: wash.durationMins, sortOrder: 0,
    }))
  )
  await db.insert(refundRecords).values({
    kind: 'checkout', targetId: STATS.failedCheckout, bookingId: null, amount: wash.amount,
    refundedBefore: '0.00', refundRef: 'rfnd_E2ESTATSF001', recordedBy: 'E2E seed',
    recordedAt: madeOn(5),
  })
}

// ─── garage payouts ─────────────────────────────────────────────────────────

/**
 * The payouts spec's garage (VENDORS.payouts): its owner's seat, one ₹500
 * wash, a UPI id to pay to, and CUSTOMERS.payouts' three bookings — two
 * payable (₹1,000 in all, its first two bookings, so free of commission) and
 * one still to come. After the people it names, like every booking.
 */
async function seedPayoutRows() {
  const garage = VENDORS.payouts.id
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.payoutsOwner.id, businessName: VENDORS.payouts.name,
    phone: '9000004600', address: '1, Payout Lane, Porur', city: 'Chennai', pincode: '600116',
    lat: ORIGIN.lat - 0.85, lng: ORIGIN.lng - 0.15, geoSource: 'map_pin', geoConfirmedAt: now,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    // Not verified: in no list a customer sees.
    isVerified: false, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 30, status: 'pending',
  })
  await db.insert(userMemberMapping).values({
    vendorId: garage, userId: STAFF.payoutsOwner.id, role: 'vendor_admin', status: 'active',
  })
  await db.insert(vendorWorkingHours).values(hoursFor(garage, '06:00:00', '22:00:00'))
  await db.insert(services).values({
    id: SERVICES.payoutsWash.id, vendorId: garage, name: SERVICES.payoutsWash.name,
    category: 'car_wash', pricingType: 'flat', price: SERVICES.payoutsWash.price,
    durationMins: SERVICES.payoutsWash.durationMins, isActive: true,
  })
  await db.insert(vendorPayoutAccounts).values({
    vendorId: garage, accountName: 'Payouts Test Garage', upiId: 'payoutsgarage@okaxis',
    updatedBy: 'E2E seed',
  })

  const customer = CUSTOMERS.payouts
  const base = { userId: customer.id, vehicleId: customer.vehicleId, vendorId: garage }
  const wash = {
    id: SERVICES.payoutsWash.id, name: SERVICES.payoutsWash.name,
    amount: SERVICES.payoutsWash.price, durationMins: SERVICES.payoutsWash.durationMins,
  }
  await insertBooking({ ...base, id: BOOKINGS.payoutDone, items: [wash],
    createdAt: daysAgo(4), scheduledAt: daysAgo(2), status: 'completed',
    acceptedAt: daysAgo(4), startedAt: daysAgo(2), completedAt: daysAgo(2),
    payment: { status: 'paid', txnId: 'pay_e2e_payout_done', paidAt: daysAgo(4), gatewayMode: 'fake' } })
  await insertBooking({ ...base, id: BOOKINGS.payoutNoShow, items: [wash],
    createdAt: daysAgo(3), scheduledAt: daysAgo(1), status: 'cancelled', acceptedAt: daysAgo(3),
    cancellation: { by: 'admin', onBehalfOf: 'detlio', noShow: 'customer', reason: 'Customer did not turn up',
      at: hoursAgo(20) },
    payment: { status: 'paid', txnId: 'pay_e2e_payout_noshow', paidAt: daysAgo(3), gatewayMode: 'fake' } })
  await insertBooking({ ...base, id: BOOKINGS.payoutUpcoming, items: [wash],
    createdAt: daysAgo(2), scheduledAt: daysAheadAt(1, 10), status: 'confirmed', acceptedAt: daysAgo(2),
    payment: { status: 'paid', txnId: 'pay_e2e_payout_upcoming', paidAt: daysAgo(2), gatewayMode: 'fake' } })
}

// ─── pickup & drop ──────────────────────────────────────────────────────────

/**
 * Pickup & drop (0037): VENDORS.pickup, on with the responsibility terms on
 * file (pickup 'yes' alone is not on), collecting within 8 km of PICKUP_PIN;
 * and CUSTOMERS.pickup, whose one car and pinned default address
 * (ADDRESSES.pickupHome, ~1.7 km away) are what a pickup booking needs.
 * After the people it names, like every garage seeded on its own.
 */
async function seedPickupRows() {
  const garage = VENDORS.pickup.id
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.pickupOwner.id, businessName: VENDORS.pickup.name,
    phone: '9000004800', address: '1, Pickup Road, Kelambakkam', city: 'Chennai', pincode: '603103',
    lat: PICKUP_PIN.lat, lng: PICKUP_PIN.lng, geoSource: 'map_pin', geoConfirmedAt: now,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: true, doorstepEnabled: false, dropinEnabled: true,
    pickup: 'yes', pickupRadiusKm: 8,
    pickupTermsAcceptedAt: daysAgo(1), pickupTermsAcceptedBy: 'admin: E2E seed',
    slotIntervalMins: 30, status: 'active', bays: 5,
  })
  await db.insert(userMemberMapping).values({
    vendorId: garage, userId: STAFF.pickupOwner.id, role: 'vendor_admin', status: 'active',
  })
  await db.insert(vendorWorkingHours).values(hoursFor(garage, '06:00:00', '22:00:00'))
  await db.insert(services).values({
    id: SERVICES.pickupWash.id, vendorId: garage, name: SERVICES.pickupWash.name,
    description: 'An exterior foam wash and dry.', category: 'car_wash', pricingType: 'flat',
    price: SERVICES.pickupWash.price, durationMins: SERVICES.pickupWash.durationMins, isActive: true,
  })

  await db.insert(userVehicles).values({
    id: CUSTOMERS.pickup.vehicleId, userId: CUSTOMERS.pickup.id, make: 'Tata', model: 'Altroz',
    color: 'Black', licensePlate: 'TN24PD0001', vehicleType: 'hatchback', isDefault: true,
  })
  await db.insert(userAddresses).values({
    id: ADDRESSES.pickupHome, userId: CUSTOMERS.pickup.id, label: PICKUP_HOME.label,
    address: PICKUP_HOME.address, city: 'Chennai',
    lat: PICKUP_HOME.lat, lng: PICKUP_HOME.lng, geoSource: 'map_pin', isDefault: true,
  })
}

/**
 * Garage documents (0043): VENDORS.documents with its owner's and an
 * operator's seat, hours and one service, and no documents yet (the spec
 * uploads them). Every id and phone is in the 2300–2399 / 90000023xx range
 * reserved for this feature. Garage before seats and services, as the
 * foreign keys need; the people are seeded with everyone else.
 */
async function seedDocumentRows() {
  const garage = VENDORS.documents.id
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.documentsOwner.id, businessName: VENDORS.documents.name,
    phone: '9000002300', address: '5, Document Lane, Chengalpattu', city: 'Chennai', pincode: '603002',
    lat: DOCUMENTS_PIN.lat, lng: DOCUMENTS_PIN.lng, geoSource: 'map_pin', geoConfirmedAt: now,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: true, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 30, status: 'active', bays: 1,
  })
  await db.insert(userMemberMapping).values([
    { vendorId: garage, userId: STAFF.documentsOwner.id, role: 'vendor_admin', status: 'active' },
    { vendorId: garage, userId: STAFF.documentsOperator.id, role: 'vendor_operator', status: 'active' },
  ])
  await db.insert(vendorWorkingHours).values(hoursFor(garage, '06:00:00', '22:00:00'))
  await db.insert(services).values({
    id: SERVICES.documentsWash.id, vendorId: garage, name: SERVICES.documentsWash.name,
    description: 'An exterior foam wash and dry.', category: 'car_wash', pricingType: 'flat',
    price: SERVICES.documentsWash.price, durationMins: SERVICES.documentsWash.durationMins, isActive: true,
  })
}

/**
 * Browser notifications (0044): VENDORS.push with its owner's and an
 * operator's seat, pending and unverified so no customer sees it. Every id
 * and phone is in the 2400–2499 / 90000024xx range reserved for this
 * feature; the people are seeded with everyone else.
 */
async function seedPushRows() {
  const garage = VENDORS.push.id
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.pushOwner.id, businessName: VENDORS.push.name,
    phone: '9000002400', address: '7, Bell Street, Chengalpattu', city: 'Chennai', pincode: '603002',
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: false, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 30, status: 'pending', bays: 1,
  })
  await db.insert(userMemberMapping).values([
    { vendorId: garage, userId: STAFF.pushOwner.id, role: 'vendor_admin', status: 'active' },
    { vendorId: garage, userId: STAFF.pushOperator.id, role: 'vendor_operator', status: 'active' },
  ])
}

/**
 * Suggested times and extra work (0041), on a garage of their own so nothing
 * else books its bays: VENDORS.proposals with its owner's seat, hours and
 * one service, the three customers' cars, and their bookings. Every id and
 * phone is in the 2100–2199 / 90000021xx range reserved for this feature.
 * Garage before services before bookings, as the foreign keys need.
 */
async function seedProposalRows() {
  const garage = VENDORS.proposals.id
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.proposalsOwner.id, businessName: VENDORS.proposals.name,
    phone: '9000002100', address: '3, Proposal Street, Chengalpattu', city: 'Chennai', pincode: '603001',
    lat: PROPOSALS_PIN.lat, lng: PROPOSALS_PIN.lng, geoSource: 'map_pin', geoConfirmedAt: now,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: true, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 30, status: 'active', bays: 2,
  })
  await db.insert(userMemberMapping).values({
    vendorId: garage, userId: STAFF.proposalsOwner.id, role: 'vendor_admin', status: 'active',
  })
  await db.insert(vendorWorkingHours).values(hoursFor(garage, '06:00:00', '22:00:00'))
  await db.insert(services).values({
    id: SERVICES.proposalsWash.id, vendorId: garage, name: SERVICES.proposalsWash.name,
    description: 'An exterior foam wash and dry.', category: 'car_wash', pricingType: 'flat',
    price: SERVICES.proposalsWash.price, durationMins: SERVICES.proposalsWash.durationMins, isActive: true,
  })

  const customers = [CUSTOMERS.proposalPicker, CUSTOMERS.proposalDecliner, CUSTOMERS.extraWorkPayer]
  await db.insert(userVehicles).values(
    customers.map((c, i) => ({
      id: c.vehicleId, userId: c.id, make: 'Maruti', model: 'Baleno', color: 'White',
      licensePlate: `TN21PX${String(i).padStart(4, '0')}`, vehicleType: 'hatchback' as const, isDefault: true,
    }))
  )

  const wash = {
    id: SERVICES.proposalsWash.id, name: SERVICES.proposalsWash.name,
    amount: SERVICES.proposalsWash.price, durationMins: SERVICES.proposalsWash.durationMins,
  }
  await insertBooking({
    id: BOOKINGS.proposalPick, userId: CUSTOMERS.proposalPicker.id, vendorId: garage,
    vehicleId: CUSTOMERS.proposalPicker.vehicleId, scheduledAt: tomorrowAt(10), status: 'pending',
    items: [wash], payment: { status: 'paid', txnId: 'pay_seed_proposal_pick', gatewayMode: 'fake' },
    createdAt: hoursAgo(1),
  })
  await insertBooking({
    id: BOOKINGS.proposalDecline, userId: CUSTOMERS.proposalDecliner.id, vendorId: garage,
    vehicleId: CUSTOMERS.proposalDecliner.vehicleId, scheduledAt: tomorrowAt(12), status: 'pending',
    items: [wash], payment: { status: 'paid', txnId: 'pay_seed_proposal_decline', gatewayMode: 'fake' },
    createdAt: hoursAgo(1),
  })
  await insertBooking({
    id: BOOKINGS.extraWorkJob, userId: CUSTOMERS.extraWorkPayer.id, vendorId: garage,
    vehicleId: CUSTOMERS.extraWorkPayer.vehicleId, scheduledAt: anHourAgo(), status: 'in_progress',
    items: [wash], payment: { status: 'paid', txnId: 'pay_seed_extra_work', gatewayMode: 'fake' },
    createdAt: daysAgo(1), acceptedAt: hoursAgo(3), startedAt: anHourAgo(),
  })
}

/**
 * The garage response deadline (0042), on garages of their own far from
 * every other: VENDORS.response with its owner's seat, hours and one wash,
 * and its neighbour VENDORS.responseOther (the suggestion), then the
 * customer's car and the overdue booking. Every id and phone is in the
 * 2200–2299 / 90000022xx range reserved for this feature. Garages before
 * services before the car before the booking, as the foreign keys need.
 */
async function seedResponseDeadlineRows() {
  const garages = [
    { vendor: VENDORS.response, pin: RESPONSE_PIN, phone: '9000002200', service: SERVICES.responseWash },
    { vendor: VENDORS.responseOther, pin: RESPONSE_OTHER_PIN, phone: '9000002210', service: SERVICES.responseOtherWash },
  ]
  for (const { vendor, pin, phone, service } of garages) {
    await db.insert(vendors).values({
      id: vendor.id, ownerId: STAFF.responseOwner.id, businessName: vendor.name,
      phone, address: '7, Deadline Road, Tindivanam', city: 'Chennai', pincode: '604001',
      lat: pin.lat, lng: pin.lng, geoSource: 'map_pin', geoConfirmedAt: now,
      vehicleTypes: ['hatchback', 'sedan', 'suv'],
      isVerified: true, doorstepEnabled: false, dropinEnabled: true,
      slotIntervalMins: 30, status: 'active', bays: 1,
    })
    await db.insert(userMemberMapping).values({
      vendorId: vendor.id, userId: STAFF.responseOwner.id, role: 'vendor_admin', status: 'active',
    })
    await db.insert(vendorWorkingHours).values(hoursFor(vendor.id, '06:00:00', '22:00:00'))
    await db.insert(services).values({
      id: service.id, vendorId: vendor.id, name: service.name,
      description: 'An exterior foam wash and dry.', category: 'car_wash', pricingType: 'flat',
      price: service.price, durationMins: service.durationMins, isActive: true,
    })
  }

  const customer = CUSTOMERS.notAccepted
  await db.insert(userVehicles).values({
    id: customer.vehicleId, userId: customer.id, make: 'Hyundai', model: 'i20', color: 'Grey',
    licensePlate: 'TN22RD0001', vehicleType: 'hatchback', isDefault: true,
  })

  const paidAt = new Date(now.getTime() - 45 * MINUTE)
  await insertBooking({
    id: BOOKINGS.notAccepted, userId: customer.id, vendorId: VENDORS.response.id,
    vehicleId: customer.vehicleId, scheduledAt: tomorrowAt(15), status: 'pending',
    items: [{
      id: SERVICES.responseWash.id, name: SERVICES.responseWash.name,
      amount: SERVICES.responseWash.price, durationMins: SERVICES.responseWash.durationMins,
    }],
    payment: { status: 'paid', txnId: 'pay_seed_not_accepted', gatewayMode: 'fake', paidAt },
    createdAt: paidAt,
    respondBy: new Date(now.getTime() - 15 * MINUTE),
  })
}

/**
 * Job photo standards (0045): VENDORS.photos with its owner's seat, hours
 * and one wash, pending and unverified so no customer list shows it; the
 * customer's car; and BOOKINGS.photosJob, accepted, paid, not started. Every
 * id and phone is in the 2500–2599 / 90000025xx range reserved for this
 * feature. Garage before service before car before booking, as the foreign
 * keys need; the people are seeded with everyone else.
 */
async function seedPhotoStandardRows() {
  const garage = VENDORS.photos.id
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.photosOwner.id, businessName: VENDORS.photos.name,
    phone: '9000002500', address: '9, Shutter Street, Chengalpattu', city: 'Chennai', pincode: '603002',
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: false, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 30, status: 'pending', bays: 1,
  })
  await db.insert(userMemberMapping).values({
    vendorId: garage, userId: STAFF.photosOwner.id, role: 'vendor_admin', status: 'active',
  })
  await db.insert(vendorWorkingHours).values(hoursFor(garage, '06:00:00', '22:00:00'))
  await db.insert(services).values({
    id: SERVICES.photosWash.id, vendorId: garage, name: SERVICES.photosWash.name,
    description: 'An exterior foam wash and dry.', category: 'car_wash', pricingType: 'flat',
    price: SERVICES.photosWash.price, durationMins: SERVICES.photosWash.durationMins, isActive: true,
  })

  const customer = CUSTOMERS.photos
  await db.insert(userVehicles).values({
    id: customer.vehicleId, userId: customer.id, make: 'Honda', model: 'Amaze', color: 'Blue',
    licensePlate: 'TN25PS0001', vehicleType: 'sedan', isDefault: true,
  })

  await insertBooking({
    id: BOOKINGS.photosJob, userId: customer.id, vendorId: garage,
    vehicleId: customer.vehicleId, scheduledAt: tomorrowAt(11), status: 'confirmed',
    items: [{
      id: SERVICES.photosWash.id, name: SERVICES.photosWash.name,
      amount: SERVICES.photosWash.price, durationMins: SERVICES.photosWash.durationMins,
    }],
    payment: { status: 'paid', txnId: 'pay_seed_photos_job', gatewayMode: 'fake' },
    createdAt: hoursAgo(2), acceptedAt: hoursAgo(1),
  })
}

/**
 * Car history and service reminders (0046): VENDORS.carHistory with its
 * owner's seat and two services (pending and unverified, so no customer sees
 * it), CUSTOMERS.carHistory's car, two completed paid jobs on it (a coating,
 * then a wash), a cancelled one, and the coating's maintenance-wash reminder
 * due in 3 days. The wash is more than 30 days before that, so it does not
 * answer the reminder. Every id and phone is in the 2600–2699 / 90000026xx
 * range reserved for this feature.
 */
async function seedCarHistoryRows() {
  const garage = VENDORS.carHistory.id
  const customer = CUSTOMERS.carHistory
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.carHistoryOwner.id, businessName: VENDORS.carHistory.name,
    phone: '9000002610', address: '9, History Lane, Chengalpattu', city: 'Chennai', pincode: '603003',
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: false, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 30, status: 'pending', bays: 1,
  })
  await db.insert(userMemberMapping).values({
    vendorId: garage, userId: STAFF.carHistoryOwner.id, role: 'vendor_admin', status: 'active',
  })
  await db.insert(services).values([
    {
      id: SERVICES.carHistoryWash.id, vendorId: garage, name: SERVICES.carHistoryWash.name,
      description: 'An exterior foam wash and dry.', category: 'car_wash', pricingType: 'flat',
      price: SERVICES.carHistoryWash.price, durationMins: SERVICES.carHistoryWash.durationMins, isActive: true,
    },
    {
      id: SERVICES.carHistoryCoating.id, vendorId: garage, name: SERVICES.carHistoryCoating.name,
      description: 'A ceramic coating over a polished finish.', category: 'coating', pricingType: 'flat',
      price: SERVICES.carHistoryCoating.price, durationMins: SERVICES.carHistoryCoating.durationMins, isActive: true,
    },
  ])
  await db.insert(userVehicles).values({
    id: customer.vehicleId, userId: customer.id, make: 'Kia', model: 'Seltos', color: 'Black',
    licensePlate: 'TN26KH0001', vehicleType: 'suv', isDefault: true,
  })

  const item = (service: { id: string; name: string; price: string; durationMins: number }) => ({
    id: service.id, name: service.name, amount: service.price, durationMins: service.durationMins,
  })
  const done = (days: number) => ({
    scheduledAt: daysAgo(days), createdAt: daysAgo(days + 2),
    acceptedAt: daysAgo(days + 1), startedAt: daysAgo(days), completedAt: new Date(daysAgo(days).getTime() + 2 * HOUR),
  })
  await insertBooking({
    id: BOOKINGS.carHistoryCoating, userId: customer.id, vendorId: garage, vehicleId: customer.vehicleId,
    status: 'completed', items: [item(SERVICES.carHistoryCoating)],
    payment: { status: 'paid', txnId: 'pay_seed_history_coating', gatewayMode: 'fake', paidAt: daysAgo(89) },
    ...done(87),
  })
  await insertBooking({
    id: BOOKINGS.carHistoryWash, userId: customer.id, vendorId: garage, vehicleId: customer.vehicleId,
    status: 'completed', items: [item(SERVICES.carHistoryWash)],
    payment: { status: 'paid', txnId: 'pay_seed_history_wash', gatewayMode: 'fake', paidAt: daysAgo(42) },
    ...done(40),
  })
  await insertBooking({
    id: BOOKINGS.carHistoryCancelled, userId: customer.id, vendorId: garage, vehicleId: customer.vehicleId,
    scheduledAt: daysAgo(10), status: 'cancelled', items: [item(SERVICES.carHistoryWash)],
    createdAt: daysAgo(12),
    cancellation: { by: 'user', reason: 'Plans changed', at: daysAgo(11) },
  })
  await db.insert(vehicleServiceReminders).values({
    id: SERVICE_REMINDERS.carHistoryMaintenance, userId: customer.id, vehicleId: customer.vehicleId,
    kind: 'maintenance_wash', dueOn: istDate(3), sourceBookingId: BOOKINGS.carHistoryCoating,
  })
}

/**
 * "Notify me if a slot opens" (0047), on a garage of its own so nothing else
 * books its day: VENDORS.slotAlerts with its owner's seat, hours, one bay,
 * one job a day and one wash, the holder's car, and the booking that fills
 * the day two days ahead. Every id and phone is in the 2700–2799 /
 * 90000027xx range reserved for this feature. Garage before service before
 * the car before the booking, as the foreign keys need.
 */
async function seedSlotAlertRows() {
  const garage = VENDORS.slotAlerts.id
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.slotAlertsOwner.id, businessName: VENDORS.slotAlerts.name,
    phone: '9000002710', address: '9, Waiting Street, Chidambaram', city: 'Chennai', pincode: '608001',
    lat: SLOT_ALERTS_PIN.lat, lng: SLOT_ALERTS_PIN.lng, geoSource: 'map_pin', geoConfirmedAt: now,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: true, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 60, status: 'active', bays: 1, jobsPerDay: 1,
  })
  await db.insert(userMemberMapping).values({
    vendorId: garage, userId: STAFF.slotAlertsOwner.id, role: 'vendor_admin', status: 'active',
  })
  await db.insert(vendorWorkingHours).values(hoursFor(garage, '06:00:00', '22:00:00'))
  const wash = SERVICES.slotAlertsWash
  await db.insert(services).values({
    id: wash.id, vendorId: garage, name: wash.name,
    description: 'An exterior foam wash and dry.', category: 'car_wash', pricingType: 'flat',
    price: wash.price, durationMins: wash.durationMins, isActive: true,
  })

  const holder = CUSTOMERS.slotHolder
  await db.insert(userVehicles).values({
    id: holder.vehicleId, userId: holder.id, make: 'Honda', model: 'Amaze', color: 'Blue',
    licensePlate: 'TN31SA0001', vehicleType: 'sedan', isDefault: true,
  })
  await insertBooking({
    id: BOOKINGS.slotAlertsHeld, userId: holder.id, vendorId: garage,
    vehicleId: holder.vehicleId, scheduledAt: daysAheadAt(2, 10), status: 'pending',
    items: [{ id: wash.id, name: wash.name, amount: wash.price, durationMins: wash.durationMins }],
    payment: { status: 'paid', txnId: 'pay_seed_slot_alerts_held', gatewayMode: 'fake' },
    createdAt: hoursAgo(1),
  })
}

/**
 * The Service History certificate (0053): VENDORS.certificate with its
 * owner's seat and two services (pending and unverified, so no customer sees
 * it), CUSTOMERS.certificate's car, two completed paid jobs on it (a polish,
 * then a wash) and a cancelled one. No share link is seeded: the spec makes
 * it. Every id and phone is in the 3300–3399 / 90000033xx range reserved for
 * this feature.
 */
async function seedCertificateRows() {
  const garage = VENDORS.certificate.id
  const customer = CUSTOMERS.certificate
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.certificateOwner.id, businessName: VENDORS.certificate.name,
    phone: '9000003310', address: '3, Record Street, Madurantakam', city: 'Chennai', pincode: '603306',
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: false, doorstepEnabled: false, dropinEnabled: true,
    slotIntervalMins: 30, status: 'pending', bays: 1,
  })
  await db.insert(userMemberMapping).values({
    vendorId: garage, userId: STAFF.certificateOwner.id, role: 'vendor_admin', status: 'active',
  })
  await db.insert(services).values([
    {
      id: SERVICES.certificateWash.id, vendorId: garage, name: SERVICES.certificateWash.name,
      description: 'An exterior foam wash and dry.', category: 'car_wash', pricingType: 'flat',
      price: SERVICES.certificateWash.price, durationMins: SERVICES.certificateWash.durationMins, isActive: true,
    },
    {
      id: SERVICES.certificatePolish.id, vendorId: garage, name: SERVICES.certificatePolish.name,
      description: 'A machine polish of the paintwork.', category: 'detailing', pricingType: 'flat',
      price: SERVICES.certificatePolish.price, durationMins: SERVICES.certificatePolish.durationMins, isActive: true,
    },
  ])
  await db.insert(userVehicles).values({
    id: customer.vehicleId, userId: customer.id, make: 'Maruti', model: 'Baleno', color: 'Blue',
    licensePlate: 'TN09AB3301', vehicleType: 'hatchback', isDefault: true,
  })

  const item = (service: { id: string; name: string; price: string; durationMins: number }) => ({
    id: service.id, name: service.name, amount: service.price, durationMins: service.durationMins,
  })
  const done = (days: number) => ({
    scheduledAt: daysAgo(days), createdAt: daysAgo(days + 2),
    acceptedAt: daysAgo(days + 1), startedAt: daysAgo(days), completedAt: new Date(daysAgo(days).getTime() + 2 * HOUR),
  })
  await insertBooking({
    id: BOOKINGS.certificatePolish, userId: customer.id, vendorId: garage, vehicleId: customer.vehicleId,
    status: 'completed', items: [item(SERVICES.certificatePolish)],
    payment: { status: 'paid', txnId: 'pay_seed_certificate_polish', gatewayMode: 'fake', paidAt: daysAgo(62) },
    ...done(60),
  })
  await insertBooking({
    id: BOOKINGS.certificateWash, userId: customer.id, vendorId: garage, vehicleId: customer.vehicleId,
    status: 'completed', items: [item(SERVICES.certificateWash)],
    payment: { status: 'paid', txnId: 'pay_seed_certificate_wash', gatewayMode: 'fake', paidAt: daysAgo(14) },
    ...done(12),
  })
  await insertBooking({
    id: BOOKINGS.certificateCancelled, userId: customer.id, vendorId: garage, vehicleId: customer.vehicleId,
    scheduledAt: daysAgo(5), status: 'cancelled', items: [item(SERVICES.certificateWash)],
    createdAt: daysAgo(7),
    cancellation: { by: 'user', reason: 'Plans changed', at: daysAgo(6) },
    })
}

/**
 * Contact windows: VENDORS.contact with its owner's seat, hours and one wash
 * (pending and unverified, so no customer list shows it), CUSTOMERS.contact's
 * car, and four paid washes there, one inside the window and three outside
 * (see BOOKINGS.contactSoon). Every id and phone is in the 3400–3499 /
 * 90000034xx range reserved for this feature.
 */
/**
 * The six-tap checkout (specs/users/checkout-six-taps.spec.ts): CUSTOMERS.sixTap
 * and one default car, so Home's Book a wash opens checkout with the car
 * chosen. Nothing else: the spec books MAIN's Express Wash itself.
 */
async function seedSixTapRows() {
  const customer = CUSTOMERS.sixTap
  await db.insert(userVehicles).values({
    id: customer.vehicleId, userId: customer.id, make: 'Hyundai', model: 'Venue', color: 'Grey',
    licensePlate: 'TN09ST4001', vehicleType: 'hatchback', isDefault: true,
  })
}

async function seedContactWindowRows() {
  const garage = VENDORS.contact.id
  const customer = CUSTOMERS.contact
  await db.insert(vendors).values({
    id: garage, ownerId: STAFF.contactOwner.id, businessName: VENDORS.contact.name,
    phone: CONTACT_GARAGE.phone, whatsapp: CONTACT_GARAGE.whatsapp,
    address: '3, Window Street, Adyar', city: 'Chennai', pincode: '600020',
    lat: 13.0067, lng: 80.2571,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: false, doorstepEnabled: true, dropinEnabled: true,
    slotIntervalMins: 30, status: 'pending', bays: 2,
  })
  await db.insert(userMemberMapping).values({
    vendorId: garage, userId: STAFF.contactOwner.id, role: 'vendor_admin', status: 'active',
  })
  await db.insert(vendorWorkingHours).values(hoursFor(garage, '06:00:00', '22:00:00'))
  await db.insert(services).values({
    id: SERVICES.contactWash.id, vendorId: garage, name: SERVICES.contactWash.name,
    description: 'An exterior foam wash and dry.', category: 'car_wash', pricingType: 'flat',
    price: SERVICES.contactWash.price, durationMins: SERVICES.contactWash.durationMins, isActive: true,
  })
  await db.insert(userVehicles).values({
    id: customer.vehicleId, userId: customer.id, make: 'Hyundai', model: 'i20', color: 'White',
    licensePlate: 'TN07CW0001', vehicleType: 'hatchback', isDefault: true,
  })

  const items = [{
    id: SERVICES.contactWash.id, name: SERVICES.contactWash.name,
    amount: SERVICES.contactWash.price, durationMins: SERVICES.contactWash.durationMins,
  }]
  const common = { userId: customer.id, vendorId: garage, vehicleId: customer.vehicleId, items }

  // In an hour: inside the window, so both numbers show.
  await insertBooking({
    ...common, id: BOOKINGS.contactSoon, scheduledAt: insideCutoff(), status: 'confirmed',
    payment: { status: 'paid', txnId: 'pay_seed_contact_soon', gatewayMode: 'fake' },
    createdAt: daysAgo(1), acceptedAt: hoursAgo(20),
  })
  // Two days ahead: the numbers show 2 hours before.
  await insertBooking({
    ...common, id: BOOKINGS.contactLater, scheduledAt: daysAheadAt(2, 11), status: 'confirmed',
    payment: { status: 'paid', txnId: 'pay_seed_contact_later', gatewayMode: 'fake' },
    createdAt: daysAgo(1), acceptedAt: hoursAgo(20),
  })
  // Done three hours ago: the hour after has passed, so both are hidden.
  await insertBooking({
    ...common, id: BOOKINGS.contactDone, scheduledAt: hoursAgo(4), status: 'completed',
    payment: { status: 'paid', txnId: 'pay_seed_contact_done', gatewayMode: 'fake' },
    createdAt: daysAgo(2), acceptedAt: daysAgo(1), startedAt: hoursAgo(4), completedAt: hoursAgo(3),
  })
  // Pending, at the customer's door, tomorrow: the garage plans the route
  // from the address now, and calls from 2 hours before.
  await insertBooking({
    ...common, id: BOOKINGS.contactDoorstep, scheduledAt: tomorrowAt(15), status: 'pending',
    doorstep: { ...CONTACT_DOORSTEP },
    payment: { status: 'paid', txnId: 'pay_seed_contact_doorstep', gatewayMode: 'fake' },
    createdAt: hoursAgo(1),
  })
}

/**
 * The garage's Today view and job page (specs/vendors/today.spec.ts): one
 * garage of its own, five jobs, one in each list (see BOOKINGS.today*).
 * Ids 3900–3999 and phones 90000039xx only.
 */
async function seedTodayRows() {
  const garage = VENDORS.today.id
  const customer = CUSTOMERS.today
  await db.insert(vendors).values({
    id: garage,
    ownerId: STAFF.todayOwner.id,
    businessName: VENDORS.today.name,
    phone: '9000003910',
    address: '9, Today Street, Adyar',
    city: 'Chennai',
    pincode: '600020',
    lat: 13.0067,
    lng: 80.2571,
    vehicleTypes: ['hatchback', 'sedan', 'suv'],
    isVerified: false,
    doorstepEnabled: false,
    dropinEnabled: true,
    slotIntervalMins: 30,
    status: 'pending',
    bays: 2,
  })
  await db.insert(userMemberMapping).values({
    vendorId: garage,
    userId: STAFF.todayOwner.id,
    role: 'vendor_admin',
    status: 'active',
  })
  await db
    .insert(vendorWorkingHours)
    .values(hoursFor(garage, '06:00:00', '22:00:00'))
  await db.insert(services).values({
    id: SERVICES.todayWash.id,
    vendorId: garage,
    name: SERVICES.todayWash.name,
    description: 'An exterior foam wash and dry.',
    category: 'car_wash',
    pricingType: 'flat',
    price: SERVICES.todayWash.price,
    durationMins: SERVICES.todayWash.durationMins,
    isActive: true,
  })
  await db.insert(userVehicles).values({
    id: customer.vehicleId,
    userId: customer.id,
    make: 'Honda',
    model: 'City',
    color: 'Silver',
    licensePlate: 'TN01BQ5521',
    vehicleType: 'sedan',
    isDefault: true,
  })

  const items = [
    {
      id: SERVICES.todayWash.id,
      name: SERVICES.todayWash.name,
      amount: SERVICES.todayWash.price,
      durationMins: SERVICES.todayWash.durationMins,
    },
  ]
  const common = {
    userId: customer.id,
    vendorId: garage,
    vehicleId: customer.vehicleId,
    items,
  }

  await insertBooking({
    ...common,
    id: BOOKINGS.todayWorking,
    scheduledAt: hoursAgo(1),
    status: 'in_progress',
    payment: {
      status: 'paid',
      txnId: 'pay_seed_today_working',
      gatewayMode: 'fake',
    },
    createdAt: daysAgo(1),
    acceptedAt: hoursAgo(20),
    startedAt: hoursAgo(1),
  })
  await insertBooking({
    ...common,
    id: BOOKINGS.todayLate,
    scheduledAt: hoursAgo(1),
    status: 'confirmed',
    payment: {
      status: 'paid',
      txnId: 'pay_seed_today_late',
      gatewayMode: 'fake',
    },
    createdAt: daysAgo(1),
    acceptedAt: hoursAgo(20),
  })
  await insertBooking({
    ...common,
    id: BOOKINGS.todayAnswer,
    scheduledAt: daysAheadAt(2, 11),
    status: 'pending',
    payment: {
      status: 'paid',
      txnId: 'pay_seed_today_answer',
      gatewayMode: 'fake',
    },
    createdAt: hoursAgo(1),
  })
  // Three hours to answer: far enough that no run's cron reaches it.
  await db
    .update(bookings)
    .set({ respondBy: new Date(now.getTime() + 3 * HOUR) })
    .where(eq(bookings.id, BOOKINGS.todayAnswer))
  await insertBooking({
    ...common,
    id: BOOKINGS.todayLater,
    scheduledAt: daysAheadAt(4, 10),
    status: 'confirmed',
    payment: {
      status: 'paid',
      txnId: 'pay_seed_today_later',
      gatewayMode: 'fake',
    },
    createdAt: daysAgo(1),
    acceptedAt: hoursAgo(20),
  })
  await insertBooking({
    ...common,
    id: BOOKINGS.todayDone,
    scheduledAt: daysAgo(1),
    status: 'completed',
    payment: {
      status: 'paid',
      txnId: 'pay_seed_today_done',
      gatewayMode: 'fake',
    },
    createdAt: daysAgo(2),
    acceptedAt: daysAgo(2),
    startedAt: daysAgo(1),
    completedAt: daysAgo(1),
  })
}

/**
 * Personal admin logins (0058; ADMIN_LOGINS, ids 4100–4149): the panel's
 * own E2E session and the team-logins spec's logins. Hashed here, as the
 * panel would, so signing in checks a real hash.
 */
async function seedAdminLoginRows() {
  const longAgo = daysAgo(30)
  for (const login of Object.values(ADMIN_LOGINS)) {
    await db.insert(adminLogins).values({
      id: login.id,
      username: login.username,
      name: login.name,
      passwordHash: await hashPassword(login.password),
      status: login === ADMIN_LOGINS.off ? 'off' : 'active',
      // E2E Admin is the owner; nobody else is.
      isOwner: 'isOwner' in login && login.isOwner,
      phone: 'phone' in login ? login.phone : null,
      sessionsFrom: longAgo,
      createdByName: 'E2E seed',
      createdAt: longAgo,
      updatedAt: longAgo,
    })
  }
}

/**
 * Onboarding marks and collection lists (0059; VENDORS.marksA / marksB, ids
 * 4150–4199 and phones 90000041xx from 51 only): two live garages, each
 * missing exactly what VENDORS says, so the Missing keys are exact. Every
 * required document approved (documents are on in E2E) so "documents" is
 * never among them. No marks or lists are seeded: the specs make their own.
 * marksA is the newest of the three by a minute each, so the Garages list
 * (newest first) always puts it first: the marks UI spec's "Open next".
 */
async function seedMarksRows() {
  const pin = (n: number) => ({
    lat: ORIGIN.lat - 0.9 - n * 0.01, lng: ORIGIN.lng - 0.2,
    geoSource: 'map_pin' as const, geoConfirmedAt: now,
  })
  const garage = {
    city: 'Chennai', pincode: '600116', vehicleTypes: ['hatchback', 'sedan', 'suv'],
    slotIntervalMins: 30, status: 'active' as const, isVerified: true, whatsapp: null,
  }
  await db.insert(vendors).values([
    {
      ...garage, ...pin(0), id: VENDORS.marksA.id, ownerId: STAFF.marksAOwner.id,
      businessName: VENDORS.marksA.name, phone: STAFF.marksAOwner.phone,
      address: '1, Marks Road, Porur', bays: 2, logoUrl: null,
      doorstepEnabled: true, dropinEnabled: true, doorstepRadiusKm: null,
      createdAt: now,
    },
    {
      ...garage, ...pin(1), id: VENDORS.marksB.id, ownerId: STAFF.marksBOwner.id,
      businessName: VENDORS.marksB.name, phone: STAFF.marksBOwner.phone,
      address: '2, Marks Road, Porur', bays: null,
      logoUrl: `http://localhost:9000/detlio-e2e/vendors/${VENDORS.marksB.id}/logo/seed.png`,
      doorstepEnabled: false, dropinEnabled: true,
      onboardedByName: VENDORS.marksB.onboardedByName,
      createdAt: new Date(now.getTime() - MINUTE),
    },
    {
      ...garage, ...pin(2), id: VENDORS.marksC.id, ownerId: STAFF.marksCOwner.id,
      businessName: VENDORS.marksC.name, phone: STAFF.marksCOwner.phone,
      address: '3, Marks Road, Porur', bays: null,
      logoUrl: `http://localhost:9000/detlio-e2e/vendors/${VENDORS.marksC.id}/logo/seed.png`,
      doorstepEnabled: false, dropinEnabled: true,
      onboardedByName: VENDORS.marksC.onboardedByName,
      createdAt: new Date(now.getTime() - 2 * MINUTE),
    },
  ])
  await db.insert(userMemberMapping).values([
    { vendorId: VENDORS.marksA.id, userId: STAFF.marksAOwner.id, role: 'vendor_admin', status: 'active' },
    { vendorId: VENDORS.marksB.id, userId: STAFF.marksBOwner.id, role: 'vendor_admin', status: 'active' },
    { vendorId: VENDORS.marksC.id, userId: STAFF.marksCOwner.id, role: 'vendor_admin', status: 'active' },
  ])
  await db.insert(vendorWorkingHours).values([
    ...hoursFor(VENDORS.marksA.id, '06:00:00', '22:00:00'),
    ...hoursFor(VENDORS.marksB.id, '06:00:00', '22:00:00'),
    ...hoursFor(VENDORS.marksC.id, '06:00:00', '22:00:00'),
  ])
  const wash = (
    service: typeof SERVICES.marksAWash | typeof SERVICES.marksBWash | typeof SERVICES.marksCWash,
    vendorId: string
  ) => ({
    id: service.id, vendorId, name: service.name,
    description: 'An exterior foam wash and dry.', category: 'car_wash' as const,
    pricingType: 'flat' as const, price: service.price, durationMins: service.durationMins, isActive: true,
  })
  await db.insert(services).values([
    wash(SERVICES.marksAWash, VENDORS.marksA.id),
    wash(SERVICES.marksBWash, VENDORS.marksB.id),
    wash(SERVICES.marksCWash, VENDORS.marksC.id),
  ])
  // UPI is enough to be paid (lib/vendor-missing.ts payoutUsable).
  await db.insert(vendorPayoutAccounts).values([
    { vendorId: VENDORS.marksB.id, upiId: 'marksb@upi', updatedBy: 'E2E seed' },
    { vendorId: VENDORS.marksC.id, upiId: 'marksc@upi', updatedBy: 'E2E seed' },
  ])
  const approved = (vendorId: string) =>
    (['shop_photo', 'owner_id', 'bank_proof', 'agreement'] as const).map((type) => ({
      vendorId, type, status: 'approved' as const,
      uploadedBy: 'E2E seed', uploadedBySub: 'admin',
      reviewedBy: 'E2E seed', reviewedBySub: 'admin', reviewedAt: daysAgo(1),
    }))
  await db.insert(vendorDocuments).values([
    ...approved(VENDORS.marksA.id),
    ...approved(VENDORS.marksB.id),
    ...approved(VENDORS.marksC.id),
  ])
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')

  console.log('[e2e-seed] people…')
  await seedPeople()
  console.log('[e2e-seed] garages…')
  await seedVendorRows()
  console.log('[e2e-seed] services…')
  await seedServiceRows()
  console.log('[e2e-seed] membership…')
  await seedMembership()
  console.log('[e2e-seed] discounts…')
  await seedDiscountRows()
  console.log('[e2e-seed] bookings…')
  await seedBookingRows()
  await seedIntentRows()
  await exhaustDiscounts()
  console.log('[e2e-seed] home hub…')
  await seedHomeHubRows()
  console.log('[e2e-seed] doorstep reach…')
  await seedDoorstepReachRows()
  console.log('[e2e-seed] admin fixtures…')
  await seedAdminFixtureRows()
  console.log('[e2e-seed] test-data reset…')
  await seedDataResetRows()
  console.log('[e2e-seed] service media…')
  await seedServiceMediaRows()
  console.log('[e2e-seed] garage bin…')
  await seedGarageBinRows()
  console.log('[e2e-seed] complaints…')
  await seedComplaintRows()
  console.log('[e2e-seed] statistics…')
  await seedStatsRows()
  console.log('[e2e-seed] payouts…')
  await seedPayoutRows()
  console.log('[e2e-seed] pickup & drop…')
  await seedPickupRows()
  console.log('[e2e-seed] suggested times & extra work…')
  await seedProposalRows()
  console.log('[e2e-seed] garage response deadline…')
  await seedResponseDeadlineRows()
  console.log('[e2e-seed] garage documents…')
  await seedDocumentRows()
  console.log('[e2e-seed] browser notifications…')
  await seedPushRows()
  console.log('[e2e-seed] job photo standards…')
  await seedPhotoStandardRows()
  console.log('[e2e-seed] car history…')
  await seedCarHistoryRows()
  console.log('[e2e-seed] slot alerts…')
  await seedSlotAlertRows()
  console.log('[e2e-seed] service history certificate…')
  await seedCertificateRows()
  console.log('[e2e-seed] contact windows…')
  await seedContactWindowRows()
  console.log('[e2e-seed] six-tap checkout…')
  await seedSixTapRows()
  await seedTodayRows()
  console.log('[e2e-seed] onboarding marks…')
  await seedMarksRows()
  console.log('[e2e-seed] admin logins…')
  await seedAdminLoginRows()
  console.log('[e2e-seed] done')
  process.exit(0)
}

main().catch((error) => {
  console.error('[e2e-seed] failed:', error)
  process.exit(1)
})
