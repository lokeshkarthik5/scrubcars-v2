import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { CTA_GRADIENT, CTA_GRADIENT_STOPS, contrastRatio, relativeLuminance } from './cta'

describe('the red call to action', () => {
  // axe reports text on a gradient as "incomplete" and the accessibility
  // suite only recognises #EF3240, so this is the gate that sees the button.
  test('white text clears 4.5:1 on its lightest stop, so on all of it at rest', () => {
    const lightest = [...CTA_GRADIENT_STOPS].sort(
      (a, b) => relativeLuminance(b) - relativeLuminance(a)
    )[0]
    expect(lightest).toBe('#E4002B')
    expect(contrastRatio('#FFFFFF', lightest)).toBeGreaterThanOrEqual(4.5)
    // The app's own white is #FAFAFA, a shade darker.
    expect(contrastRatio('#FAFAFA', lightest)).toBeGreaterThanOrEqual(4.5)
  })

  test('the red it replaces does not, which is why it was replaced (D12)', () => {
    expect(contrastRatio('#FFFFFF', '#EF3240')).toBeLessThan(4.5)
  })

  test('the stylesheet draws the button with exactly these stops', () => {
    const css = readFileSync(join(import.meta.dir, '../../ui/styles/globals.css'), 'utf8')
    expect(css).toContain(CTA_GRADIENT)
    for (const stop of CTA_GRADIENT_STOPS) expect(CTA_GRADIENT).toContain(stop)
  })

  test('contrast is symmetric and spans 1 to 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
    expect(() => relativeLuminance('red')).toThrow()
  })
})
