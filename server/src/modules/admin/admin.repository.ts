import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookings,
  bookingStatusEnum,
  serviceImages,
  services,
  users,
  vendorPhotos,
  vendors,
  vendorWorkingHours,
} from '../../db/schema.js'

type WorkingHoursInsert = typeof vendorWorkingHours.$inferInsert
type ServiceInsert = typeof services.$inferInsert

export type VendorInsert = typeof vendors.$inferInsert
export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number]

export const adminRepository = {
  listVendors() {
    return db.query.vendors.findMany({
      with: {
        owner: true,
        // Only ids of active services — the service layer derives a count.
        // Packages share this table, so they are excluded to keep the count a
        // count of services.
        services: {
          columns: { id: true },
          where: and(eq(services.isActive, true), ne(services.category, 'package')),
        },
      },
      orderBy: [desc(vendors.createdAt)],
    })
  },

  findVendorById(id: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.id, id),
    })
  },

  // Full detail for the admin edit screen: owner + weekly working hours +
  // active services (soft-deleted ones are hidden from the editor) + the media
  // the admin can manage — gallery photos and each service's own images.
  findVendorDetailById(id: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.id, id),
      with: {
        owner: true,
        workingHours: true,
        photos: {
          orderBy: [asc(vendorPhotos.sortOrder), asc(vendorPhotos.createdAt)],
        },
        services: {
          where: and(eq(services.isActive, true), ne(services.category, 'package')),
          orderBy: [asc(services.name)],
          with: {
            images: {
              orderBy: [
                asc(serviceImages.sortOrder),
                asc(serviceImages.createdAt),
              ],
            },
          },
        },
      },
    })
  },

  // Any service (including a package) by id alone — the admin media routes are
  // keyed by service, and need the row to resolve which vendor's R2 prefix the
  // upload belongs under.
  findServiceById(id: string) {
    return db.query.services.findFirst({
      where: eq(services.id, id),
      with: {
        images: {
          orderBy: [asc(serviceImages.sortOrder), asc(serviceImages.createdAt)],
        },
      },
    })
  },

  updateVendor(id: string, data: Partial<VendorInsert>) {
    return db.update(vendors).set(data).where(eq(vendors.id, id)).returning()
  },

  /**
   * Supply-vs-demand by geographic cell, for the ops view.
   *
   * Buckets both garages and doorstep booking locations onto a grid and reports
   * where they disagree — cells with customers ordering doorstep work but no
   * garage nearby are where the next garage should be recruited.
   *
   * The grid is plain coordinate rounding rather than H3. At city scale the
   * distortion from using degrees is irrelevant (a cell is ~1.1 km tall and
   * ~1.08 km wide at Chennai's latitude), and it needs no extension, no
   * dependency and no index — the alternative was pulling in H3 to answer a
   * question that a GROUP BY already answers. Revisit if this ever needs to be
   * correct across very different latitudes.
   */
  async getDemandSupplyCells(precision = 2) {
    const rows = await db.execute<{
      cell_lat: number
      cell_lng: number
      vendor_count: number
      booking_count: number
    }>(sql`
      WITH grid AS (
        SELECT
          round(v.lat::numeric, ${precision}) AS cell_lat,
          round(v.lng::numeric, ${precision}) AS cell_lng,
          1 AS is_vendor,
          0 AS is_booking
          FROM vendors v
         WHERE v.lat IS NOT NULL
           AND v.status = 'active'
           AND v.is_verified = true

        UNION ALL

        SELECT
          round(b.lat::numeric, ${precision}) AS cell_lat,
          round(b.lng::numeric, ${precision}) AS cell_lng,
          0 AS is_vendor,
          1 AS is_booking
          FROM bookings b
         WHERE b.lat IS NOT NULL
           AND b.status <> 'cancelled'
      )
      SELECT
        cell_lat::float AS cell_lat,
        cell_lng::float AS cell_lng,
        sum(is_vendor)::int  AS vendor_count,
        sum(is_booking)::int AS booking_count
        FROM grid
       GROUP BY cell_lat, cell_lng
       ORDER BY sum(is_booking) DESC, sum(is_vendor) ASC
       LIMIT 500
    `)

    return Array.from(rows).map((row) => ({
      lat: Number(row.cell_lat),
      lng: Number(row.cell_lng),
      vendorCount: Number(row.vendor_count),
      bookingCount: Number(row.booking_count),
    }))
  },

  verifyVendor(id: string) {
    return db
      .update(vendors)
      // Verifying is the moment a human actually looked at this garage, so it
      // is also the moment its pin counts as confirmed. The service refuses to
      // get here while geo is null.
      .set({ isVerified: true, status: 'active', geoConfirmedAt: new Date() })
      .where(eq(vendors.id, id))
      .returning()
  },

  archiveVendor(id: string) {
    return db
      .update(vendors)
      .set({ status: 'archived' })
      .where(eq(vendors.id, id))
      .returning()
  },

  // Restore an archived vendor. It becomes visible to customers again only if
  // it is also verified (public listings require status='active' AND verified).
  unarchiveVendor(id: string) {
    return db
      .update(vendors)
      .set({ status: 'active' })
      .where(eq(vendors.id, id))
      .returning()
  },

  // Hard delete. FK cascades remove the vendor's services, photos, working
  // hours, service areas, bookings, payments and reviews. The owner user row
  // is preserved.
  deleteVendor(id: string) {
    return db.delete(vendors).where(eq(vendors.id, id)).returning()
  },

  findUserByPhone(phone: string) {
    return db.query.users.findFirst({
      where: eq(users.phone, phone),
    })
  },

  createOwner(data: { name: string; phone: string }) {
    return db
      .insert(users)
      .values({
        name: data.name,
        phone: data.phone,
        isCustomer: false,
        isVendorOwner: true,
        phoneVerified: true,
      })
      .returning()
  },

  updateUser(id: string, data: { name?: string; phone?: string }) {
    return db.update(users).set(data).where(eq(users.id, id)).returning()
  },

  setUserAsVendorOwner(userId: string) {
    return db
      .update(users)
      .set({ isVendorOwner: true })
      .where(eq(users.id, userId))
      .returning()
  },

  findVendorByOwnerId(ownerId: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.ownerId, ownerId),
    })
  },

  createVendor(data: VendorInsert) {
    return db.insert(vendors).values(data).returning()
  },

  insertWorkingHours(rows: WorkingHoursInsert[]) {
    if (rows.length === 0) return Promise.resolve([])
    return db.insert(vendorWorkingHours).values(rows).returning()
  },

  deleteWorkingHours(vendorId: string) {
    return db
      .delete(vendorWorkingHours)
      .where(eq(vendorWorkingHours.vendorId, vendorId))
  },

  insertServices(rows: ServiceInsert[]) {
    if (rows.length === 0) return Promise.resolve([])
    return db.insert(services).values(rows).returning()
  },

  // Active service ids for a vendor, used to reconcile the admin edit payload.
  // Packages MUST stay out: the admin editor never sends them, so including
  // them here would make every save deactivate all of the vendor's packages.
  async listActiveServiceIds(vendorId: string): Promise<string[]> {
    const rows = await db.query.services.findMany({
      columns: { id: true },
      where: and(
        eq(services.vendorId, vendorId),
        eq(services.isActive, true),
        ne(services.category, 'package')
      ),
    })
    return rows.map((r) => r.id)
  },

  updateService(id: string, data: Partial<ServiceInsert>) {
    return db.update(services).set(data).where(eq(services.id, id)).returning()
  },

  // Soft-delete: hide from customers and block new bookings, but keep the row
  // so existing bookings' restrict FK stays intact.
  deactivateServices(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([])
    return db
      .update(services)
      .set({ isActive: false })
      .where(inArray(services.id, ids))
      .returning()
  },

  listBookings(status?: BookingStatus) {
    return db.query.bookings.findMany({
      where: status ? eq(bookings.status, status) : undefined,
      with: {
        vendor: true,
        user: true,
        service: true,
        vehicle: true,
        payment: true,
      },
      orderBy: [desc(bookings.scheduledAt)],
    })
  },
}
