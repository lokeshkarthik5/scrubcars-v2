import { MAX_SOURCE_BYTES } from './photo-limits';

/**
 * The checks and words of Garage photos (apps/vendors/app/photos/page.tsx), kept pure so they can
 * be tested. The web checks the file it was given; here the picker says the type and size, and
 * photo-prepare.ts then re-encodes what passes as a JPEG (which drops its location) and holds
 * the result to 5 MB: the size is checked on what is sent, not on the original (photo-limits.ts).
 */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export { MAX_SOURCE_BYTES };

export const PHOTOS_LOAD_FAILED = 'Failed to load photos';
export const PHOTO_DELETE_FAILED = 'Failed to delete photo';
export const LOGO_REMOVE_FAILED = 'Failed to remove logo';
export const UPLOAD_FAILED = 'Upload failed';
export const PHOTOS_SUBTITLE = 'JPEG, PNG or WebP · up to 5 MB each. These show on your public listing.';
export const LOGO_SUBTITLE = 'Shown next to your garage in customer listings.';

export interface PickedPhoto {
  name: string;
  mimeType?: string | null;
  /** Bytes, when the picker knows them. */
  size?: number | null;
}

/** A phone's own photo format is accepted: it is sent as JPEG, as the browser does after its own conversion. */
const isAccepted = (mimeType: string | null | undefined) => {
  const type = (mimeType ?? '').toLowerCase();
  return (PHOTO_TYPES as readonly string[]).includes(type) || type === 'image/jpg' || type === 'image/heic' || type === 'image/heif';
};

/** The logo's toast, or null when the file can go. */
export function logoProblem(file: PickedPhoto): string | null {
  if (!isAccepted(file.mimeType)) return 'Unsupported type (use JPEG, PNG or WebP)';
  if ((file.size ?? 0) > MAX_SOURCE_BYTES) return 'Logo too large (max 5 MB)';
  return null;
}

/** A listing photo's toast, named by its file, or null when the file can go. */
export function photoProblem(file: PickedPhoto): string | null {
  if (!isAccepted(file.mimeType)) return `${file.name}: unsupported type (use JPEG, PNG or WebP)`;
  if ((file.size ?? 0) > MAX_SOURCE_BYTES) return `${file.name}: too large (max 5 MB)`;
  return null;
}

/** A tile's size in a two-column grid with `gap` between, in a container `width` wide. */
export const tileSize = (width: number, gap = 8) => Math.max(0, Math.floor((width - gap) / 2));
