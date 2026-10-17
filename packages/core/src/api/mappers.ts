import { formatDistance } from '@repo/core/map'
import type {
  ApiAddress,
  ApiAuthUser,
  ApiBooking,
  ApiFinalBill,
  ApiPackage,
  ApiPublicVendor,
  ApiPublicReview,
  ApiService,
  ApiTierBreakdownEntry,
  ApiUserProfile,
  ApiVehicle,
  ApiVendorListItem,
} from './types'
import type {
  Address,
  Booking,
  FinalBill,
  Review,
  Service,
  ServicePackage,
  TierBreakdownEntry,
  User,
  Vehicle,
  Vendor,
} from '@repo/core/types'
import { APP_TIMEZONE, formatServiceSummary } from '@repo/core/utils'
import { categoryLabel } from '@repo/core/categories'

function formatSlotTime(iso: string): string {
  const date = new Date(iso)
  // Zero-padded hour and an uppercase meridiem ("05:00 PM"), so the slot grid
  // stays a fixed width. en-IN yields a lowercase "pm", hence the toUpperCase.
  return date
    .toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: APP_TIMEZONE,
    })
    .toUpperCase()
}

export function formatScheduledAt(iso: string): string {
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
    distance: formatDistance(item.distanceKm),
    distanceKm: item.distanceKm,
    lat: item.lat,
    lng: item.lng,
    rating: item.rating ?? 0,
    reviewCount: item.reviewCount,
    openingHours: item.workingHours ?? null,
    closures: item.closures ?? [],
    // A paused garage is left out of every list, so a listed one never is.
    bookingsPaused: false,
    bookingsPausedReason: null,
    startingPrice: item.startingPrice ?? 0,
    dropinEnabled: item.dropinEnabled,
    doorstepEnabled: item.doorstepEnabled,
    serviceTags: item.serviceTags,
    isVerified: item.isVerified,
    photos: item.photos,
    matchedService: item.matchedService ?? null,
    outsideServiceCity: item.outsideServiceCity ?? null,
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
    // The single-vendor endpoint carries no origin, so it has no distance to
    // report. Left as an em-dash rather than 0, which would read as "here".
    distance: '—',
    distanceKm: null,
    lat: vendor.lat,
    lng: vendor.lng,
    rating: vendor.rating ?? 0,
    reviewCount: vendor.reviewCount,
    // Not on the single-vendor response: the garage page reads them from
    // /vendors/:id/working-hours, the query checkout's slot picker shares.
    openingHours: null,
    // Likewise read from /vendors/:id/closures by the page that needs them.
    closures: [],
    // Absent from a server older than pausing, which means "taking bookings".
    bookingsPaused: vendor.bookingsPausedAt != null,
    bookingsPausedReason: vendor.bookingsPausedReason ?? null,
    startingPrice: prices.length > 0 ? Math.min(...prices) : 0,
    dropinEnabled: vendor.dropinEnabled,
    doorstepEnabled: vendor.doorstepEnabled,
    serviceTags: categories.map(categoryLabel),
    isVerified: vendor.isVerified,
    photos: vendor.photos.map((p) => p.url),
    // Not a search result, so nothing was matched.
    matchedService: null,
    outsideServiceCity: vendor.outsideServiceCity ?? null,
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
    // Older responses (and any cached payload) may predate service images.
    images: service.images ?? [],
    media: service.media ?? [],
  }
}

function mapTierEntry(entry: ApiTierBreakdownEntry): TierBreakdownEntry {
  return {
    price: Number(entry.price),
    itemsTotal: Number(entry.itemsTotal),
    savings: entry.savings === null ? null : Number(entry.savings),
  }
}

export function mapPackage(
  pkg: ApiPackage,
  vendorId: string
): ServicePackage {
  return {
    ...mapService(pkg, vendorId),
    items: pkg.items.map((item) => ({
      serviceId: item.serviceId,
      name: item.name,
      price: Number(item.price),
      durationMins: item.durationMins,
      isActive: item.isActive,
    })),
    itemsTotal: Number(pkg.itemsTotal),
    savings: pkg.savings === null ? null : Number(pkg.savings),
    tierBreakdown: pkg.tierBreakdown
      ? {
          hatchback: mapTierEntry(pkg.tierBreakdown.hatchback),
          sedan: mapTierEntry(pkg.tierBreakdown.sedan),
          suv: mapTierEntry(pkg.tierBreakdown.suv),
        }
      : null,
    hasInactiveItems: pkg.hasInactiveItems,
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
    washIntervalDays: vehicle.washIntervalDays ?? null,
  }
}

export function mapAddress(address: ApiAddress): Address {
  return {
    id: address.id,
    label: address.label,
    address: `${address.address}, ${address.city}`,
    pincode: address.address.match(/\d{6}/)?.[0] ?? '',
    lat: address.lat,
    lng: address.lng,
    isDefault: address.isDefault,
  }
}

export function mapFinalBill(bill: ApiFinalBill): FinalBill {
  return {
    id: bill.id,
    status: bill.status,
    lines: bill.lines.map((line) => ({
      description: line.description,
      amount: Number(line.amount),
    })),
    total: Number(bill.totalAmount),
    paidBefore: Number(bill.paidBefore),
    amountDue: Number(bill.amountDue),
    note: bill.note,
    paidAt: bill.paidAt,
    createdAt: bill.createdAt,
  }
}

export function mapBooking(booking: ApiBooking): Booking {
  // Older payloads (and any response cached before multi-service bookings) have
  // no `items`, so the deprecated single `service` stands in as one line.
  const items = (booking.items ?? []).map((item) => ({
    id: item.id,
    serviceId: item.serviceId,
    name: item.name,
    amount: Number(item.amount),
    durationMins: item.durationMins,
    pricingType: item.pricingType ?? undefined,
  }))

  const fallbackItems =
    items.length > 0 || !booking.service
      ? items
      : [
          {
            id: booking.service.id,
            serviceId: booking.service.id,
            name: booking.service.name,
            amount: Number(booking.subtotalAmount ?? booking.amount),
            durationMins: booking.service.durationMins,
          },
        ]

  return {
    id: booking.id,
    vendorId: booking.vendor?.id ?? '',
    vendorName: booking.vendor?.businessName ?? '',
    items: fallbackItems,
    serviceId: fallbackItems[0]?.serviceId ?? '',
    serviceName: fallbackItems[0]?.name ?? '',
    serviceSummary: formatServiceSummary(fallbackItems.map((item) => item.name)),
    durationMins:
      booking.durationMins ??
      fallbackItems.reduce((total, item) => total + item.durationMins, 0),
    servicePrice: Number(booking.amount),
    subtotalPrice: Number(booking.subtotalAmount ?? booking.amount),
    discountAmount: Number(booking.discountAmount ?? 0),
    discountCode: booking.discountCode ?? undefined,
    discountFundedBy: booking.discountFundedBy ?? undefined,
    servicePricingType: booking.service?.pricingType,
    status: booking.status as Booking['status'],
    bookingType: booking.bookingType as Booking['bookingType'],
    scheduledAt: formatScheduledAt(booking.scheduledAt),
    scheduledAtIso: booking.scheduledAt,
    customerName: booking.user?.name,
    customerPhone: booking.user?.phone || undefined,
    jobLocation:
      booking.bookingType === 'doorstep' && booking.address
        ? { address: booking.address, lat: booking.lat, lng: booking.lng }
        : undefined,
    garage: booking.vendor
      ? {
          phone: booking.vendor.phone || undefined,
          whatsapp: booking.vendor.whatsapp || undefined,
          address: booking.vendor.address || undefined,
          city: booking.vendor.city || undefined,
          lat: booking.vendor.lat ?? null,
          lng: booking.vendor.lng ?? null,
        }
      : undefined,
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
    cancelledOnBehalfOf: booking.cancelledOnBehalfOf ?? undefined,
    noShow: booking.noShow ?? undefined,
    rescheduleCount: booking.rescheduleCount ?? 0,
    remainingReschedules: booking.remainingReschedules ?? 0,
    rescheduledFromId: booking.rescheduledFromId ?? undefined,
    review: booking.review
      ? {
          id: booking.review.id,
          userName: booking.user?.name ?? 'Customer',
          rating: booking.review.rating,
          comment: booking.review.comment ?? '',
          date: formatReviewDate(booking.review.createdAt),
        }
      : undefined,
    requestedAtIso: booking.createdAt,
    acceptedAtIso: booking.acceptedAt ?? undefined,
    startedAtIso: booking.startedAt ?? undefined,
    completedAtIso: booking.completedAt ?? undefined,
    // The server's figure when it sent one (it credits the pre-discount
    // price, so a promo code is not charged back on the bill); otherwise
    // what the payment says arrived.
    paidAtBooking:
      booking.paidAtBooking !== undefined
        ? Number(booking.paidAtBooking)
        : booking.payment && ['paid', 'collected'].includes(booking.payment.status)
          ? Number(booking.subtotalAmount ?? booking.payment.amount)
          : 0,
    jobPhotos: booking.photos ?? [],
    finalBill: booking.finalBill ? mapFinalBill(booking.finalBill) : null,
    canRaiseFinalBill: booking.canRaiseFinalBill ?? false,
    refund: booking.refund
      ? {
          status: booking.refund.status,
          amount: Number(booking.refund.amount),
          amountRefunded: Number(booking.refund.amountRefunded),
          refundedAt: booking.refund.refundedAt ?? undefined,
        }
      : { status: 'none', amount: 0, amountRefunded: 0 },
    receiptAvailable: booking.receiptAvailable ?? false,
    moved: booking.moved ?? false,
  }
}

// Takes the public shape, which the signed-in ApiReview extends.
export function mapReview(review: ApiPublicReview): Review {
  return {
    id: review.id,
    userName: review.user?.name ?? 'Customer',
    rating: review.rating,
    comment: review.comment ?? '',
    date: formatReviewDate(review.createdAt),
    // The job this review is about, as one line. With several services that is
    // the summary label — naming only the first would misdescribe the job.
    bookingContext: review.booking
      ? formatServiceSummary(
          review.booking.serviceNames?.length
            ? review.booking.serviceNames
            : [review.booking.service?.name ?? '']
        ) || undefined
      : undefined,
  }
}

// The server returns only bookable slots — full ones are already left out — so
// every slot that comes back is available; there is no "taken" state to render.
export function mapSlots(slots: string[]) {
  const now = Date.now()
  return slots
    // Hide slots that are already in the past (e.g. earlier times today).
    // The server also validates this, but filtering here keeps the UI clean.
    .filter((iso) => new Date(iso).getTime() > now)
    .map((iso) => ({
      time: iso,
      label: formatSlotTime(iso),
    }))
}
