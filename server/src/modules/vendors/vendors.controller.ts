import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { vendorsService } from './vendors.service.js'
import type {
  CreateServiceAreaInput,
  CreateServiceInput,
  CreateVendorInput,
  ListPublicVendorsQuery,
  ReorderPhotosInput,
  SetWorkingHoursInput,
  SlotsQueryInput,
  ToggleServiceActiveInput,
  UpdateJobTypesInput,
  UpdateServiceInput,
  UpdateSlotIntervalInput,
  UpdateVendorInput,
} from './vendors.validation.js'

type VendorsContext = Context<{ Variables: AuthVariables }>

function getOwnerId(c: VendorsContext): string {
  return c.get('auth').sub
}

export async function listPublicVendors(
  c: VendorsContext,
  query: ListPublicVendorsQuery
) {
  const vendors = await vendorsService.listPublicVendors(query)

  return c.json({
    success: true,
    data: vendors,
  })
}

export async function getPublicVendor(c: VendorsContext, vendorId: string) {
  const vendor = await vendorsService.getPublicVendor(vendorId)

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function getMyVendor(c: VendorsContext) {
  const vendor = await vendorsService.getMyVendor(getOwnerId(c))

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function createVendor(
  c: VendorsContext,
  input: CreateVendorInput
) {
  const vendor = await vendorsService.createVendor(getOwnerId(c), input)

  return c.json(
    {
      success: true,
      data: vendor,
    },
    201
  )
}

export async function updateVendor(
  c: VendorsContext,
  input: UpdateVendorInput
) {
  const vendor = await vendorsService.updateVendor(getOwnerId(c), input)

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function updateJobTypes(
  c: VendorsContext,
  input: UpdateJobTypesInput
) {
  const vendor = await vendorsService.updateJobTypes(getOwnerId(c), input)

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function updateSlotInterval(
  c: VendorsContext,
  input: UpdateSlotIntervalInput
) {
  const vendor = await vendorsService.updateSlotInterval(getOwnerId(c), input)

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function getWorkingHours(c: VendorsContext) {
  const hours = await vendorsService.getWorkingHours(getOwnerId(c))

  return c.json({
    success: true,
    data: hours,
  })
}

export async function setWorkingHours(
  c: VendorsContext,
  input: SetWorkingHoursInput
) {
  const hours = await vendorsService.setWorkingHours(getOwnerId(c), input)

  return c.json({
    success: true,
    data: hours,
  })
}

export async function listServiceAreas(c: VendorsContext) {
  const areas = await vendorsService.listServiceAreas(getOwnerId(c))

  return c.json({
    success: true,
    data: areas,
  })
}

export async function createServiceArea(
  c: VendorsContext,
  input: CreateServiceAreaInput
) {
  const area = await vendorsService.createServiceArea(getOwnerId(c), input)

  return c.json(
    {
      success: true,
      data: area,
    },
    201
  )
}

export async function deleteServiceArea(c: VendorsContext, areaId: string) {
  const area = await vendorsService.deleteServiceArea(getOwnerId(c), areaId)

  return c.json({
    success: true,
    data: area,
  })
}

export async function listPhotos(c: VendorsContext) {
  const photos = await vendorsService.listPhotos(getOwnerId(c))

  return c.json({
    success: true,
    data: photos,
  })
}

export async function reorderPhotos(
  c: VendorsContext,
  input: ReorderPhotosInput
) {
  const photos = await vendorsService.reorderPhotos(getOwnerId(c), input)

  return c.json({
    success: true,
    data: photos,
  })
}

export async function deletePhoto(c: VendorsContext, photoId: string) {
  const photo = await vendorsService.deletePhoto(getOwnerId(c), photoId)

  return c.json({
    success: true,
    data: photo,
  })
}

export async function listPublicServices(c: VendorsContext, vendorId: string) {
  const services = await vendorsService.listPublicServices(vendorId)

  return c.json({
    success: true,
    data: services,
  })
}

export async function listMyServices(c: VendorsContext) {
  const services = await vendorsService.listMyServices(getOwnerId(c))

  return c.json({
    success: true,
    data: services,
  })
}

export async function createService(
  c: VendorsContext,
  input: CreateServiceInput
) {
  const service = await vendorsService.createService(getOwnerId(c), input)

  return c.json(
    {
      success: true,
      data: service,
    },
    201
  )
}

export async function updateService(
  c: VendorsContext,
  serviceId: string,
  input: UpdateServiceInput
) {
  const service = await vendorsService.updateService(
    getOwnerId(c),
    serviceId,
    input
  )

  return c.json({
    success: true,
    data: service,
  })
}

export async function toggleServiceActive(
  c: VendorsContext,
  serviceId: string,
  input: ToggleServiceActiveInput
) {
  const service = await vendorsService.toggleServiceActive(
    getOwnerId(c),
    serviceId,
    input
  )

  return c.json({
    success: true,
    data: service,
  })
}

export async function deleteService(c: VendorsContext, serviceId: string) {
  const service = await vendorsService.deleteService(getOwnerId(c), serviceId)

  return c.json({
    success: true,
    data: service,
  })
}

export async function getAvailableSlots(
  c: VendorsContext,
  vendorId: string,
  query: SlotsQueryInput
) {
  const slots = await vendorsService.getAvailableSlots(vendorId, query)

  return c.json({
    success: true,
    data: slots,
  })
}
