import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import {
  computeAvailableSlots,
  getDayOfWeekFromDate,
  type BookedRange,
} from '../../lib/slots.js'
import {
  createPresignedUpload,
  deleteObject,
  keyFromPublicUrl,
} from '../../lib/storage.js'
import { vendorsRepository } from './vendors.repository.js'

const log = logger.child({ module: 'vendors' })
import type {
  PhotoRecord,
  ServiceAreaRecord,
  ServiceRecord,
  VendorRecord,
  WorkingHoursRecord,
} from './vendors.repository.js'
import type {
  CreatePhotoInput,
  CreateServiceAreaInput,
  CreateServiceInput,
  CreateVendorInput,
  ListPublicVendorsQuery,
  LogoUploadUrlInput,
  PhotoUploadUrlInput,
  ReorderPhotosInput,
  SetLogoInput,
  SetWorkingHoursInput,
  SlotsQueryInput,
  ToggleServiceActiveInput,
  UpdateJobTypesInput,
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

export type ServiceResponse = {
  id: string
  name: string
  description: string | null
  category: string
  price: string
  durationMins: number
  isActive: boolean
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

function toServiceResponse(service: ServiceRecord): ServiceResponse {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    category: service.category,
    price: service.price,
    durationMins: service.durationMins,
    isActive: service.isActive,
  }
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

    const categoryLabels: Record<string, string> = {
      car_wash: 'Car wash',
      detailing: 'Detailing',
      coating: 'Coating',
      scratch_removal: 'Scratch removal',
      others: 'Others',
    }

    return vendors
      .filter((vendor) => {
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
        return true
      })
      .map((vendor) => {
        const prices = vendor.services.map((service) => Number(service.price))
        const categories = [
          ...new Set(vendor.services.map((service) => service.category)),
        ]

        return {
          id: vendor.id,
          businessName: vendor.businessName,
          logoUrl: vendor.logoUrl,
          city: vendor.city,
          isVerified: vendor.isVerified,
          status: vendor.status,
          doorstepEnabled: vendor.doorstepEnabled,
          dropinEnabled: vendor.dropinEnabled,
          startingPrice:
            prices.length > 0 ? Math.min(...prices) : null,
          serviceTags: categories.map(
            (category) => categoryLabels[category] ?? category
          ),
          photos: vendor.photos.map((photo) => photo.url),
        }
      })
  },

  async getPublicVendor(vendorId: string): Promise<PublicVendorResponse> {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const [photos, services] = await Promise.all([
      vendorsRepository.listPhotos(vendor.id),
      vendorsRepository.listServices(vendor.id, true),
    ])

    const { ownerId: _ownerId, ...publicVendor } = toVendorResponse(vendor)

    return {
      ...publicVendor,
      photos: photos.map(toPhotoResponse),
      services: services.map(toServiceResponse),
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
    return services.map(toServiceResponse)
  },

  async listMyServices(ownerId: string) {
    const vendor = await getOwnedVendor(ownerId)
    const services = await vendorsRepository.listServices(vendor.id)
    return services.map(toServiceResponse)
  },

  async createService(ownerId: string, input: CreateServiceInput) {
    const vendor = await getOwnedVendor(ownerId)
    const [service] = await vendorsRepository.createService(vendor.id, {
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      price: input.price.toFixed(2),
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

    const [updated] = await vendorsRepository.updateService(
      vendor.id,
      serviceId,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.price !== undefined ? { price: input.price.toFixed(2) } : {}),
        ...(input.durationMins !== undefined
          ? { durationMins: input.durationMins }
          : {}),
      }
    )

    return toServiceResponse(updated)
  },

  async toggleServiceActive(
    ownerId: string,
    serviceId: string,
    input: ToggleServiceActiveInput
  ) {
    const vendor = await getOwnedVendor(ownerId)
    const existing = await vendorsRepository.findServiceById(
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

    return toServiceResponse(updated)
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

    const [deleted] = await vendorsRepository.deleteService(
      vendor.id,
      serviceId
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

    const dayBookings = await vendorsRepository.listBookingsForDate(
      vendor.id,
      query.date
    )

    const bookedRanges: BookedRange[] = dayBookings.map((booking) => {
      const durationMins = booking.service?.durationMins ?? service.durationMins
      const start = booking.scheduledAt
      const end = new Date(start.getTime() + durationMins * 60 * 1000)
      return { start, end }
    })

    const slots = computeAvailableSlots({
      date: query.date,
      openTime: hours.openTime,
      closeTime: hours.closeTime,
      intervalMins: vendor.slotIntervalMins,
      isClosed: hours.isClosed,
      serviceDurationMins: service.durationMins,
      bookedRanges,
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
