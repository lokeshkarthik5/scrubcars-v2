/**
 * A cache file name no other upload shares: two uploads running at once must never write the
 * same file, and each deletes only its own.
 */
export function uniqueCacheName(prefix: string, ext: string, random: () => number = Math.random): string {
  const suffix = `${Date.now().toString(36)}-${Math.floor(random() * 0xffffffff).toString(36)}`;
  return `${prefix}-${suffix}.${ext}`;
}
