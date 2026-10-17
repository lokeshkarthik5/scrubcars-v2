import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookingIntents,
  bookings,
  receiptNumbers,
  userAddresses,
  users,
  userVehicles,
  vendors,
} from '../../db/schema.js'
import type { geoSourceEnum, vehicleTypeEnum } from '../../db/schema.js'

type GeoSource = (typeof geoSourceEnum.enumValues)[number]

type VehicleType = (typeof vehicleTypeEnum.enumValues)[number]

export type UserRecord = typeof users.$inferSelect
export type AddressRecord = typeof userAddresses.$inferSelect
export type VehicleRecord = typeof userVehicles.$inferSelect

export const usersRepository = {
  findUserById(id: string) {
    return db.query.users.findFirst({
      where: eq(users.id, id),
    })
  },

  updateUser(
    id: string,
    data: Partial<{
      name: string
      email: string | null
      avatarUrl: string | null
      avatarStorageKey: string | null
    }>
  ) {
    return db.update(users).set(data).where(eq(users.id, id)).returning()
  },

  deleteUser(id: string) {
    return db.delete(users).where(eq(users.id, id)).returning()
  },

  /**
   * Whether a receipt number was ever issued on one of the user's bookings.
   * receipt_numbers is keyed by a reschedule chain's first booking, which is
   * the same customer's as the rest of the chain.
   */
  async hasReceiptNumbers(userId: string) {
    const [row] = await db
      .select({ one: sql`1` })
      .from(receiptNumbers)
      .innerJoin(bookings, eq(bookings.id, receiptNumbers.rootBookingId))
      .where(eq(bookings.userId, userId))
      .limit(1)
    return !!row
  },

  /**
   * Whether the user is the named owner (`vendors.owner_id`) of any garage,
   * in any status. Owner, not member: only the owner row cascades.
   */
  async ownsVendor(userId: string) {
    const [row] = await db
      .select({ one: sql`1` })
      .from(vendors)
      .where(eq(vendors.ownerId, userId))
      .limit(1)
    return !!row
  },

  listAddresses(userId: string) {
    return db.query.userAddresses.findMany({
      where: eq(userAddresses.userId, userId),
      orderBy: [asc(userAddresses.createdAt)],
    })
  },

  countAddresses(userId: string) {
    return db.query.userAddresses.findMany({
      where: eq(userAddresses.userId, userId),
      columns: { id: true },
    })
  },

  findAddressById(userId: string, addressId: string) {
    return db.query.userAddresses.findFirst({
      where: and(
        eq(userAddresses.id, addressId),
        eq(userAddresses.userId, userId)
      ),
    })
  },

  createAddress(data: {
    userId: string
    label: string
    address: string
    city: string
    lat?: number | null
    lng?: number | null
    geoSource?: GeoSource
    isDefault: boolean
  }) {
    return db.insert(userAddresses).values(data).returning()
  },

  updateAddress(
    userId: string,
    addressId: string,
    data: Partial<{
      label: string
      address: string
      city: string
      lat: number | null
      lng: number | null
      geoSource: GeoSource
      isDefault: boolean
    }>
  ) {
    return db
      .update(userAddresses)
      .set(data)
      .where(
        and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId))
      )
      .returning()
  },

  deleteAddress(userId: string, addressId: string) {
    return db
      .delete(userAddresses)
      .where(
        and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId))
      )
      .returning()
  },

  clearDefaultAddresses(userId: string) {
    return db
      .update(userAddresses)
      .set({ isDefault: false })
      .where(eq(userAddresses.userId, userId))
  },

  setDefaultAddress(userId: string, addressId: string) {
    return db.transaction(async (tx) => {
      await tx
        .update(userAddresses)
        .set({ isDefault: false })
        .where(eq(userAddresses.userId, userId))

      return tx
        .update(userAddresses)
        .set({ isDefault: true })
        .where(
          and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId))
        )
        .returning()
    })
  },

  listVehicles(userId: string) {
    return db.query.userVehicles.findMany({
      where: and(
        eq(userVehicles.userId, userId),
        isNull(userVehicles.archivedAt)
      ),
      orderBy: [asc(userVehicles.make), asc(userVehicles.model)],
    })
  },

  countVehicles(userId: string) {
    return db.query.userVehicles.findMany({
      where: and(
        eq(userVehicles.userId, userId),
        isNull(userVehicles.archivedAt)
      ),
      columns: { id: true },
    })
  },

  findVehicleById(userId: string, vehicleId: string) {
    return db.query.userVehicles.findFirst({
      where: and(
        eq(userVehicles.id, vehicleId),
        eq(userVehicles.userId, userId),
        isNull(userVehicles.archivedAt)
      ),
    })
  },

  createVehicle(data: {
    userId: string
    make: string
    model: string
    color?: string | null
    licensePlate?: string | null
    vehicleType: VehicleType
    isDefault: boolean
  }) {
    return db.insert(userVehicles).values(data).returning()
  },

  updateVehicle(
    userId: string,
    vehicleId: string,
    data: Partial<{
      make: string
      model: string
      color: string | null
      licensePlate: string | null
      vehicleType: VehicleType
      isDefault: boolean
      washIntervalDays: number | null
    }>
  ) {
    return db
      .update(userVehicles)
      .set(data)
      .where(
        and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId))
      )
      .returning()
  },

  /**
   * Whether history still points at this car. Both FKs are ON DELETE RESTRICT,
   * so this is the question that decides between deleting the row and
   * archiving it.
   */
  async isVehicleReferenced(vehicleId: string) {
    const [referenced] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.vehicleId, vehicleId))
      .limit(1)

    if (referenced) return true

    const [intent] = await db
      .select({ id: bookingIntents.id })
      .from(bookingIntents)
      .where(eq(bookingIntents.vehicleId, vehicleId))
      .limit(1)

    return Boolean(intent)
  },

  deleteVehicle(userId: string, vehicleId: string) {
    return db
      .delete(userVehicles)
      .where(
        and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId))
      )
      .returning()
  },

  /**
   * Takes the car out of the customer's garage without deleting the row a
   * booking still names. Clears `is_default` in the same statement so an
   * archived car cannot stay the default the pickers preselect.
   */
  archiveVehicle(userId: string, vehicleId: string) {
    return db
      .update(userVehicles)
      .set({ archivedAt: new Date(), isDefault: false })
      .where(
        and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId))
      )
      .returning()
  },

  clearDefaultVehicles(userId: string) {
    return db
      .update(userVehicles)
      .set({ isDefault: false })
      .where(eq(userVehicles.userId, userId))
  },

  setDefaultVehicle(userId: string, vehicleId: string) {
    return db.transaction(async (tx) => {
      await tx
        .update(userVehicles)
        .set({ isDefault: false })
        .where(eq(userVehicles.userId, userId))

      return tx
        .update(userVehicles)
        .set({ isDefault: true })
        .where(
          and(
            eq(userVehicles.id, vehicleId),
            eq(userVehicles.userId, userId),
            isNull(userVehicles.archivedAt)
          )
        )
        .returning()
    })
  },
}
