import type { OpeningDay } from '@repo/core/opening-hours'
import type { PickupNext } from '@repo/core/pickup'
import type { OutsideServiceCity } from '@repo/core/service-city'

/**
 * How the car and the work meet. 'pickup' is pickup & drop: the garage
 * collects the car from the customer's address, works on it at the garage
 * and brings it back, from garages that offer it (Vendor.pickupEnabled).
 */
export type BookingType = 'doorstep' | 'dropin' | 'pickup'
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rescheduled'
// 'package' bundles other services of the same vendor. Labels for every value
// live in @/lib/categories — add new values there too, the map is exhaustive.
export type ServiceCategory =
  | 'car_wash'
  | 'detailing'
  | 'coating'
  | 'scratch_removal'
  | 'others'
  | 'package'
// New bookings always prepay online; 'cash' remains only for historical rows.
export type PaymentMethod = 'online' | 'cash'
export type PricingType = 'flat' | 'per_vehicle' | 'on_inspection'
export type VehicleType = 'hatchback' | 'sedan' | 'suv'

export interface User {
  id: string
  name: string
  phone: string
  avatarUrl?: string | null
  area?: string
  pincode?: string
  isCustomer: boolean
  isVendorOwner: boolean
}

export interface Vendor {
  id: string
  name: string
  logoUrl: string | null
  area: string
  /** Human-phrased distance, or an em-dash when unknown. See formatDistance. */
  distance: string
  /** Raw km for sorting and filtering. Null when the origin was unknown. */
  distanceKm: number | null
  /** Where the garage is, for the map view. Null only if it was never pinned. */
  lat: number | null
  lng: number | null
  rating: number
  reviewCount: number
  /**
   * The weekly hours, when the response carried them; null when it did not.
   * This, not the account status, is what "Open" is decided from — see
   * openStatus in @repo/core/opening-hours. An active account is not an open
   * garage.
   */
  openingHours: OpeningDay[] | null
  /**
   * The garage's upcoming holidays as IST dates ("2026-10-20"), so "Closed
   * today" can be said on one. Empty when there are none or the response did
   * not carry them.
   */
  closures: string[]
  /**
   * Whether the garage has stopped taking new bookings for now, and the
   * reason it gave. Its page says so in place of the Book button.
   */
  bookingsPaused: boolean
  bookingsPausedReason: string | null
  startingPrice: number
  dropinEnabled: boolean
  doorstepEnabled: boolean
  /** Offers pickup & drop. False on servers older than it. */
  pickupEnabled: boolean
  /**
   * How far it collects cars from, from its pin; null is the 10 km default.
   * Only the garage page carries it (undefined on list items), for
   * checkout's early check; the server's check is the one that counts.
   */
  pickupRadiusKm?: number | null
  serviceTags: string[]
  isVerified: boolean
  photos: string[]
  /**
   * On a search result, the service the garage was found by when its name
   * did not match ("Ceramic Coating"). Null everywhere else.
   */
  matchedService: string | null
  /**
   * Where the garage is when that is not Chennai: its town and how far out,
   * for the "Outside Chennai" chip, the page's line and checkout's (km null
   * when it has no pin). Null in the city, when an unpinned garage's town is
   * unknown, and from a server older than the sign.
   */
  outsideServiceCity: OutsideServiceCity | null
  /**
   * Detlio has approved the garage's required documents (ID, bank proof,
   * shop photo, signed agreement): the shield after its name. False from a
   * server older than garage documents, and while they are off.
   */
  documentsVerified: boolean
}

// Photos of a service's work, shown in the details popup on the garage page.
// Capped server-side (3 per service) — see MAX_SERVICE_PHOTOS.
export interface ServiceImage {
  id: string
  url: string
  sortOrder: number
}

/**
 * One photo or video of a service, as the garage page shows it. A video
 * reaches customers only once it is ready to play. `source: 'ai'` is a
 * picture admin made with AI: always shown tagged "Sample image".
 */
export interface ServiceMedia {
  id: string
  kind: 'image' | 'video'
  /** A photo's URL, or a video's HLS manifest. */
  url: string
  /** A video's poster frame; null for a photo. */
  posterUrl: string | null
  /** A video's length in whole seconds; null for a photo. */
  durationSecs: number | null
  source: 'upload' | 'ai'
  /** The garage's app and admin only: where a video is up to. */
  videoStatus?: 'processing' | 'ready' | 'error' | null
  /** The garage's app and admin only: why a video failed, in plain words. */
  videoError?: string | null
}

export interface Service {
  id: string
  vendorId: string
  name: string
  description: string | null
  category: ServiceCategory
  pricingType: PricingType
  // Base/display price. For 'flat'/'on_inspection' the price, for 'per_vehicle'
  // the cheapest tier.
  price: number
  priceHatchback: number | null
  priceSedan: number | null
  priceSuv: number | null
  durationMins: number
  isActive: boolean
  /** Photos only. */
  images: ServiceImage[]
  /** Photos and the video, the video first. */
  media: ServiceMedia[]
}

export interface PackageItem {
  serviceId: string
  name: string
  price: number
  durationMins: number
  isActive: boolean
}

// A package is a Service (category 'package') plus the services it bundles.
// `itemsTotal` and `savings` come from the server, recomputed per request from
// the members' current prices — never cache or persist them client-side, or the
// "you save ₹X" badge can outlive the prices it was derived from.
export interface TierBreakdownEntry {
  price: number
  itemsTotal: number
  savings: number | null
}

export interface ServicePackage extends Service {
  items: PackageItem[]
  itemsTotal: number
  // For a per-vehicle package this is the *smallest* saving across vehicles, so
  // the badge holds for every customer. See tierBreakdown for the exact figures.
  savings: number | null
  tierBreakdown: Record<VehicleType, TierBreakdownEntry> | null
  hasInactiveItems: boolean
}

export interface Review {
  id: string
  userName: string
  rating: number
  comment: string
  date: string
  bookingContext?: string
}

export interface Vehicle {
  id: string
  make: string
  model: string
  plate: string
  vehicleType?: VehicleType
  isDefault: boolean
  /**
   * The customer's wash interval in days (7, 10, 14, 21 or 30), for the wash
   * bar on Home. Null is the default: 14 days, 10 from October to December.
   * Absent where a payload carries a booking's car rather than the garage's.
   */
  washIntervalDays?: number | null
}

export interface Address {
  id: string
  label: string
  address: string
  pincode: string
  /**
   * Null until the customer drops a pin. Carried on the domain type because
   * doorstep checkout has to know which saved addresses can actually be
   * delivered to, and prompt for a pin on the one that cannot.
   */
  lat: number | null
  lng: number | null
  isDefault: boolean
}

export interface TimeSlot {
  time: string
  available: boolean
}

/** One service on a booking, as it was sold. */
export interface BookingItem {
  id: string
  serviceId: string
  name: string
  /** The pre-discount line price. */
  amount: number
  durationMins: number
  /** How the service is priced; an inspection fee is not the whole price. */
  pricingType?: PricingType
}

/** A photo the garage took of the job: the car before, or the work after. */
export interface JobPhoto {
  id: string
  stage: 'before' | 'after'
  url: string
  createdAt: string
}

/**
 * The final bill of an inspection job. The customer prepaid the inspection
 * fee; this is what the work came to, what was already paid, and what is
 * left (never below zero — nothing is refunded when it comes to less).
 */
export interface FinalBill {
  id: string
  status: 'due' | 'paid' | 'cancelled' | 'not_needed'
  lines: Array<{ description: string; amount: number }>
  total: number
  paidBefore: number
  amountDue: number
  note: string | null
  paidAt: string | null
  createdAt: string
}

/**
 * Extra work the garage asked for mid-job (0041): approved by the customer
 * paying it in the app, or declined. `state` is where it stands.
 */
export interface ExtraWork {
  id: string
  description: string
  amount: number
  note: string | null
  photos: Array<{ url: string }>
  state: 'awaiting' | 'paid' | 'declined' | 'withdrawn' | 'closed'
  paidAt: string | null
  cancelledAt: string | null
  createdAt: string
}

/**
 * Other times the garage suggested instead of declining (0041). `options`
 * are the times still on offer while it is 'open'; once answered, every time
 * it offered. 'closed' is one left behind by a booking that changed another
 * way.
 */
export interface TimeProposal {
  id: string
  status: 'open' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | 'closed'
  options: string[]
  note: string | null
  expiresAt: string
  chosenSlot: string | null
  resultBookingId: string | null
  resolvedAt: string | null
  createdAt: string
}

/** Why the garage can't ask for extra work on a job now; null when it can. */
export type ExtraWorkRefusal = 'on_inspection' | 'not_open' | 'too_many_open'

/** A pickup & drop job's handover, as one payload carries it. */
export interface BookingPickup {
  pickedUpAtIso?: string
  atGarageAtIso?: string
  outForDeliveryAtIso?: string
  deliveredAtIso?: string
  /** Garage payloads: the step its job card offers next. */
  nextStep?: PickupNext | null
  pickupCodeTriesLeft?: number
  deliveryCodeTriesLeft?: number
  /** Customer payloads: the codes still to give, each until it is used. */
  pickupCode?: string | null
  deliveryCode?: string | null
}

export interface Booking {
  id: string
  vendorId: string
  vendorName: string
  /**
   * Every service on this booking. Anything that shows what was booked should
   * read this — `serviceId`/`serviceName` below are the first item only, and
   * showing one service for a three-service job is the failure mode this
   * field exists to prevent.
   */
  items: BookingItem[]
  /** Deprecated: the first item's id. */
  serviceId: string
  /** Deprecated: the first item's name. Use `items` or `serviceSummary`. */
  serviceName: string
  /** Every service name, ready to render: "Full wash + 2 more". */
  serviceSummary: string
  /** The booking's total duration, in minutes. */
  durationMins: number
  /** What the customer is actually charged, after any discount. */
  servicePrice: number
  /** The pre-discount price. Equal to servicePrice when no code was used. */
  subtotalPrice: number
  discountAmount: number
  discountCode?: string
  discountFundedBy?: 'platform' | 'vendor'
  /**
   * What the garage is owed: the full pre-discount price when Detlio funded
   * the discount, the charged amount when the garage funded it. Computed
   * server-side — never re-derive it here.
   */
  servicePricingType?: PricingType
  status: BookingStatus
  bookingType: BookingType
  scheduledAt: string
  scheduledAtIso: string
  customerName?: string
  /** The customer's mobile, for the garage to call or WhatsApp. */
  customerPhone?: string
  /**
   * Where a doorstep job happens: the address the customer booked to, with its
   * map pin when it has one. Absent for a job at the garage.
   */
  jobLocation?: JobLocation
  /** Where the garage is and how to reach it. */
  garage?: GarageContact
  vehicle?: Vehicle
  paymentMethod: PaymentMethod
  paymentStatus: 'pending' | 'paid' | 'collected' | 'failed' | 'refunded'
  /** 'admin' is the Detlio ops team; `cancelledOnBehalfOf` says whose call it was. */
  cancelledBy?: 'user' | 'vendor' | 'admin'
  cancellationReason?: string
  /** Only on a Detlio cancellation. */
  cancelledOnBehalfOf?: 'customer' | 'garage' | 'detlio'
  /**
   * Who didn't turn up for an accepted booking. A customer no-show keeps the
   * payment; a garage no-show is refunded.
   */
  noShow?: 'customer' | 'garage'
  rescheduleCount: number
  remainingReschedules: number
  /** Set when the customer moved an earlier booking to this new time. */
  rescheduledFromId?: string
  review?: Review
  /**
   * Pickup & drop only: the handover steps, and what the job waits for. The
   * customer's codes are on the customer's own booking only (`pickupCode`,
   * `deliveryCode`); the garage gets `nextStep` and the tries left instead.
   */
  pickup?: BookingPickup
  /** When each step happened, as ISO strings. Absent until it does. */
  requestedAtIso: string
  acceptedAtIso?: string
  startedAtIso?: string
  completedAtIso?: string
  /**
   * What the booking already covers toward a final bill: its pre-discount
   * price once the payment landed, otherwise 0. The bill subtracts this, so a
   * promo code used at checkout stays the customer's.
   */
  paidAtBooking: number
  /** Before/after photos; empty where the payload does not carry them. */
  jobPhotos: JobPhoto[]
  /** The final bill that stands, if the garage has raised one. */
  finalBill: FinalBill | null
  /** Garage only: the job card can offer "Raise final bill" now. */
  canRaiseFinalBill: boolean
  /** Extra work the garage asked for (0041), newest first; empty where not carried. */
  extraWork: ExtraWork[]
  /** Garage only: why "Ask for extra work" is not offered now, or null when it is. */
  extraWorkRefusal: ExtraWorkRefusal | null
  /** Garage only: Mark completed waits for the customer's answer on extra work. */
  completeBlockedByExtraWork: boolean
  /** The garage's suggested times (0041): the live one, or how the last ended. */
  timeProposal: TimeProposal | null
  /** Garage only: the job card can offer "Suggest another time" now. */
  canSuggestTimes: boolean
  /** The garage's deadline to accept (0042); null when the booking has none. */
  responseDeadline: ResponseDeadline | null
  /** Cancelled because the garage did not accept in time (refunded in full). */
  notAcceptedInTime: boolean
  /**
   * Customer only: money owed back on this booking, or given back. 'none'
   * on garage payloads, on older servers, and on a customer no-show.
   */
  refund: BookingRefund
  /**
   * Customer only: a payment receipt can be opened for this booking (see
   * BookingReceipt). False on garage payloads and on older servers.
   */
  receiptAvailable: boolean
  /**
   * Customer only: moved to a new time by the customer. The move cancelled
   * this booking and the new one carries its payment, so My bookings leaves
   * it out (see bookingListTab). False on garage payloads and older servers.
   */
  moved: boolean
}

/**
 * Whether money is coming back on a booking, as its customer is told:
 * `amount` is all of it, `amountRefunded` what has gone back so far, and
 * `refundedAt` when the latest refund was recorded.
 */
/**
 * The garage's deadline to accept a paid booking (0042): when, whether the
 * server cancels the booking at it (AUTO_CANCEL_UNANSWERED), and the
 * window in opening-hours minutes (GARAGE_RESPONSE_MINUTES).
 */
export interface ResponseDeadline {
  respondBy: string
  enforced: boolean
  windowMins: number
}

export interface BookingRefund {
  status: 'owed' | 'refunded' | 'none'
  amount: number
  amountRefunded: number
  refundedAt?: string
  /**
   * Refunds sent through Razorpay from the app that Razorpay hasn't finished
   * yet: how much, and when the latest was started (ISO).
   */
  started?: { amount: number; at: string }
}

/**
 * A booking's payment receipt, as GET /bookings/:id/receipt sends it
 * (apps/server/src/lib/receipts.ts). Not a tax invoice: no GSTIN and no tax
 * lines until GST is set up.
 *
 * Kept as the server sends it — amounts as decimal strings, dates as ISO with
 * an IST label beside them — because a receipt shows exactly those figures
 * and dates, and the labels are made on the server so they read the same on
 * every phone whatever its timezone.
 */
export interface BookingReceipt {
  /**
   * "DTL/26-27/000123": consecutive within the Indian financial year, issued
   * once for the booking's reschedule chain and never changed. Printed as it
   * is; only a saved PDF's file name swaps the slashes for hyphens.
   */
  receiptNumber: string
  issuedAt: string
  issuedOn: string
  issuer: {
    name: string
    /**
     * The trade name of the business that runs Detlio (ScrubCars), printed as
     * "Operated by …". Never the proprietor's personal name. Null leaves the
     * line out.
     */
    tradeName: string | null
    address: string | null
    supportPhone: string
    supportEmail: string | null
    website: string
  }
  customer: { name: string; phone: string }
  garage: { name: string; address: string }
  booking: {
    id: string
    reference: string
    /** The first booking's reference when this one was moved here; else null. */
    originalReference: string | null
    bookingType: BookingType
    status: BookingStatus
    statusLabel: string
    scheduledAt: string
    scheduledAtLabel: string
  }
  items: Array<{ name: string; amount: string }>
  subtotal: string
  discount: { code: string | null; amount: string } | null
  bookingPayment: {
    amount: string
    method: string
    paymentId: string | null
    paidAt: string | null
    paidAtLabel: string | null
  }
  finalBill: {
    lines: Array<{ description: string; amount: string }>
    total: string
    /** What the customer paid at booking toward the bill (after any discount). */
    creditedFromBooking: string
    /** The booking's discount, kept off the bill; null when there was none. */
    discount: { code: string | null; amount: string } | null
    balancePaid: string
    paymentId: string | null
    paidAt: string | null
    paidAtLabel: string | null
  } | null
  /** Extra work approved and paid in the app (0041), a line each. Absent from older servers. */
  extraWork?: Array<{
    description: string
    amount: string
    paymentId: string | null
    paidAt: string | null
    paidAtLabel: string | null
  }>
  refunds: Array<{
    against: 'booking' | 'final_bill' | 'extra_work'
    amount: string
    refundedAt: string | null
    refundedAtLabel: string | null
    /** How the money went back, saying no more than the server knows. */
    method: string
    reference: string | null
  }>
  totalPaid: string
  totalRefunded: string
  netPaid: string
}

export interface JobLocation {
  address: string
  lat: number | null
  lng: number | null
}

/**
 * How a customer reaches and finds the garage of their own booking. Only the
 * booking's payload carries it (GET /bookings/:id): the public garage page
 * has no phone, WhatsApp, street address or maps link (owner decision, 17 Oct
 * 2026), so this is never filled from a Vendor.
 */
export interface GarageContact {
  phone?: string
  whatsapp?: string
  address?: string
  city?: string
  lat: number | null
  lng: number | null
  /** The garage's own Google Maps link, if it gave one. */
  mapsUrl?: string
}

export interface VendorStats {
  todaysJobs: number
  pendingRequests: number
  weekEarnings: number
  avgRating: number
}

export interface EarningsSummary {
  totalEarned: number
  jobsDone: number
  pending: number
  avgRating: number
}

export interface EarningsJob {
  id: string
  serviceName: string
  customerName: string
  date: string
  type: BookingType
  amount: number
  settled: boolean
  /**
   * What earned it: the job done, or a customer who didn't turn up — paid as
   * if the job happened, since the garage held the slot.
   */
  kind: 'job' | 'customer_no_show'
}
