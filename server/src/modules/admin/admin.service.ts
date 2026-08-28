import { timingSafeEqual } from 'node:crypto'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { signAdminToken } from '../../lib/jwt.js'
import { logger } from '../../lib/logger.js'
import { resolveServicePricing } from '../../lib/pricing.js'
import {
  createPresignedUpload,
  deleteObject,
  keyFromPublicUrl,
} from '../../lib/storage.js'
import { membersRepository } from '../members/members.repository.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import { adminRepository } from './admin.repository.js'
import type {
  CreateVendorInput,
  ListBookingsQuery,
  LoginInput,
  MediaUrlInput,
  UpdateVendorInput,
  UploadUrlInput,
} from './admin.validation.js'

const log = logger.child({ module: 'admin' })

// Constant-time string compare to avoid leaking credential length/prefix via timing.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

async function assertVendor(vendorId: string) {
  const vendor = await adminRepository.findVendorById(vendorId)
  if (!vendor) {
    throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
  }
  return vendor
}

async function assertService(serviceId: string) {
  const service = await adminRepository.findServiceById(serviceId)
  if (!service) {
    throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
  }
  return service
}

// Only accept URLs that actually point at our bucket, so an admin can't
// register an arbitrary external image as vendor media.
function assertOwnBucketUrl(url: string, code: string): string {
  const storageKey = keyFromPublicUrl(url)
  if (!storageKey) {
    throw new AppError(400, 'Invalid image URL', code)
  }
  return storageKey
}

async function assertPhotoCapacity(vendorId: string) {
  const [{ count }] = await vendorsRepository.countPhotos(vendorId)
  if (count >= env.r2MaxPhotosPerVendor) {
    throw new AppError(
      409,
      `This garage can have at most ${env.r2MaxPhotosPerVendor} photos`,
      'PHOTO_LIMIT_REACHED'
    )
  }
}

async function assertServiceImageCapacity(serviceId: string) {
  const [{ count }] = await vendorsRepository.countServiceImages(serviceId)
  if (count >= env.r2MaxImagesPerService) {
    throw new AppError(
      409,
      `A service can have at most ${env.r2MaxImagesPerService} images`,
      'SERVICE_IMAGE_LIMIT_REACHED'
    )
  }
}

export const adminService = {
  async login(input: LoginInput): Promise<{ accessToken: string }> {
    const validUser = safeEqual(input.username, env.adminUsername)
    const validPass = safeEqual(input.password, env.adminPassword)

    if (!validUser || !validPass) {
      throw new AppError(401, 'Invalid username or password', 'INVALID_CREDENTIALS')
    }

    const accessToken = await signAdminToken()
    log.info('admin:login')
    return { accessToken }
  },

  async listVendors() {
    const vendors = await adminRepository.listVendors()
    // Flatten the active-services relation into a plain count for the list table.
    return vendors.map(({ services, ...vendor }) => ({
      ...vendor,
      serviceCount: services.length,
    }))
  },

  async getVendor(id: string) {
    const vendor = await adminRepository.findVendorDetailById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }
    return vendor
  },

  async updateVendor(id: string, input: UpdateVendorInput) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    // Owner name/phone live on the linked user row. Guard against moving the
    // owner phone onto a number that already belongs to another account.
    if (input.ownerPhone !== undefined || input.ownerName !== undefined) {
      if (input.ownerPhone !== undefined) {
        const existing = await adminRepository.findUserByPhone(input.ownerPhone)
        if (existing && existing.id !== vendor.ownerId) {
          throw new AppError(
            409,
            'Another account already uses this owner phone',
            'PHONE_IN_USE'
          )
        }
      }
      await adminRepository.updateUser(vendor.ownerId, {
        ...(input.ownerName !== undefined && { name: input.ownerName }),
        ...(input.ownerPhone !== undefined && { phone: input.ownerPhone }),
      })
    }

    // Only forward vendor-table columns that were actually provided. `null`
    // clears a nullable column; `undefined` leaves it untouched.
    const patch: Parameters<typeof adminRepository.updateVendor>[1] = {
      ...(input.businessName !== undefined && { businessName: input.businessName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.pincode !== undefined && { pincode: input.pincode }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.whatsapp !== undefined && { whatsapp: input.whatsapp }),
      ...(input.yearsInOperation !== undefined && {
        yearsInOperation: input.yearsInOperation,
      }),
      ...(input.mapsUrl !== undefined && { mapsUrl: input.mapsUrl }),
      ...(input.pickup !== undefined && { pickup: input.pickup }),
      ...(input.pickupRadiusKm !== undefined && {
        pickupRadiusKm: input.pickupRadiusKm,
      }),
      ...(input.dropinEnabled !== undefined && { dropinEnabled: input.dropinEnabled }),
      ...(input.doorstepEnabled !== undefined && {
        doorstepEnabled: input.doorstepEnabled,
      }),
      ...(input.slotIntervalMins !== undefined && {
        slotIntervalMins: input.slotIntervalMins,
      }),
      ...(input.bays !== undefined && { bays: input.bays }),
      ...(input.jobsPerDay !== undefined && { jobsPerDay: input.jobsPerDay }),
      ...(input.vehicleTypes !== undefined && { vehicleTypes: input.vehicleTypes }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.isVerified !== undefined && { isVerified: input.isVerified }),
    }

    const [updated] = Object.keys(patch).length
      ? await adminRepository.updateVendor(id, patch)
      : [vendor]

    // Rewrite the weekly schedule when the admin submitted working days.
    if (input.workingDays !== undefined) {
      await adminRepository.deleteWorkingHours(id)
      if (input.workingDays.length > 0) {
        const open = new Set(input.workingDays)
        const openTime = input.openTime ?? '09:00'
        const closeTime = input.closeTime ?? '18:00'
        await adminRepository.insertWorkingHours(
          Array.from({ length: 7 }, (_, dayOfWeek) => ({
            vendorId: id,
            dayOfWeek,
            openTime,
            closeTime,
            isClosed: !open.has(dayOfWeek),
          }))
        )
      }
    }

    // Reconcile the services list when provided. Rows with an `id` (that belong
    // to this vendor) are updated in place; rows without an `id` are inserted;
    // existing active services missing from the payload are soft-deleted. We
    // never hard-delete because bookings reference services with a restrict FK.
    if (input.services !== undefined) {
      const existingIds = new Set(
        await adminRepository.listActiveServiceIds(id)
      )
      const keptIds = new Set<string>()
      const toInsert: Parameters<typeof adminRepository.insertServices>[0] = []
      // Default duration for services left blank: one slot on this vendor.
      const defaultDuration = input.slotIntervalMins ?? vendor.slotIntervalMins

      for (const s of input.services) {
        const columns = {
          name: s.name,
          description: s.description ?? null,
          category: s.category,
          ...resolveServicePricing(s),
          durationMins: s.durationMins ?? defaultDuration,
        }
        if (s.id && existingIds.has(s.id)) {
          keptIds.add(s.id)
          await adminRepository.updateService(s.id, {
            ...columns,
            isActive: true,
          })
        } else {
          toInsert.push({
            vendorId: id,
            ...columns,
          })
        }
      }

      if (toInsert.length > 0) {
        await adminRepository.insertServices(toInsert)
      }

      const removedIds = [...existingIds].filter((sid) => !keptIds.has(sid))
      if (removedIds.length > 0) {
        await adminRepository.deactivateServices(removedIds)
      }
    }

    log.info({ vendorId: id }, 'admin:vendor-updated')
    return updated
  },

  async verifyVendor(id: string) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const [updated] = await adminRepository.verifyVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-verified')
    return updated
  },

  async archiveVendor(id: string) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const [updated] = await adminRepository.archiveVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-archived')
    return updated
  },

  async unarchiveVendor(id: string) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const [updated] = await adminRepository.unarchiveVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-unarchived')
    return updated
  },

  async deleteVendor(id: string) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    await adminRepository.deleteVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-deleted')
  },

  async createVendor(input: CreateVendorInput) {
    // Resolve (or create) the owner user for this vendor.
    let owner = await adminRepository.findUserByPhone(input.ownerPhone)

    if (owner) {
      if (!owner.isVendorOwner) {
        ;[owner] = await adminRepository.setUserAsVendorOwner(owner.id)
      }
      const existingVendor = await adminRepository.findVendorByOwnerId(owner.id)
      if (existingVendor) {
        throw new AppError(
          409,
          'A vendor profile already exists for this owner',
          'VENDOR_ALREADY_EXISTS'
        )
      }
    } else {
      ;[owner] = await adminRepository.createOwner({
        name: input.ownerName,
        phone: input.ownerPhone,
      })
    }

    const [vendor] = await adminRepository.createVendor({
      ownerId: owner.id,
      businessName: input.businessName,
      phone: input.phone,
      address: input.address,
      city: input.city,
      pincode: input.pincode,
      email: input.email ?? null,
      whatsapp: input.whatsapp ?? null,
      yearsInOperation: input.yearsInOperation ?? null,
      mapsUrl: input.mapsUrl ?? null,
      pickup: input.pickup ?? null,
      pickupRadiusKm: input.pickupRadiusKm ?? null,
      ...(input.dropinEnabled !== undefined && { dropinEnabled: input.dropinEnabled }),
      ...(input.doorstepEnabled !== undefined && { doorstepEnabled: input.doorstepEnabled }),
      ...(input.slotIntervalMins !== undefined && { slotIntervalMins: input.slotIntervalMins }),
      bays: input.bays ?? null,
      jobsPerDay: input.jobsPerDay ?? null,
      ...(input.vehicleTypes !== undefined && { vehicleTypes: input.vehicleTypes }),
      notes: input.notes ?? null,
      ...(input.status !== undefined && { status: input.status }),
      ...(input.isVerified !== undefined && { isVerified: input.isVerified }),
    })

    // The owner's seat. Same write as the self-serve path — both company-create
    // paths dual-write, so no company is ever left with zero members.
    await membersRepository.createOwnerMembership(vendor.id, owner.id)

    // Working hours: open on the selected days, closed on the rest. Only written
    // when the admin picked days, so a bare vendor keeps the defaults (none).
    if (input.workingDays && input.workingDays.length > 0) {
      const open = new Set(input.workingDays)
      const openTime = input.openTime ?? '09:00'
      const closeTime = input.closeTime ?? '18:00'
      await adminRepository.insertWorkingHours(
        Array.from({ length: 7 }, (_, dayOfWeek) => ({
          vendorId: vendor.id,
          dayOfWeek,
          openTime,
          closeTime,
          isClosed: !open.has(dayOfWeek),
        }))
      )
    }

    if (input.services && input.services.length > 0) {
      await adminRepository.insertServices(
        input.services.map((s) => ({
          vendorId: vendor.id,
          name: s.name,
          description: s.description ?? null,
          category: s.category,
          // Resolve pricing type + tiers into the columns to persist.
          ...resolveServicePricing(s),
          // Fall back to one slot when no explicit duration was given.
          durationMins: s.durationMins ?? vendor.slotIntervalMins,
        }))
      )
    }

    log.info({ vendorId: vendor.id, ownerId: owner.id }, 'admin:vendor-created')
    return vendor
  },

  async listBookings(query: ListBookingsQuery) {
    return adminRepository.listBookings(query.status)
  },

  // ─── Media ─────────────────────────────────────────────────────────────────
  //
  // The same logo / gallery / service-image capabilities the vendor panel has,
  // reachable by an admin on any vendor's behalf. The vendor module owns the
  // storage-backed queries, so these reuse vendorsRepository rather than
  // restating them; what differs is only how the caller is authorized — an
  // admin names the vendor, an owner is resolved from their token.

  async createVendorLogoUploadUrl(vendorId: string, input: UploadUrlInput) {
    const vendor = await assertVendor(vendorId)
    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType,
      'logo'
    )
    return { uploadUrl, publicUrl }
  },

  async setVendorLogo(vendorId: string, input: MediaUrlInput) {
    const vendor = await assertVendor(vendorId)

    const storageKey = assertOwnBucketUrl(input.url, 'INVALID_LOGO_URL')
    const previousKey = vendor.logoStorageKey

    const [updated] = await adminRepository.updateVendor(vendor.id, {
      logoUrl: input.url,
      logoStorageKey: storageKey,
    })

    if (previousKey && previousKey !== storageKey) {
      await deleteObject(previousKey)
    }

    log.info({ vendorId: vendor.id }, 'admin:vendor-logo-updated')
    return updated
  },

  async deleteVendorLogo(vendorId: string) {
    const vendor = await assertVendor(vendorId)

    const [updated] = await adminRepository.updateVendor(vendor.id, {
      logoUrl: null,
      logoStorageKey: null,
    })

    const key = vendor.logoStorageKey ?? keyFromPublicUrl(vendor.logoUrl ?? '')
    if (key) {
      await deleteObject(key)
    }

    log.info({ vendorId: vendor.id }, 'admin:vendor-logo-removed')
    return updated
  },

  async createVendorPhotoUploadUrl(vendorId: string, input: UploadUrlInput) {
    const vendor = await assertVendor(vendorId)
    await assertPhotoCapacity(vendor.id)

    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType
    )
    return { uploadUrl, publicUrl }
  },

  async addVendorPhoto(vendorId: string, input: MediaUrlInput) {
    const vendor = await assertVendor(vendorId)
    const storageKey = assertOwnBucketUrl(input.url, 'INVALID_PHOTO_URL')

    // Re-checked after the presign: that URL stays usable for its whole TTL,
    // so this is the check that actually holds the cap.
    await assertPhotoCapacity(vendor.id)

    const [{ maxOrder }] = await vendorsRepository.getNextPhotoSortOrder(
      vendor.id
    )
    const [created] = await vendorsRepository.createPhoto(vendor.id, {
      url: input.url,
      storageKey,
      sortOrder: maxOrder + 1,
    })

    log.info(
      { vendorId: vendor.id, photoId: created.id },
      'admin:vendor-photo-added'
    )
    return created
  },

  async deleteVendorPhoto(vendorId: string, photoId: string) {
    const vendor = await assertVendor(vendorId)
    const photo = await vendorsRepository.findPhotoById(vendor.id, photoId)

    if (!photo) {
      throw new AppError(404, 'Photo not found', 'PHOTO_NOT_FOUND')
    }

    const [deleted] = await vendorsRepository.deletePhoto(vendor.id, photoId)

    const key = deleted.storageKey ?? keyFromPublicUrl(deleted.url)
    if (key) {
      await deleteObject(key)
    }

    return deleted
  },

  async createServiceImageUploadUrl(serviceId: string, input: UploadUrlInput) {
    const service = await assertService(serviceId)
    await assertServiceImageCapacity(service.id)

    // Keyed under the owning vendor, so a service's images sit beside the rest
    // of that vendor's objects regardless of who uploaded them.
    const { uploadUrl, publicUrl } = await createPresignedUpload(
      service.vendorId,
      input.contentType,
      `services/${service.id}`
    )
    return { uploadUrl, publicUrl }
  },

  async addServiceImage(serviceId: string, input: MediaUrlInput) {
    const service = await assertService(serviceId)
    const storageKey = assertOwnBucketUrl(
      input.url,
      'INVALID_SERVICE_IMAGE_URL'
    )

    await assertServiceImageCapacity(service.id)

    const [{ maxOrder }] =
      await vendorsRepository.getNextServiceImageSortOrder(service.id)
    await vendorsRepository.createServiceImage(service.id, {
      url: input.url,
      storageKey,
      sortOrder: maxOrder + 1,
    })

    log.info(
      { vendorId: service.vendorId, serviceId },
      'admin:service-image-added'
    )
    return vendorsRepository.listServiceImages(service.id)
  },

  async deleteServiceImage(serviceId: string, imageId: string) {
    const service = await assertService(serviceId)
    const image = await vendorsRepository.findServiceImageById(
      service.id,
      imageId
    )

    if (!image) {
      throw new AppError(404, 'Image not found', 'SERVICE_IMAGE_NOT_FOUND')
    }

    const [deleted] = await vendorsRepository.deleteServiceImage(
      service.id,
      imageId
    )

    const key = deleted.storageKey ?? keyFromPublicUrl(deleted.url)
    if (key) {
      await deleteObject(key)
    }

    return vendorsRepository.listServiceImages(service.id)
  },
}
