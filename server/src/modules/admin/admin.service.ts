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

/**
 * A garage with no coordinates cannot be distance-sorted, cannot be found by a
 * customer browsing nearby, and cannot have its doorstep radius checked.
 *
 * Public listings already require `is_verified`, so refusing to verify without
 * a pin is what keeps pin-less garages out of customer-facing results — with no
 * special case in the listing query and no "location not set" tail to design.
 * The invariant is enforced at the one gate a human already stands at.
 */
function assertPinnedBeforeVerifying(vendor: {
  lat: number | null
  lng: number | null
}) {
  // Off by default while the pre-map-picker backlog is still unpinned — see
  // env.geoRequirePin. Verifying without a pin is survivable now that the
  // listing appends unlocated garages after the located ones; what it costs
  // them is distance sorting and doorstep coverage, not visibility.
  if (!env.geoRequirePin) return

  if (vendor.lat === null || vendor.lng === null) {
    throw new AppError(
      422,
      'Set the garage location on the map before verifying',
      'VENDOR_LOCATION_REQUIRED'
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

    // Flipping isVerified through the general update has the same requirement
    // as the dedicated verify endpoint, and must check against the pin the row
    // will have *after* this patch — an admin can legitimately set the
    // coordinates and verify in one submit.
    if (input.isVerified) {
      assertPinnedBeforeVerifying({
        lat: input.lat ?? vendor.lat,
        lng: input.lng ?? vendor.lng,
      })
    }

    const pinMoved =
      input.lat !== undefined &&
      input.lng !== undefined &&
      (input.lat !== vendor.lat || input.lng !== vendor.lng)

    if (input.confirmLocation === true && !pinMoved && vendor.lat === null) {
      throw new AppError(
        422,
        'Set the garage location before confirming it',
        'VENDOR_LOCATION_REQUIRED'
      )
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
      ...(input.doorstepRadiusKm !== undefined && {
        doorstepRadiusKm: input.doorstepRadiusKm,
      }),
      // Staff placing a pin by hand is its own provenance, and it supersedes
      // whatever the vendor originally set. Moving it also counts as confirming
      // it — an admin who just dragged a marker onto a garage has done exactly
      // the checking that `geoConfirmedAt` records.
      //
      // Compared against the stored value rather than merely being present: the
      // edit form round-trips the current coordinates on every save, so keying
      // off presence alone would let someone confirm a pin by editing a phone
      // number.
      ...(pinMoved && {
        lat: input.lat,
        lng: input.lng,
        geoSource: 'admin' as const,
        geoConfirmedAt: new Date(),
      }),
      // An explicit "this pin is already right" from the admin screen, for the
      // common case where nothing needs moving. Without it there was no way to
      // confirm a pin at all once a vendor was verified — `verifyVendor` was the
      // only writer, and it cannot run twice.
      ...(input.confirmLocation === true && { geoConfirmedAt: new Date() }),
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

  /**
   * Where demand outruns supply.
   *
   * Each cell reports how many live garages and how many doorstep bookings it
   * contains. `gap` is the ops signal: bookings with no garage in the cell means
   * customers are being served from further away than they should be, which is
   * where the next garage is worth recruiting.
   */
  async getDemandSupply() {
    const cells = await adminRepository.getDemandSupplyCells()

    return cells.map((cell) => ({
      ...cell,
      // Positive when a cell has demand it cannot serve locally. Kept as a raw
      // difference rather than a ratio so a cell with 3 bookings and 0 garages
      // is not indistinguishable from one with 30 and 0.
      gap: cell.bookingCount - cell.vendorCount,
    }))
  },

  async verifyVendor(id: string) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    assertPinnedBeforeVerifying(vendor)

    // Verifying is the moment a human looked at this garage, so it is also the
    // moment its pin becomes confirmed.
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

    if (input.isVerified) {
      assertPinnedBeforeVerifying({
        lat: input.lat ?? null,
        lng: input.lng ?? null,
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
      doorstepRadiusKm: input.doorstepRadiusKm ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      ...(input.lat !== undefined && { geoSource: 'admin' as const }),
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
