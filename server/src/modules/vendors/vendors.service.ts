import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import {
  computeAvailableSlots,
  getDayOfWeekFromDate,
} from '../../lib/slots.js'
import {
  createPresignedUpload,
  deleteObject,
  keyFromPublicUrl,
} from '../../lib/storage.js'
import {
  computeStartingPrice,
  resolveServicePricing,
  tiersOf,
  type VehicleTier,
} from '../../lib/pricing.js'

// Fixed order for every per-tier breakdown, so the UI can render rows without
// sorting and the "smallest saving" scan is deterministic.
const VEHICLE_TIERS: VehicleTier[] = ['hatchback', 'sedan', 'suv']
import { categoryLabel } from '../../lib/categories.js'
import { membersRepository } from '../members/members.repository.js'
import { vendorsRepository } from './vendors.repository.js'

const log = logger.child({ module: 'vendors' })
import type {
  PhotoRecord,
  ServiceAreaRecord,
  ServiceImageRecord,
  ServiceRecord,
  VendorRecord,
  WorkingHoursRecord,
} from './vendors.repository.js'
import type {
  CreatePackageInput,
  CreatePhotoInput,
  CreateServiceAreaInput,
  CreateServiceImageInput,
  CreateServiceInput,
  CreateVendorInput,
  ListPublicVendorsQuery,
  LogoUploadUrlInput,
  PhotoUploadUrlInput,
  ReorderPhotosInput,
  ServiceImageUploadUrlInput,
  SetLogoInput,
  SetWorkingHoursInput,
  SlotsQueryInput,
  ToggleServiceActiveInput,
  UpdateJobTypesInput,
  UpdatePackageInput,
  UpdateServiceInput,
  UpdateSlotIntervalInput,
  UpdateVendorInput,
} from './vendors.validation.js'

export type VendorResponse = {
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
  whatsapp: string | null
  email: string | null
  yearsInOperation: string | null
  mapsUrl: string | null
  pickup: string | null
  pickupRadiusKm: number | null
  bays: number | null
  jobsPerDay: number | null
  vehicleTypes: string[]
  notes: string | null
  isVerified: boolean
  doorstepEnabled: boolean
  dropinEnabled: boolean
  slotIntervalMins: number
  status: string
  createdAt: string
}

export type PublicVendorResponse = Omit<VendorResponse, 'ownerId'> & {
  photos: PhotoResponse[]
  services: ServiceResponse[]
  // null when the vendor has no reviews yet — distinct from a rating of 0.
  rating: number | null
  reviewCount: number
}

export type VendorListItemResponse = {
  id: string
  businessName: string
  logoUrl: string | null
  city: string
  isVerified: boolean
  status: string
  doorstepEnabled: boolean
  dropinEnabled: boolean
  startingPrice: number | null
  // null when the vendor has no reviews yet — distinct from a rating of 0.
  rating: number | null
  reviewCount: number
  serviceTags: string[]
  photos: string[]
}

export type WorkingHoursResponse = {
  id: string
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

export type ServiceAreaResponse = {
  id: string
  areaName: string
  pincode: string
  radiusKm: number | null
}

export type PhotoResponse = {
  id: string
  url: string
  sortOrder: number
  createdAt: string
}

export type ServiceImageResponse = {
  id: string
  url: string
  sortOrder: number
}

export type ServiceResponse = {
  id: string
  name: string
  description: string | null
  category: string
  pricingType: string
  price: string
  priceHatchback: string | null
  priceSedan: string | null
  priceSuv: string | null
  durationMins: number
  isActive: boolean
  images: ServiceImageResponse[]
}

export type PackageItemResponse = {
  serviceId: string
  name: string
  price: string
  durationMins: number
  isActive: boolean
}

export type TierBreakdownEntry = {
  price: string
  itemsTotal: string
  savings: string | null
}

// A package response is a service response plus its contents. `itemsTotal` and
// `savings` are computed per request from the members' current prices rather
// than stored, so editing a member's price can never leave a stale claim on
// screen. `savings` is null when the package is not cheaper than its parts, so
// the UI has nothing to badge.
//
// For a per-vehicle package those two headline figures are floor-to-floor
// (cheapest tier vs the sum of the members' cheapest tiers), which is the right
// basis for a browsing card but is not what an SUV owner will pay. So a
// per-vehicle package also carries `tierBreakdown` — the real price, parts total
// and saving for each vehicle — and its headline `savings` is narrowed to the
// smallest saving across tiers, so the badge understates rather than overpromises.
export type PackageResponse = ServiceResponse & {
  items: PackageItemResponse[]
  itemsTotal: string
  savings: string | null
  tierBreakdown: Record<VehicleTier, TierBreakdownEntry> | null
  hasInactiveItems: boolean
}

function toVendorResponse(vendor: VendorRecord): VendorResponse {
  return {
    id: vendor.id,
    ownerId: vendor.ownerId,
    businessName: vendor.businessName,
    logoUrl: vendor.logoUrl,
    phone: vendor.phone,
    address: vendor.address,
    city: vendor.city,
    pincode: vendor.pincode,
    lat: vendor.lat,
    lng: vendor.lng,
    whatsapp: vendor.whatsapp,
    email: vendor.email,
    yearsInOperation: vendor.yearsInOperation,
    mapsUrl: vendor.mapsUrl,
    pickup: vendor.pickup,
    pickupRadiusKm: vendor.pickupRadiusKm,
    bays: vendor.bays,
    jobsPerDay: vendor.jobsPerDay,
    vehicleTypes: vendor.vehicleTypes,
    notes: vendor.notes,
    isVerified: vendor.isVerified,
    doorstepEnabled: vendor.doorstepEnabled,
    dropinEnabled: vendor.dropinEnabled,
    slotIntervalMins: vendor.slotIntervalMins,
    status: vendor.status,
    createdAt: vendor.createdAt.toISOString(),
  }
}

function toWorkingHoursResponse(
  hours: WorkingHoursRecord
): WorkingHoursResponse {
  return {
    id: hours.id,
    dayOfWeek: hours.dayOfWeek,
    openTime: hours.openTime,
    closeTime: hours.closeTime,
    isClosed: hours.isClosed,
  }
}

function toServiceAreaResponse(area: ServiceAreaRecord): ServiceAreaResponse {
  return {
    id: area.id,
    areaName: area.areaName,
    pincode: area.pincode,
    radiusKm: area.radiusKm,
  }
}

function toPhotoResponse(photo: PhotoRecord): PhotoResponse {
  return {
    id: photo.id,
    url: photo.url,
    sortOrder: photo.sortOrder,
    createdAt: photo.createdAt.toISOString(),
  }
}

function toServiceImageResponse(
  image: ServiceImageRecord
): ServiceImageResponse {
  return {
    id: image.id,
    url: image.url,
    sortOrder: image.sortOrder,
  }
}

// `images` is optional on the record because the write paths return a bare row
// from `returning()`. Callers that mutate images pass the fresh list explicitly.
function toServiceResponse(
  service: ServiceRecord & { images?: ServiceImageRecord[] },
  images: ServiceImageRecord[] = service.images ?? []
): ServiceResponse {
  return {
    images: images.map(toServiceImageResponse),
    id: service.id,
    name: service.name,
    description: service.description,
    category: service.category,
    pricingType: service.pricingType,
    price: service.price,
    priceHatchback: service.priceHatchback,
    priceSedan: service.priceSedan,
    priceSuv: service.priceSuv,
    durationMins: service.durationMins,
    isActive: service.isActive,
  }
}

type PackageWithItems = ServiceRecord & {
  images?: ServiceImageRecord[]
  packageItems: Array<{ sortOrder: number; service: ServiceRecord }>
}

function toPackageResponse(pkg: PackageWithItems): PackageResponse {
  const items = pkg.packageItems.map(({ service }) => ({
    serviceId: service.id,
    name: service.name,
    price: service.price,
    durationMins: service.durationMins,
    isActive: service.isActive,
  }))

  // Compare like with like: a package's own base price against the sum of its
  // members' base prices. For per-vehicle members `price` is the cheapest tier
  // (see resolveServicePricing), so this stays a consistent floor-to-floor
  // comparison rather than mixing a tier price into a flat total.
  const itemsTotal = items.reduce((sum, item) => sum + Number(item.price), 0)
  const packagePrice = Number(pkg.price)
  const saved = itemsTotal - packagePrice

  // What each vehicle actually pays, and saves. Only meaningful when the
  // package itself prices by vehicle; a flat package costs the same either way.
  const tierBreakdown =
    pkg.pricingType === 'per_vehicle'
      ? VEHICLE_TIERS.reduce(
          (acc, tier) => {
            // A member that doesn't price by vehicle contributes its flat price
            // to every tier. A tier a member never priced falls back to its
            // base — only reachable on rows predating the all-tiers rule.
            const tierItemsTotal = pkg.packageItems.reduce(
              (sum, { service }) =>
                sum + Number(tiersOf(service)[tier] ?? service.price),
              0
            )
            const tierPrice = Number(tiersOf(pkg)[tier] ?? pkg.price)
            const tierSaved = tierItemsTotal - tierPrice

            acc[tier] = {
              price: tierPrice.toFixed(2),
              itemsTotal: tierItemsTotal.toFixed(2),
              savings: tierSaved > 0 ? tierSaved.toFixed(2) : null,
            }
            return acc
          },
          {} as Record<VehicleTier, TierBreakdownEntry>
        )
      : null

  // Headline saving. For a per-vehicle package, the smallest saving any vehicle
  // gets — so "Save ₹X" is true for every customer, not just the cheapest one.
  // Null if any tier doesn't save, since the claim wouldn't hold for them.
  const headlineSavings = tierBreakdown
    ? VEHICLE_TIERS.every((tier) => tierBreakdown[tier].savings !== null)
      ? VEHICLE_TIERS.map((tier) => Number(tierBreakdown[tier].savings))
          .reduce((min, value) => Math.min(min, value))
          .toFixed(2)
      : null
    : saved > 0
      ? saved.toFixed(2)
      : null

  return {
    ...toServiceResponse(pkg),
    items,
    itemsTotal: itemsTotal.toFixed(2),
    savings: headlineSavings,
    tierBreakdown,
    hasInactiveItems: items.some((item) => !item.isActive),
  }
}

// Validates that every requested member is one of this vendor's own active,
// non-package services, and returns them in the caller's order. Rejecting here
// (rather than letting the FK fail) is what stops a vendor bundling another
// vendor's service or nesting a package inside a package.
async function assertValidPackageMembers(
  vendorId: string,
  serviceIds: string[]
): Promise<void> {
  const eligible = await vendorsRepository.findEligiblePackageMembers(
    vendorId,
    serviceIds
  )
  const eligibleIds = new Set(eligible.map((s) => s.id))
  const rejected = serviceIds.filter((id) => !eligibleIds.has(id))

  if (rejected.length > 0) {
    throw new AppError(
      400,
      `A package can only contain your own active services (${rejected.length} invalid)`,
      'INVALID_PACKAGE_ITEMS'
    )
  }
}

// Read back a service after an image write. A package is a services row, so it
// resolves here too — and must come back in its package shape (contents,
// savings), because the client swaps the whole object into its list and would
// otherwise lose the composition.
async function readServiceOrPackage(
  vendorId: string,
  serviceId: string
): Promise<ServiceResponse | PackageResponse> {
  const service = await vendorsRepository.findAnyServiceById(vendorId, serviceId)

  if (!service) {
    throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
  }

  if (service.category !== 'package') {
    return toServiceResponse(service)
  }

  const pkg = await vendorsRepository.findPackageById(vendorId, serviceId)
  return pkg ? toPackageResponse(pkg) : toServiceResponse(service)
}

async function getOwnedVendor(ownerId: string): Promise<VendorRecord> {
  const vendor = await vendorsRepository.findVendorByOwnerId(ownerId)

  if (!vendor) {
    throw new AppError(404, 'Vendor profile not found', 'VENDOR_NOT_FOUND')
  }

  return vendor
}

export const vendorsService = {
  async listPublicVendors(
    query: ListPublicVendorsQuery
  ): Promise<VendorListItemResponse[]> {
    const vendors = await vendorsRepository.listPublicVendors()

    const matching = vendors.filter((vendor) => {
      if (query.q) {
        const term = query.q.toLowerCase()
        const matchesName = vendor.businessName.toLowerCase().includes(term)
        const matchesCity = vendor.city.toLowerCase().includes(term)
        if (!matchesName && !matchesCity) return false
      }

      if (query.category) {
        const hasCategory = vendor.services.some(
          (service) => service.category === query.category
        )
        if (!hasCategory) return false
      }

      if (query.bookingType === 'dropin' && !vendor.dropinEnabled) return false
      if (query.bookingType === 'doorstep' && !vendor.doorstepEnabled) {
        return false
      }
      return true
    })

    // One grouped query for the whole page, keyed by vendor id.
    const aggregates = await vendorsRepository.getRatingAggregates(
      matching.map((vendor) => vendor.id)
    )
    const ratingsByVendor = new Map(
      aggregates.map((row) => [row.vendorId, row])
    )

    return matching.map((vendor) => {
      const categories = [
        ...new Set(vendor.services.map((service) => service.category)),
      ]
      const rating = ratingsByVendor.get(vendor.id)

      return {
        id: vendor.id,
        businessName: vendor.businessName,
        logoUrl: vendor.logoUrl,
        city: vendor.city,
        isVerified: vendor.isVerified,
        status: vendor.status,
        doorstepEnabled: vendor.doorstepEnabled,
        dropinEnabled: vendor.dropinEnabled,
        startingPrice: computeStartingPrice(vendor.services),
        rating: rating ? Number(rating.average.toFixed(2)) : null,
        reviewCount: rating?.count ?? 0,
        serviceTags: categories.map(categoryLabel),
        photos: vendor.photos.map((photo) => photo.url),
      }
    })
  },

  async getPublicVendor(vendorId: string): Promise<PublicVendorResponse> {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const [photos, services, aggregates] = await Promise.all([
      vendorsRepository.listPhotos(vendor.id),
      vendorsRepository.listServices(vendor.id, true),
      vendorsRepository.getRatingAggregates([vendor.id]),
    ])

    const { ownerId: _ownerId, ...publicVendor } = toVendorResponse(vendor)
    const rating = aggregates[0]

    return {
      ...publicVendor,
      photos: photos.map(toPhotoResponse),
      services: services.map((service) => toServiceResponse(service)),
      rating: rating ? Number(rating.average.toFixed(2)) : null,
      reviewCount: rating?.count ?? 0,
    }
  },

  async getMyVendor(ownerId: string) {
    const vendor = await getOwnedVendor(ownerId)
    return toVendorResponse(vendor)
  },

  async createVendor(ownerId: string, input: CreateVendorInput) {
    const existing = await vendorsRepository.findVendorByOwnerId(ownerId)

    if (existing) {
      throw new AppError(
        409,
        'Vendor profile already exists for this user',
        'VENDOR_ALREADY_EXISTS'
      )
    }

    const [vendor] = await vendorsRepository.createVendor({
      ownerId,
      ...input,
    })

    await vendorsRepository.setUserAsVendorOwner(ownerId)
    // The owner is always an active vendor_admin. Writing it here is what makes
    // "at least one active vendor_admin exists" true by construction rather
    // than something to enforce with a count query.
    await membersRepository.createOwnerMembership(vendor.id, ownerId)
    log.info({ vendorId: vendor.id, ownerId, businessName: vendor.businessName }, 'vendor:created')

    return toVendorResponse(vendor)
  },

  async updateVendor(ownerId: string, input: UpdateVendorInput) {
    const vendor = await getOwnedVendor(ownerId)
    const [updated] = await vendorsRepository.updateVendor(vendor.id, input)
    return toVendorResponse(updated)
  },

  async updateJobTypes(ownerId: string, input: UpdateJobTypesInput) {
    const vendor = await getOwnedVendor(ownerId)
    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      ...(input.dropinEnabled !== undefined && { dropinEnabled: input.dropinEnabled }),
      ...(input.doorstepEnabled !== undefined && { doorstepEnabled: input.doorstepEnabled }),
    })
    return toVendorResponse(updated)
  },

  async updateSlotInterval(ownerId: string, input: UpdateSlotIntervalInput) {
    const vendor = await getOwnedVendor(ownerId)
    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      slotIntervalMins: input.slotIntervalMins,
    })
    return toVendorResponse(updated)
  },

  async getWorkingHours(ownerId: string) {
    const vendor = await getOwnedVendor(ownerId)
    const hours = await vendorsRepository.listWorkingHours(vendor.id)
    return hours.map(toWorkingHoursResponse)
  },

  async setWorkingHours(ownerId: string, input: SetWorkingHoursInput) {
    const vendor = await getOwnedVendor(ownerId)

    for (const day of input.days) {
      if (!day.isClosed && day.openTime >= day.closeTime) {
        throw new AppError(
          400,
          `openTime must be before closeTime for day ${day.dayOfWeek}`,
          'INVALID_WORKING_HOURS'
        )
      }
    }

    const hours = await vendorsRepository.upsertWorkingHours(
      vendor.id,
      input.days
    )

    return hours.map(toWorkingHoursResponse)
  },

  async listServiceAreas(ownerId: string) {
    const vendor = await getOwnedVendor(ownerId)
    const areas = await vendorsRepository.listServiceAreas(vendor.id)
    return areas.map(toServiceAreaResponse)
  },

  async createServiceArea(ownerId: string, input: CreateServiceAreaInput) {
    const vendor = await getOwnedVendor(ownerId)
    const [area] = await vendorsRepository.createServiceArea(vendor.id, input)
    return toServiceAreaResponse(area)
  },

  async deleteServiceArea(ownerId: string, areaId: string) {
    const vendor = await getOwnedVendor(ownerId)
    const area = await vendorsRepository.findServiceAreaById(vendor.id, areaId)

    if (!area) {
      throw new AppError(
        404,
        'Service area not found',
        'SERVICE_AREA_NOT_FOUND'
      )
    }

    const [deleted] = await vendorsRepository.deleteServiceArea(
      vendor.id,
      areaId
    )

    return toServiceAreaResponse(deleted)
  },

  async createLogoUploadUrl(ownerId: string, input: LogoUploadUrlInput) {
    const vendor = await getOwnedVendor(ownerId)
    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType,
      'logo'
    )
    return { uploadUrl, publicUrl }
  },

  async setLogo(ownerId: string, input: SetLogoInput) {
    const vendor = await getOwnedVendor(ownerId)

    const storageKey = keyFromPublicUrl(input.url)
    if (!storageKey) {
      throw new AppError(400, 'Invalid logo URL', 'INVALID_LOGO_URL')
    }

    const previousKey = vendor.logoStorageKey

    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      logoUrl: input.url,
      logoStorageKey: storageKey,
    })

    // Remove the old logo object once the new one is saved.
    if (previousKey && previousKey !== storageKey) {
      await deleteObject(previousKey)
    }

    log.info({ vendorId: vendor.id }, 'vendor:logo-updated')
    return toVendorResponse(updated)
  },

  async deleteLogo(ownerId: string) {
    const vendor = await getOwnedVendor(ownerId)

    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      logoUrl: null,
      logoStorageKey: null,
    })

    const key = vendor.logoStorageKey ?? keyFromPublicUrl(vendor.logoUrl ?? '')
    if (key) {
      await deleteObject(key)
    }

    log.info({ vendorId: vendor.id }, 'vendor:logo-removed')
    return toVendorResponse(updated)
  },

  async listPhotos(ownerId: string) {
    const vendor = await getOwnedVendor(ownerId)
    const photos = await vendorsRepository.listPhotos(vendor.id)
    return photos.map(toPhotoResponse)
  },

  async createPhotoUploadUrl(ownerId: string, input: PhotoUploadUrlInput) {
    const vendor = await getOwnedVendor(ownerId)

    const [{ count }] = await vendorsRepository.countPhotos(vendor.id)
    if (count >= env.r2MaxPhotosPerVendor) {
      throw new AppError(
        409,
        `You can upload at most ${env.r2MaxPhotosPerVendor} photos`,
        'PHOTO_LIMIT_REACHED'
      )
    }

    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType
    )
    return { uploadUrl, publicUrl }
  },

  async addPhoto(ownerId: string, input: CreatePhotoInput) {
    const vendor = await getOwnedVendor(ownerId)

    // Only accept URLs that actually point at our bucket.
    const storageKey = keyFromPublicUrl(input.url)
    if (!storageKey) {
      throw new AppError(400, 'Invalid photo URL', 'INVALID_PHOTO_URL')
    }

    const [{ count }] = await vendorsRepository.countPhotos(vendor.id)
    if (count >= env.r2MaxPhotosPerVendor) {
      throw new AppError(
        409,
        `You can upload at most ${env.r2MaxPhotosPerVendor} photos`,
        'PHOTO_LIMIT_REACHED'
      )
    }

    const [{ maxOrder }] = await vendorsRepository.getNextPhotoSortOrder(
      vendor.id
    )
    const [created] = await vendorsRepository.createPhoto(vendor.id, {
      url: input.url,
      storageKey,
      sortOrder: maxOrder + 1,
    })

    log.info({ vendorId: vendor.id, photoId: created.id }, 'vendor:photo-added')
    return toPhotoResponse(created)
  },

  async reorderPhotos(ownerId: string, input: ReorderPhotosInput) {
    const vendor = await getOwnedVendor(ownerId)
    const existing = await vendorsRepository.listPhotos(vendor.id)
    const existingIds = new Set(existing.map((photo) => photo.id))

    for (const photo of input.photos) {
      if (!existingIds.has(photo.id)) {
        throw new AppError(404, 'Photo not found', 'PHOTO_NOT_FOUND')
      }
    }

    const photos = await vendorsRepository.updatePhotoSortOrders(
      vendor.id,
      input.photos
    )

    return photos.map(toPhotoResponse)
  },

  async deletePhoto(ownerId: string, photoId: string) {
    const vendor = await getOwnedVendor(ownerId)
    const photo = await vendorsRepository.findPhotoById(vendor.id, photoId)

    if (!photo) {
      throw new AppError(404, 'Photo not found', 'PHOTO_NOT_FOUND')
    }

    const [deleted] = await vendorsRepository.deletePhoto(vendor.id, photoId)

    // Best-effort remove the underlying object so storage doesn't leak.
    const key = deleted.storageKey ?? keyFromPublicUrl(deleted.url)
    if (key) {
      await deleteObject(key)
    }

    return toPhotoResponse(deleted)
  },

  async listPublicServices(vendorId: string) {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const services = await vendorsRepository.listServices(vendor.id, true)
    return services.map((service) => toServiceResponse(service))
  },

  async listMyServices(ownerId: string) {
    const vendor = await getOwnedVendor(ownerId)
    const services = await vendorsRepository.listServices(vendor.id)
    return services.map((service) => toServiceResponse(service))
  },

  async createService(ownerId: string, input: CreateServiceInput) {
    const vendor = await getOwnedVendor(ownerId)
    const pricing = resolveServicePricing(input)
    const [service] = await vendorsRepository.createService(vendor.id, {
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      ...pricing,
      durationMins: input.durationMins,
    })

    return toServiceResponse(service)
  },

  async updateService(
    ownerId: string,
    serviceId: string,
    input: UpdateServiceInput
  ) {
    const vendor = await getOwnedVendor(ownerId)
    const existing = await vendorsRepository.findServiceById(
      vendor.id,
      serviceId
    )

    if (!existing) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    // When the pricing type is provided we rewrite the whole pricing block
    // (type + base price + all tiers) so stale tier values can't linger after
    // switching, say, from per-vehicle to flat. Otherwise leave pricing as-is.
    const pricing =
      input.pricingType !== undefined
        ? resolveServicePricing({
            pricingType: input.pricingType,
            price: input.price,
            priceHatchback: input.priceHatchback,
            priceSedan: input.priceSedan,
            priceSuv: input.priceSuv,
          })
        : input.price !== undefined
          ? { price: input.price.toFixed(2) }
          : {}

    const [updated] = await vendorsRepository.updateService(
      vendor.id,
      serviceId,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...pricing,
        ...(input.durationMins !== undefined
          ? { durationMins: input.durationMins }
          : {}),
      }
    )

    return toServiceResponse(updated, existing.images)
  },

  async toggleServiceActive(
    ownerId: string,
    serviceId: string,
    input: ToggleServiceActiveInput
  ) {
    const vendor = await getOwnedVendor(ownerId)
    // findAnyServiceById, not findServiceById: activating/deactivating is
    // valid for a package too, and the packages list uses this same endpoint.
    const existing = await vendorsRepository.findAnyServiceById(
      vendor.id,
      serviceId
    )

    if (!existing) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    const [updated] = await vendorsRepository.updateService(
      vendor.id,
      serviceId,
      { isActive: input.isActive }
    )

    return toServiceResponse(updated, existing.images)
  },

  async deleteService(ownerId: string, serviceId: string) {
    const vendor = await getOwnedVendor(ownerId)
    const existing = await vendorsRepository.findServiceById(
      vendor.id,
      serviceId
    )

    if (!existing) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    // service_package_items holds a restrict FK on the member side, so this
    // delete would fail at the DB with an opaque constraint error. Check first
    // and name the packages, so the vendor knows what to edit.
    const containing = await vendorsRepository.findPackagesContaining(
      vendor.id,
      serviceId
    )

    if (containing.length > 0) {
      throw new AppError(
        409,
        `Remove this service from ${containing
          .map((p) => `"${p.name}"`)
          .join(', ')} before deleting it`,
        'SERVICE_IN_PACKAGE'
      )
    }

    const [deleted] = await vendorsRepository.deleteService(
      vendor.id,
      serviceId
    )

    // The rows cascade with the service; the objects behind them don't, so
    // clear them here or the bucket keeps paying for orphans.
    for (const image of existing.images) {
      const key = image.storageKey ?? keyFromPublicUrl(image.url)
      if (key) {
        await deleteObject(key)
      }
    }

    return toServiceResponse(deleted, existing.images)
  },

  // ─── Service images ────────────────────────────────────────────────────────
  //
  // Scoped by service, but resolved through findAnyServiceById so a package can
  // carry images too — a package is a services row, and its details popup wants
  // the same treatment. Each mutation returns the whole service so the client
  // can swap one object into its list rather than reconciling a sub-array.

  async createServiceImageUploadUrl(
    ownerId: string,
    serviceId: string,
    input: ServiceImageUploadUrlInput
  ) {
    const vendor = await getOwnedVendor(ownerId)
    const service = await vendorsRepository.findAnyServiceById(
      vendor.id,
      serviceId
    )

    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    const [{ count }] = await vendorsRepository.countServiceImages(serviceId)
    if (count >= env.r2MaxImagesPerService) {
      throw new AppError(
        409,
        `You can add at most ${env.r2MaxImagesPerService} images per service`,
        'SERVICE_IMAGE_LIMIT_REACHED'
      )
    }

    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType,
      `services/${serviceId}`
    )
    return { uploadUrl, publicUrl }
  },

  async addServiceImage(
    ownerId: string,
    serviceId: string,
    input: CreateServiceImageInput
  ) {
    const vendor = await getOwnedVendor(ownerId)
    const service = await vendorsRepository.findAnyServiceById(
      vendor.id,
      serviceId
    )

    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    // Only accept URLs that actually point at our bucket.
    const storageKey = keyFromPublicUrl(input.url)
    if (!storageKey) {
      throw new AppError(400, 'Invalid image URL', 'INVALID_SERVICE_IMAGE_URL')
    }

    // Re-check the cap here, not just at presign time: the presigned URL is
    // reusable within its TTL, so this is the check that actually holds.
    const [{ count }] = await vendorsRepository.countServiceImages(serviceId)
    if (count >= env.r2MaxImagesPerService) {
      throw new AppError(
        409,
        `You can add at most ${env.r2MaxImagesPerService} images per service`,
        'SERVICE_IMAGE_LIMIT_REACHED'
      )
    }

    const [{ maxOrder }] =
      await vendorsRepository.getNextServiceImageSortOrder(serviceId)
    const [created] = await vendorsRepository.createServiceImage(serviceId, {
      url: input.url,
      storageKey,
      sortOrder: maxOrder + 1,
    })

    log.info(
      { vendorId: vendor.id, serviceId, imageId: created.id },
      'service:image-added'
    )

    return readServiceOrPackage(vendor.id, serviceId)
  },

  async deleteServiceImage(
    ownerId: string,
    serviceId: string,
    imageId: string
  ) {
    const vendor = await getOwnedVendor(ownerId)
    const service = await vendorsRepository.findAnyServiceById(
      vendor.id,
      serviceId
    )

    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    const image = await vendorsRepository.findServiceImageById(
      serviceId,
      imageId
    )

    if (!image) {
      throw new AppError(404, 'Image not found', 'SERVICE_IMAGE_NOT_FOUND')
    }

    const [deleted] = await vendorsRepository.deleteServiceImage(
      serviceId,
      imageId
    )

    // Best-effort remove the underlying object so storage doesn't leak.
    const key = deleted.storageKey ?? keyFromPublicUrl(deleted.url)
    if (key) {
      await deleteObject(key)
    }

    return readServiceOrPackage(vendor.id, serviceId)
  },

  async listMyPackages(ownerId: string): Promise<PackageResponse[]> {
    const vendor = await getOwnedVendor(ownerId)
    const packages = await vendorsRepository.listPackages(vendor.id)
    return packages.map(toPackageResponse)
  },

  async listPublicPackages(vendorId: string): Promise<PackageResponse[]> {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const packages = await vendorsRepository.listPackages(vendor.id, true)
    return packages.map(toPackageResponse)
  },

  async createPackage(ownerId: string, input: CreatePackageInput) {
    const vendor = await getOwnedVendor(ownerId)
    await assertValidPackageMembers(vendor.id, input.serviceIds)

    const pricing = resolveServicePricing(input)
    const pkg = await vendorsRepository.createPackage(
      vendor.id,
      {
        name: input.name,
        description: input.description ?? null,
        ...pricing,
        durationMins: input.durationMins,
      },
      input.serviceIds
    )

    const created = await vendorsRepository.findPackageById(vendor.id, pkg.id)
    return toPackageResponse(created as PackageWithItems)
  },

  async updatePackage(
    ownerId: string,
    packageId: string,
    input: UpdatePackageInput
  ) {
    const vendor = await getOwnedVendor(ownerId)
    const existing = await vendorsRepository.findPackageById(
      vendor.id,
      packageId
    )

    if (!existing) {
      throw new AppError(404, 'Package not found', 'PACKAGE_NOT_FOUND')
    }

    if (input.serviceIds !== undefined) {
      await assertValidPackageMembers(vendor.id, input.serviceIds)
      await vendorsRepository.replacePackageItems(packageId, input.serviceIds)
    }

    // Same rule as updateService: providing a pricing type rewrites the whole
    // pricing block so stale tiers can't survive a type switch.
    const pricing =
      input.pricingType !== undefined
        ? resolveServicePricing({
            pricingType: input.pricingType,
            price: input.price,
            priceHatchback: input.priceHatchback,
            priceSedan: input.priceSedan,
            priceSuv: input.priceSuv,
          })
        : {}

    await vendorsRepository.updateService(vendor.id, packageId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...pricing,
      ...(input.durationMins !== undefined
        ? { durationMins: input.durationMins }
        : {}),
    })

    const updated = await vendorsRepository.findPackageById(
      vendor.id,
      packageId
    )
    return toPackageResponse(updated as PackageWithItems)
  },

  async deletePackage(ownerId: string, packageId: string) {
    const vendor = await getOwnedVendor(ownerId)
    const existing = await vendorsRepository.findPackageById(
      vendor.id,
      packageId
    )

    if (!existing) {
      throw new AppError(404, 'Package not found', 'PACKAGE_NOT_FOUND')
    }

    // Items cascade with the package row. Bookings hold a restrict FK on
    // services, so a package that has ever been booked can't be hard-deleted —
    // the vendor deactivates it instead, exactly like a plain service.
    const [deleted] = await vendorsRepository.deleteService(
      vendor.id,
      packageId
    )

    return toServiceResponse(deleted)
  },

  async getAvailableSlots(vendorId: string, query: SlotsQueryInput) {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const service = await vendorsRepository.findPublicService(
      vendor.id,
      query.service_id
    )

    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    const dayOfWeek = getDayOfWeekFromDate(query.date)
    const hours = await vendorsRepository.findWorkingHoursForDay(
      vendor.id,
      dayOfWeek
    )

    if (!hours || hours.isClosed) {
      return {
        date: query.date,
        serviceId: service.id,
        slotIntervalMins: vendor.slotIntervalMins,
        isClosed: true,
        slots: [] as string[],
      }
    }

    // Existing bookings are not consulted: capacity is unlimited, so every slot
    // within working hours is offered no matter how many bookings it already has.
    const slots = computeAvailableSlots({
      date: query.date,
      openTime: hours.openTime,
      closeTime: hours.closeTime,
      intervalMins: vendor.slotIntervalMins,
      isClosed: hours.isClosed,
      serviceDurationMins: service.durationMins,
    })

    log.debug({ vendorId: vendor.id, date: query.date, serviceId: service.id, count: slots.length }, 'slots:computed')

    return {
      date: query.date,
      serviceId: service.id,
      slotIntervalMins: vendor.slotIntervalMins,
      isClosed: false,
      slots,
    }
  },

  async getPublicWorkingHours(vendorId: string) {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const hours = await vendorsRepository.listWorkingHours(vendor.id)
    return hours.map(toWorkingHoursResponse)
  },
}
