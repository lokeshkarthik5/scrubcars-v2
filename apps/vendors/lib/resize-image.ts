/**
 * Turns a photo from a phone camera into something worth uploading: a JPEG
 * no larger than 1600px on its longest side.
 *
 * A modern phone takes 12–50 megapixel photos of 4–12 MB, over the 5 MB the
 * photo upload allows, and far more than a job record needs. Shrinking in the
 * browser first means a garage never has a photo refused for its size, and a
 * mechanic on a weak signal uploads a few hundred KB instead of megabytes.
 */

import { decodeImage, encodeImage, fitWithin, type DecodedImage } from '@repo/core/image-upload'

export const MAX_UPLOAD_DIMENSION = 1600

/** The upload limit the photo screens use (see /photos). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const JPEG_QUALITY = 0.85

/**
 * The photo, scaled down to fit MAX_UPLOAD_DIMENSION and re-encoded as JPEG.
 * A photo already small enough is still re-encoded, which also strips its
 * location metadata before it leaves the phone. Decoding and encoding are the
 * shared ones every other upload uses (@repo/core/image-upload); unlike those,
 * a photo that can't be read is refused here, since a job photo is always
 * sent on as a JPEG.
 */
export async function resizeForUpload(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not a photo.`)
  }

  let decoded: DecodedImage
  try {
    decoded = await decodeImage(file)
  } catch {
    throw new Error(`${file.name} couldn't be read. Try another photo, or take one with the camera.`)
  }

  let blob: Blob | null
  try {
    blob = await encodeImage(
      decoded,
      fitWithin(decoded.width, decoded.height, MAX_UPLOAD_DIMENSION),
      'image/jpeg',
      JPEG_QUALITY
    )
  } finally {
    decoded.close()
  }
  if (!blob || blob.type !== 'image/jpeg') throw new Error(`${file.name} couldn't be prepared for upload.`)
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is too large (max 5 MB).`)
  return blob
}
