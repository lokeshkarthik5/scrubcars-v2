/**
 * Turns a photo from a phone camera into something worth uploading: a JPEG
 * no larger than 1600px on its longest side.
 *
 * A modern phone takes 12–50 megapixel photos of 4–12 MB, over the 5 MB the
 * photo upload allows, and far more than a job record needs. Shrinking in the
 * browser first means a garage never has a photo refused for its size, and a
 * mechanic on a weak signal uploads a few hundred KB instead of megabytes.
 */

export const MAX_UPLOAD_DIMENSION = 1600

/** The upload limit the photo screens use (see /photos). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const JPEG_QUALITY = 0.85

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  // createImageBitmap honours the photo's orientation, so a portrait shot
  // stays portrait. Older browsers fall back to an <img>, which also does in
  // every browser that lacks it.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height }
    } catch {
      // Fall through to the <img> path.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('unreadable'))
      image.src = url
    })
    return { source: img, width: img.naturalWidth, height: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * The photo, scaled down to fit MAX_UPLOAD_DIMENSION and re-encoded as JPEG.
 * A photo already small enough is still re-encoded, which also strips its
 * location metadata before it leaves the phone.
 */
export async function resizeForUpload(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not a photo.`)
  }

  let decoded: Awaited<ReturnType<typeof decode>>
  try {
    decoded = await decode(file)
  } catch {
    throw new Error(`${file.name} couldn't be read. Try another photo, or take one with the camera.`)
  }

  const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(decoded.width, decoded.height))
  const width = Math.max(1, Math.round(decoded.width * scale))
  const height = Math.max(1, Math.round(decoded.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare photos for upload.')
  context.drawImage(decoded.source, 0, 0, width, height)
  if ('close' in decoded.source && typeof decoded.source.close === 'function') {
    decoded.source.close()
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  )
  if (!blob) throw new Error(`${file.name} couldn't be prepared for upload.`)
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is too large (max 5 MB).`)
  return blob
}
