import type { ServiceMedia } from '@repo/core/types'

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  message?: string
}

export interface ApiErrorResponse {
  success: false
  message: string
  code?: string
  /** On a refusal that is only about timing: seconds until a retry can work. */
  retryAfterSeconds?: number
}

export type AuthAudience = 'customer' | 'vendor'
export type OtpPurpose = 'login' | 'register' | 'vendor_onboard'

export interface ApiAuthUser {
  id: string
  name: string
  phone: string
  email: string | null
  phoneVerified: boolean
  isCustomer: boolean
  isVendorOwner: boolean
  status: string
}

/**
 * The caller's power inside one company. Namespaced by scope on purpose — no
 * role is called `admin`, because `/admin` already means Detlio staff.
 */
export type VendorRole = 'vendor_admin' | 'vendor_operator'

export interface ApiAuthVendor {
  id: string
  businessName: string
  logoUrl?: string | null
  phone: string
  status: string
  isVerified: boolean
  /** Present once the server ships the team model; absent on older sessions. */
  role?: VendorRole
  isOwner?: boolean
}

export interface ApiSessionData {
  user: ApiAuthUser
  /**
   * The active company. Kept populated when there is exactly one so existing
   * clients survive the transition; `vendors` is the full list.
   */
  vendor: ApiAuthVendor | null
  vendors?: ApiAuthVendor[]
}

export interface ApiUserProfile {
  id: string
  name: string
  phone: string
  email: string | null
  avatarUrl: string | null
  phoneVerified: boolean
  isCustomer: boolean
  isVendorOwner: boolean
  status: string
  createdAt: string
}

export interface ApiAddress {
  id: string
  label: string
  address: string
  city: string
  /**
   * Null when the address was saved without dropping a pin — a legitimate
   * state, since only doorstep needs a coordinate. Was typed non-nullable
   * here, which quietly promised every address had one.
   */
  lat: number | null
  lng: number | null
  geoSource: 'unset' | 'gps' | 'map_pin'
  isDefault: boolean
  createdAt: string
}

export interface ApiVehicle {
  id: string
  make: string
  model: string
  color: string | null
  licensePlate: string | null
  vehicleType: string
  isDefault: boolean
  /**
   * How often the customer wants this car washed (7, 10, 14, 21 or 30
   * days); null is the default. Absent from an API older than 0031.
   */
  washIntervalDays?: number | null
}

export interface ApiVendorListItem {
  id: string
  businessName: string
  logoUrl: string | null
  city: string
  isVerified: boolean
  status: string
  doorstepEnabled: boolean
  dropinEnabled: boolean
  startingPrice: number | null
  rating: number | null
  reviewCount: number
  serviceTags: string[]
  photos: string[]
  /** Null when the request carried no origin. Never 0 to mean "unknown". */
  distanceKm: number | null
  /** The garage's own coordinates, for plotting it on the map view. */
  lat: number | null
  lng: number | null
  /**
   * The weekly hours, for the open/closed line on a card. Optional because an
   * API deployed before the field existed does not send it, and a card then
   * shows no status rather than a guessed one.
   */
  workingHours?: Array<Omit<ApiWorkingHours, 'id'>>
  /** Holidays in the coming week, as IST dates. Absent on older servers. */
  closures?: string[]
  /**
   * On a search, the service the garage was found by when its name and city
   * did not match. Null otherwise; absent on older servers.
   */
  matchedService?: string | null
}

export interface ApiVendorList {
  items: ApiVendorListItem[]
  /** Opaque; pass back as `cursor`. Null when the list is exhausted. */
  nextCursor: string | null
  /**
   * The radius that actually produced these results. Differs from the requested
   * one when the search auto-widened, which the UI must say out loud.
   */
  appliedRadiusKm: number | null
}

export interface ApiPublicVendor {
  id: string
  businessName: string
  logoUrl: string | null
  phone: string
  address: string
  city: string
  pincode: string
  lat: number | null
  lng: number | null
  isVerified: boolean
  doorstepEnabled: boolean
  dropinEnabled: boolean
  slotIntervalMins: number
  status: string
  createdAt: string
  photos: Array<{ id: string; url: string; sortOrder: number }>
  services: ApiService[]
  rating: number | null
  reviewCount: number
  /** Set while the garage takes no new bookings. Optional for older servers. */
  bookingsPausedAt?: string | null
  bookingsPausedReason?: string | null
}

export interface VendorProfileExtras {
  whatsapp: string | null
  email: string | null
  yearsInOperation: string | null
  mapsUrl: string | null
  pickup: 'yes' | 'nearby' | 'no' | null
  pickupRadiusKm: number | null
  /** How far this garage travels for doorstep work. Null means "nowhere yet". */
  doorstepRadiusKm: number | null
  geoSource: 'unset' | 'gps' | 'map_pin' | 'geocoded' | 'admin'
  /** Set when an admin confirmed the pin on a map. Null means nobody has. */
  geoConfirmedAt: string | null
  /** Cars the garage works on at once. Null is read as one. */
  bays: number | null
  /** The most jobs it takes in a day. Null is no limit. */
  jobsPerDay: number | null
  vehicleTypes: string[]
  notes: string | null
  /** When the garage paused new bookings; null while it takes them. */
  bookingsPausedAt: string | null
  bookingsPausedReason: string | null
}

/** A day the garage marked as a holiday. */
export interface ApiVendorClosure {
  id: string
  /** IST calendar day, YYYY-MM-DD. */
  date: string
  reason: string | null
  /** Bookings still on that day — a holiday does not cancel them. */
  activeBookingCount: number
}

export interface ApiVendorProfile extends VendorProfileExtras {
  id: string
  ownerId: string
  businessName: string
  logoUrl: string | null
  phone: string
  address: string
  city: string
  pincode: string
  lat: number | null
  lng: number | null
  isVerified: boolean
  doorstepEnabled: boolean
  dropinEnabled: boolean
  slotIntervalMins: number
  status: string
  createdAt: string
}

export interface ApiWorkingHours {
  id: string
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

export interface ApiServiceArea {
  id: string
  areaName: string
  pincode: string
  radiusKm: number | null
}

export interface ApiServiceImage {
  id: string
  url: string
  sortOrder: number
}

export interface ApiService {
  id: string
  name: string
  description: string | null
  category: string
  pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
  price: string
  priceHatchback: string | null
  priceSedan: string | null
  priceSuv: string | null
  durationMins: number
  isActive: boolean
  images: ApiServiceImage[]
  /** Absent from responses older than service videos. */
  media?: ServiceMedia[]
}

export interface ApiPackageItem {
  serviceId: string
  name: string
  price: string
  durationMins: number
  isActive: boolean
}

export interface ApiTierBreakdownEntry {
  price: string
  itemsTotal: string
  savings: string | null
}

export interface ApiPackage extends ApiService {
  items: ApiPackageItem[]
  itemsTotal: string
  savings: string | null
  // Present only for per-vehicle packages: what each vehicle pays and saves.
  tierBreakdown: Record<
    'hatchback' | 'sedan' | 'suv',
    ApiTierBreakdownEntry
  > | null
  hasInactiveItems: boolean
}

export interface ApiSlotsResponse {
  date: string
  serviceIds: string[]
  /** The combined duration the slots were computed for. */
  durationMins: number
  slotIntervalMins: number
  isClosed: boolean
  /**
   * Whether the services fit the day at all, judged before past and too-soon
   * times are removed. Absent from servers older than the notice rule.
   */
  fitsInDay?: boolean
  /** The notice the list was filtered by, in minutes. */
  minNoticeMins?: number
  /**
   * Why a closed day is closed: a holiday the garage marked, or its weekly
   * off day. Null on an open day.
   */
  closedReason?: 'holiday' | 'weekly_off' | null
  /** The garage has paused new bookings: no day has times. */
  paused?: boolean
  /** Times that had enough notice but are already booked up. */
  fullSlots?: number
  slots: string[]
}

/** A before/after photo of a job. */
export interface ApiJobPhoto {
  id: string
  stage: 'before' | 'after'
  url: string
  createdAt: string
}

/**
 * The final bill of an inspection job, as the customer and the garage see it.
 * Money is decimal strings. `amountDue` is max(0, total − paidBefore); a bill
 * with none is 'not_needed'.
 */
export interface ApiFinalBill {
  id: string
  status: 'due' | 'paid' | 'cancelled' | 'not_needed'
  lines: Array<{ description: string; amount: string }>
  totalAmount: string
  paidBefore: string
  amountDue: string
  note: string | null
  paidAt: string | null
  createdAt: string
}

export interface ApiBooking {
  id: string
  status: string
  bookingType: string
  scheduledAt: string
  amount: string
  // Absent on every vendor-facing payload: the payout split and the discount
  // breakdown are served only by GET /vendors/me/earnings, behind a
  // vendor_admin check. `amount` and `paymentMethod` are always present —
  // whoever finishes a cash job has to know what to collect.
  subtotalAmount?: string
  discountAmount?: string
  discountCode: string | null
  discountFundedBy?: 'platform' | 'vendor' | null
  vendorPayoutAmount?: string
  paymentMethod: string
  lat: number | null
  lng: number | null
  address: string | null
  cancelledBy: 'user' | 'vendor' | 'admin' | null
  cancellationReason: string | null
  cancelledAt: string | null
  // Optional: a server older than admin cancellations does not send these.
  cancelledOnBehalfOf?: 'customer' | 'garage' | 'detlio' | null
  noShow?: 'customer' | 'garage' | null
  originalBookingId: string | null
  rescheduledFromId: string | null
  rescheduleCount: number
  remainingReschedules: number
  maxReschedules: number
  // When each step happened. Optional: a server older than job records does
  // not send them, and a job from before they were kept has them null.
  acceptedAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
  /**
   * The job's photos. Only on the booking page and the garage's job list,
   * and the customer's copy is empty until the work starts.
   */
  photos?: ApiJobPhoto[]
  /** The final bill that stands, on payloads that carry job records. */
  finalBill?: ApiFinalBill | null
  /** Garage payloads only: whether "Raise final bill" applies now. */
  canRaiseFinalBill?: boolean
  /** What the booking already covers toward a final bill, as a decimal string. */
  paidAtBooking?: string
  /**
   * Customer payloads only: money owed back on this booking, or given back.
   * Absent from garage payloads and from servers older than refunds.
   */
  refund?: {
    status: 'owed' | 'refunded' | 'none'
    amount: string
    amountRefunded: string
    refundedAt: string | null
    /**
     * Refunds the app sent through Razorpay that are still on their way:
     * how much, and when the latest was started. Absent when there are none.
     */
    started?: { amount: string; at: string }
  }
  /**
   * Customer payloads only: whether GET /bookings/:id/receipt has a receipt
   * (a payment went through and the booking was not moved). Absent from
   * garage payloads and from servers older than receipts.
   */
  receiptAvailable?: boolean
  /**
   * Customer only: the customer moved this booking to a new time, so it was
   * cancelled and the new booking carries its payment. Absent from garage
   * payloads and from older servers.
   */
  moved?: boolean
  review: {
    id: string
    rating: number
    comment: string | null
    createdAt: string
  } | null
  user: { id: string; name: string; phone: string } | null
  vendor: {
    id: string
    businessName: string
    phone: string
    city: string
    // Optional: the API and the apps deploy separately, so a client can meet
    // a server that does not send these yet.
    address?: string
    lat?: number | null
    lng?: number | null
    whatsapp?: string | null
  } | null
  /** Every service on the booking, priced and named as sold. */
  items: Array<{
    id: string
    serviceId: string
    name: string
    amount: string
    durationMins: number
    /** Absent from older servers. */
    pricingType?: 'flat' | 'per_vehicle' | 'on_inspection' | null
  }>
  /** The booking's total duration: the sum of its items. */
  durationMins: number
  /** Deprecated: the first item. Read `items`. */
  service: {
    id: string
    name: string
    category: string
    pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
    durationMins: number
  } | null
  vehicle: {
    id: string
    make: string
    model: string
    licensePlate: string | null
    vehicleType: string
  } | null
  payment: {
    id: string
    status: string
    amount: string
    gateway: string | null
  } | null
}

/**
 * A review from the public feed (GET /reviews/vendors/:vendorId): what the
 * garage page shows, with the reviewer as "Arjun K." and no contact details.
 */
export interface ApiPublicReview {
  id: string
  vendorId: string
  rating: number
  comment: string | null
  createdAt: string
  user: { name: string } | null
  booking: {
    /** Every service the review is about. */
    serviceNames?: string[]
    /** Deprecated: the first service. */
    service: { id: string; name: string } | null
  } | null
}

export interface ApiReview {
  id: string
  bookingId: string
  userId: string
  vendorId: string
  rating: number
  comment: string | null
  createdAt: string
  user: {
    id: string
    name: string
    phone: string
  } | null
  vendor: {
    id: string
    businessName: string
  } | null
  booking: {
    id: string
    scheduledAt: string
    /** Every service the review is about. */
    serviceNames?: string[]
    /** Deprecated: the first service. */
    service: {
      id: string
      name: string
    } | null
  } | null
}
