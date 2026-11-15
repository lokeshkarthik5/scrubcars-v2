import { apiClient } from '@repo/core/api/client';
import { t } from '@repo/core/i18n/translate';
import { REPAIR_QUOTE_RULES, frameTimes, videoProblem, videoShortHint, wipeVideoLocation } from '@repo/core/repair-quotes';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { createVideoPlayer } from 'expo-video';

import { fitWithin, prepareForUpload } from './photo-prepare';
import { videoTypeOf } from './repair-quote-view';

/**
 * apps/users/lib/repair-media.ts for a phone (repair quotes, 0075): the video picked or
 * recorded, still frames taken from it for Detlio's brief (the AI reads pictures, not
 * video: expo-video's thumbnails, re-encoded by expo-image-manipulator so nothing but the
 * picture comes with them), the video wiped of where it was recorded before it is
 * uploaded (core's wipeVideoLocation over its bytes), and the base64 copies the brief
 * sends. Photos go through photo-prepare.ts like every customer photo (core's
 * stripImageMetadata does nothing on a phone).
 */

/** A picture on its way: a local preview and the JPEG's bytes. */
export interface RepairPicture {
  id: string;
  kind: 'photo' | 'frame';
  uri: string;
  bytes: Uint8Array;
}

export interface RepairVideo {
  uri: string;
  secs: number;
  type: string;
  size: number;
}

const FRAME_EDGE = 1280;
const BRIEF_EDGE = 1024;
let counter = 0;
const nextId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * Record (or, without a camera, pick) one video, held to the rules: a problem is thrown in
 * words the screen shows; a short one comes back with its gentle hint.
 */
export async function pickRepairVideo(record: boolean): Promise<{ video: RepairVideo; hint: string | null } | null> {
  let picked: ImagePicker.ImagePickerResult;
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['videos'], videoMaxDuration: REPAIR_QUOTE_RULES.videoMaxSecs, quality: 1 };
  if (record) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    picked = permission.granted ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  } else {
    picked = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = picked.canceled ? null : picked.assets?.[0];
  if (!asset) return null;
  const file = new File(asset.uri);
  const size = asset.fileSize ?? file.size ?? 0;
  const secs = asset.duration ? asset.duration / 1000 : await durationOf(asset.uri);
  const type = videoTypeOf(asset.mimeType, asset.uri);
  const problem = videoProblem({ durationSecs: secs, sizeBytes: size, type });
  if (problem) throw new Error(t(problem));
  const hint = videoShortHint(secs);
  return { video: { uri: asset.uri, secs: Math.max(1, Math.round(secs)), type, size }, hint: hint ? t(hint) : null };
}

async function loadedPlayer(uri: string) {
  const player = createVideoPlayer(uri);
  const started = Date.now();
  while (player.status !== 'readyToPlay' && player.status !== 'error' && Date.now() - started < 10_000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return player;
}

async function durationOf(uri: string): Promise<number> {
  const player = await loadedPlayer(uri);
  const duration = player.duration;
  player.release();
  return duration;
}

/** Up to `count` frames spread through the video, as JPEGs with nothing but the picture. */
export async function extractRepairFrames(video: RepairVideo, count = REPAIR_QUOTE_RULES.maxFrames): Promise<RepairPicture[]> {
  const player = await loadedPlayer(video.uri);
  try {
    const thumbs = await player.generateThumbnailsAsync(frameTimes(player.duration || video.secs, count), { maxWidth: FRAME_EDGE });
    const frames: RepairPicture[] = [];
    for (const thumb of thumbs) {
      const image = await ImageManipulator.manipulate(thumb).renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      frames.push({ id: nextId(), kind: 'frame', uri: saved.uri, bytes: await new File(saved.uri).bytes() });
    }
    return frames;
  } catch {
    // No frames: the photos (or the customer's own words) carry the brief.
    return [];
  } finally {
    player.release();
  }
}

/** One photo, re-encoded without its metadata (photo-prepare.ts). */
export async function prepareRepairPhoto(uri: string): Promise<RepairPicture> {
  const prepared = await prepareForUpload(uri);
  return { id: nextId(), kind: 'photo', uri: prepared.uri, bytes: prepared.bytes };
}

/** A small JPEG copy of a picture for the brief, as base64. */
export async function briefImage(picture: RepairPicture): Promise<{ mimeType: 'image/jpeg'; dataBase64: string }> {
  const decoded = await ImageManipulator.manipulate(picture.uri).renderAsync();
  const size = fitWithin(decoded.width, decoded.height, BRIEF_EDGE);
  const image = size.width === decoded.width ? decoded : await ImageManipulator.manipulate(picture.uri).resize(size).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { mimeType: 'image/jpeg', dataBase64: await new File(saved.uri).base64() };
}

/** Presign (the size is signed into the link), then PUT the bytes; the key the request names it by. */
async function upload(kind: 'video' | 'photo', contentType: string, bytes: Uint8Array): Promise<string> {
  const { uploadUrl, key } = await apiClient<{ uploadUrl: string; key: string }>('/users/me/repair-quotes/upload-url', {
    method: 'POST',
    body: JSON.stringify({ kind, contentType, sizeBytes: bytes.length }),
  });
  const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: bytes as unknown as BodyInit });
  if (!response.ok) throw new Error(t('Upload failed. Please try again.'));
  return key;
}

export function uploadRepairPicture(picture: RepairPicture): Promise<string> {
  return upload('photo', 'image/jpeg', picture.bytes);
}

/** The video, with the place the phone recorded zeroed in its own bytes first. */
export async function uploadRepairVideo(video: RepairVideo): Promise<string> {
  const bytes = await new File(video.uri).bytes();
  wipeVideoLocation(bytes);
  return upload('video', video.type, bytes);
}
