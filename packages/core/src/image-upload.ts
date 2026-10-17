/**
 * Getting a photo ready to leave the browser.
 *
 * A photo taken on a phone usually carries EXIF metadata: the camera, the
 * time, and often the GPS position it was taken at — a customer's home, for
 * an avatar shot in the driveway. Uploads go straight from the browser to R2
 * on a presigned URL, so the API never sees the bytes and cannot clean them;
 * it has to happen here. Drawing the decoded pixels onto a canvas and encoding
 * them again keeps the picture and drops everything else.
 *
 * Every image upload in packages/core/src/api goes through
 * `stripImageMetadata` (job photos through the vendor portal's
 * `resizeForUpload`, which re-encodes with the same decoder). Videos go to
 * Cloudflare Stream untouched.
 */

export type UploadImageType = 'image/jpeg' | 'image/png' | 'image/webp'

/** The three types every presigned photo upload accepts. */
export const UPLOAD_IMAGE_TYPES: readonly UploadImageType[] = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Longest side a cleaned photo keeps. Bigger than anything the apps show
 * (the largest is a full-width gallery photo), so nobody sees the difference;
 * a 50-megapixel original is 8000px and would only be slow to upload.
 */
export const MAX_UPLOAD_EDGE = 2560

/** High enough that a second encode is not visible in a photo. */
const LOSSY_QUALITY = 0.9

export function isUploadImageType(type: string): type is UploadImageType {
  return (UPLOAD_IMAGE_TYPES as readonly string[]).includes(type)
}

/** `width` × `height` scaled down, never up, so its longer side is at most `maxEdge`. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** The encoder quality for a type; PNG is lossless and takes none. */
export function encodeQuality(type: UploadImageType): number | undefined {
  return type === 'image/png' ? undefined : LOSSY_QUALITY
}

export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  /** Frees the decoded pixels; call once drawn. */
  close(): void
}

/**
 * The image's pixels, the right way up. Throws when the browser cannot read
 * it (a HEIC photo outside Safari, a damaged file).
 */
export async function decodeImage(file: Blob): Promise<DecodedImage> {
  // createImageBitmap applies the EXIF orientation with 'from-image', so a
  // portrait shot stays portrait once the EXIF that said so is gone. An
  // <img> does the same in every browser that lacks createImageBitmap.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // Fall through to the <img> path.
    }
  }

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('This browser cannot read the image')
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('unreadable'))
      image.src = url
    })
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * The decoded image drawn at `width` × `height` and encoded as `type`. Null
 * when the browser has no canvas or no encoder for it.
 *
 * The result's own `type` is what the browser actually made: asked for a
 * type it cannot write (Safari and WebP), a canvas hands back a PNG instead,
 * so callers must check it rather than assume.
 */
export async function encodeImage(
  decoded: DecodedImage,
  size: { width: number; height: number },
  type: UploadImageType,
  quality = encodeQuality(type)
): Promise<Blob | null> {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(decoded.source, 0, 0, size.width, size.height)
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size.width, size.height)
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(decoded.source, 0, 0, size.width, size.height)
    return canvas.convertToBlob({ type, quality })
  }

  return null
}

/**
 * `file` without its metadata (location, camera, time), as the same type,
 * scaled down to MAX_UPLOAD_EDGE if larger.
 *
 * Never throws and never blocks an upload: anything that is not a JPEG, PNG
 * or WebP, or that this browser cannot decode or write back as the same
 * type, comes back as it was. Upload the result, and presign with the
 * result's `type`, which is always the type given.
 */
export async function stripImageMetadata(file: Blob): Promise<Blob> {
  const type = file.type
  if (!isUploadImageType(type)) return file

  let decoded: DecodedImage
  try {
    decoded = await decodeImage(file)
  } catch {
    return file
  }

  try {
    const blob = await encodeImage(decoded, fitWithin(decoded.width, decoded.height, MAX_UPLOAD_EDGE), type)
    // A different type would no longer match the extension and Content-Type
    // the upload is presigned for; keep the original rather than change it.
    return blob && blob.type === type && blob.size > 0 ? blob : file
  } catch {
    return file
  } finally {
    decoded.close()
  }
}
