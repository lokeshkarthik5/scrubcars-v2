import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { straightLineKm } from './service-city.js'
import {
  CHENNAI_ZONES,
  ZONE_RADIUS_KM,
  zoneFor,
  zoneSlug,
  zonesWithGarages,
} from './zones.js'

const sql = readFileSync(new URL('../../drizzle/0062_customer_reach.sql', import.meta.url), 'utf8')

const zone = (slug: string) => CHENNAI_ZONES.find((z) => z.slug === slug)!

/** A point `km` east of a zone's centre (1° of longitude ≈ 108 km at Chennai). */
function eastOf(slug: string, km: number) {
  const z = zone(slug)
  return { lat: z.lat, lng: z.lng + km / (111.32 * Math.cos((z.lat * Math.PI) / 180)) }
}

describe('the zone list', () => {
  test('25 areas, the owner’s 7 priority ones first', () => {
    expect(CHENNAI_ZONES).toHaveLength(25)
    expect(CHENNAI_ZONES.filter((z) => z.priority).map((z) => z.name)).toEqual([
      'Adyar',
      'Nungambakkam',
      'Anna Nagar',
      'Sholinganallur',
      'Navalur',
      'Guindy',
      'T Nagar',
    ])
    expect(CHENNAI_ZONES.slice(0, 7).every((z) => z.priority)).toBe(true)
  })

  test('every slug is its name’s, and unique', () => {
    for (const z of CHENNAI_ZONES) expect(z.slug).toBe(zoneSlug(z.name))
    expect(new Set(CHENNAI_ZONES.map((z) => z.slug)).size).toBe(25)
    expect(zoneSlug('T Nagar')).toBe('t-nagar')
    expect(zoneSlug('  Anna   Nagar ')).toBe('anna-nagar')
  })

  test('every centre is in Chennai', () => {
    for (const z of CHENNAI_ZONES) {
      expect({ zone: z.slug, near: straightLineKm(z, { lat: 13.0827, lng: 80.2707 }) < 30 }).toEqual({
        zone: z.slug,
        near: true,
      })
    }
  })

  test('migration 0062 seeds exactly this list', () => {
    for (const z of CHENNAI_ZONES) {
      const row = `('${z.slug}', '${z.name}', ${z.lat}, ${z.lng}, ${z.priority})`
      expect({ zone: z.slug, seeded: sql.includes(row) }).toEqual({ zone: z.slug, seeded: true })
    }
    expect(sql.match(/^ {2}\('[a-z0-9-]+', '[^']+', [\d.]+, [\d.]+, (true|false)\)/gm)?.length).toBe(25)
  })
})

describe('which zone a point is in', () => {
  test('a zone’s own centre is in it', () => {
    for (const z of CHENNAI_ZONES) expect(zoneFor(z, CHENNAI_ZONES)?.slug).toBe(z.slug)
  })

  test('the nearest centre wins', () => {
    // Between Adyar and Thiruvanmiyur, closer to Thiruvanmiyur.
    const point = { lat: 12.99, lng: 80.258 }
    expect(straightLineKm(point, zone('thiruvanmiyur'))).toBeLessThan(straightLineKm(point, zone('adyar')))
    expect(zoneFor(point, CHENNAI_ZONES)?.slug).toBe('thiruvanmiyur')
  })

  test('within 6 km of a centre, exactly 6 included; past it, no zone', () => {
    expect(ZONE_RADIUS_KM).toBe(6)
    const only = [zone('navalur')]
    expect(zoneFor(eastOf('navalur', 5.9), only)?.slug).toBe('navalur')
    expect(zoneFor(eastOf('navalur', 6.1), only)).toBeNull()
    // A point far from every centre (Mahabalipuram) is in no zone.
    expect(zoneFor({ lat: 12.6208, lng: 80.1945 }, CHENNAI_ZONES)).toBeNull()
  })

  test('the boundary sits at 6 km', () => {
    const centre = { slug: 'x', lat: 13, lng: 80 }
    // The longitude 6 km east of the centre, found by halving.
    let lo = 80
    let hi = 80.1
    for (let i = 0; i < 80; i += 1) {
      const mid = (lo + hi) / 2
      if (straightLineKm(centre, { lat: 13, lng: mid }) <= ZONE_RADIUS_KM) lo = mid
      else hi = mid
    }
    expect(zoneFor({ lat: 13, lng: lo }, [centre])?.slug).toBe('x')
    expect(zoneFor({ lat: 13, lng: hi + 1e-6 }, [centre])).toBeNull()
  })

  test('a tie goes to the zone listed first', () => {
    const a = { slug: 'a', lat: 13, lng: 80 }
    const b = { slug: 'b', lat: 13, lng: 80 }
    expect(zoneFor({ lat: 13.01, lng: 80 }, [a, b])?.slug).toBe('a')
    expect(zoneFor({ lat: 13.01, lng: 80 }, [b, a])?.slug).toBe('b')
  })

  test('no pin is no zone', () => {
    expect(zoneFor({ lat: null, lng: null }, CHENNAI_ZONES)).toBeNull()
    expect(zoneFor(null, CHENNAI_ZONES)).toBeNull()
    expect(zoneFor({ lat: Number.NaN, lng: 80 }, CHENNAI_ZONES)).toBeNull()
  })
})

describe('zones with a live garage', () => {
  test('a zone counts once it holds a garage’s pin; pins in no zone and unpinned garages count nowhere', () => {
    const live = zonesWithGarages(CHENNAI_ZONES, [
      eastOf('adyar', 1),
      eastOf('adyar', 2),
      zone('guindy'),
      { lat: 12.6208, lng: 80.1945 },
      { lat: null, lng: null },
    ])
    expect([...live].sort()).toEqual(['adyar', 'guindy'])
  })
})
