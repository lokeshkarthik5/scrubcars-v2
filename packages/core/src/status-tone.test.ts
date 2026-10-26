import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { typedConfirmHint, typedConfirmMatches } from './confirm'
import { contrastRatio } from './cta'
import {
  STATUS_TONE_MEANING,
  bookingStatusTone,
  type StatusTone,
} from './status-tone'

const TONES: StatusTone[] = [
  'new',
  'progress',
  'done',
  'attention',
  'late',
  'closed',
]

describe('bookingStatusTone', () => {
  test('each booking status has its one tone', () => {
    expect(bookingStatusTone('pending')).toBe('new')
    expect(bookingStatusTone('confirmed')).toBe('progress')
    expect(bookingStatusTone('in_progress')).toBe('progress')
    expect(bookingStatusTone('completed')).toBe('done')
    expect(bookingStatusTone('cancelled')).toBe('closed')
    expect(bookingStatusTone('rescheduled')).toBe('closed')
  })

  test('anything unknown is the quiet one', () => {
    expect(bookingStatusTone('')).toBe('closed')
    expect(bookingStatusTone('archived')).toBe('closed')
    expect(bookingStatusTone('toString')).toBe('closed')
  })

  test('every tone has a one-line meaning for a legend', () => {
    expect(Object.keys(STATUS_TONE_MEANING).sort()).toEqual([...TONES].sort())
    for (const tone of TONES) {
      expect(STATUS_TONE_MEANING[tone].length).toBeGreaterThan(0)
      expect(STATUS_TONE_MEANING[tone]).not.toContain('\n')
    }
  })
})

/**
 * The tones as globals.css draws them: every text colour on its own tint
 * clears AA (4.5:1) over the canvas and over a card. The tints are
 * translucent, so each is laid over the surface first.
 */
describe('the status tone tokens', () => {
  const css = readFileSync(
    join(import.meta.dir, '../../ui/styles/globals.css'),
    'utf8'
  )
  const token = (name: string) => {
    const m = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(css)
    expect(m).not.toBeNull()
    return m![1].trim()
  }
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  /** An rgba() laid over an opaque #RRGGBB, as #RRGGBB. */
  const over = (rgba: string, surface: string) => {
    const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(rgba)
    expect(m).not.toBeNull()
    const [r, g, b, a] = m!.slice(1).map(Number)
    const out = rgb(surface).map((bg, i) =>
      Math.round([r, g, b][i] * a + bg * (1 - a))
    )
    return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`
  }

  // The brand canvas and card, and the flat greys they replaced.
  const SURFACES = ['#0A0A0B', '#141416', '#0A0A0A', '#151515']

  for (const tone of TONES) {
    test(`${tone}: text on its tint clears 4.5:1 on the canvas and a card`, () => {
      const text = token(`tone-${tone}-text`)
      const tint = token(`tone-${tone}-tint`)
      for (const surface of SURFACES) {
        expect(contrastRatio(text, over(tint, surface))).toBeGreaterThanOrEqual(
          4.5
        )
        expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5)
      }
      // A dot is a graphic: 3:1.
      expect(
        contrastRatio(token(`tone-${tone}-dot`), '#141416')
      ).toBeGreaterThanOrEqual(3)
    })
  }

  test('the red fill behind white text clears 4.5:1, at rest and on hover', () => {
    for (const fill of [
      token('brand-red-fill'),
      token('brand-red-fill-hover'),
    ]) {
      expect(contrastRatio('#FFFFFF', fill)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio('#FAFAFA', fill)).toBeGreaterThanOrEqual(4.5)
    }
    expect(token('brand-red-fill')).toBe('#E4002B')
  })
})

describe('typed confirmation', () => {
  test('matches ignoring case and the spaces around it, never on empty', () => {
    expect(typedConfirmMatches('marina auto spa ', 'Marina Auto Spa')).toBe(
      true
    )
    expect(typedConfirmMatches('DELETE', 'delete')).toBe(true)
    expect(typedConfirmMatches('Marina Auto', 'Marina Auto Spa')).toBe(false)
    expect(typedConfirmMatches('', '')).toBe(false)
    expect(typedConfirmMatches('  ', ' ')).toBe(false)
  })

  test('says what to type', () => {
    expect(typedConfirmHint(' DELETE ')).toBe('Type "DELETE" to confirm.')
  })
})
