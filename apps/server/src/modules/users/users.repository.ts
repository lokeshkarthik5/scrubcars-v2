import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { userAddresses, users, userVehicles } from '../../db/schema.js'
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
      where: eq(userVehicles.userId, userId),
      orderBy: [asc(userVehicles.make), asc(userVehicles.model)],
    })
  },

  countVehicles(userId: string) {
    return db.query.userVehicles.findMany({
      where: eq(userVehicles.userId, userId),
      columns: { id: true },
    })
  },

  findVehicleById(userId: string, vehicleId: string) {
    return db.query.userVehicles.findFirst({
      where: and(
        eq(userVehicles.id, vehicleId),
        eq(userVehicles.userId, userId)
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

  deleteVehicle(userId: string, vehicleId: string) {
    return db
      .delete(userVehicles)
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
          and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId))
        )
        .returning()
    })
  },
}
