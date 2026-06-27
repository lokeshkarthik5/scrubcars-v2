import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { usersService } from './users.service.js'
import type {
  CreateAddressInput,
  CreateVehicleInput,
  UpdateAddressInput,
  UpdateProfileInput,
  UpdateVehicleInput,
} from './users.validation.js'

type UsersContext = Context<{ Variables: AuthVariables }>

function getUserId(c: UsersContext): string {
  return c.get('auth').sub
}

export async function getProfile(c: UsersContext) {
  const profile = await usersService.getProfile(getUserId(c))

  return c.json({
    success: true,
    data: profile,
  })
}

export async function updateProfile(
  c: UsersContext,
  input: UpdateProfileInput
) {
  const profile = await usersService.updateProfile(getUserId(c), input)

  return c.json({
    success: true,
    data: profile,
  })
}

export async function deleteAccount(c: UsersContext) {
  await usersService.deleteAccount(getUserId(c))

  return c.json({
    success: true,
    message: 'Account deleted successfully',
  })
}

export async function listAddresses(c: UsersContext) {
  const addresses = await usersService.listAddresses(getUserId(c))

  return c.json({
    success: true,
    data: addresses,
  })
}

export async function createAddress(
  c: UsersContext,
  input: CreateAddressInput
) {
  const address = await usersService.createAddress(getUserId(c), input)

  return c.json(
    {
      success: true,
      data: address,
    },
    201
  )
}

export async function updateAddress(
  c: UsersContext,
  addressId: string,
  input: UpdateAddressInput
) {
  const address = await usersService.updateAddress(
    getUserId(c),
    addressId,
    input
  )

  return c.json({
    success: true,
    data: address,
  })
}

export async function deleteAddress(c: UsersContext, addressId: string) {
  const address = await usersService.deleteAddress(getUserId(c), addressId)

  return c.json({
    success: true,
    data: address,
  })
}

export async function setDefaultAddress(c: UsersContext, addressId: string) {
  const address = await usersService.setDefaultAddress(getUserId(c), addressId)

  return c.json({
    success: true,
    data: address,
  })
}

export async function listVehicles(c: UsersContext) {
  const vehicles = await usersService.listVehicles(getUserId(c))

  return c.json({
    success: true,
    data: vehicles,
  })
}

export async function createVehicle(
  c: UsersContext,
  input: CreateVehicleInput
) {
  const vehicle = await usersService.createVehicle(getUserId(c), input)

  return c.json(
    {
      success: true,
      data: vehicle,
    },
    201
  )
}

export async function updateVehicle(
  c: UsersContext,
  vehicleId: string,
  input: UpdateVehicleInput
) {
  const vehicle = await usersService.updateVehicle(
    getUserId(c),
    vehicleId,
    input
  )

  return c.json({
    success: true,
    data: vehicle,
  })
}

export async function deleteVehicle(c: UsersContext, vehicleId: string) {
  const vehicle = await usersService.deleteVehicle(getUserId(c), vehicleId)

  return c.json({
    success: true,
    data: vehicle,
  })
}

export async function setDefaultVehicle(c: UsersContext, vehicleId: string) {
  const vehicle = await usersService.setDefaultVehicle(getUserId(c), vehicleId)

  return c.json({
    success: true,
    data: vehicle,
  })
}
