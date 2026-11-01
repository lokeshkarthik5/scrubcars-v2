import { apiClient } from '@repo/core/api/client';
import type { PhotoAngle } from '@repo/core/job-photo-standards';
import type { JobPhoto } from '@repo/core/types';

import { prepareForUpload } from './photo-prepare';

/**
 * The customer's own photo of their car: the web's uploadMyCarPhoto, with the phone's own
 * re-encode in place of core's browser-only one (which would silently keep the metadata
 * here). Presign, PUT the bytes, record the key.
 */
export async function uploadCarPhoto(bookingId: string, stage: JobPhoto['stage'], uri: string, angle?: PhotoAngle): Promise<void> {
  const prepared = await prepareForUpload(uri, 'This photo');
  const base = `/bookings/${bookingId}/photos`;
  const { uploadUrl, key } = await apiClient<{ uploadUrl: string; key: string }>(`${base}/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ stage, contentType: 'image/jpeg' }),
  });
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: prepared.bytes as unknown as BodyInit });
  if (!put.ok) throw new Error('Your photo did not upload. Please try again.');
  await apiClient(base, { method: 'POST', body: JSON.stringify({ stage, key, ...(angle ? { angle } : {}) }) });
}
