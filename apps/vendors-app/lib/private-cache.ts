import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { onBeforeSignOut } from './auth';
import { uniqueCacheName } from './cache-names';
import {
  DELETE_AFTER_SHARE_MS,
  isInside,
  PRIVATE_DIR,
  privateFileName,
  SWEPT_CACHE_DIRS,
} from './private-files';

/**
 * Private files on the phone's disk (see private-files.ts): made in one app-only folder of the cache,
 * deleted when done, and swept on sign-out and on launch so nothing outlives the person.
 */
function privateDir(): Directory {
  const dir = new Directory(Paths.cache, PRIVATE_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * A new, empty file in the app's private folder. With a `name` (an earnings file keeps the
 * web's download name) it sits in a folder of its own, so two never share a path; without, the
 * name says nothing about what is in it.
 */
export function newPrivateFile(contentType: string, name?: string): File {
  let dir = privateDir();
  if (name) {
    dir = new Directory(dir, uniqueCacheName('d', 'dir'));
    dir.create({ intermediates: true });
  }
  const file = new File(dir, name ?? privateFileName(contentType));
  file.create({ overwrite: true });
  return file;
}

/** Deletes the files at these uris that are inside the cache; others (a library photo) are left alone. */
export function discardCached(uris: (string | null | undefined)[]) {
  for (const uri of uris) {
    if (!uri || !isInside(uri, Paths.cache.uri)) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Cache files are the system's to clear in the end.
    }
  }
}

/** Deletes a shared file: at once on iOS, and after the other app has had time to read it on Android. */
export function discardAfterShare(file: File) {
  const wait = DELETE_AFTER_SHARE_MS[Platform.OS === 'android' ? 'android' : 'ios'];
  const remove = () => discardCached([file.uri]);
  if (wait === 0) remove();
  else setTimeout(remove, wait);
}

/** Empties every cache folder that may hold a private copy. */
export function clearPrivateCache() {
  for (const name of SWEPT_CACHE_DIRS) {
    try {
      const dir = new Directory(Paths.cache, name);
      if (dir.exists) dir.delete();
    } catch {
      // Nothing to clear, or it is already going.
    }
  }
}

onBeforeSignOut(() => clearPrivateCache());
