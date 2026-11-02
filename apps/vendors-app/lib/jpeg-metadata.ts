/**
 * Whether a JPEG still says where it was taken: a GPS block in its EXIF, or GPS
 * fields in its XMP. The last check before a photo leaves the phone, because the
 * re-encode in photo-prepare.ts is what strips them and a platform could change.
 * Pure, so it is tested on real bytes.
 */
const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.subarray(from, from + length));

function exifHasGps(bytes: Uint8Array, start: number, end: number): boolean {
  // "Exif\0\0", then a TIFF header: byte order, 42, offset of the first directory.
  const tiff = start + 6;
  if (tiff + 8 > end) return false;
  const little = bytes[tiff] === 0x49;
  const u16 = (at: number) => (little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
  const u32 = (at: number) =>
    little
      ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
      : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  const directory = tiff + u32(tiff + 4);
  if (directory + 2 > end) return false;
  const entries = u16(directory);
  for (let i = 0; i < entries; i += 1) {
    const entry = directory + 2 + i * 12;
    if (entry + 12 > end) return false;
    // 0x8825: GPSInfo, the pointer to the location block.
    if (u16(entry) === 0x8825) return true;
  }
  return false;
}

export function jpegHasLocation(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    // Start of scan: the metadata segments all come before the picture.
    if (marker === 0xda) return false;
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    const start = at + 4;
    const end = Math.min(at + 2 + length, bytes.length);
    if (marker === 0xe1) {
      if (ascii(bytes, start, 4) === 'Exif' && exifHasGps(bytes, start, end)) return true;
      if (ascii(bytes, start, 4) === 'http' && ascii(bytes, start, end - start).includes('GPS')) return true;
    }
    at = at + 2 + length;
  }
  return false;
}
