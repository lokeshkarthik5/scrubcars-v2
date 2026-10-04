import type { Context } from 'hono'
import {
  getTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import { jobPhotosService } from './job-photos.service.js'
import type {
  JobPhotoUploadUrlInput,
  RecordJobPhotoInput,
} from './job-photos.validation.js'

type JobPhotosContext = Context<{ Variables: TenantVariables }>

/** The active company. Produced by resolveTenant, never by a request param. */
function getVendorId(c: JobPhotosContext): string {
  return getTenant(c).vendorId
}

export async function listPhotos(c: JobPhotosContext, bookingId: string) {
  const photos = await jobPhotosService.listPhotos(getVendorId(c), bookingId)

  return c.json({
    success: true,
    data: photos,
  })
}

export async function createUploadUrl(
  c: JobPhotosContext,
  bookingId: string,
  input: JobPhotoUploadUrlInput
) {
  const upload = await jobPhotosService.createUploadUrl(
    getVendorId(c),
    bookingId,
    input
  )

  return c.json({
    success: true,
    data: upload,
  })
}

export async function recordPhoto(
  c: JobPhotosContext,
  bookingId: string,
  input: RecordJobPhotoInput
) {
  const photo = await jobPhotosService.recordPhoto(
    getVendorId(c),
    c.get('auth').sub,
    bookingId,
    input
  )

  return c.json(
    {
      success: true,
      data: photo,
    },
    201
  )
}

export async function deletePhoto(
  c: JobPhotosContext,
  bookingId: string,
  photoId: string
) {
  const photo = await jobPhotosService.deletePhoto(
    getVendorId(c),
    bookingId,
    photoId
  )

  return c.json({
    success: true,
    data: photo,
  })
}
