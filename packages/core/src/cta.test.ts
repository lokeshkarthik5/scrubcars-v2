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

  // The rest of what makes the red pill safe to put on every customer screen
  // (the app-wide look, behind NEXT_PUBLIC_HOME_HUB), read from the one
  // stylesheet that draws it.
  const css = readFileSync(join(import.meta.dir, '../../ui/styles/globals.css'), 'utf8')
  /** The declarations of one rule, by its exact selector. */
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`)
    expect(at).toBeGreaterThan(-1)
    return css.slice(at, css.indexOf('}', at))
  }

  test('its label is pure white, the colour the contrast above is measured with', () => {
    expect(rule('.cta-hero')).toContain('color: #FFFFFF;')
    expect(rule('.cta-hero')).toContain('background: var(--gradient-cta);')
  })

  test('the shine sweeps twice and stops within 5 s (WCAG 2.2.2), well inside the 10 s the accessibility scan waits', () => {
    const m = /animation: cta-shine-intro ([\d.]+)s ([\d.]+)s (\d+) both;/.exec(rule('.cta-hero::after'))
    expect(m).not.toBeNull()
    const [, cycle, delay, count] = m!.map(Number)
    expect(count).toBe(2)
    expect(delay + cycle * count).toBeLessThanOrEqual(5)
    expect(css).not.toMatch(/cta-shine-intro[^;]*infinite/)
  })

  test('there is no shine under reduced motion, nor on a disabled button', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n    .cta-hero::after'))
    expect(reduced.length).toBeLessThan(css.length)
    expect(reduced.slice(0, reduced.indexOf('}'))).toContain('display: none;')
    expect(rule('.cta-hero:disabled::after')).toContain('display: none;')
  })

  test('a spent shine stays spent: enabling the button again does not replay it', () => {
    // Twice per visit is the limit the motion was approved under; a hero that
    // can be disabled (Pay while the payment sheet opens) is marked rested by
    // useHeroShine once its run ends or starts over, and this rule keeps the
    // band away.
    const rested = rule('.cta-hero-rested::after')
    expect(rested).toContain('display: none;')
    expect(rested).toContain('animation: none;')
    // After `.cta-hero::after`, which it has to override at equal specificity.
    expect(css.indexOf('.cta-hero-rested::after {')).toBeGreaterThan(css.indexOf('.cta-hero::after {'))
  })

  test('contrast is symmetric and spans 1 to 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
    expect(() => relativeLuminance('red')).toThrow()
  })
})
