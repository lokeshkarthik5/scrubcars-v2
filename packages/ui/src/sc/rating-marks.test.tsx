import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { DetlioMark, GoogleMapsText, GoogleMark } from './rating-marks'

/**
 * The rating marks (21 Nov 2026): Detlio's d. in place of the amber star,
 * named for screen readers, in the brand red token; Google's G named as
 * Google's; "Google Maps" exactly, never translated.
 */
describe('DetlioMark', () => {
  test('a lowercase d and the red dot, named “Detlio rating 4.8”', () => {
    const html = renderToStaticMarkup(<DetlioMark rating={4.8} size={15} />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Detlio rating 4.8"')
    expect(html).toContain('>d</span>')
    // The brand red token (--color-brand-red, #EF3240), never a new red.
    expect(html).toContain('bg-brand-red')
    expect(html).not.toMatch(/#[0-9a-f]{6}/i)
    // The star is gone.
    expect(html).not.toContain('tabler-icon-star')
  })

  test('without a figure it is still named', () => {
    expect(renderToStaticMarkup(<DetlioMark />)).toContain('aria-label="Detlio rating"')
    expect(renderToStaticMarkup(<DetlioMark rating={4} />)).toContain('aria-label="Detlio rating 4.0"')
  })

  test('the dot scales with the d', () => {
    expect(renderToStaticMarkup(<DetlioMark size={30} />)).toContain('width:8.1px')
  })
})

describe('Google', () => {
  test('the G is named “Google rating”', () => {
    const html = renderToStaticMarkup(<GoogleMark size={14} />)
    expect(html).toContain('aria-label="Google rating"')
    expect(html).toContain('<svg')
  })

  test('“Google Maps”, whole, 12px, never translated, never a link', () => {
    const html = renderToStaticMarkup(<GoogleMapsText />)
    expect(html).toContain('>Google Maps</span>')
    expect(html).toContain('translate="no"')
    expect(html).toContain('text-[12px]')
    expect(html).toContain('whitespace-nowrap')
    expect(html).not.toContain('<a ')
  })
})
