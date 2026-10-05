import { AppError } from '../../lib/errors.js'
import type { GeoSource } from '../../lib/geo/index.js'
import {
  createUserUpload,
  deleteObject,
  keyFromPublicUrl,
} from '../../lib/storage.js'
import { logger } from '../../lib/logger.js'
import { usersRepository } from './users.repository.js'
import type {
  AddressRecord,
  UserRecord,
  VehicleRecord,
} from './users.repository.js'
import type {
  AvatarUploadUrlInput,
  CreateAddressInput,
  CreateVehicleInput,
  SetAvatarInput,
  UpdateAddressInput,
  UpdateProfileInput,
  UpdateVehicleInput,
} from './users.validation.js'

const log = logger.child({ module: 'users' })

export type UserProfileResponse = {
  id: string
  name: string
  phone: string
  email: string | null
  avatarUrl: string | null
  phoneVerified: boolean
  isCustomer: boolean
  isVendorOwner: boolean
  status: string
  createdAt: string
}

export type AddressResponse = {
  id: string
  label: string
  address: string
  city: string
  /**
   * Null when the customer saved an address without dropping a pin. That is a
   * legitimate state — the address books a drop-in slot fine, and is only
   * prompted for a pin when it is picked for doorstep, which is the one place
   * the coordinate is actually needed.
   */
  lat: number | null
  lng: number | null
  geoSource: GeoSource
  isDefault: boolean
  createdAt: string
}

export type VehicleResponse = {
  id: string
  make: string
  model: string
  color: string | null
  licensePlate: string | null
  vehicleType: string
  isDefault: boolean
}

function toProfileResponse(user: UserRecord): UserProfileResponse {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    avatarUrl: user.avatarUrl,
    phoneVerified: user.phoneVerified,
    isCustomer: user.isCustomer,
    isVendorOwner: user.isVendorOwner,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  }
}

function toAddressResponse(address: AddressRecord): AddressResponse {
  return {
    id: address.id,
    label: address.label,
    address: address.address,
    city: address.city,
    lat: address.lat,
    lng: address.lng,
    geoSource: address.geoSource,
    isDefault: address.isDefault,
    createdAt: address.createdAt.toISOString(),
  }
}

function toVehicleResponse(vehicle: VehicleRecord): VehicleResponse {
  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    color: vehicle.color,
    licensePlate: vehicle.licensePlate,
    vehicleType: vehicle.vehicleType,
    isDefault: vehicle.isDefault,
  }
}

async function getActiveUser(userId: string): Promise<UserRecord> {
  const user = await usersRepository.findUserById(userId)

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
  }

  if (user.status === 'suspended') {
    throw new AppError(403, 'Account is suspended', 'ACCOUNT_SUSPENDED')
  }

  return user
}

async function getOwnedAddress(userId: string, addressId: string) {
  const address = await usersRepository.findAddressById(userId, addressId)

  if (!address) {
    throw new AppError(404, 'Address not found', 'ADDRESS_NOT_FOUND')
  }

  return address
}

async function getOwnedVehicle(userId: string, vehicleId: string) {
  const vehicle = await usersRepository.findVehicleById(userId, vehicleId)

  if (!vehicle) {
    throw new AppError(404, 'Vehicle not found', 'VEHICLE_NOT_FOUND')
  }

  return vehicle
}

export const usersService = {
  async getProfile(userId: string) {
    const user = await getActiveUser(userId)
    return toProfileResponse(user)
  },

  async updateProfile(userId: string, input: UpdateProfileInput) {
    await getActiveUser(userId)

    const [updated] = await usersRepository.updateUser(userId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    })

    return toProfileResponse(updated)
  },

  async createAvatarUploadUrl(userId: string, input: AvatarUploadUrlInput) {
    await getActiveUser(userId)
    const { uploadUrl, publicUrl } = await createUserUpload(
      userId,
      input.contentType
    )
    return { uploadUrl, publicUrl }
  },

  async setAvatar(userId: string, input: SetAvatarInput) {
    const user = await getActiveUser(userId)

    // Only accept URLs that actually point at our bucket.
    const storageKey = keyFromPublicUrl(input.url)
    if (!storageKey) {
      throw new AppError(400, 'Invalid avatar URL', 'INVALID_AVATAR_URL')
    }

    const previousKey = user.avatarStorageKey

    const [updated] = await usersRepository.updateUser(userId, {
      avatarUrl: input.url,
      avatarStorageKey: storageKey,
    })

    // Remove the old avatar object once the new one is saved.
    if (previousKey && previousKey !== storageKey) {
      await deleteObject(previousKey)
    }

    log.info({ userId }, 'user:avatar-updated')
    return toProfileResponse(updated)
  },

  async deleteAvatar(userId: string) {
    const user = await getActiveUser(userId)

    const [updated] = await usersRepository.updateUser(userId, {
      avatarUrl: null,
      avatarStorageKey: null,
    })

    const key = user.avatarStorageKey ?? keyFromPublicUrl(user.avatarUrl ?? '')
    if (key) {
      await deleteObject(key)
    }

    log.info({ userId }, 'user:avatar-removed')
    return toProfileResponse(updated)
  },

  async deleteAccount(userId: string) {
    await getActiveUser(userId)

    // Deleting a user deletes their bookings with it. A receipt number is
    // never reused or renumbered, so the bookings one was issued on have to
    // stay (receipt_numbers' foreign key would refuse the cascade anyway, as
    // a bare 500). Closing such an account is a person's job for now.
    if (await usersRepository.hasReceiptNumbers(userId)) {
      throw new AppError(
        409,
        "Your account has bookings with payment receipts, so it can't be deleted from the app. Please call Detlio support to close it.",
        'ACCOUNT_HAS_RECEIPTS'
      )
    }

    await usersRepository.deleteUser(userId)
  },

  async listAddresses(userId: string) {
    await getActiveUser(userId)
    const addresses = await usersRepository.listAddresses(userId)
    return addresses.map(toAddressResponse)
  },

  async createAddress(userId: string, input: CreateAddressInput) {
    await getActiveUser(userId)

    const existing = await usersRepository.countAddresses(userId)
    const shouldBeDefault = input.isDefault ?? existing.length === 0

    if (shouldBeDefault) {
      await usersRepository.clearDefaultAddresses(userId)
    }

    const [created] = await usersRepository.createAddress({
      userId,
      label: input.label,
      address: input.address,
      city: input.city,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      // Validation guarantees lat/lng arrive together, so coordinates without a
      // stated source can only mean the client forgot to say — 'map_pin' is the
      // safer assumption than 'gps', since it does not claim device accuracy.
      geoSource: input.lat !== undefined ? (input.geoSource ?? 'map_pin') : 'unset',
      isDefault: shouldBeDefault,
    })

    return toAddressResponse(created)
  },

  async updateAddress(
    userId: string,
    addressId: string,
    input: UpdateAddressInput
  ) {
    await getActiveUser(userId)
    await getOwnedAddress(userId, addressId)

    if (input.isDefault === true) {
      await usersRepository.clearDefaultAddresses(userId)
    }

    const [updated] = await usersRepository.updateAddress(userId, addressId, {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.lat !== undefined ? { lat: input.lat } : {}),
      ...(input.lng !== undefined ? { lng: input.lng } : {}),
      // Provenance moves with the coordinates it describes, never on its own.
      ...(input.lat !== undefined
        ? { geoSource: input.geoSource ?? 'map_pin' }
        : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
    })

    return toAddressResponse(updated)
  },

  async deleteAddress(userId: string, addressId: string) {
    await getActiveUser(userId)
    const existing = await getOwnedAddress(userId, addressId)

    const [deleted] = await usersRepository.deleteAddress(userId, addressId)

    if (existing.isDefault) {
      const remaining = await usersRepository.listAddresses(userId)
      if (remaining.length > 0) {
        await usersRepository.setDefaultAddress(userId, remaining[0].id)
      }
    }

    return toAddressResponse(deleted)
  },

  async setDefaultAddress(userId: string, addressId: string) {
    await getActiveUser(userId)
    await getOwnedAddress(userId, addressId)

    const [updated] = await usersRepository.setDefaultAddress(userId, addressId)

    if (!updated) {
      throw new AppError(404, 'Address not found', 'ADDRESS_NOT_FOUND')
    }

    return toAddressResponse(updated)
  },

  async listVehicles(userId: string) {
    await getActiveUser(userId)
    const vehicles = await usersRepository.listVehicles(userId)
    return vehicles.map(toVehicleResponse)
  },

  async createVehicle(userId: string, input: CreateVehicleInput) {
    await getActiveUser(userId)

    const existing = await usersRepository.countVehicles(userId)
    const shouldBeDefault = input.isDefault ?? existing.length === 0

    if (shouldBeDefault) {
      await usersRepository.clearDefaultVehicles(userId)
    }

    const [created] = await usersRepository.createVehicle({
      userId,
      make: input.make,
      model: input.model,
      color: input.color ?? null,
      licensePlate: input.licensePlate ?? null,
      vehicleType: input.vehicleType,
      isDefault: shouldBeDefault,
    })

    return toVehicleResponse(created)
  },

  async updateVehicle(
    userId: string,
    vehicleId: string,
    input: UpdateVehicleInput
  ) {
    await getActiveUser(userId)
    await getOwnedVehicle(userId, vehicleId)

    if (input.isDefault === true) {
      await usersRepository.clearDefaultVehicles(userId)
    }

    const [updated] = await usersRepository.updateVehicle(userId, vehicleId, {
      ...(input.make !== undefined ? { make: input.make } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.licensePlate !== undefined
        ? { licensePlate: input.licensePlate }
        : {}),
      ...(input.vehicleType !== undefined
        ? { vehicleType: input.vehicleType }
        : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
    })

    return toVehicleResponse(updated)
  },

  /**
   * Remove a car from the customer's garage.
   *
   * A car a booking or an intent still points at cannot be deleted — those FKs
   * are ON DELETE RESTRICT so a booking can never lose the car it was for — so
   * it is archived instead: gone from the garage and from every picker, still
   * there for the booking that names it. A car nothing references is deleted
   * outright, so a typo added and removed leaves nothing behind.
   */
  async deleteVehicle(userId: string, vehicleId: string) {
    await getActiveUser(userId)
    const existing = await getOwnedVehicle(userId, vehicleId)

    const referenced = await usersRepository.isVehicleReferenced(vehicleId)

    const [removed] = referenced
      ? await usersRepository.archiveVehicle(userId, vehicleId)
      : await usersRepository.deleteVehicle(userId, vehicleId)

    if (existing.isDefault) {
      const remaining = await usersRepository.listVehicles(userId)
      if (remaining.length > 0) {
        await usersRepository.setDefaultVehicle(userId, remaining[0].id)
      }
    }

    log.info({ userId, vehicleId, archived: referenced }, 'user:vehicle-removed')

    return toVehicleResponse(removed)
  },

  async setDefaultVehicle(userId: string, vehicleId: string) {
    await getActiveUser(userId)
    await getOwnedVehicle(userId, vehicleId)

    const [updated] = await usersRepository.setDefaultVehicle(userId, vehicleId)

    if (!updated) {
      throw new AppError(404, 'Vehicle not found', 'VEHICLE_NOT_FOUND')
    }

    return toVehicleResponse(updated)
  },
}
