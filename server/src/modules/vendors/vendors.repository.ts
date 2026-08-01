import { and, asc, eq, gte, lt, ne, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookings,
  services,
  users,
  vendorPhotos,
  vendors,
  vendorServiceAreas,
  vendorWorkingHours,
} from '../../db/schema.js'
import type { serviceCategoryEnum } from '../../db/schema.js'

type ServiceCategory = (typeof serviceCategoryEnum.enumValues)[number]

export type VendorRecord = typeof vendors.$inferSelect
export type VendorInsert = typeof vendors.$inferInsert
export type VendorUpdate = Partial<Omit<VendorInsert, 'id' | 'ownerId' | 'createdAt'>>
export type WorkingHoursRecord = typeof vendorWorkingHours.$inferSelect
export type ServiceAreaRecord = typeof vendorServiceAreas.$inferSelect
export type PhotoRecord = typeof vendorPhotos.$inferSelect
export type ServiceRecord = typeof services.$inferSelect
export type BookingRecord = typeof bookings.$inferSelect

function normalizeTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time
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

  listServices(vendorId: string, activeOnly = false) {
    return db.query.services.findMany({
      where: activeOnly
        ? and(eq(services.vendorId, vendorId), eq(services.isActive, true))
        : eq(services.vendorId, vendorId),
      orderBy: [asc(services.name)],
    })
  },

  findServiceById(vendorId: string, serviceId: string) {
    return db.query.services.findFirst({
      where: and(eq(services.id, serviceId), eq(services.vendorId, vendorId)),
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
      price: string
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
        price: data.price,
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
      price: string
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

  listBookingsForDate(vendorId: string, date: string) {
    const dayStart = new Date(`${date}T00:00:00.000Z`)
    const dayEnd = new Date(`${date}T23:59:59.999Z`)

    return db.query.bookings.findMany({
      where: and(
        eq(bookings.vendorId, vendorId),
        gte(bookings.scheduledAt, dayStart),
        lt(bookings.scheduledAt, dayEnd),
        ne(bookings.status, 'cancelled')
      ),
      with: {
        service: true,
      },
    })
  },
}
