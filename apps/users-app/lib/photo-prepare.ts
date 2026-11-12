import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { jpegHasLocation } from './jpeg-metadata';
import { sentTooLarge } from './photo-limits';
import { t } from '@repo/core/i18n/translate';

/**
 * apps/vendors/lib/resize-image.ts for a phone: a JPEG no larger than 1600px on
 * its longest side, always re-encoded, which is what drops the photo's location
 * and the rest of its EXIF before it leaves the phone. Never core's
 * stripImageMetadata, which does nothing in React Native.
 */
export const MAX_UPLOAD_DIMENSION = 1600;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const JPEG_QUALITY = 0.85;

export interface PreparedPhoto {
  /** A local copy for the preview. */
  uri: string;
  bytes: Uint8Array;
}

export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function prepareForUpload(uri: string, name = t('This photo')): Promise<PreparedPhoto> {
  let saved: { uri: string };
  try {
    const decoded = await ImageManipulator.manipulate(uri).renderAsync();
    const size = fitWithin(decoded.width, decoded.height, MAX_UPLOAD_DIMENSION);
    const image =
      size.width === decoded.width
        ? decoded
        : await ImageManipulator.manipulate(uri).resize(size).renderAsync();
    saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  } catch {
    throw new Error(t("{name} couldn't be read. Try another photo, or take one with the camera.", { name }));
  }
  const bytes = await new File(saved.uri).bytes();
  if (sentTooLarge(bytes.length)) throw new Error(t('{name} is too large (max 5 MB).', { name }));
  if (jpegHasLocation(bytes)) throw new Error(t("{name} couldn't be prepared for upload.", { name }));
  return { uri: saved.uri, bytes };
}
