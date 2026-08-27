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
export type VendorStatus = 'open' | 'busy' | 'closed'
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
  distance: string
  rating: number
  reviewCount: number
  status: VendorStatus
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
  isDefault: boolean
}

export interface TimeSlot {
  time: string
  available: boolean
}

export interface Booking {
  id: string
  vendorId: string
  vendorName: string
  serviceId: string
  serviceName: string
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
  vendorPayoutAmount: number
  servicePricingType?: PricingType
  status: BookingStatus
  bookingType: BookingType
  scheduledAt: string
  scheduledAtIso: string
  customerName?: string
  vehicle?: Vehicle
  paymentMethod: PaymentMethod
  paymentStatus: 'pending' | 'paid' | 'collected' | 'failed' | 'refunded'
  cancelledBy?: 'user' | 'vendor'
  cancellationReason?: string
  rescheduleCount: number
  remainingReschedules: number
  review?: Review
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
