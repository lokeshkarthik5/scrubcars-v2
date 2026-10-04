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
import { db } from '../index.js'
import {
  bookingItems,
  bookingReschedules,
  bookings,
  discountRedemptions,
  discounts,
  payments,
  reviews,
  servicePackageItems,
  services,
  userAddresses,
  userMemberMapping,
  userVehicles,
  users,
  vendorPhotos,
  vendorServiceAreas,
  vendorWorkingHours,
  vendors,
} from '../schema.js'
import {
  BOOKINGS,
  CUSTOMERS,
  DISCOUNTS,
  FILLER_VENDOR_COUNT,
  DOORSTEP_JOB_PIN,
  ORIGIN,
  REVIEWS,
  SERVICES,
  STAFF,
  VEHICLES,
  ADDRESSES,
  VENDORS,
  fillerVendorId,
} from './e2e-ids.js'

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

/** Inside the 2-hour cutoff. The only way to reach the WINDOW_PASSED branches. */
const insideCutoff = () => new Date(now.getTime() + 1 * HOUR)

const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * HOUR)

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
        CUSTOMERS.logout, CUSTOMERS.session, CUSTOMERS.doorstep,
        CUSTOMERS.journeyCancel, CUSTOMERS.journeyMove].map((c, i) => ({
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
     CUSTOMERS.journeyCancel, CUSTOMERS.journeyMove].map((c) => ({
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
      slotIntervalMins: 30, status: 'active', bays: 2, jobsPerDay: 10,
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
  ])

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
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
  items: Array<{ id: string; name: string; amount: string; durationMins: number }>
  discount?: { id: string; code: string; amount: string; fundedBy: 'platform' | 'vendor' }
  payment?: { status: 'pending' | 'paid'; txnId?: string }
  rescheduleCount?: number
  /** Defaults to an at-garage job. A doorstep one carries where to go. */
  doorstep?: { address: string; lat: number; lng: number }
}

/**
 * Writes a booking plus its line items, and optionally its payment row.
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
    await db.insert(payments).values({
      bookingId: spec.id,
      gateway: 'razorpay',
      gatewayTxnId: spec.payment.txnId ?? null,
      amount: (subtotal - discountAmount).toFixed(2),
      currency: 'INR',
      status: spec.payment.status,
      paidAt: spec.payment.status === 'paid' ? daysAgo(1) : null,
    })
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
    payment: { status: 'paid', txnId: 'pay_seed_reschedulable' } })

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
  await exhaustDiscounts()
  console.log('[e2e-seed] done')
  process.exit(0)
}

main().catch((error) => {
  console.error('[e2e-seed] failed:', error)
  process.exit(1)
})
