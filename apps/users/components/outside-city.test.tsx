import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { outsideCityLine } from '@repo/core/service-city'
import {
  OutsideCityChip,
  OutsideCityLine,
} from '@repo/ui/features/outside-city'

// The sign's look is the owner's brief (2026-10-16): a neutral graphite chip
// with an amber pin, never red. The words themselves are pinned in
// packages/core/src/service-city.test.ts.

/** The words a customer reads, with the markup gone. */
const text = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

describe('OutsideCityChip', () => {
  test('names the town, on graphite, with the pin in amber and hidden from screen readers', () => {
    const html = renderToStaticMarkup(
      <OutsideCityChip outside={{ town: 'Sivakasi', km: 485 }} />
    )
    expect(text(html)).toBe('Outside Chennai · Sivakasi')
    expect(html).toContain('bg-surface-elevated')
    const pin = /<svg[^>]*>/.exec(html)?.[0] ?? ''
    expect(pin).toContain('text-warning')
    expect(pin).toContain('aria-hidden="true"')
    expect(html).not.toContain('brand-red')
  })

  test('without a town it says just Outside Chennai', () => {
    const html = renderToStaticMarkup(
      <OutsideCityChip outside={{ town: null, km: 55 }} />
    )
    expect(text(html)).toBe('Outside Chennai')
  })
})

describe('OutsideCityLine', () => {
  test('one plain sentence, its distance in the numeric face', () => {
    const html = renderToStaticMarkup(
      <OutsideCityLine text={outsideCityLine({ town: 'Sivakasi', km: 485 })} />
    )
    expect(text(html)).toBe(
      'This garage is in Sivakasi, about 485 km from Chennai.'
    )
    expect(html).toContain('<span class="font-numeric">485</span>')
  })

  test('carries an id when given one, for checkout’s Pay to point at', () => {
    const html = renderToStaticMarkup(
      <OutsideCityLine
        id="checkout-outside-city"
        text="This garage is in Sivakasi, not Chennai."
      />
    )
    expect(html).toContain('<p id="checkout-outside-city"')
  })

  test('with no pin, says where and no distance', () => {
    const html = renderToStaticMarkup(
      <OutsideCityLine text={outsideCityLine({ town: 'Sivakasi', km: null })} />
    )
    expect(text(html)).toBe('This garage is in Sivakasi.')
  })
})
