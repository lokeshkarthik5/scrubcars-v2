import type {
  Address,
  Booking,
  EarningsJob,
  EarningsSummary,
  Review,
  Service,
  User,
  Vehicle,
  Vendor,
  VendorStats,
} from '@/lib/types'

export const MOCK_USER: User = {
  id: 'user-1',
  name: 'Rahul Sharma',
  phone: '9876543210',
  area: 'Adyar',
  pincode: '600020',
  isCustomer: true,
  isVendorOwner: false,
}

export const MOCK_VENDORS: Vendor[] = [
  {
    id: 'vendor-1',
    name: 'Sparkle Auto Care',
    logoUrl: null,
    area: 'Adyar',
    distance: '1.2 km',
    rating: 4.8,
    reviewCount: 124,
    status: 'open',
    startingPrice: 299,
    dropinEnabled: false,
    doorstepEnabled: true,
    serviceTags: ['Car wash', 'Detailing'],
    isVerified: true,
    photos: [],
  },
  {
    id: 'vendor-2',
    name: 'Elite Detailing Studio',
    logoUrl: null,
    area: 'Velachery',
    distance: '3.5 km',
    rating: 4.6,
    reviewCount: 89,
    status: 'busy',
    startingPrice: 499,
    dropinEnabled: true,
    doorstepEnabled: false,
    serviceTags: ['Detailing', 'Coating'],
    isVerified: true,
    photos: [],
  },
  {
    id: 'vendor-3',
    name: 'Quick Wash Hub',
    logoUrl: null,
    area: 'T Nagar',
    distance: '5.1 km',
    rating: 4.3,
    reviewCount: 56,
    status: 'closed',
    startingPrice: 199,
    dropinEnabled: false,
    doorstepEnabled: true,
    serviceTags: ['Car wash'],
    isVerified: true,
    photos: [],
  },
]

export const MOCK_SERVICES: Service[] = [
  {
    id: 'svc-1',
    vendorId: 'vendor-1',
    name: 'Basic Wash',
    description: null,
    category: 'car_wash',
    price: 299,
    durationMins: 30,
    pricingType: 'flat',
    priceHatchback: null,
    priceSedan: null,
    priceSuv: null,
    isActive: true,
    images: [],
  },
  {
    id: 'svc-2',
    vendorId: 'vendor-1',
    name: 'Premium Detailing',
    description: null,
    category: 'detailing',
    price: 1499,
    durationMins: 120,
    pricingType: 'flat',
    priceHatchback: null,
    priceSedan: null,
    priceSuv: null,
    isActive: true,
    images: [],
  },
  {
    id: 'svc-3',
    vendorId: 'vendor-1',
    name: 'Ceramic Coating',
    description: null,
    category: 'coating',
    price: 4999,
    durationMins: 180,
    pricingType: 'flat',
    priceHatchback: null,
    priceSedan: null,
    priceSuv: null,
    isActive: true,
    images: [],
  },
]

export const MOCK_REVIEWS: Review[] = [
  {
    id: 'rev-1',
    userName: 'Priya M',
    rating: 5,
    comment: 'Excellent service! My car looks brand new.',
    date: '12 Jun 2025',
    bookingContext: 'Basic wash · 12 Jun',
  },
  {
    id: 'rev-2',
    userName: 'Arun K',
    rating: 4,
    comment: 'Good work, arrived on time for doorstep service.',
    date: '8 Jun 2025',
    bookingContext: 'Premium detailing · 8 Jun',
  },
]

export const MOCK_VEHICLES: Vehicle[] = [
  {
    id: 'veh-1',
    make: 'Honda',
    model: 'City',
    plate: 'TN 09 AB 1234',
    isDefault: true,
  },
  {
    id: 'veh-2',
    make: 'Hyundai',
    model: 'Creta',
    plate: 'TN 07 CD 5678',
    isDefault: false,
  },
]

export const MOCK_ADDRESSES: Address[] = [
  {
    id: 'addr-1',
    label: 'Home',
    address: '14, Gandhi Nagar, Adyar, Chennai',
    pincode: '600020',
    isDefault: true,
  },
  {
    id: 'addr-2',
    label: 'Office',
    address: '42, IT Park, Sholinganallur, Chennai',
    pincode: '600119',
    isDefault: false,
  },
]

export const MOCK_SLOTS = [
  { time: '9:00 AM', available: true },
  { time: '9:30 AM', available: true },
  { time: '10:00 AM', available: false },
  { time: '10:30 AM', available: true },
  { time: '11:00 AM', available: true },
  { time: '11:30 AM', available: false },
  { time: '2:00 PM', available: true },
  { time: '2:30 PM', available: true },
  { time: '3:00 PM', available: true },
]

const RAW_MOCK_BOOKINGS = [
  {
    id: 'BK-2847',
    vendorId: 'vendor-1',
    vendorName: 'Sparkle Auto Care',
    serviceName: 'Basic Wash',
    servicePrice: 299,
    status: 'confirmed',
    bookingType: 'doorstep',
    scheduledAt: 'Today, 10:30 AM',
    scheduledAtIso: new Date().toISOString(),
    customerName: 'Rahul Sharma',
    vehicle: MOCK_VEHICLES[0],
    paymentMethod: 'online',
    paymentStatus: 'paid',
  },
  {
    id: 'BK-2801',
    vendorId: 'vendor-2',
    vendorName: 'Elite Detailing Studio',
    serviceName: 'Premium Detailing',
    servicePrice: 1499,
    status: 'completed',
    bookingType: 'dropin',
    scheduledAt: '5 Jun, 2:00 PM',
    scheduledAtIso: '2026-06-05T14:00:00.000Z',
    customerName: 'Rahul Sharma',
    vehicle: MOCK_VEHICLES[0],
    paymentMethod: 'cash',
    paymentStatus: 'collected',
    review: MOCK_REVIEWS[0],
  },
]

const RAW_MOCK_VENDOR_BOOKINGS = [
  {
    id: 'BK-2901',
    vendorId: 'vendor-1',
    vendorName: 'Sparkle Auto Care',
    serviceName: 'Basic Wash',
    servicePrice: 299,
    status: 'pending',
    bookingType: 'doorstep',
    scheduledAt: 'Today, 11:00 AM',
    scheduledAtIso: new Date().toISOString(),
    customerName: 'Priya M',
    vehicle: { id: 'v1', make: 'Maruti', model: 'Swift', plate: 'TN 01 XY 9876', isDefault: true },
    paymentMethod: 'online',
    paymentStatus: 'paid',
  },
  {
    id: 'BK-2890',
    vendorId: 'vendor-1',
    vendorName: 'Sparkle Auto Care',
    serviceName: 'Premium Detailing',
    servicePrice: 1499,
    status: 'confirmed',
    bookingType: 'dropin',
    scheduledAt: 'Tomorrow, 9:00 AM',
    scheduledAtIso: new Date(Date.now() + 86400000).toISOString(),
    customerName: 'Arun K',
    vehicle: { id: 'v2', make: 'Toyota', model: 'Innova', plate: 'TN 09 ZZ 4321', isDefault: true },
    paymentMethod: 'cash',
    paymentStatus: 'pending',
  },
  {
    id: 'BK-2850',
    vendorId: 'vendor-1',
    vendorName: 'Sparkle Auto Care',
    serviceName: 'Basic Wash',
    servicePrice: 299,
    status: 'in_progress',
    bookingType: 'doorstep',
    scheduledAt: 'Started 9:15 AM',
    scheduledAtIso: new Date().toISOString(),
    customerName: 'Karthik S',
    vehicle: { id: 'v3', make: 'Honda', model: 'Amaze', plate: 'TN 07 AB 5555', isDefault: true },
    paymentMethod: 'online',
    paymentStatus: 'paid',
  },
  {
    id: 'BK-2801',
    vendorId: 'vendor-1',
    vendorName: 'Sparkle Auto Care',
    serviceName: 'Ceramic Coating',
    servicePrice: 4999,
    status: 'completed',
    bookingType: 'dropin',
    scheduledAt: '3 Jun, 10:00 AM',
    scheduledAtIso: '2026-06-03T10:00:00.000Z',
    customerName: 'Deepa R',
    vehicle: { id: 'v4', make: 'BMW', model: 'X1', plate: 'TN 10 CD 1111', isDefault: true },
    paymentMethod: 'online',
    paymentStatus: 'paid',
    review: MOCK_REVIEWS[1],
  },
]

// Mock bookings predate the reschedule fields; fill sensible defaults so they
// satisfy the Booking type without hand-editing every fixture.
function withRescheduleDefaults<T extends object>(bookings: T[]): Booking[] {
  return bookings.map((b) => ({
    serviceId: '',
    rescheduleCount: 0,
    remainingReschedules: 2,
    ...b,
  })) as unknown as Booking[]
}

export const MOCK_BOOKINGS: Booking[] = withRescheduleDefaults(RAW_MOCK_BOOKINGS)

export const MOCK_VENDOR_BOOKINGS: Booking[] = withRescheduleDefaults(
  RAW_MOCK_VENDOR_BOOKINGS
)

export const MOCK_VENDOR_STATS: VendorStats = {
  todaysJobs: 4,
  pendingRequests: 2,
  weekEarnings: 12450,
  avgRating: 4.8,
}

export const MOCK_EARNINGS: EarningsSummary = {
  totalEarned: 45200,
  jobsDone: 38,
  pending: 2400,
  avgRating: 4.8,
}

export const MOCK_EARNINGS_JOBS: EarningsJob[] = [
  {
    id: 'ej-1',
    serviceName: 'Basic Wash',
    customerName: 'Priya M',
    date: 'Today',
    type: 'doorstep',
    amount: 299,
    settled: true,
  },
  {
    id: 'ej-2',
    serviceName: 'Premium Detailing',
    customerName: 'Arun K',
    date: 'Yesterday',
    type: 'dropin',
    amount: 1499,
    settled: false,
  },
  {
    id: 'ej-3',
    serviceName: 'Ceramic Coating',
    customerName: 'Deepa R',
    date: '3 Jun',
    type: 'dropin',
    amount: 4999,
    settled: true,
  },
]

// Re-exported so mock consumers and real ones can never drift apart.
export { CATEGORY_LABELS } from '@/lib/categories'
