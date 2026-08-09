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
import { APP_TIMEZONE } from '@/lib/utils'

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
    timeZone: APP_TIMEZONE,
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
    timeZone: APP_TIMEZONE,
  })
}

function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: APP_TIMEZONE,
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
    avatarUrl: profile.avatarUrl,
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
    logoUrl: item.logoUrl,
    area: item.city,
    distance: '—',
    rating: 4.5,
    reviewCount: 0,
    status: mapVendorStatus(item.status),
    startingPrice: item.startingPrice ?? 0,
    dropinEnabled: item.dropinEnabled,
    doorstepEnabled: item.doorstepEnabled,
    serviceTags: item.serviceTags,
    isVerified: item.isVerified,
    photos: item.photos,
  }
}

export function mapPublicVendor(vendor: ApiPublicVendor): Vendor {
  const activeServices = vendor.services.filter((s) => s.isActive)
  // Every pricing type carries a concrete price now (incl. the inspection fee).
  const prices = activeServices
    .map((s) => Number(s.price))
    .filter((n) => Number.isFinite(n) && n > 0)
  const categories = [...new Set(activeServices.map((s) => s.category))]

  return {
    id: vendor.id,
    name: vendor.businessName,
    logoUrl: vendor.logoUrl,
    area: vendor.city,
    distance: '—',
    rating: 4.5,
    reviewCount: 0,
    status: mapVendorStatus(vendor.status),
    startingPrice: prices.length > 0 ? Math.min(...prices) : 0,
    dropinEnabled: vendor.dropinEnabled,
    doorstepEnabled: vendor.doorstepEnabled,
    serviceTags: categories.map((c) => CATEGORY_LABELS[c] ?? c),
    isVerified: vendor.isVerified,
    photos: vendor.photos.map((p) => p.url),
  }
}

export function mapService(service: ApiService, vendorId: string): Service {
  const tier = (v: string | null): number | null => (v === null ? null : Number(v))
  return {
    id: service.id,
    vendorId,
    name: service.name,
    description: service.description,
    category: service.category as Service['category'],
    pricingType: service.pricingType,
    price: Number(service.price),
    priceHatchback: tier(service.priceHatchback),
    priceSedan: tier(service.priceSedan),
    priceSuv: tier(service.priceSuv),
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
    vehicleType: vehicle.vehicleType as Vehicle['vehicleType'],
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
    servicePricingType: booking.service?.pricingType,
    status: booking.status as Booking['status'],
    bookingType: booking.bookingType as Booking['bookingType'],
    scheduledAt: formatScheduledAt(booking.scheduledAt),
    scheduledAtIso: booking.scheduledAt,
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
    cancelledBy: booking.cancelledBy ?? undefined,
    cancellationReason: booking.cancellationReason ?? undefined,
    review: booking.review
      ? {
          id: booking.review.id,
          userName: booking.user?.name ?? 'Customer',
          rating: booking.review.rating,
          comment: booking.review.comment ?? '',
          date: formatReviewDate(booking.review.createdAt),
        }
      : undefined,
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
  const now = Date.now()
  return slots
    // Hide slots that are already in the past (e.g. earlier times today).
    // The server also validates this, but filtering here keeps the UI clean.
    .filter((iso) => new Date(iso).getTime() > now)
    .map((iso) => ({
      time: iso,
      label: formatSlotTime(iso),
      available: true,
    }))
}
