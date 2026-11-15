import { describe, expect, test } from 'bun:test'
import {
  REPAIR_QUOTE_RULES,
  daysLabel,
  frameTimes,
  priceRangeLabel,
  showsQuotes,
  timeLeftLabel,
  typedRupees,
  videoProblem,
  videoShortHint,
  wipeVideoLocation,
} from './repair-quotes'

/** A box: 4-byte size, 4-byte type, then its contents. */
function box(type: string, contents: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + contents.length)
  new DataView(out.buffer).setUint32(0, out.length)
  // Box types are four bytes, Latin-1 ("©xyz" starts with 0xA9).
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(contents, 8)
  return out
}
const text = (s: string) => new TextEncoder().encode(s)
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

describe('repair quotes (app): the video', () => {
  test('a phone’s place in moov is zeroed in place, the file keeps its size', () => {
    const where = '+13.0827+080.2707+012.000/'
    const file = join(
      box('ftyp', text('qt  ')),
      box('mdat', text('+13.0827+080.2707/ not metadata')),
      box('moov', join(box('udta', join(box('©xyz', text(`\u0000\u0012${where}`)), text('com.apple.quicktime.location.ISO6709+12.97+077.59/')))))
    )
    const before = file.length
    expect(wipeVideoLocation(file)).toBe(2)
    expect(file.length).toBe(before)
    const after = new TextDecoder().decode(file)
    expect(after).toContain('+00.0000+000.0000+000.000/')
    expect(after).toContain('ISO6709+00.00+000.00/')
    expect(after.slice(after.indexOf('moov'))).not.toContain('13.0827')
    // mdat (the picture itself) is never touched.
    expect(after).toContain('+13.0827+080.2707/ not metadata')
  })

  test('no moov, or nothing in it, wipes nothing', () => {
    expect(wipeVideoLocation(box('ftyp', text('isom')))).toBe(0)
    expect(wipeVideoLocation(box('moov', text('+1 not a place')))).toBe(0)
  })

  test('frames spread through the video, away from both ends', () => {
    expect(frameTimes(20, 4)).toEqual([4, 8, 12, 16])
    expect(frameTimes(0, 4)).toEqual([])
  })

  test('too long, too large or not a video is said; short is a gentle line', () => {
    expect(videoProblem({ durationSecs: 22, sizeBytes: 20_000_000, type: 'video/mp4' })).toBeNull()
    expect(videoProblem({ durationSecs: 30.4, sizeBytes: 1, type: 'video/quicktime' })).toBeNull()
    expect(videoProblem({ durationSecs: 45, sizeBytes: 1, type: 'video/mp4' })).toContain('30 seconds')
    expect(videoProblem({ durationSecs: 20, sizeBytes: REPAIR_QUOTE_RULES.videoMaxBytes + 1, type: 'video/mp4' })).toContain('60 MB')
    expect(videoProblem({ durationSecs: 20, sizeBytes: 1, type: 'video/x-msvideo' })).toContain('MP4')
    expect(videoShortHint(9)).toContain('15–30')
    expect(videoShortHint(16)).toBeNull()
  })
})

describe('repair quotes (app): words', () => {
  test('prices and days', () => {
    expect(priceRangeLabel(4000, 5500)).toBe('₹4,000–5,500')
    expect(priceRangeLabel(5000, 5000)).toBe('₹5,000')
    expect(daysLabel(1)).toBe('1 day')
    expect(daysLabel(2)).toBe('2 days')
  })

  test('the quotes screen once any garage has answered', () => {
    expect(showsQuotes({ state: 'open', quotes: [{ state: 'waiting' }, { state: 'missed' }] })).toBe(false)
    expect(showsQuotes({ state: 'open', quotes: [{ state: 'waiting' }, { state: 'quoted' }] })).toBe(true)
    expect(showsQuotes({ state: 'expired', quotes: [{ state: 'declined' }] })).toBe(true)
  })
})

describe('repair quotes (app): time left', () => {
  test('hours and minutes, rounded up; nothing below zero', () => {
    expect(timeLeftLabel((3 * 60 + 11) * 60_000 + 1)).toBe('3 h 12 min')
    expect(timeLeftLabel(2 * 60 * 60_000)).toBe('2 h')
    expect(timeLeftLabel(12 * 60_000)).toBe('12 min')
    expect(timeLeftLabel(-5)).toBe('0 min')
  })
})

describe('typedRupees', () => {
  test('whole rupees from what the garage typed', () => {
    expect(typedRupees('4,000')).toBe(4000)
    expect(typedRupees('₹ 5500')).toBe(5500)
    expect(typedRupees('')).toBeNull()
    expect(typedRupees('abc')).toBeNull()
  })

  test('paise after a point are dropped, never read as more digits', () => {
    expect(typedRupees('4000.50')).toBe(4000)
    expect(typedRupees('4,000.5')).toBe(4000)
    expect(typedRupees('.50')).toBeNull()
  })
})
