import { apiClient } from '@repo/core/api/client';
import type { GarageLuxury, SendLuxuryApplication } from '@repo/core/api/luxury';
import { t } from '@repo/core/i18n/translate';
import { useQuery } from '@tanstack/react-query';

/**
 * packages/core/src/api/luxury.ts for the phone: that module imports image-upload, which
 * can't come here, and its hooks the admin ones. The same requests (only the types are
 * shared), so the endpoints stay the one place they are. A photo goes up as the JPEG bytes
 * lib/photo-prepare.ts made, in place of a browser File.
 */
export const getGarageLuxury = () => apiClient<GarageLuxury>('/vendors/me/luxury');

export const sendLuxuryApplication = (input: SendLuxuryApplication) =>
  apiClient<GarageLuxury>('/vendors/me/luxury', { method: 'PUT', body: JSON.stringify(input) });

/** One past-job photo: a presigned PUT in the garage's luxury folder, then its public URL. */
export async function uploadLuxuryPhoto(bytes: Uint8Array): Promise<string> {
  const { uploadUrl, publicUrl } = await apiClient<{ uploadUrl: string; publicUrl: string }>(
    '/vendors/me/luxury/photos/upload-url',
    // The exact size is signed into the upload (at most 8 MB; photo-prepare.ts keeps it under 5).
    { method: 'POST', body: JSON.stringify({ contentType: 'image/jpeg', sizeBytes: bytes.length }) }
  );
  const sent = await fetch(uploadUrl, {
    method: 'PUT',
    body: bytes as unknown as BodyInit,
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (!sent.ok) throw new Error(t('Upload failed. Please try again.'));
  return publicUrl;
}

export const luxuryQueryKey = (vendorId: string | undefined) => ['luxury', 'garage', vendorId ?? 'none'] as const;

/** packages/core/src/api/hooks/use-luxury.ts */
export function useGarageLuxury(vendorId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: luxuryQueryKey(vendorId),
    queryFn: getGarageLuxury,
    enabled: Boolean(vendorId) && enabled,
    retry: false,
  });
}
