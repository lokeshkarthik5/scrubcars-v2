import { apiClient } from '@repo/core/api/client';
import { getAvatarUploadUrl, setAvatar } from '@repo/core/api/users';
import type { PhotoAngle } from '@repo/core/job-photo-standards';
import type { JobPhoto, User } from '@repo/core/types';
import * as ImagePicker from 'expo-image-picker';

import { prepareForUpload, type PreparedPhoto } from './photo-prepare';

/**
 * Every photo the customer sends: re-encoded on the phone first (photo-prepare.ts, which drops
 * location and camera details and refuses to go on if it finds any left). Core's
 * stripImageMetadata does nothing on a phone, so core's own uploaders are not used.
 */
async function put(uploadUrl: string, prepared: PreparedPhoto) {
  const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: prepared.bytes as unknown as BodyInit });
  if (!response.ok) throw new Error('Your photo did not upload. Please try again.');
}

/** The camera, as the web's `capture`; a phone without one (the simulator) picks from its photos. */
export async function pickPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  let picked: ImagePicker.ImagePickerResult;
  try {
    if (!permission.granted) throw new Error('no camera');
    picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  } catch {
    picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  }
  return picked.canceled ? null : (picked.assets?.[0]?.uri ?? null);
}

export async function uploadCarPhoto(bookingId: string, stage: JobPhoto['stage'], uri: string, angle?: PhotoAngle): Promise<void> {
  const prepared = await prepareForUpload(uri);
  const base = `/bookings/${bookingId}/photos`;
  const { uploadUrl, key } = await apiClient<{ uploadUrl: string; key: string }>(`${base}/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ stage, contentType: 'image/jpeg' }),
  });
  await put(uploadUrl, prepared);
  await apiClient(base, { method: 'POST', body: JSON.stringify({ stage, key, ...(angle ? { angle } : {}) }) });
}

export async function uploadClaimPhoto(bookingId: string, uri: string): Promise<{ key: string; preview: string }> {
  const prepared = await prepareForUpload(uri);
  const { uploadUrl, key } = await apiClient<{ uploadUrl: string; key: string }>(`/users/me/guarantee/bookings/${bookingId}/photos/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType: 'image/jpeg' }),
  });
  await put(uploadUrl, prepared);
  return { key, preview: prepared.uri };
}

export async function uploadAvatarPhoto(uri: string): Promise<User> {
  const prepared = await prepareForUpload(uri, 'This photo');
  const { uploadUrl, publicUrl } = await getAvatarUploadUrl('image/jpeg');
  await put(uploadUrl, prepared);
  return setAvatar(publicUrl);
}
