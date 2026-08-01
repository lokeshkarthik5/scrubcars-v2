import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookings,
  bookingStatusEnum,
  services,
  users,
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
      },
      orderBy: [desc(vendors.createdAt)],
    })
  },

  findVendorById(id: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.id, id),
    })
  },

  verifyVendor(id: string) {
    return db
      .update(vendors)
      .set({ isVerified: true, status: 'active' })
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

  insertServices(rows: ServiceInsert[]) {
    if (rows.length === 0) return Promise.resolve([])
    return db.insert(services).values(rows).returning()
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
