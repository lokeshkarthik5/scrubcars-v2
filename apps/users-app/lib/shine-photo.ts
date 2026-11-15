import { SHINE_NUMBERS } from '@repo/core/shine-score';
import { t } from '@repo/core/i18n/translate';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { bytesToBase64 } from './base64';
import { jpegHasLocation } from './jpeg-metadata';
import { fitWithin } from './photo-prepare';

/**
 * Shine Score's photos (0078; the web's lib/shine-photo.ts): re-encoded on the phone as a
 * JPEG at most SHINE_NUMBERS.photoEdge on its longer side (smaller if it comes out over
 * maxPhotoBytes), which drops where and when it was taken. Core's stripImageMetadata does
 * nothing on a phone, so expo-image-manipulator does it, and the bytes are checked for a
 * location before they go anywhere (photo-prepare.ts does the same).
 */
export interface ShinePhoto {
  /** The local copy, for the slot and the check screen. */
  uri: string;
  dataBase64: string;
  mimeType: 'image/jpeg';
}

export async function prepareShinePhoto(uri: string): Promise<ShinePhoto> {
  let edge: number = SHINE_NUMBERS.photoEdge;
  let compress = 0.82;
  try {
    const decoded = await ImageManipulator.manipulate(uri).renderAsync();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const size = fitWithin(decoded.width, decoded.height, edge);
      const image = await ImageManipulator.manipulate(uri).resize(size).renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress });
      const bytes = await new File(saved.uri).bytes();
      if (jpegHasLocation(bytes)) throw new Error('location');
      if (bytes.length <= SHINE_NUMBERS.maxPhotoBytes) return { uri: saved.uri, dataBase64: bytesToBase64(bytes), mimeType: 'image/jpeg' };
      edge = Math.round(edge * 0.8);
      compress = Math.max(0.6, compress - 0.08);
    }
  } catch {
    // Said below, in the screen's words.
  }
  throw new Error(t("Couldn't read that photo. Try another one."));
}

/** The camera (Take photo), or the phone's photos (Choose from gallery). Null when cancelled. */
export async function pickShinePhoto(from: 'camera' | 'gallery'): Promise<string | null> {
  let picked: ImagePicker.ImagePickerResult;
  if (from === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    try {
      if (!permission.granted) throw new Error('no camera');
      picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
    } catch {
      // A phone without a camera (the simulator), or no permission: the photos instead.
      picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
    }
  } else {
    picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  }
  return picked.canceled ? null : (picked.assets?.[0]?.uri ?? null);
}
