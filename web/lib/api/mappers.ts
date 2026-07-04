import type {
  ApiAddress,
  ApiAuthUser,
  ApiBooking,
  ApiPublicVendor,
  ApiReview,
  ApiService,
  ApiUserProfile,
  ApiVehicle,
  ApiVendorListItem,
} from './types'
import type {
  Address,
  Booking,
  Review,
  Service,
  User,
  Vehicle,
  Vendor,
  VendorStatus,
} from '@/lib/types'

const CATEGORY_LABELS: Record<string, string> = {
  car_wash: 'Car wash',
  detailing: 'Detailing',
  coating: 'Coating',
  scratch_removal: 'Scratch removal',
}

function mapVendorStatus(status: string): VendorStatus {
  if (status === 'active') return 'open'
  if (status === 'suspended') return 'closed'
  return 'closed'
}

function formatSlotTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatScheduledAt(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function mapAuthUser(user: ApiAuthUser, area?: string, pincode?: string): User {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    area,
    pincode,
    isCustomer: user.isCustomer,
    isVendorOwner: user.isVendorOwner,
  }
}

export function mapUserProfile(
  profile: ApiUserProfile,
  defaultAddress?: ApiAddress
): User {
  return {
    id: profile.id,
    name: profile.name,
    phone: profile.phone,
    area: defaultAddress?.city,
    pincode: defaultAddress?.address.match(/\d{6}/)?.[0],
    isCustomer: profile.isCustomer,
    isVendorOwner: profile.isVendorOwner,
  }
}

export function mapVendorListItem(item: ApiVendorListItem): Vendor {
  return {
    id: item.id,
    name: item.businessName,
    area: item.city,
    distance: '—',
    rating: 4.5,
    reviewCount: 0,
    status: mapVendorStatus(item.status),
    startingPrice: item.startingPrice ?? 0,
    bookingType: 'dropin',
    serviceTags: item.serviceTags,
    isVerified: item.isVerified,
    photos: item.photos,
  }
}

export function mapPublicVendor(vendor: ApiPublicVendor): Vendor {
  const activeServices = vendor.services.filter((s) => s.isActive)
  const prices = activeServices.map((s) => Number(s.price))
  const categories = [...new Set(activeServices.map((s) => s.category))]

  return {
    id: vendor.id,
    name: vendor.businessName,
    area: vendor.city,
    distance: '—',
    rating: 4.5,
    reviewCount: 0,
    status: mapVendorStatus(vendor.status),
    startingPrice: prices.length > 0 ? Math.min(...prices) : 0,
    bookingType: 'dropin',
    serviceTags: categories.map((c) => CATEGORY_LABELS[c] ?? c),
    isVerified: vendor.isVerified,
    photos: vendor.photos.map((p) => p.url),
  }
}

export function mapService(service: ApiService, vendorId: string): Service {
  return {
    id: service.id,
    vendorId,
    name: service.name,
    category: service.category as Service['category'],
    price: Number(service.price),
    durationMins: service.durationMins,
    isActive: service.isActive,
  }
}

export function mapVehicle(vehicle: ApiVehicle): Vehicle {
  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    plate: vehicle.licensePlate ?? '',
    isDefault: vehicle.isDefault,
  }
}

export function mapAddress(address: ApiAddress): Address {
  return {
    id: address.id,
    label: address.label,
    address: `${address.address}, ${address.city}`,
    pincode: address.address.match(/\d{6}/)?.[0] ?? '',
    isDefault: address.isDefault,
  }
}

export function mapBooking(booking: ApiBooking): Booking {
  return {
    id: booking.id,
    vendorId: booking.vendor?.id ?? '',
    vendorName: booking.vendor?.businessName ?? '',
    serviceName: booking.service?.name ?? '',
    servicePrice: Number(booking.amount),
    status: booking.status as Booking['status'],
    bookingType: booking.bookingType as Booking['bookingType'],
    scheduledAt: formatScheduledAt(booking.scheduledAt),
    customerName: booking.user?.name,
    vehicle: booking.vehicle
      ? {
          id: booking.vehicle.id,
          make: booking.vehicle.make,
          model: booking.vehicle.model,
          plate: booking.vehicle.licensePlate ?? '',
          isDefault: false,
        }
      : undefined,
    paymentMethod: booking.paymentMethod as Booking['paymentMethod'],
    paymentStatus: (booking.payment?.status ?? 'pending') as Booking['paymentStatus'],
  }
}

export function mapReview(review: ApiReview): Review {
  return {
    id: review.id,
    userName: review.user?.name ?? 'Customer',
    rating: review.rating,
    comment: review.comment ?? '',
    date: formatReviewDate(review.createdAt),
    bookingContext: review.booking?.service?.name,
  }
}

export function mapSlots(slots: string[]) {
  return slots.map((iso) => ({
    time: iso,
    label: formatSlotTime(iso),
    available: true,
  }))
}
