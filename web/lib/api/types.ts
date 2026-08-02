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
  isAdmin: boolean
  status: string
}

export interface ApiAuthVendor {
  id: string
  businessName: string
  phone: string
  status: string
  isVerified: boolean
}

export interface ApiSessionData {
  user: ApiAuthUser
  vendor: ApiAuthVendor | null
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
  isAdmin: boolean
  status: string
  createdAt: string
}

export interface ApiAddress {
  id: string
  label: string
  address: string
  city: string
  lat: number
  lng: number
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
  serviceTags: string[]
  photos: string[]
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
}

export interface VendorProfileExtras {
  whatsapp: string | null
  email: string | null
  yearsInOperation: string | null
  mapsUrl: string | null
  pickup: 'yes' | 'nearby' | 'no' | null
  pickupRadiusKm: number | null
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

export interface ApiService {
  id: string
  name: string
  description: string | null
  category: string
  pricingType: 'flat' | 'per_vehicle' | 'from' | 'on_inspection'
  price: string
  priceHatchback: string | null
  priceSedan: string | null
  priceSuv: string | null
  durationMins: number
  isActive: boolean
}

export interface ApiSlotsResponse {
  date: string
  serviceId: string
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
  paymentMethod: string
  lat: number | null
  lng: number | null
  address: string | null
  cancelledBy: 'user' | 'vendor' | null
  cancellationReason: string | null
  cancelledAt: string | null
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
  } | null
  service: {
    id: string
    name: string
    category: string
    pricingType: 'flat' | 'per_vehicle' | 'from' | 'on_inspection'
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
    service: {
      id: string
      name: string
    } | null
  } | null
}
