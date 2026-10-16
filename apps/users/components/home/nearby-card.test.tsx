import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { NearbyCard } from './nearby-card'

// The card's wording is the owner's (2026-10-16), so it is pinned here word
// for word; the counts themselves are checked against the API in
// e2e/specs/users/home-api.spec.ts.

type Nearby = { count: number; closestKm: number | null; radiusKm: number }

const render = (nearby: Nearby | null, located = true) =>
  renderToStaticMarkup(<NearbyCard nearby={nearby} located={located} />)

/**
 * The words a customer reads, with the markup gone. Each tag becomes a space
 * (the card's lines are block spans with no space between them in the HTML),
 * then runs of spaces collapse to one.
 */
const text = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const href = (html: string) => /href="([^"]*)"/.exec(html)?.[1] ?? null

describe('NearbyCard', () => {
  test('a count within 50 km, with the nearest distance, opens the map', () => {
    const html = render({ count: 12, closestKm: 2.3, radiusKm: 50 })
    expect(text(html)).toBe('Nearby garages 12 garages Within 50 km · nearest 2.3 km')
    expect(href(html)).toBe('/map')
    // Figures are set in the numeric face.
    expect(html).toContain('<span class="font-numeric">12</span>')
  })

  test('one garage is singular, and under 1 km reads in metres', () => {
    const html = render({ count: 1, closestKm: 0.4, radiusKm: 50 })
    expect(text(html)).toBe('Nearby garages 1 garage Within 50 km · nearest 400 m')
    expect(href(html)).toBe('/map')
  })

  test('none within 50 km says so and leads to the full list, not an empty map', () => {
    const html = render({ count: 0, closestKm: null, radiusKm: 50 })
    expect(text(html)).toBe('Nearby garages No garages within 50 km yet See all garages')
    expect(href(html)).toBe('/garages')
  })

  test('no location asks for one; a failed count with a location hides the card', () => {
    expect(text(render(null, false))).toBe('Nearby garages Turn on location to see the nearest')
    expect(render(null, true)).toBe('')
  })
})
