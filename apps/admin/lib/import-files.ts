/**
 * Getting picked files ready for the garage import, in the browser: photos
 * shrunk to 2000 px on their longest side and re-encoded as JPEG, PDFs as
 * they are, all as base64 for the API's JSON body. Nothing is kept: the
 * files go to the API once, and the page forgets them when the admin
 * leaves the review.
 *
 * A phone photo is 4–12 MB, over what one request may carry (about 4.5 MB
 * on the API's host). 2000 px keeps a poster's small print legible to the
 * reader and comes to a few hundred KB.
 */
import type { GarageImportInput } from '@repo/core/api/admin'
import { IMPORT_IMAGE_EDGE, MAX_IMPORT_BASE64_CHARS, importFileKind } from './garage-import'

const JPEG_QUALITY = 0.85

type ImportFile = Extract<GarageImportInput, { source: 'files' }>['files'][number]

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  // createImageBitmap honours the photo's orientation, so a portrait shot
  // stays portrait. Older browsers fall back to an <img>, which does too.
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

/** The photo at most IMPORT_IMAGE_EDGE on its longest side, as JPEG. */
async function shrink(file: File): Promise<Blob> {
  let decoded: Awaited<ReturnType<typeof decode>>
  try {
    decoded = await decode(file)
  } catch {
    throw new Error(`“${file.name}” couldn't be opened. Try another photo, or a screenshot of it.`)
  }
  const scale = Math.min(1, IMPORT_IMAGE_EDGE / Math.max(decoded.width, decoded.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(decoded.width * scale))
  canvas.height = Math.max(1, Math.round(decoded.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare photos for upload.')
  // White under a transparent PNG, rather than JPEG's black.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
  if ('close' in decoded.source && typeof decoded.source.close === 'function') decoded.source.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error(`“${file.name}” couldn't be prepared for upload.`)
  return blob
}

/** A blob's bytes as base64, without the data URL's prefix. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('The file could not be read.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * The picked files as the API takes them. Throws an Error with words for
 * the admin when a photo can't be opened or the whole is too big.
 */
export async function prepareImportFiles(files: File[]): Promise<ImportFile[]> {
  const prepared: ImportFile[] = []
  for (const file of files) {
    if (importFileKind(file) === 'pdf') {
      prepared.push({ name: file.name, mimeType: 'application/pdf', dataBase64: await toBase64(file) })
    } else {
      const jpeg = await shrink(file)
      prepared.push({ name: file.name, mimeType: 'image/jpeg', dataBase64: await toBase64(jpeg) })
    }
  }
  const total = prepared.reduce((sum, file) => sum + file.dataBase64.length, 0)
  if (total > MAX_IMPORT_BASE64_CHARS) {
    throw new Error('These files are too big to read together (about 3 MB at most). Send fewer pages, or smaller photos.')
  }
  return prepared
}
