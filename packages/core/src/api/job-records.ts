import { apiClient } from './client'
import { mapExtraWork, mapFinalBill, mapJobPhoto } from './mappers'
import {
  MAX_UPLOAD_EDGE,
  decodeImage,
  encodeImage,
  fitWithin,
  isUploadImageType,
  stripImageMetadata,
} from '@repo/core/image-upload'
import type { PhotoAngle } from '@repo/core/job-photo-standards'
import type { ApiExtraWork, ApiFinalBill, ApiJobPhoto } from './types'
import type { ExtraWork, FinalBill, JobPhoto } from '@repo/core/types'

/**
 * A job's records: the garage's before/after photos and the final bill of an
 * inspection job, and the customer paying that bill's balance.
 *
 * The garage side lives under /vendors/me/bookings/:id, so the company is the
 * one the session resolved (X-Vendor-Id), never a parameter.
 */

export type JobPhotoStage = JobPhoto['stage']

type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp'

/**
 * Upload a photo of a job and record it: presign, PUT straight to storage,
 * then register the key the upload went to, with the guided angle it was
 * taken from (0045). The caller hands over an image already sized for
 * upload (the portal turns phone photos into JPEGs first, with
 * apps/vendors/lib/resize-image.ts, and that re-encode is what strips their
 * location metadata), so it is not stripped a second time here.
 */
export async function uploadJobPhoto(
  bookingId: string,
  stage: JobPhotoStage,
  file: Blob,
  angle?: PhotoAngle
): Promise<JobPhoto> {
  return uploadAndRecord(`/vendors/me/bookings/${bookingId}/photos`, stage, file, angle)
}

/** DELETE /vendors/me/bookings/:id/photos/:photoId — one of the garage's own. */
export async function deleteJobPhoto(bookingId: string, photoId: string): Promise<void> {
  await apiClient<ApiJobPhoto>(`/vendors/me/bookings/${bookingId}/photos/${photoId}`, {
    method: 'DELETE',
  })
}

/**
 * The customer's own photo of their car (0045), on their booking: before
 * photos until the work starts, after photos for 24 hours after completion.
 * Stripped of its metadata in the browser first (stripImageMetadata), as
 * every customer upload is.
 */
export async function uploadMyCarPhoto(
  bookingId: string,
  stage: JobPhotoStage,
  file: Blob,
  angle?: PhotoAngle
): Promise<JobPhoto> {
  const clean = await prepareCarPhoto(file)
  return uploadAndRecord(`/bookings/${bookingId}/photos`, stage, clean, angle)
}

/**
 * A JPEG, PNG or WebP without its metadata. Anything else the browser can
 * read (an iPhone's HEIC in Safari, say) is re-encoded as a JPEG, which
 * drops its metadata too; a file it cannot read is refused here rather than
 * by the upload.
 */
async function prepareCarPhoto(file: Blob): Promise<Blob> {
  if (isUploadImageType(file.type)) return stripImageMetadata(file)
  try {
    const decoded = await decodeImage(file)
    try {
      const size = fitWithin(decoded.width, decoded.height, MAX_UPLOAD_EDGE)
      const jpeg = await encodeImage(decoded, size, 'image/jpeg')
      if (jpeg && jpeg.type === 'image/jpeg' && jpeg.size > 0) return jpeg
    } finally {
      decoded.close()
    }
  } catch {
    // Unreadable: said below.
  }
  throw new Error("This photo can't be read. Try another one, or take it with the camera.")
}

/** DELETE /bookings/:id/photos/:photoId — one of the customer's own. */
export async function deleteMyCarPhoto(bookingId: string, photoId: string): Promise<void> {
  await apiClient<ApiJobPhoto>(`/bookings/${bookingId}/photos/${photoId}`, { method: 'DELETE' })
}

/** Presign under `base`/upload-url, PUT the bytes, then record the key at `base`. */
async function uploadAndRecord(
  base: string,
  stage: JobPhotoStage,
  file: Blob,
  angle?: PhotoAngle
): Promise<JobPhoto> {
  const contentType = file.type as UploadContentType
  const { uploadUrl, key } = await apiClient<{
    uploadUrl: string
    key: string
    publicUrl: string
  }>(`${base}/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ stage, contentType }),
  })

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  })
  if (!put.ok) {
    throw new Error('Upload failed. Please try again.')
  }

  const photo = await apiClient<ApiJobPhoto>(base, {
    method: 'POST',
    body: JSON.stringify({ stage, key, ...(angle && { angle }) }),
  })
  return mapJobPhoto(photo)
}

export interface FinalBillInput {
  lines: Array<{ description: string; amount: number }>
  note?: string
}

/**
 * POST /vendors/me/bookings/:id/final-bill — raise the bill, or replace the
 * unpaid one. The server works out what is already paid and what is due.
 */
export async function raiseFinalBill(bookingId: string, input: FinalBillInput): Promise<FinalBill> {
  const bill = await apiClient<ApiFinalBill>(`/vendors/me/bookings/${bookingId}/final-bill`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return mapFinalBill(bill)
}

/** What the app needs to open the checkout for a bill's balance. */
export interface FinalBillOrder {
  bookingId: string
  chargeId: string
  orderId: string
  /** In paise. */
  amount: number
  currency: string
  keyId: string
}

/**
 * POST /bookings/:id/charges/:chargeId/pay — the Razorpay order for the
 * balance. The same order comes back on every tap until it is paid.
 */
export async function payFinalBill(bookingId: string, chargeId: string): Promise<FinalBillOrder> {
  return apiClient<FinalBillOrder>(`/bookings/${bookingId}/charges/${chargeId}/pay`, {
    method: 'POST',
  })
}

/** POST /bookings/:id/charges/:chargeId/verify — after Razorpay reports it paid. */
export async function verifyFinalBillPayment(
  bookingId: string,
  chargeId: string,
  payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }
): Promise<{ bookingId: string; finalBill: FinalBill }> {
  const result = await apiClient<{ bookingId: string; finalBill: ApiFinalBill }>(
    `/bookings/${bookingId}/charges/${chargeId}/verify`,
    { method: 'POST', body: JSON.stringify(payload) }
  )
  return { bookingId: result.bookingId, finalBill: mapFinalBill(result.finalBill) }
}

// ─── Extra work (0041) ───────────────────────────────────────────────────────

export interface ExtraWorkInput {
  description: string
  /** Rupees. */
  amount: number
  note?: string
  /** Photos already sized for upload (the portal's resizeImageForUpload), at most three. */
  photos: Blob[]
}

/**
 * POST /vendors/me/bookings/:id/extra-work — ask the customer for extra work.
 * Each photo goes straight to storage first, into the job's own photo folder
 * (the same presign as job photos), and the request names them by key.
 */
export async function askExtraWork(bookingId: string, input: ExtraWorkInput): Promise<ExtraWork> {
  const photoKeys: string[] = []
  for (const file of input.photos) {
    const contentType = file.type as UploadContentType
    const { uploadUrl, key } = await apiClient<{ uploadUrl: string; key: string; publicUrl: string }>(
      `/vendors/me/bookings/${bookingId}/extra-work/upload-url`,
      { method: 'POST', body: JSON.stringify({ contentType }) }
    )
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': contentType },
    })
    if (!put.ok) throw new Error('A photo did not upload. Please try again.')
    photoKeys.push(key)
  }

  const work = await apiClient<ApiExtraWork>(`/vendors/me/bookings/${bookingId}/extra-work`, {
    method: 'POST',
    body: JSON.stringify({
      description: input.description,
      amount: input.amount,
      ...(input.note ? { note: input.note } : {}),
      photoKeys,
    }),
  })
  return mapExtraWork(work)
}

/** POST /vendors/me/bookings/:id/extra-work/:chargeId/withdraw — only while unpaid. */
export async function withdrawExtraWork(bookingId: string, chargeId: string): Promise<ExtraWork> {
  const work = await apiClient<ApiExtraWork>(
    `/vendors/me/bookings/${bookingId}/extra-work/${chargeId}/withdraw`,
    { method: 'POST' }
  )
  return mapExtraWork(work)
}

/** POST /bookings/:id/charges/:chargeId/decline — the customer says no. */
export async function declineExtraWork(bookingId: string, chargeId: string): Promise<ExtraWork> {
  const work = await apiClient<ApiExtraWork>(`/bookings/${bookingId}/charges/${chargeId}/decline`, {
    method: 'POST',
  })
  return mapExtraWork(work)
}

/**
 * "Approve & pay": the same Razorpay order and verify as a final bill
 * (payFinalBill opens it); paying is the approval.
 */
export async function verifyExtraWorkPayment(
  bookingId: string,
  chargeId: string,
  payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }
): Promise<{ bookingId: string; extraWork: ExtraWork }> {
  const result = await apiClient<{ bookingId: string; extraWork: ApiExtraWork }>(
    `/bookings/${bookingId}/charges/${chargeId}/verify`,
    { method: 'POST', body: JSON.stringify(payload) }
  )
  return { bookingId: result.bookingId, extraWork: mapExtraWork(result.extraWork) }
}
