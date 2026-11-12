/**
 * Reading the garage's payment QR (Garage Book payment details, 0073).
 *
 * The garage uploads a screenshot or photo of its GPay, PhonePe or Paytm QR.
 * When it saves, the server reads the QR so the owner can check "We read:
 * x@okaxis · Name" is really theirs. Pure JavaScript (jsqr, jpeg-js, pngjs):
 * no native image library, nothing leaves the process.
 *
 * Only a UPI QR (`upi://pay?pa=…`) is accepted. Anything else, a website or
 * a contact card, is refused, so nothing but the garage's own UPI id can end
 * up printed on its bills. A picture with no QR found in it is not refused:
 * the image is kept and the owner is asked to check it.
 */
import jpegModule from 'jpeg-js'
import jsQRModule from 'jsqr'
import pngModule from 'pngjs'
import { parseUpiUri } from './garage-book.js'

type JsQR = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null

// CommonJS packages: their export sits on `default` or is the module itself,
// depending on who loads them (Node, bun, the TypeScript build).
const jsQR: JsQR =
  (jsQRModule as unknown as { default?: JsQR }).default ?? (jsQRModule as unknown as JsQR)
const jpeg = jpegModule as unknown as typeof import('jpeg-js')
const { PNG } = pngModule as unknown as typeof import('pngjs')

/** Pictures bigger than this many pixels on a side are shrunk before reading. */
const READ_EDGE = 1200
/** And none bigger than this is decoded at all (a phone photo is about 12 MP). */
const MAX_MEGAPIXELS = 40

export type QrRead =
  | { status: 'upi'; upiId: string; upiName: string | null }
  | { status: 'not_upi' }
  | { status: 'unreadable' }

interface Rgba {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

function isPng(bytes: Uint8Array) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

function isJpeg(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

/** The picture as RGBA pixels, or null when it is neither a PNG nor a JPEG, or is broken. */
export function decodeImage(bytes: Uint8Array): Rgba | null {
  try {
    if (isPng(bytes)) {
      const png = PNG.sync.read(Buffer.from(bytes))
      return { width: png.width, height: png.height, data: png.data }
    }
    if (isJpeg(bytes)) {
      const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_MEGAPIXELS, maxMemoryUsageInMB: 512 })
      return { width: image.width, height: image.height, data: image.data }
    }
  } catch {
    // A broken or truncated file reads as no picture at all.
  }
  return null
}

/** A smaller copy, each new pixel the average of the block it covers: a QR in a big photo reads faster and better. */
function shrink(image: Rgba, maxEdge: number): Rgba {
  const scale = Math.max(image.width, image.height) / maxEdge
  if (scale <= 1) return image
  const step = Math.ceil(scale)
  const width = Math.floor(image.width / step)
  const height = Math.floor(image.height / step)
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let dy = 0; dy < step; dy++) {
        const row = (y * step + dy) * image.width
        for (let dx = 0; dx < step; dx++) {
          const i = (row + x * step + dx) * 4
          r += image.data[i]!
          g += image.data[i + 1]!
          b += image.data[i + 2]!
        }
      }
      const n = step * step
      const o = (y * width + x) * 4
      out[o] = r / n
      out[o + 1] = g / n
      out[o + 2] = b / n
      out[o + 3] = 255
    }
  }
  return { width, height, data: out }
}

/** The text of the first QR found in the picture, or null. */
export function readQrText(bytes: Uint8Array): string | null {
  const image = decodeImage(bytes)
  if (!image || image.width === 0 || image.height === 0) return null
  const tries = Math.max(image.width, image.height) > READ_EDGE ? [shrink(image, READ_EDGE), image] : [image]
  for (const attempt of tries) {
    const pixels =
      attempt.data instanceof Uint8ClampedArray
        ? attempt.data
        : new Uint8ClampedArray(attempt.data.buffer, attempt.data.byteOffset, attempt.data.byteLength)
    const found = jsQR(pixels, attempt.width, attempt.height)
    if (found?.data) return found.data
  }
  return null
}

/** What the garage's payment QR says: its UPI id and name, not a UPI QR, or nothing readable. */
export function readPaymentQr(bytes: Uint8Array): QrRead {
  const text = readQrText(bytes)
  if (text === null) return { status: 'unreadable' }
  const upi = parseUpiUri(text)
  if (upi === 'not_upi') return { status: 'not_upi' }
  return { status: 'upi', ...upi }
}
