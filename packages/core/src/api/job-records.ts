import { apiClient } from './client'
import { mapFinalBill } from './mappers'
import type { ApiFinalBill, ApiJobPhoto } from './types'
import type { FinalBill, JobPhoto } from '@repo/core/types'

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
 * then register the key the upload went to. The caller hands over an image
 * already sized for upload (the portal turns phone photos into JPEGs first).
 */
export async function uploadJobPhoto(
  bookingId: string,
  stage: JobPhotoStage,
  file: Blob
): Promise<JobPhoto> {
  const contentType = file.type as UploadContentType
  const { uploadUrl, key } = await apiClient<{
    uploadUrl: string
    key: string
    publicUrl: string
  }>(`/vendors/me/bookings/${bookingId}/photos/upload-url`, {
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

  return apiClient<ApiJobPhoto>(`/vendors/me/bookings/${bookingId}/photos`, {
    method: 'POST',
    body: JSON.stringify({ stage, key }),
  })
}

/** DELETE /vendors/me/bookings/:id/photos/:photoId */
export async function deleteJobPhoto(bookingId: string, photoId: string): Promise<void> {
  await apiClient<ApiJobPhoto>(`/vendors/me/bookings/${bookingId}/photos/${photoId}`, {
    method: 'DELETE',
  })
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
