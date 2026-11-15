import { apiClient } from '@repo/core/api/client';
import { mapExtraWork, mapFinalBill, mapJobPhoto } from '@repo/core/api/mappers';
import type { ApiExtraWork, ApiFinalBill, ApiJobPhoto } from '@repo/core/api/types';
import type { JobPhotoAngle } from '@repo/core/job-photo-standards';
import type { JobPhoto } from '@repo/core/types';
import { t } from '@repo/core/i18n/translate';

/**
 * The garage's side of packages/core/src/api/job-records.ts, whose module imports
 * image-upload and so can't come to the phone. The same requests, with the bytes
 * photo-prepare.ts made in place of a browser Blob.
 */
const put = (uploadUrl: string, bytes: Uint8Array) =>
  fetch(uploadUrl, {
    method: 'PUT',
    body: bytes as unknown as BodyInit,
    headers: { 'Content-Type': 'image/jpeg' },
  });

export async function uploadJobPhoto(
  bookingId: string,
  stage: JobPhoto['stage'],
  bytes: Uint8Array,
  angle?: JobPhotoAngle
): Promise<JobPhoto> {
  const base = `/vendors/me/bookings/${bookingId}/photos`;
  const { uploadUrl, key } = await apiClient<{ uploadUrl: string; key: string }>(`${base}/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ stage, contentType: 'image/jpeg' }),
  });
  const sent = await put(uploadUrl, bytes);
  if (!sent.ok) throw new Error(t('Upload failed. Please try again.'));
  const photo = await apiClient<ApiJobPhoto>(base, {
    method: 'POST',
    body: JSON.stringify({ stage, key, ...(angle && { angle }) }),
  });
  return mapJobPhoto(photo);
}

export async function deleteJobPhoto(bookingId: string, photoId: string): Promise<void> {
  await apiClient<ApiJobPhoto>(`/vendors/me/bookings/${bookingId}/photos/${photoId}`, { method: 'DELETE' });
}

export async function raiseFinalBill(
  bookingId: string,
  input: { lines: { description: string; amount: number }[]; note?: string }
) {
  const bill = await apiClient<ApiFinalBill>(`/vendors/me/bookings/${bookingId}/final-bill`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapFinalBill(bill);
}

export async function askExtraWork(
  bookingId: string,
  input: { description: string; amount: number; note?: string; photos: Uint8Array[] }
) {
  const photoKeys: string[] = [];
  for (const bytes of input.photos) {
    const { uploadUrl, key } = await apiClient<{ uploadUrl: string; key: string }>(
      `/vendors/me/bookings/${bookingId}/extra-work/upload-url`,
      { method: 'POST', body: JSON.stringify({ contentType: 'image/jpeg' }) }
    );
    const sent = await put(uploadUrl, bytes);
    if (!sent.ok) throw new Error(t('A photo did not upload. Please try again.'));
    photoKeys.push(key);
  }
  const work = await apiClient<ApiExtraWork>(`/vendors/me/bookings/${bookingId}/extra-work`, {
    method: 'POST',
    body: JSON.stringify({
      description: input.description,
      amount: input.amount,
      ...(input.note ? { note: input.note } : {}),
      photoKeys,
    }),
  });
  return mapExtraWork(work);
}

export async function withdrawExtraWork(bookingId: string, chargeId: string) {
  const work = await apiClient<ApiExtraWork>(`/vendors/me/bookings/${bookingId}/extra-work/${chargeId}/withdraw`, {
    method: 'POST',
  });
  return mapExtraWork(work);
}
