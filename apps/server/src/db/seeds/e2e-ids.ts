/**
 * Frozen identifiers for the E2E fixture data.
 *
 * Every id the suite touches is pinned here rather than discovered at runtime,
 * so a spec can navigate straight to /garage/<id> without first querying for
 * it. That removes a whole class of ordering assumption: no test depends on
 * "the first vendor in the list" being the one it meant.
 *
 * This module is imported by both the seed (apps/server) and the test helpers
 * (apps/e2e/support/seed-ids.ts). It deliberately has no imports of its own so
 * either side can load it without dragging in a database client.
 */

/** Builds a valid v4-shaped UUID with a readable numeric tail. */
const id = (n: number): string =>
  `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`

/**
 * CUSTOMERS.vehicles' car that a fixture booking names. Declared ahead of
 * CUSTOMERS because that customer's `vehicleId` is this one — the booking is
 * the whole point of the fixture.
 */
const VEHICLE_BOOKED = id(704)

/**
 * Customers, one per concern.
 *
 * Specs run in parallel against a single database that is seeded once per run,
 * so two specs mutating the same customer would flake. Giving each concern its
 * own customer is what makes `fullyParallel` safe without truncating between
 * tests.
 */
/**
 * `vehicleId` is the customer's single car. bookings.vehicle_id is NOT NULL, so
 * every fixture booking needs one, and pinning it here lets a spec assert the
 * car on a booking without a lookup. CUSTOMERS.book is the exception: it owns
 * all three vehicle types (see VEHICLES) because the pricing specs switch
 * between them.
 */
export const CUSTOMERS = {
  browse: { id: id(101), phone: '9000000001', name: 'Browsing Bharathi', vehicleId: id(711) },
  book: { id: id(102), phone: '9000000002', name: 'Booking Bhavana', vehicleId: id(701) },
  cancel: { id: id(103), phone: '9000000003', name: 'Cancelling Chandra', vehicleId: id(713) },
  reschedule: { id: id(104), phone: '9000000004', name: 'Moving Meera', vehicleId: id(714) },
  review: { id: id(105), phone: '9000000005', name: 'Reviewing Ravi', vehicleId: id(715) },
  payLater: { id: id(106), phone: '9000000006', name: 'Unpaid Uma', vehicleId: id(716) },
  coupons: { id: id(107), phone: '9000000007', name: 'Coupon Kavya', vehicleId: id(717) },
  /** Deliberately owns no car and no address — the profile spec adds both. */
  profile: { id: id(108), phone: '9000000008', name: 'Profile Priya', vehicleId: null },
  /**
   * The cross-app journey's customer, with no seeded bookings at all.
   *
   * The journey drives the vendor app and clicks "Accept booking for <name>",
   * so any pre-existing booking for this customer would make that button
   * ambiguous and the run would accept the wrong job.
   */
  journey: { id: id(109), phone: '9000000009', name: 'Journey Jaya', vehicleId: id(718) },
  /**
   * Owns two cars, one of which a booking names. Deleting a car that history
   * points at used to raise a foreign-key error and surface as a 500; it is
   * archived now, and the two cars are what tell archive and hard-delete
   * apart in the same spec.
   */
  vehicles: { id: id(116), phone: '9000000016', name: 'Garage Gowri', vehicleId: VEHICLE_BOOKED },
  /**
   * Doorstep checkout. Owns two addresses — one pinned, one saved without
   * coordinates — because the pinless one is what makes the "pin the exact
   * spot" prompt reachable, and that prompt is the only place a customer can
   * satisfy the server's coverage check.
   */
  doorstep: { id: id(117), phone: '9000000017', name: 'Doorstep Deepa', vehicleId: id(727) },
  /** One per cross-app journey, for the same reason as `journey` above: the
   *  vendor app finds a job by its customer's name. */
  journeyCancel: { id: id(114), phone: '9000000014', name: 'Journey Cancel Chitra', vehicleId: id(723) },
  journeyMove: { id: id(115), phone: '9000000015', name: 'Journey Move Mani', vehicleId: id(724) },
  /**
   * Customers that exist only to own the vendor-side fixture bookings.
   *
   * The vendor app identifies a job by its customer's name ("Accept booking
   * for X"), so a customer who also books through the users specs would put
   * two identically named buttons on the vendor's screen and the vendor spec
   * would accept whichever it found first.
   */
  vendorJob: { id: id(110), phone: '9000000010', name: 'Vendor Job Vimal', vehicleId: id(719) },
  vendorReject: { id: id(111), phone: '9000000011', name: 'Vendor Reject Radha', vehicleId: id(720) },
  /**
   * Customers whose *session* is the thing under test.
   *
   * Logging out and revoking refresh tokens are destructive to the session
   * they touch, so they must not be aimed at a customer another file is
   * reading — the storageState minted in global setup would go stale mid-run.
   */
  logout: { id: id(112), phone: '9000000012', name: 'Logout Lakshmi', vehicleId: id(721) },
  session: { id: id(113), phone: '9000000013', name: 'Session Suresh', vehicleId: id(722) },
} as const

/**
 * A phone with no user attached. The signup spec needs a number that has never
 * been seen before; anything seeded would send it down the returning-user path.
 */
export const UNREGISTERED_PHONE = '9000000099'

/** The same, for the vendor app: onboarding only runs for a brand-new owner. */
export const UNREGISTERED_VENDOR_PHONE = '9000000098'

export const STAFF = {
  /** Owns both MAIN and SECOND — the company switcher needs two to switch between. */
  owner: { id: id(201), phone: '9000001001', name: 'Owner Om' },
  /** vendor_operator on MAIN. Must not see earnings, services or settings. */
  operator: { id: id(202), phone: '9000001002', name: 'Operator Oviya' },
  /** Platform super_admin. Acting inside a vendor writes an internal_access_log row. */
  superAdmin: { id: id(203), phone: '9000001003', name: 'Super Sundar' },
  /** Owns NARROW only. Kept separate so tenancy specs have a clean negative case. */
  narrowOwner: { id: id(204), phone: '9000001004', name: 'Narrow Nandhini' },
} as const

export const VENDORS = {
  /** The canonical garage. Both booking modes, open 06:00–22:00 every day. */
  main: { id: id(301), name: 'Detlio Test Garage' },
  /** Same owner as MAIN, so switching between them exercises tenant isolation. */
  second: { id: id(302), name: 'Second Test Garage' },
  /** Open 09:00–11:00 only: two long services cannot fit in the day. */
  narrow: { id: id(303), name: 'Narrow Hours Garage' },
} as const

/** Filler garages so listing, sorting and infinite scroll have real volume. */
export const FILLER_VENDOR_COUNT = 12
export const fillerVendorId = (index: number): string => id(320 + index)

export const SERVICES = {
  /** Flat price, short. The default pick for any spec that just needs "a service". */
  wash: { id: id(401), name: 'Express Wash', price: '499.00', durationMins: 30 },
  /**
   * Priced per vehicle type, and deliberately NOT priced for an SUV — this is
   * what drives the "Remove the unpriced service" disabled-CTA case.
   */
  tiered: { id: id(402), name: 'Interior Detail', durationMins: 45,
    priceHatchback: '599.00', priceSedan: '799.00', priceSuv: null },
  /** Long enough that two of them overflow a short working day. */
  detail: { id: id(403), name: 'Full Body Detail', price: '1999.00', durationMins: 90 },
  /**
   * pricingType on_inspection: an upfront inspection fee that IS charged, with
   * the repair quoted afterwards — not an unpriced service. See pricing.ts,
   * where resolveServiceAmount returns `price` for this type.
   */
  inspect: { id: id(404), name: 'Dent Assessment', price: '299.00', durationMins: 60 },
  /** A package; its children are wash + detail. Counts as ONE cart line. */
  packageDeal: { id: id(405), name: 'Weekend Package', price: '2299.00', durationMins: 120 },
  /** isActive false. Must never appear on the garage page. */
  inactive: { id: id(406), name: 'Retired Polish', price: '899.00', durationMins: 30 },
  /** On SECOND, so tenancy specs can assert a service that must NOT leak. */
  secondOnly: { id: id(407), name: 'Second Garage Only Wash', price: '399.00', durationMins: 30 },
  /** Two long services on NARROW: 90 + 90 cannot fit a 09:00–11:00 day. */
  narrowA: { id: id(408), name: 'Narrow Long Wash', price: '1200.00', durationMins: 90 },
  narrowB: { id: id(409), name: 'Narrow Long Polish', price: '1400.00', durationMins: 90 },
} as const

export const DISCOUNTS = {
  /** 20% off, capped at ₹200 — the cap is the point. */
  percentCapped: { id: id(501), code: 'SAVE20', percentOff: '20.00', maxDiscountAmount: '200.00' },
  /** ₹100 off but only above ₹1000, so a small cart is rejected. */
  fixedMinOrder: { id: id(502), code: 'FLAT100', amountOff: '100.00', minOrderAmount: '1000.00' },
  /** endsAt in the past. */
  expired: { id: id(503), code: 'EXPIRED10' },
  /** Scoped to SECOND, so it must be refused at MAIN. */
  otherVendor: { id: id(504), code: 'SECONDONLY' },
  /** totalUsageLimit 1, already redeemed by the seed. */
  exhaustedTotal: { id: id(505), code: 'USEDUP' },
  /** perUserLimit 1, already redeemed by CUSTOMERS.coupons. */
  exhaustedPerUser: { id: id(506), code: 'ONEPERUSER' },
  /** fundedBy vendor rather than platform — asserted on the booking row. */
  vendorFunded: { id: id(507), code: 'VENDORPAYS', percentOff: '10.00' },
  /** Deactivated by the admin spec, then asserted to fail on the customer side. */
  toDeactivate: { id: id(508), code: 'KILLME' },
} as const

export const BOOKINGS = {
  /** confirmed, tomorrow — the happy-path cancel target. */
  cancellable: id(601),
  /** A second cancellable booking, so the optional-reason case has its own row
   *  and does not race the one above. */
  cancellableNoReason: id(612),
  /** confirmed, now + 60min — inside the 2-hour cutoff, so cancel must be refused. */
  cancelTooLate: id(602),
  /** in_progress — not a cancellable status. */
  cancelWrongStatus: id(603),
  /** confirmed + paid + discounted. Reschedule must carry payment and discount across. */
  reschedulable: id(604),
  /** rescheduleCount already 2 — the next move must be refused at the cap. */
  rescheduleExhausted: id(605),
  /** confirmed, now + 60min — inside the cutoff, so reschedule must be refused. */
  rescheduleTooLate: id(606),
  /** completed with no review attached — the review form's target. */
  reviewable: id(607),
  /** completed and already reviewed — a second review must be refused. */
  alreadyReviewed: id(608),
  /** pending with an unpaid payment row — drives the legacy createPaymentOrder path. */
  unpaid: id(609),
  /** pending at MAIN — what the vendor sees under "Incoming". */
  vendorIncoming: id(610),
  /** A second pending booking at MAIN. Reject is only offered on the Incoming
   *  tab, so the reject case needs its own pending row rather than reusing the
   *  one the accept case consumes. */
  vendorRejectable: id(613),
  /** confirmed at SECOND — must never appear while MAIN is the active tenant. */
  secondTenant: id(611),
  /** completed, naming VEHICLES.booked. Its only job is to make that car
   *  undeletable by the old code path — the regression this pins. */
  vehicleArchive: id(614),
} as const

export const VEHICLES = {
  /** Hatchback, default. Priced on the tiered service. */
  hatchback: id(701),
  /** SUV — deliberately unpriced on SERVICES.tiered. */
  suv: id(702),
  sedan: id(703),
  /** CUSTOMERS.vehicles' default car, named by BOOKINGS.vehicleArchive.
   *  Deleting it must archive the row rather than fail. */
  booked: VEHICLE_BOOKED,
  /** CUSTOMERS.vehicles' second car, on no booking at all. Deleting it must
   *  take the row with it — archiving everything would fill the table with
   *  tombstones for cars added by mistake. */
  spare: id(705),
} as const

/**
 * Addresses that a spec needs to name.
 *
 * Only the doorstep fixture's two are pinned: every other seeded address is
 * incidental to its customer and nothing asserts on it by id.
 */
export const ADDRESSES = {
  /** Has coordinates, at ORIGIN — inside MAIN's 15 km doorstep radius. */
  doorstepPinned: id(901),
  /** Saved with no lat/lng. Doorstep checkout must prompt for a pin rather
   *  than letting the booking fail the server's coverage check. */
  doorstepUnpinned: id(902),
} as const

export const REVIEWS = { existing: id(801) } as const

/** Admin panel credentials, matching ADMIN_USERNAME / ADMIN_PASSWORD in .env.e2e. */
export const ADMIN = { username: 'admin', password: 'admin' } as const

/** Chennai. Vendors sit within a few km of this so distance sorting is stable. */
export const ORIGIN = { lat: 13.0827, lng: 80.2707 } as const
