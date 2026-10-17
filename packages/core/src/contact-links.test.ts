import { describe, expect, test } from 'bun:test'
import { directionsHref, googleMapsLink } from './contact-links'

describe('googleMapsLink', () => {
  test("a garage's own Google Maps link, and nothing that only looks like one", () => {
    expect(googleMapsLink('https://maps.app.goo.gl/AbC123')).toBe('https://maps.app.goo.gl/AbC123')
    expect(googleMapsLink(' https://www.google.com/maps/place/Next+Level ')).toBe(
      'https://www.google.com/maps/place/Next+Level'
    )
    expect(googleMapsLink('https://goo.gl/maps/xyz')).toBe('https://goo.gl/maps/xyz')
    // Not Maps, not https, or not a link at all.
    expect(googleMapsLink('https://www.google.com/search?q=garage')).toBeNull()
    expect(googleMapsLink('http://maps.google.com/?q=1')).toBeNull()
    expect(googleMapsLink('https://maps.app.goo.gl.evil.example/x')).toBeNull()
    expect(googleMapsLink('https://user@maps.app.goo.gl/x')).toBeNull()
    expect(googleMapsLink('javascript:alert(1)')).toBeNull()
    expect(googleMapsLink('Adyar, Chennai')).toBeNull()
    expect(googleMapsLink(null)).toBeNull()
  })
})

describe('directionsHref', () => {
  const base = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='

  test('the pin first, then the garage’s own Maps link, then the address', () => {
    const mapsUrl = 'https://maps.app.goo.gl/AbC123'
    expect(directionsHref({ lat: 13.0827, lng: 80.2707, address: 'Adyar', mapsUrl })).toBe(
      `${base}13.082700,80.270700`
    )
    expect(directionsHref({ lat: null, lng: null, address: 'Adyar', mapsUrl })).toBe(mapsUrl)
    expect(directionsHref({ lat: null, lng: null, address: 'Adyar', mapsUrl: 'https://evil.example' })).toBe(
      `${base}Adyar`
    )
    expect(directionsHref({ lat: null, lng: null })).toBeNull()
  })
})
