import { and, asc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookings,
  reviews,
  serviceImages,
  servicePackageItems,
  services,
  users,
  vendorPhotos,
  vendors,
  vendorServiceAreas,
  vendorWorkingHours,
} from '../../db/schema.js'
import type {
  serviceCategoryEnum,
  servicePricingTypeEnum,
} from '../../db/schema.js'

type ServiceCategory = (typeof serviceCategoryEnum.enumValues)[number]
type ServicePricingType = (typeof servicePricingTypeEnum.enumValues)[number]

export type VendorRecord = typeof vendors.$inferSelect
export type VendorInsert = typeof vendors.$inferInsert
export type VendorUpdate = Partial<Omit<VendorInsert, 'id' | 'ownerId' | 'createdAt'>>
export type WorkingHoursRecord = typeof vendorWorkingHours.$inferSelect
export type ServiceAreaRecord = typeof vendorServiceAreas.$inferSelect
export type PhotoRecord = typeof vendorPhotos.$inferSelect
export type ServiceRecord = typeof services.$inferSelect
export type ServiceImageRecord = typeof serviceImages.$inferSelect
export type ServiceWithImages = ServiceRecord & { images: ServiceImageRecord[] }
export type BookingRecord = typeof bookings.$inferSelect

function normalizeTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time
}

// Images ride along with every service read, so the garage page never needs a
// second round trip to fill the details popup.
const withImages = {
  images: {
    orderBy: [asc(serviceImages.sortOrder), asc(serviceImages.createdAt)],
  },
}

export const vendorsRepository = {
  findVendorById(id: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.id, id),
    })
  },

  findVendorByOwnerId(ownerId: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.ownerId, ownerId),
    })
  },

  findPublicVendorById(id: string) {
    return db.query.vendors.findFirst({
      where: and(
        eq(vendors.id, id),
        eq(vendors.status, 'active'),
        eq(vendors.isVerified, true)
      ),
    })
  },

  listPublicVendors() {
    return db.query.vendors.findMany({
      where: and(
        eq(vendors.status, 'active'),
        eq(vendors.isVerified, true)
      ),
      with: {
        photos: {
          orderBy: [asc(vendorPhotos.sortOrder)],
        },
        services: {
          where: eq(services.isActive, true),
        },
        serviceAreas: true,
      },
      orderBy: [asc(vendors.businessName)],
    })
  },

  createVendor(data: VendorInsert) {
    return db.insert(vendors).values(data).returning()
  },

  updateVendor(vendorId: string, data: VendorUpdate) {
    return db
      .update(vendors)
      .set(data)
      .where(eq(vendors.id, vendorId))
      .returning()
  },

  setUserAsVendorOwner(userId: string) {
    return db
      .update(users)
      .set({ isVendorOwner: true })
      .where(eq(users.id, userId))
      .returning()
  },

  listWorkingHours(vendorId: string) {
    return db.query.vendorWorkingHours.findMany({
      where: eq(vendorWorkingHours.vendorId, vendorId),
      orderBy: [asc(vendorWorkingHours.dayOfWeek)],
    })
  },

  /**
   * Average rating and review count per vendor, for the listing cards and the
   * "Top Rated" sort. One grouped query for the whole page rather than one per
   * vendor. Vendors with no reviews are simply absent from the result — callers
   * treat a missing entry as "not yet rated", which is not the same as zero.
   */
  async getRatingAggregates(vendorIds: string[]) {
    if (vendorIds.length === 0) return []

    return db
      .select({
        vendorId: reviews.vendorId,
        average: sql<number>`avg(${reviews.rating})::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(inArray(reviews.vendorId, vendorIds))
      .groupBy(reviews.vendorId)
  },

  findWorkingHoursForDay(vendorId: string, dayOfWeek: number) {
    return db.query.vendorWorkingHours.findFirst({
      where: and(
        eq(vendorWorkingHours.vendorId, vendorId),
        eq(vendorWorkingHours.dayOfWeek, dayOfWeek)
      ),
    })
  },

  upsertWorkingHours(
    vendorId: string,
    days: Array<{
      dayOfWeek: number
      openTime: string
      closeTime: string
      isClosed: boolean
    }>
  ) {
    return db.transaction(async (tx) => {
      const results: WorkingHoursRecord[] = []

      for (const day of days) {
        const [row] = await tx
          .insert(vendorWorkingHours)
          .values({
            vendorId,
            dayOfWeek: day.dayOfWeek,
            openTime: normalizeTime(day.openTime),
            closeTime: normalizeTime(day.closeTime),
            isClosed: day.isClosed,
          })
          .onConflictDoUpdate({
            target: [vendorWorkingHours.vendorId, vendorWorkingHours.dayOfWeek],
            set: {
              openTime: normalizeTime(day.openTime),
              closeTime: normalizeTime(day.closeTime),
              isClosed: day.isClosed,
            },
          })
          .returning()

        results.push(row)
      }

      return results.sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    })
  },

  listServiceAreas(vendorId: string) {
    return db.query.vendorServiceAreas.findMany({
      where: eq(vendorServiceAreas.vendorId, vendorId),
      orderBy: [asc(vendorServiceAreas.areaName)],
    })
  },

  createServiceArea(
    vendorId: string,
    data: { areaName: string; pincode: string; radiusKm?: number | null }
  ) {
    return db
      .insert(vendorServiceAreas)
      .values({
        vendorId,
        areaName: data.areaName,
        pincode: data.pincode,
        radiusKm: data.radiusKm ?? null,
      })
      .returning()
  },

  findServiceAreaById(vendorId: string, areaId: string) {
    return db.query.vendorServiceAreas.findFirst({
      where: and(
        eq(vendorServiceAreas.id, areaId),
        eq(vendorServiceAreas.vendorId, vendorId)
      ),
    })
  },

  deleteServiceArea(vendorId: string, areaId: string) {
    return db
      .delete(vendorServiceAreas)
      .where(
        and(
          eq(vendorServiceAreas.id, areaId),
          eq(vendorServiceAreas.vendorId, vendorId)
        )
      )
      .returning()
  },

  listPhotos(vendorId: string) {
    return db.query.vendorPhotos.findMany({
      where: eq(vendorPhotos.vendorId, vendorId),
      orderBy: [asc(vendorPhotos.sortOrder), asc(vendorPhotos.createdAt)],
    })
  },

  getNextPhotoSortOrder(vendorId: string) {
    return db
      .select({
        maxOrder: sql<number>`coalesce(max(${vendorPhotos.sortOrder}), -1)`,
      })
      .from(vendorPhotos)
      .where(eq(vendorPhotos.vendorId, vendorId))
  },

  createPhoto(
    vendorId: string,
    data: { url: string; sortOrder: number; storageKey?: string | null }
  ) {
    return db
      .insert(vendorPhotos)
      .values({
        vendorId,
        url: data.url,
        storageKey: data.storageKey ?? null,
        sortOrder: data.sortOrder,
      })
      .returning()
  },

  countPhotos(vendorId: string) {
    return db
      .select({ count: sql<number>`count(*)::int` })
      .from(vendorPhotos)
      .where(eq(vendorPhotos.vendorId, vendorId))
  },

  findPhotoById(vendorId: string, photoId: string) {
    return db.query.vendorPhotos.findFirst({
      where: and(
        eq(vendorPhotos.id, photoId),
        eq(vendorPhotos.vendorId, vendorId)
      ),
    })
  },

  deletePhoto(vendorId: string, photoId: string) {
    return db
      .delete(vendorPhotos)
      .where(
        and(eq(vendorPhotos.id, photoId), eq(vendorPhotos.vendorId, vendorId))
      )
      .returning()
  },

  updatePhotoSortOrders(
    vendorId: string,
    updates: Array<{ id: string; sortOrder: number }>
  ) {
    return db.transaction(async (tx) => {
      const results: PhotoRecord[] = []

      for (const update of updates) {
        const [row] = await tx
          .update(vendorPhotos)
          .set({ sortOrder: update.sortOrder })
          .where(
            and(
              eq(vendorPhotos.id, update.id),
              eq(vendorPhotos.vendorId, vendorId)
            )
          )
          .returning()

        if (row) {
          results.push(row)
        }
      }

      return results.sort((a, b) => a.sortOrder - b.sortOrder)
    })
  },

  // Plain services only. Packages live in the same table but are listed via
  // listPackages — a caller that means "the vendor's services" must never get
  // packages mixed in, or the garage page renders a bundle as a line item and
  // the admin service count double-counts.
  listServices(vendorId: string, activeOnly = false) {
    return db.query.services.findMany({
      where: and(
        eq(services.vendorId, vendorId),
        ne(services.category, 'package'),
        ...(activeOnly ? [eq(services.isActive, true)] : [])
      ),
      orderBy: [asc(services.name)],
      with: withImages,
    })
  },

  listPackages(vendorId: string, activeOnly = false) {
    return db.query.services.findMany({
      where: and(
        eq(services.vendorId, vendorId),
        eq(services.category, 'package'),
        ...(activeOnly ? [eq(services.isActive, true)] : [])
      ),
      orderBy: [asc(services.name)],
      with: {
        ...withImages,
        packageItems: {
          orderBy: [asc(servicePackageItems.sortOrder)],
          with: { service: true },
        },
      },
    })
  },

  findPackageById(vendorId: string, packageId: string) {
    return db.query.services.findFirst({
      where: and(
        eq(services.id, packageId),
        eq(services.vendorId, vendorId),
        eq(services.category, 'package')
      ),
      with: {
        ...withImages,
        packageItems: {
          orderBy: [asc(servicePackageItems.sortOrder)],
          with: { service: true },
        },
      },
    })
  },

  // Members a vendor is allowed to bundle: their own, active, non-package
  // services. Used to validate serviceIds before writing the composition.
  findEligiblePackageMembers(vendorId: string, serviceIds: string[]) {
    if (serviceIds.length === 0) return Promise.resolve([])

    return db.query.services.findMany({
      where: and(
        eq(services.vendorId, vendorId),
        inArray(services.id, serviceIds),
        ne(services.category, 'package'),
        eq(services.isActive, true)
      ),
    })
  },

  // Packages that contain this service — non-empty means deactivating or
  // deleting the service would leave those packages misrepresenting contents.
  findPackagesContaining(vendorId: string, serviceId: string) {
    return db
      .select({ id: services.id, name: services.name })
      .from(servicePackageItems)
      .innerJoin(services, eq(servicePackageItems.packageId, services.id))
      .where(
        and(
          eq(servicePackageItems.serviceId, serviceId),
          eq(services.vendorId, vendorId)
        )
      )
  },

  // Create the package row and its composition atomically, so a failure part
  // way through can never leave a package with no contents.
  createPackage(
    vendorId: string,
    data: {
      name: string
      description?: string | null
      pricingType: ServicePricingType
      price: string
      priceHatchback?: string | null
      priceSedan?: string | null
      priceSuv?: string | null
      durationMins: number
    },
    serviceIds: string[]
  ) {
    return db.transaction(async (tx) => {
      const [pkg] = await tx
        .insert(services)
        .values({
          vendorId,
          name: data.name,
          description: data.description ?? null,
          category: 'package',
          pricingType: data.pricingType,
          price: data.price,
          priceHatchback: data.priceHatchback ?? null,
          priceSedan: data.priceSedan ?? null,
          priceSuv: data.priceSuv ?? null,
          durationMins: data.durationMins,
        })
        .returning()

      await tx.insert(servicePackageItems).values(
        serviceIds.map((serviceId, index) => ({
          packageId: pkg.id,
          serviceId,
          sortOrder: index,
        }))
      )

      return pkg
    })
  },

  replacePackageItems(packageId: string, serviceIds: string[]) {
    return db.transaction(async (tx) => {
      await tx
        .delete(servicePackageItems)
        .where(eq(servicePackageItems.packageId, packageId))

      await tx.insert(servicePackageItems).values(
        serviceIds.map((serviceId, index) => ({
          packageId,
          serviceId,
          sortOrder: index,
        }))
      )
    })
  },

  // Plain services only — the package endpoints use findPackageById, so a
  // package can't be reshaped through the generic service update/delete path
  // (which has no way to keep its composition coherent).
  findServiceById(vendorId: string, serviceId: string) {
    return db.query.services.findFirst({
      where: and(
        eq(services.id, serviceId),
        eq(services.vendorId, vendorId),
        ne(services.category, 'package')
      ),
      with: withImages,
    })
  },

  // Either kind. Used by the shared active-toggle and the image endpoints,
  // which are valid for both.
  findAnyServiceById(vendorId: string, serviceId: string) {
    return db.query.services.findFirst({
      where: and(eq(services.id, serviceId), eq(services.vendorId, vendorId)),
      with: withImages,
    })
  },

  findPublicService(vendorId: string, serviceId: string) {
    return db.query.services.findFirst({
      where: and(
        eq(services.id, serviceId),
        eq(services.vendorId, vendorId),
        eq(services.isActive, true)
      ),
    })
  },

  createService(
    vendorId: string,
    data: {
      name: string
      description?: string | null
      category: ServiceCategory
      pricingType: ServicePricingType
      price: string
      priceHatchback?: string | null
      priceSedan?: string | null
      priceSuv?: string | null
      durationMins: number
    }
  ) {
    return db
      .insert(services)
      .values({
        vendorId,
        name: data.name,
        description: data.description ?? null,
        category: data.category,
        pricingType: data.pricingType,
        price: data.price,
        priceHatchback: data.priceHatchback ?? null,
        priceSedan: data.priceSedan ?? null,
        priceSuv: data.priceSuv ?? null,
        durationMins: data.durationMins,
      })
      .returning()
  },

  updateService(
    vendorId: string,
    serviceId: string,
    data: Partial<{
      name: string
      description: string | null
      category: ServiceCategory
      pricingType: ServicePricingType
      price: string
      priceHatchback: string | null
      priceSedan: string | null
      priceSuv: string | null
      durationMins: number
      isActive: boolean
    }>
  ) {
    return db
      .update(services)
      .set(data)
      .where(and(eq(services.id, serviceId), eq(services.vendorId, vendorId)))
      .returning()
  },

  deleteService(vendorId: string, serviceId: string) {
    return db
      .delete(services)
      .where(and(eq(services.id, serviceId), eq(services.vendorId, vendorId)))
      .returning()
  },

  listServiceImages(serviceId: string) {
    return db.query.serviceImages.findMany({
      where: eq(serviceImages.serviceId, serviceId),
      orderBy: [asc(serviceImages.sortOrder), asc(serviceImages.createdAt)],
    })
  },

  countServiceImages(serviceId: string) {
    return db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceImages)
      .where(eq(serviceImages.serviceId, serviceId))
  },

  getNextServiceImageSortOrder(serviceId: string) {
    return db
      .select({
        maxOrder: sql<number>`coalesce(max(${serviceImages.sortOrder}), -1)`,
      })
      .from(serviceImages)
      .where(eq(serviceImages.serviceId, serviceId))
  },

  createServiceImage(
    serviceId: string,
    data: { url: string; sortOrder: number; storageKey?: string | null }
  ) {
    return db
      .insert(serviceImages)
      .values({
        serviceId,
        url: data.url,
        storageKey: data.storageKey ?? null,
        sortOrder: data.sortOrder,
      })
      .returning()
  },

  findServiceImageById(serviceId: string, imageId: string) {
    return db.query.serviceImages.findFirst({
      where: and(
        eq(serviceImages.id, imageId),
        eq(serviceImages.serviceId, serviceId)
      ),
    })
  },

  deleteServiceImage(serviceId: string, imageId: string) {
    return db
      .delete(serviceImages)
      .where(
        and(
          eq(serviceImages.id, imageId),
          eq(serviceImages.serviceId, serviceId)
        )
      )
      .returning()
  },
}
