import { uniqueCacheName } from './cache-names';

/**
 * The pure half of private-cache.ts. Anything private that must touch the phone's disk
 * (an earnings statement, a document opened outside the app, the original of a picked ID
 * photo) lives in the app's cache only as long as it is needed, and is cleared on sign-out.
 */

/** Where this app writes its own temporary private files, under the cache directory. */
export const PRIVATE_DIR = 'detlio-private';

/**
 * The cache folders the pickers and the image tools write copies into. A picked ID photo is
 * copied here with its location still on it; it is deleted after it is sent, and anything left
 * is swept on sign-out and on launch.
 */
export const SWEPT_CACHE_DIRS = [PRIVATE_DIR, 'ImagePicker', 'DocumentPicker', 'ImageManipulator', 'Camera'] as const;

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'text/csv': 'csv',
};

export const extensionFor = (contentType: string) => EXTENSIONS[contentType.toLowerCase()] ?? 'bin';

/** A name for a temporary private file: unique, with no part of the document's own name. */
export const privateFileName = (contentType: string, random?: () => number) =>
  uniqueCacheName('private', extensionFor(contentType), random);

const stripScheme = (uri: string) => uri.replace(/^file:\/\//, '').replace(/\/+$/, '');

/**
 * Whether `uri` is a file inside `root` (both as the file system gives them). Only such files are
 * ever deleted: never a photo in the person's own library, which a picker may hand back in place.
 */
export function isInside(uri: string, root: string): boolean {
  const base = stripScheme(root);
  const path = stripScheme(uri.split(/[?#]/)[0] ?? '');
  if (!base || path.split('/').includes('..')) return false;
  return path.startsWith(`${base}/`);
}

/** Android keeps the shared file until the other app has read it; iOS has finished when the sheet closes. */
export const DELETE_AFTER_SHARE_MS = { ios: 0, android: 2 * 60 * 1000 } as const;
