import { decodeImage, encodeImage, fitWithin } from '@repo/core/image-upload'
import { SHINE_NUMBERS, photoStats, photoWarning, type ShinePhotoWarning } from '@repo/core/shine-score'

/** A Shine Score photo, ready to send: re-encoded (no EXIF, no location), at most 1280 px. */
export interface ShinePhoto {
  blob: Blob
  /** A local object URL, for the slot and the check screen. */
  url: string
  mimeType: 'image/jpeg'
  /** Brightness and sharpness, for the warning before scoring; null when the browser could not measure. */
  warning: ShinePhotoWarning | null
}

/** The grey copy the check is measured on. */
const STATS_EDGE = 256

function greyStats(source: CanvasImageSource, width: number, height: number) {
  if (typeof document === 'undefined') return null
  const size = fitWithin(width, height, STATS_EDGE)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(source, 0, 0, size.width, size.height)
  const { data } = context.getImageData(0, 0, size.width, size.height)
  const grey = new Uint8ClampedArray(size.width * size.height)
  for (let i = 0; i < grey.length; i++) {
    grey[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!
  }
  return photoStats(grey, size.width, size.height)
}

/**
 * The picked photo, drawn again as a JPEG at most SHINE_NUMBERS.photoEdge
 * on its longer side (smaller still if it comes out over maxPhotoBytes),
 * which drops its metadata (where and when it was taken, the camera) as
 * every upload in the app does (AGENTS.md: stripImageMetadata). Throws when
 * the browser cannot read the file (a HEIC outside Safari): the screen asks
 * for another photo.
 */
export async function prepareShinePhoto(file: Blob): Promise<ShinePhoto> {
  const decoded = await decodeImage(file)
  try {
    let warning: ShinePhotoWarning | null = null
    try {
      warning = photoWarning(greyStats(decoded.source, decoded.width, decoded.height))
    } catch {
      warning = null
    }
    let edge: number = SHINE_NUMBERS.photoEdge
    let quality = 0.82
    for (let attempt = 0; attempt < 4; attempt++) {
      const blob = await encodeImage(decoded, fitWithin(decoded.width, decoded.height, edge), 'image/jpeg', quality)
      if (!blob || blob.type !== 'image/jpeg' || blob.size === 0) break
      if (blob.size <= SHINE_NUMBERS.maxPhotoBytes) {
        return { blob, url: URL.createObjectURL(blob), mimeType: 'image/jpeg', warning }
      }
      edge = Math.round(edge * 0.8)
      quality = Math.max(0.6, quality - 0.08)
    }
    throw new Error('encode')
  } finally {
    decoded.close()
  }
}

/** A blob as base64, without the data-URL prefix. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk))
  }
  return btoa(binary)
}
