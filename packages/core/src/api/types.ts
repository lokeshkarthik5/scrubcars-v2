import type { ConditionPhotos, PhotoStandard, ServiceMedia } from '@repo/core/types'
import type { PickupNext } from '@repo/core/pickup'
import type { OutsideServiceCity } from '@repo/core/service-city'

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
  /** Offers pickup & drop. Absent from older servers. */
  pickupEnabled?: boolean
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
  /**
   * Set when the garage is pinned more than 50 km from the Chennai centre, or
   * is unpinned and its city field names another town; null in the city.
   * Absent on older servers.
   */
  outsideServiceCity?: OutsideServiceCity | null
  /** Every required document approved by Detlio. Absent on older servers. */
  documentsVerified?: boolean
  /** Detlio Certified (0048): the seal. Absent on older servers. */
  certified?: boolean
}

export interface ApiVendorList {
  items: ApiVendorListItem[]
  /** Opaque; pass back as `cursor`. Null when the list is exhausted. */
  nextCursor: string | null
  /**
   * How far from the customer the list reached, in km: set whenever a radius
   * applied (a location, not doorstep, not the map's viewport, not a typed
   * search), even with nothing found. Null otherwise. Optional because an API
   * deployed before the field existed does not send it.
   */
  radiusKm?: number | null
  /**
   * Deprecated: the old auto-widening ladder's ring, always null from the API
   * that sends `radiusKm`. Read only as the fallback for an older API.
   */
  appliedRadiusKm?: number | null
}

/**
 * GET /vendors/:id, which anyone may read. No phone, WhatsApp, email, street
 * address or maps link (owner decision, 17 Oct 2026): a customer gets those
 * from their own booking (ApiBooking.vendor) once they have booked.
 */
export interface ApiPublicVendor {
  id: string
  businessName: string
  logoUrl: string | null
  city: string
  pincode: string
  lat: number | null
  lng: number | null
  isVerified: boolean
  doorstepEnabled: boolean
  dropinEnabled: boolean
  /** Offers pickup & drop. Absent from older servers. */
  pickupEnabled?: boolean
  /** How far it collects cars from; null is the 10 km default. */
  pickupRadiusKm?: number | null
  /** How far it travels for doorstep work; null is the default. Absent from older servers. */
  doorstepRadiusKm?: number | null
  /** As the garage wrote it ("5", "10+"). Absent from older servers. */
  yearsInOperation?: string | null
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
  /** As on a list item: set only outside Chennai. Absent on older servers. */
  outsideServiceCity?: OutsideServiceCity | null
  /** As on a list item: the "Documents verified" badge. Absent on older servers. */
  documentsVerified?: boolean
  /** As on a list item: the Detlio Certified seal. Absent on older servers. */
  certified?: boolean
}

export interface VendorProfileExtras {
  whatsapp: string | null
  email: string | null
  yearsInOperation: string | null
  mapsUrl: string | null
  /** The stored answer; read `pickupEnabled` for whether it is on. */
  pickup: 'yes' | 'nearby' | 'no' | null
  /** How far it collects cars from. Null is the 10 km default. */
  pickupRadiusKm: number | null
  /** Offers pickup & drop: said yes, with the responsibility terms on file. */
  pickupEnabled?: boolean
  /** When the responsibility terms were last accepted; null if never. */
  pickupTermsAcceptedAt?: string | null
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
  /** 0045; absent from older servers. */
  angle?: 'front' | 'back' | 'left' | 'right' | 'interior' | null
  /** 0045; absent from older servers, whose photos were all the garage's. */
  by?: 'garage' | 'customer'
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

/** Extra work as the booking payloads carry it (0041). Money is a decimal string. */
export interface ApiExtraWork {
  id: string
  description: string
  amount: string
  note: string | null
  photos: Array<{ url: string }>
  state: 'awaiting' | 'paid' | 'declined' | 'withdrawn' | 'closed'
  paidAt: string | null
  cancelledAt: string | null
  createdAt: string
}

/** The garage's suggested times as the booking payloads carry them (0041). */
export interface ApiTimeProposal {
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

export interface ApiBookingPickup {
  pickedUpAt: string | null
  atGarageAt: string | null
  outForDeliveryAt: string | null
  deliveredAt: string | null
  /** Garage payloads only. */
  nextStep?: PickupNext | null
  pickupCodeTriesLeft?: number
  deliveryCodeTriesLeft?: number
  /** Customer payloads only. */
  pickupCode?: string | null
  deliveryCode?: string | null
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
  /**
   * Pickup & drop only (null on other types; absent from older servers).
   * The customer's payload carries the codes still to give; the garage's
   * carries `nextStep` and the tries left instead, never the codes.
   */
  pickup?: ApiBookingPickup | null
  createdAt: string
  /**
   * The job's photos. Only on the booking page and the garage's job list,
   * and the customer's copy is empty until the work starts.
   */
  photos?: ApiJobPhoto[]
  /** Garage payloads only (0045): the job's photo standard. */
  photoStandard?: PhotoStandard
  /** Customer payloads only (0045): when they may add their own photos. */
  conditionPhotos?: ConditionPhotos
  /** The final bill that stands, on payloads that carry job records. */
  finalBill?: ApiFinalBill | null
  /** Garage payloads only: whether "Raise final bill" applies now. */
  canRaiseFinalBill?: boolean
  /** Extra work (0041), on payloads that carry job records. */
  extraWork?: ApiExtraWork[]
  /** Garage payloads only: why "Ask for extra work" is not offered, or null. */
  extraWorkRefusal?: 'on_inspection' | 'not_open' | 'too_many_open' | null
  /** Garage payloads only: Mark completed waits for an answer on extra work. */
  completeBlockedByExtraWork?: boolean
  /** The garage's suggested times (0041), on payloads that carry job records. */
  timeProposal?: ApiTimeProposal | null
  /** Garage payloads only: whether "Suggest another time" applies now. */
  canSuggestTimes?: boolean
  /** The garage's deadline to accept (0042); absent from older servers. */
  responseDeadline?: { respondBy: string; enforced: boolean; windowMins: number } | null
  /** Cancelled because the garage did not accept in time (0042). */
  notAcceptedInTime?: boolean
  /**
   * The contact window: the other side's phone is on the payload only while
   * `open`. Absent from older servers.
   */
  contactWindow?: { opensAt: string; closesAt: string | null; open: boolean }
  /** A free redo of an earlier job (Detlio Guarantee, 0051). Absent from older servers. */
  guaranteeRedo?: boolean
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
    /**
     * Gift a wash (0049): the part paid with Detlio credit, which goes back to
     * the customer's credit (never their card), and when it did (null while
     * on its way). Absent when no credit was used. Already in `amount`.
     */
    credit?: { amount: string; returnedAt: string | null }
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
  // `phone` is null outside the contact window: the customer's on a garage
  // payload, the garage's (and its WhatsApp) on a customer's.
  user: { id: string; name: string; phone: string | null } | null
  vendor: {
    id: string
    businessName: string
    phone: string | null
    city: string
    // Optional: the API and the apps deploy separately, so a client can meet
    // a server that does not send these yet.
    address?: string
    lat?: number | null
    lng?: number | null
    whatsapp?: string | null
    /** The garage's own Google Maps link. Absent from older servers. */
    mapsUrl?: string | null
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
    /** What came through Razorpay (0.00 when Detlio credit paid it all). */
    amount: string
    gateway: string | null
    /** Gift a wash (0049): the part paid with Detlio credit. Absent from older servers. */
    creditAmount?: string
    /** When that part went back to the customer's credit (a cancelled booking). */
    creditReturnedAt?: string | null
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
