export interface ApiSuccessResponse<T> {
  success: true
  data: T
  message?: string
}

export interface ApiErrorResponse {
  success: false
  message: string
  code?: string
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
  bays: number | null
  jobsPerDay: number | null
  vehicleTypes: string[]
  notes: string | null
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
  slots: string[]
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
  cancelledBy: 'user' | 'vendor' | null
  cancellationReason: string | null
  cancelledAt: string | null
  originalBookingId: string | null
  rescheduledFromId: string | null
  rescheduleCount: number
  remainingReschedules: number
  maxReschedules: number
  createdAt: string
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
