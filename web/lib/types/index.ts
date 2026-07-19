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
export type PaymentMethod = 'online' | 'cash'
export type VendorStatus = 'open' | 'busy' | 'closed'

export interface User {
  id: string
  name: string
  phone: string
  area?: string
  pincode?: string
  isCustomer: boolean
  isVendorOwner: boolean
}

export interface Vendor {
  id: string
  name: string
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
  price: number
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
  status: BookingStatus
  bookingType: BookingType
  scheduledAt: string
  scheduledAtIso: string
  customerName?: string
  vehicle?: Vehicle
  paymentMethod: PaymentMethod
  paymentStatus: 'pending' | 'paid' | 'collected' | 'failed' | 'refunded'
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
