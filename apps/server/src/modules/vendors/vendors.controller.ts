import type { Context } from 'hono'
import {
  getTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import { reachService } from '../reach/reach.service.js'
import { vendorsService } from './vendors.service.js'
import type {
  CreateClosureInput,
  ListClosuresQuery,
  CreatePhotoInput,
  CreatePackageInput,
  DoorstepAreaInput,
  CreateServiceAreaInput,
  CreateServiceInput,
  CreateVendorInput,
  ListPublicVendorsQuery,
  NextFreeQuery,
  LogoUploadUrlInput,
  PauseBookingsInput,
  PhotoUploadUrlInput,
  ReorderPhotosInput,
  ServiceImageUploadUrlInput,
  SetLogoInput,
  SetWorkingHoursInput,
  SlotsQueryInput,
  CreateAddOnInput,
  ToggleServiceActiveInput,
  UpdateAddOnInput,
  UpdateJobTypesInput,
  UpdatePackageInput,
  UpdateServiceInput,
  UpdateSlotIntervalInput,
  UpdateVendorInput,
  EarningsQuery,
} from './vendors.validation.js'
import type { AddPhotoInput } from '../service-media/service-media.validation.js'

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
  // With the reach figures and the "Just outside their area" group (0062),
  // in the same answer: modules/reach.
  const vendors = await reachService.withReach(await vendorsService.listPublicVendors(query), query)

  return c.json({
    success: true,
    data: vendors,
  })
}

/**
 * The browser may keep a public garage read for half a minute and use it for
 * five more while it checks again (speed fix 6, customer UI round): the
 * garage page and checkout read the same garage over and over within a
 * visit. The browser's own cache only: no `s-maxage`, so no shared cache
 * between people holds a garage's page. Set on success only, so an error is
 * never kept.
 */
const PUBLIC_GARAGE_CACHE = 'public, max-age=30, stale-while-revalidate=300'

/** "Next free" times move on with the clock and with every booking: a minute. */
const NEXT_FREE_CACHE = 'public, max-age=60'

export async function getNextFree(c: VendorsContext, query: NextFreeQuery) {
  const data = await vendorsService.nextFree(query.ids, query.bookingType)

  c.header('Cache-Control', NEXT_FREE_CACHE)
  return c.json({
    success: true,
    data,
  })
}

export async function getPublicVendor(c: VendorsContext, vendorId: string) {
  const vendor = await vendorsService.getPublicVendor(vendorId)

  c.header('Cache-Control', PUBLIC_GARAGE_CACHE)
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
  const vendor = await vendorsService.updateJobTypes(getVendorId(c), input, {
    userId: getActorId(c),
    viaSupport: getTenant(c).viaSuperAdmin,
  })

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

export async function getDoorstepArea(c: VendorsContext) {
  const area = await vendorsService.getDoorstepArea(getVendorId(c))

  return c.json({
    success: true,
    data: area,
  })
}

export async function setDoorstepArea(
  c: VendorsContext,
  input: DoorstepAreaInput
) {
  const area = await vendorsService.setDoorstepArea(getVendorId(c), input)

  return c.json({
    success: true,
    data: area,
  })
}

export async function listMyClosures(
  c: VendorsContext,
  query: ListClosuresQuery
) {
  const closures = await vendorsService.listMyClosures(
    getVendorId(c),
    query.from
  )

  return c.json({
    success: true,
    data: closures,
  })
}

export async function addClosure(c: VendorsContext, input: CreateClosureInput) {
  const result = await vendorsService.addClosure(getVendorId(c), input)

  return c.json(
    {
      success: true,
      data: result,
    },
    201
  )
}

export async function removeClosure(c: VendorsContext, closureId: string) {
  const closure = await vendorsService.removeClosure(getVendorId(c), closureId)

  return c.json({
    success: true,
    data: closure,
  })
}

export async function pauseBookings(
  c: VendorsContext,
  input: PauseBookingsInput
) {
  const vendor = await vendorsService.pauseBookings(getVendorId(c), input)

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function resumeBookings(c: VendorsContext) {
  const vendor = await vendorsService.resumeBookings(getVendorId(c))

  return c.json({
    success: true,
    data: vendor,
  })
}

export async function getPublicClosures(c: VendorsContext, vendorId: string) {
  const closures = await vendorsService.getPublicClosures(vendorId)

  c.header('Cache-Control', PUBLIC_GARAGE_CACHE)
  return c.json({
    success: true,
    data: closures,
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

export async function listPublicAddOns(c: VendorsContext, vendorId: string) {
  const addOns = await vendorsService.listPublicAddOns(vendorId)

  c.header('Cache-Control', PUBLIC_GARAGE_CACHE)
  return c.json({ success: true, data: addOns })
}

export async function listMyAddOns(c: VendorsContext) {
  return c.json({ success: true, data: await vendorsService.listMyAddOns(getVendorId(c)) })
}

export async function createAddOn(c: VendorsContext, input: CreateAddOnInput) {
  return c.json({ success: true, data: await vendorsService.createAddOn(getVendorId(c), input) }, 201)
}

export async function updateAddOn(c: VendorsContext, addOnId: string, input: UpdateAddOnInput) {
  return c.json({ success: true, data: await vendorsService.updateAddOn(getVendorId(c), addOnId, input) })
}

export async function deleteAddOn(c: VendorsContext, addOnId: string) {
  return c.json({ success: true, data: await vendorsService.deleteAddOn(getVendorId(c), addOnId) })
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
  input: AddPhotoInput
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

export async function getRescheduleSlots(
  c: VendorsContext,
  vendorId: string,
  bookingId: string,
  query: SlotsQueryInput
) {
  const slots = await vendorsService.getRescheduleSlots(
    getActorId(c),
    vendorId,
    bookingId,
    query
  )

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

  c.header('Cache-Control', PUBLIC_GARAGE_CACHE)
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

  c.header('Cache-Control', PUBLIC_GARAGE_CACHE)
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
