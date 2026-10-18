import { afterEach, describe, expect, test } from 'bun:test'
import {
  encodeQuality,
  fitWithin,
  isUploadImageType,
  MAX_UPLOAD_EDGE,
  stripImageMetadata,
} from './image-upload'

describe('fitWithin', () => {
  test('a photo already small enough keeps its size', () => {
    expect(fitWithin(1200, 900, MAX_UPLOAD_EDGE)).toEqual({ width: 1200, height: 900 })
  })

  test('a large landscape photo is scaled so its width is the cap', () => {
    expect(fitWithin(8000, 6000, 2560)).toEqual({ width: 2560, height: 1920 })
  })

  test('a large portrait photo is scaled so its height is the cap', () => {
    expect(fitWithin(3024, 4032, 2560)).toEqual({ width: 1920, height: 2560 })
  })

  test('never scales up, and never down to nothing', () => {
    expect(fitWithin(10, 10, 2560)).toEqual({ width: 10, height: 10 })
    expect(fitWithin(10000, 1, 2560)).toEqual({ width: 2560, height: 1 })
  })
})

describe('encodeQuality', () => {
  test('JPEG and WebP are encoded at high quality; PNG is lossless', () => {
    expect(encodeQuality('image/jpeg')).toBe(0.9)
    expect(encodeQuality('image/webp')).toBe(0.9)
    expect(encodeQuality('image/png')).toBeUndefined()
  })
})

describe('isUploadImageType', () => {
  test('only the three presigned types', () => {
    expect(isUploadImageType('image/jpeg')).toBe(true)
    expect(isUploadImageType('image/png')).toBe(true)
    expect(isUploadImageType('image/webp')).toBe(true)
    expect(isUploadImageType('image/heic')).toBe(false)
    expect(isUploadImageType('video/mp4')).toBe(false)
  })
})

/**
 * Stands in for the browser: a createImageBitmap that reports a size, and an
 * OffscreenCanvas whose encoder writes `writes` (or the type asked for).
 */
function fakeBrowser(options: { width: number; height: number; writes?: string; decodeFails?: boolean }) {
  const drawn: Array<{ width: number; height: number; type: string; quality?: number }> = []
  const g = globalThis as Record<string, unknown>
  g.createImageBitmap = async () => {
    if (options.decodeFails) throw new Error('cannot decode')
    return { width: options.width, height: options.height, close() {} }
  }
  g.OffscreenCanvas = class {
    constructor(
      public width: number,
      public height: number
    ) {}
    getContext() {
      return { drawImage() {} }
    }
    async convertToBlob({ type, quality }: { type: string; quality?: number }) {
      drawn.push({ width: this.width, height: this.height, type, quality })
      return new Blob(['clean'], { type: options.writes ?? type })
    }
  }
  return drawn
}

describe('stripImageMetadata', () => {
  const g = globalThis as Record<string, unknown>
  const saved = { createImageBitmap: g.createImageBitmap, OffscreenCanvas: g.OffscreenCanvas }
  afterEach(() => {
    g.createImageBitmap = saved.createImageBitmap
    g.OffscreenCanvas = saved.OffscreenCanvas
  })

  const photo = (type: string) => new Blob(['original bytes with exif'], { type })

  test('a JPEG comes back re-encoded, as a JPEG, capped at the long edge', async () => {
    const drawn = fakeBrowser({ width: 4032, height: 3024 })
    const original = photo('image/jpeg')
    const clean = await stripImageMetadata(original)
    expect(clean).not.toBe(original)
    expect(clean.type).toBe('image/jpeg')
    expect(drawn).toEqual([{ width: 2560, height: 1920, type: 'image/jpeg', quality: 0.9 }])
  })

  test('PNG and WebP keep their type', async () => {
    fakeBrowser({ width: 100, height: 100 })
    expect((await stripImageMetadata(photo('image/png'))).type).toBe('image/png')
    expect((await stripImageMetadata(photo('image/webp'))).type).toBe('image/webp')
  })

  test('a photo the browser cannot decode is uploaded as it was', async () => {
    fakeBrowser({ width: 100, height: 100, decodeFails: true })
    const original = photo('image/jpeg')
    expect(await stripImageMetadata(original)).toBe(original)
  })

  test('a type the browser cannot write back (Safari and WebP) is uploaded as it was', async () => {
    fakeBrowser({ width: 100, height: 100, writes: 'image/png' })
    const original = photo('image/webp')
    expect(await stripImageMetadata(original)).toBe(original)
  })

  test('anything but the three photo types is left alone', async () => {
    const drawn = fakeBrowser({ width: 100, height: 100 })
    const video = new Blob(['video'], { type: 'video/mp4' })
    expect(await stripImageMetadata(video)).toBe(video)
    expect(drawn).toHaveLength(0)
  })

  test('with no canvas at all, the original goes up', async () => {
    g.createImageBitmap = undefined
    g.OffscreenCanvas = undefined
    const original = photo('image/jpeg')
    expect(await stripImageMetadata(original)).toBe(original)
  })
})
