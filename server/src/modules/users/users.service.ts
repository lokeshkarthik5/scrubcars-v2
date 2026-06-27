import { AppError } from '../../lib/errors.js'
import { usersRepository } from './users.repository.js'
import type {
  AddressRecord,
  UserRecord,
  VehicleRecord,
} from './users.repository.js'
import type {
  CreateAddressInput,
  CreateVehicleInput,
  UpdateAddressInput,
  UpdateProfileInput,
  UpdateVehicleInput,
} from './users.validation.js'

export type UserProfileResponse = {
  id: string
  name: string
  phone: string
  email: string | null
  phoneVerified: boolean
  isCustomer: boolean
  isVendorOwner: boolean
  isAdmin: boolean
  status: string
  createdAt: string
}

export type AddressResponse = {
  id: string
  label: string
  address: string
  city: string
  lat: number
  lng: number
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
    phoneVerified: user.phoneVerified,
    isCustomer: user.isCustomer,
    isVendorOwner: user.isVendorOwner,
    isAdmin: user.isAdmin,
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

  async deleteAccount(userId: string) {
    await getActiveUser(userId)
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
      lat: input.lat,
      lng: input.lng,
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

  async deleteVehicle(userId: string, vehicleId: string) {
    await getActiveUser(userId)
    const existing = await getOwnedVehicle(userId, vehicleId)

    const [deleted] = await usersRepository.deleteVehicle(userId, vehicleId)

    if (existing.isDefault) {
      const remaining = await usersRepository.listVehicles(userId)
      if (remaining.length > 0) {
        await usersRepository.setDefaultVehicle(userId, remaining[0].id)
      }
    }

    return toVehicleResponse(deleted)
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
