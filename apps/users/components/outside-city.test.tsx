import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { FALLBACK_CITY, outsideCityLine, outsideCityTag } from '@repo/core/customer-city'
import {
  OutsideCityChip,
  OutsideCityLine,
} from '@repo/ui/features/outside-city'

// The sign's look is the owner's brief (2026-10-16): a neutral graphite chip
// with an amber pin, never red. The words themselves, relative to the
// customer's city (0070), are pinned in packages/core/src/customer-city.test.ts.

/** The words a customer reads, with the markup gone. */
const text = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// A Chennai customer with no place shared; Vellore's garage is in no city.
const PLACE = { city: FALLBACK_CITY, at: null }
const VELLORE = { lat: 12.9165, lng: 79.1325, area: 'Vellore', garageCity: null }

describe('OutsideCityChip', () => {
  test('names the town and how far, on graphite, with the pin in amber and hidden from screen readers', () => {
    const html = renderToStaticMarkup(<OutsideCityChip text={outsideCityTag(VELLORE, PLACE)!} />)
    expect(text(html)).toBe('Vellore · 125 km')
    expect(html).toContain('<span class="font-numeric">125</span>')
    expect(html).toContain('bg-surface-elevated')
    const pin = /<svg[^>]*>/.exec(html)?.[0] ?? ''
    expect(pin).toContain('text-warning')
    expect(pin).toContain('aria-hidden="true"')
    expect(html).not.toContain('brand-red')
  })
})

describe('OutsideCityLine', () => {
  test('one plain sentence, its distance in the numeric face', () => {
    const html = renderToStaticMarkup(<OutsideCityLine text={outsideCityLine(VELLORE, PLACE)!} />)
    expect(text(html)).toBe('This garage is in Vellore, about 125 km from Chennai.')
    expect(html).toContain('<span class="font-numeric">125</span>')
  })

  test('carries an id when given one, for checkout’s Pay to point at', () => {
    const html = renderToStaticMarkup(
      <OutsideCityLine id="checkout-outside-city" text="This garage is in Vellore, about 125 km from you." />
    )
    expect(html).toContain('<p id="checkout-outside-city"')
  })

  test('with no pin, says where and no distance', () => {
    const html = renderToStaticMarkup(
      <OutsideCityLine text={outsideCityLine({ ...VELLORE, lat: null, lng: null }, PLACE)!} />
    )
    expect(text(html)).toBe('This garage is in Vellore.')
  })
})
