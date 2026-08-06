export type BookingType = 'doorstep' | 'dropin'
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
export type ServiceCategory =
  | 'car_wash'
  | 'detailing'
  | 'coating'
  | 'scratch_removal'
  | 'others'
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

export interface Service {
  id: string
  vendorId: string
  name: string
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
  serviceName: string
  servicePrice: number
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
