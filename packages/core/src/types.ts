import type { OpeningDay } from '@repo/core/opening-hours'

export type BookingType = 'doorstep' | 'dropin'
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
  serviceTags: string[]
  isVerified: boolean
  photos: string[]
}

// Photos of a service's work, shown in the details popup on the garage page.
// Capped server-side (3 per service) — see MAX_IMAGES_PER_SERVICE.
export interface ServiceImage {
  id: string
  url: string
  sortOrder: number
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
  images: ServiceImage[]
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
}

export interface JobLocation {
  address: string
  lat: number | null
  lng: number | null
}

export interface GarageContact {
  phone?: string
  whatsapp?: string
  address?: string
  city?: string
  lat: number | null
  lng: number | null
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
}
