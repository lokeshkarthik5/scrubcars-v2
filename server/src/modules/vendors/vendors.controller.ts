import type { Context } from 'hono'
import {
  getTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import { vendorsService } from './vendors.service.js'
import type {
  CreatePhotoInput,
  CreatePackageInput,
  CreateServiceAreaInput,
  CreateServiceImageInput,
  CreateServiceInput,
  CreateVendorInput,
  ListPublicVendorsQuery,
  LogoUploadUrlInput,
  PhotoUploadUrlInput,
  ReorderPhotosInput,
  ServiceImageUploadUrlInput,
  SetLogoInput,
  SetWorkingHoursInput,
  SlotsQueryInput,
  ToggleServiceActiveInput,
  UpdateJobTypesInput,
  UpdatePackageInput,
  UpdateServiceInput,
  UpdateSlotIntervalInput,
  UpdateVendorInput,
  EarningsQuery,
} from './vendors.validation.js'

type VendorsContext = Context<{ Variables: TenantVariables }>

/**
 * The active company, produced by `resolveTenant`. Every /me handler feeds this
 * to the service. Note what it is *not*: a request parameter. The tenant is
 * never read from the path, the query or the body.
 */
function getVendorId(c: VendorsContext): string {
  return getTenant(c).vendorId
}

/** The person acting, as distinct from the company they are acting for. */
function getActorId(c: VendorsContext): string {
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
  const vendor = await vendorsService.getMyVendor(getVendorId(c))

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function createVendor(
  c: VendorsContext,
  input: CreateVendorInput
) {
  const vendor = await vendorsService.createVendor(getActorId(c), input)

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
  const vendor = await vendorsService.updateVendor(getVendorId(c), input)

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function updateJobTypes(
  c: VendorsContext,
  input: UpdateJobTypesInput
) {
  const vendor = await vendorsService.updateJobTypes(getVendorId(c), input)

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function updateSlotInterval(
  c: VendorsContext,
  input: UpdateSlotIntervalInput
) {
  const vendor = await vendorsService.updateSlotInterval(getVendorId(c), input)

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function getWorkingHours(c: VendorsContext) {
  const hours = await vendorsService.getWorkingHours(getVendorId(c))

  return c.json({
    success: true,
    data: hours,
  })
}

export async function setWorkingHours(
  c: VendorsContext,
  input: SetWorkingHoursInput
) {
  const hours = await vendorsService.setWorkingHours(getVendorId(c), input)

  return c.json({
    success: true,
    data: hours,
  })
}

export async function listServiceAreas(c: VendorsContext) {
  const areas = await vendorsService.listServiceAreas(getVendorId(c))

  return c.json({
    success: true,
    data: areas,
  })
}

export async function createServiceArea(
  c: VendorsContext,
  input: CreateServiceAreaInput
) {
  const area = await vendorsService.createServiceArea(getVendorId(c), input)

  return c.json(
    {
      success: true,
      data: area,
    },
    201
  )
}

export async function deleteServiceArea(c: VendorsContext, areaId: string) {
  const area = await vendorsService.deleteServiceArea(getVendorId(c), areaId)

  return c.json({
    success: true,
    data: area,
  })
}

export async function listPhotos(c: VendorsContext) {
  const photos = await vendorsService.listPhotos(getVendorId(c))

  return c.json({
    success: true,
    data: photos,
  })
}

export async function createLogoUploadUrl(
  c: VendorsContext,
  input: LogoUploadUrlInput
) {
  const data = await vendorsService.createLogoUploadUrl(getVendorId(c), input)

  return c.json({
    success: true,
    data,
  })
}

export async function setLogo(c: VendorsContext, input: SetLogoInput) {
  const vendor = await vendorsService.setLogo(getVendorId(c), input)

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function deleteLogo(c: VendorsContext) {
  const vendor = await vendorsService.deleteLogo(getVendorId(c))

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function createPhotoUploadUrl(
  c: VendorsContext,
  input: PhotoUploadUrlInput
) {
  const data = await vendorsService.createPhotoUploadUrl(getVendorId(c), input)

  return c.json({
    success: true,
    data,
  })
}

export async function addPhoto(c: VendorsContext, input: CreatePhotoInput) {
  const photo = await vendorsService.addPhoto(getVendorId(c), input)

  return c.json(
    {
      success: true,
      data: photo,
    },
    201
  )
}

export async function reorderPhotos(
  c: VendorsContext,
  input: ReorderPhotosInput
) {
  const photos = await vendorsService.reorderPhotos(getVendorId(c), input)

  return c.json({
    success: true,
    data: photos,
  })
}

export async function deletePhoto(c: VendorsContext, photoId: string) {
  const photo = await vendorsService.deletePhoto(getVendorId(c), photoId)

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
  const services = await vendorsService.listMyServices(getVendorId(c))

  return c.json({
    success: true,
    data: services,
  })
}

export async function createService(
  c: VendorsContext,
  input: CreateServiceInput
) {
  const service = await vendorsService.createService(getVendorId(c), input)

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
    getVendorId(c),
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
    getVendorId(c),
    serviceId,
    input
  )

  return c.json({
    success: true,
    data: service,
  })
}

export async function deleteService(c: VendorsContext, serviceId: string) {
  const service = await vendorsService.deleteService(getVendorId(c), serviceId)

  return c.json({
    success: true,
    data: service,
  })
}

export async function createServiceImageUploadUrl(
  c: VendorsContext,
  serviceId: string,
  input: ServiceImageUploadUrlInput
) {
  const data = await vendorsService.createServiceImageUploadUrl(
    getVendorId(c),
    serviceId,
    input
  )

  return c.json({
    success: true,
    data,
  })
}

export async function addServiceImage(
  c: VendorsContext,
  serviceId: string,
  input: CreateServiceImageInput
) {
  const service = await vendorsService.addServiceImage(
    getVendorId(c),
    serviceId,
    input
  )

  return c.json(
    {
      success: true,
      data: service,
    },
    201
  )
}

export async function deleteServiceImage(
  c: VendorsContext,
  serviceId: string,
  imageId: string
) {
  const service = await vendorsService.deleteServiceImage(
    getVendorId(c),
    serviceId,
    imageId
  )

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

export async function getPublicWorkingHours(
  c: VendorsContext,
  vendorId: string
) {
  const hours = await vendorsService.getPublicWorkingHours(vendorId)

  return c.json({
    success: true,
    data: hours,
  })
}

export async function listMyPackages(c: VendorsContext) {
  const packages = await vendorsService.listMyPackages(getVendorId(c))

  return c.json({
    success: true,
    data: packages,
  })
}

export async function listPublicPackages(
  c: VendorsContext,
  vendorId: string
) {
  const packages = await vendorsService.listPublicPackages(vendorId)

  return c.json({
    success: true,
    data: packages,
  })
}

export async function createPackage(
  c: VendorsContext,
  input: CreatePackageInput
) {
  const pkg = await vendorsService.createPackage(getVendorId(c), input)

  return c.json(
    {
      success: true,
      data: pkg,
    },
    201
  )
}

export async function updatePackage(
  c: VendorsContext,
  packageId: string,
  input: UpdatePackageInput
) {
  const pkg = await vendorsService.updatePackage(
    getVendorId(c),
    packageId,
    input
  )

  return c.json({
    success: true,
    data: pkg,
  })
}

export async function deletePackage(c: VendorsContext, packageId: string) {
  const pkg = await vendorsService.deletePackage(getVendorId(c), packageId)

  return c.json({
    success: true,
    data: pkg,
  })
}

export async function getEarnings(c: VendorsContext, query: EarningsQuery) {
  const earnings = await vendorsService.getEarnings(
    getVendorId(c),
    query.period
  )

  return c.json({
    success: true,
    data: earnings,
  })
}
