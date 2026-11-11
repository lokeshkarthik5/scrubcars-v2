/**
 * The garage's stored city (0069): the database writes `vendors.city_id`
 * with garage_city_of, from a trigger on every garage write that touches the
 * pin or the city field and from a recompute on any change to `cities`. This
 * pins that SQL to lib/cities.ts cityOfGarage, which stays the definition.
 *
 * There is no database in the unit tests, so, as vendors.predicates.test.ts
 * does for the list SQL, the function's clauses are pinned word for word and
 * then read clause by clause on representative cases, and the answers are
 * compared with cityOfGarage. The same cases run against the real database
 * in apps/e2e/specs/platform/garage-city.spec.ts.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { cityNameKey, cityOfGarage, type CityPlace, type GaragePlace } from './cities.js'

const sql = readFileSync(new URL('../../drizzle/0069_cities_reach.sql', import.meta.url), 'utf8')

/** The body of garage_city_of, whitespace collapsed. */
function functionBody(): string {
  const match = sql.match(/CREATE OR REPLACE FUNCTION "garage_city_of"\([^)]*\)\s*RETURNS uuid\s*LANGUAGE sql STABLE AS \$\$([\s\S]*?)\$\$;/)
  if (!match) throw new Error('garage_city_of is not in 0069')
  return match[1]!.replace(/\s+/g, ' ').trim()
}

const PINNED = 'garage_lat IS NOT NULL AND garage_lng IS NOT NULL'
const POINT = 'gis.ST_SetSRID(gis.ST_MakePoint(garage_lng, garage_lat), 4326)::gis.geography'
const IN_REACH = `gis.ST_DWithin(c."centre", ${POINT}, c."reach_km" * 1000, false)`
const NAME_KEY = (column: string) =>
  `(CASE WHEN lower(btrim(${column})) = 'madras' THEN 'chennai' ELSE lower(btrim(${column})) END)`
const DISTANCE = `gis.ST_Distance(c."centre", ${POINT}, false)`

const EXPECTED_BODY =
  `SELECT c."id" FROM public."cities" c` +
  ` WHERE CASE WHEN ${PINNED} THEN ${IN_REACH} ELSE ${NAME_KEY('garage_city')} = ${NAME_KEY('c."name"')} END` +
  ` ORDER BY CASE WHEN ${PINNED} THEN ${DISTANCE} END, c."name"` +
  ` LIMIT 1`

/**
 * PostGIS on the sphere (use_spheroid false): great-circle distance on a
 * sphere of the WGS84 mean radius, 6371008.8 m.
 */
function sphereMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h))
}

/** The SQL's lower(btrim(x)) with Madras as Chennai; NULL stays NULL (never equal). */
function sqlNameKey(value: string | null): string | null {
  if (value === null) return null
  const key = value.trim().toLowerCase()
  return key === 'madras' ? 'chennai' : key
}

/** garage_city_of, read clause by clause from the pinned text above. */
function sqlCityOf<C extends CityPlace>(garage: GaragePlace, cities: readonly C[]): C | null {
  const pinned = garage.lat !== null && garage.lng !== null
  const point = pinned ? { lat: garage.lat!, lng: garage.lng! } : null
  const held = cities.filter((city) =>
    point
      ? sphereMetres(city, point) <= city.reachKm * 1000
      : sqlNameKey(garage.city) !== null && sqlNameKey(garage.city) === sqlNameKey(city.name)
  )
  const ordered = [...held].sort((a, b) => {
    const byDistance = point ? sphereMetres(a, point) - sphereMetres(b, point) : 0
    return byDistance !== 0 ? byDistance : a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })
  return ordered[0] ?? null
}

// Two overlapping cities around Chennai, a far town, and a twin of Chennai's
// centre for the tie on distance.
const CHENNAI: CityPlace = { id: 'c-chennai', name: 'Chennai', lat: 13.0827, lng: 80.2707, reachKm: 50 }
const NORTH: CityPlace = { id: 'c-north', name: 'Ponneri', lat: 13.3378, lng: 80.1947, reachKm: 30 }
const TIRUPUR: CityPlace = { id: 'c-tirupur', name: 'Tirupur', lat: 11.1085, lng: 77.3411, reachKm: 25 }
const CITIES = [CHENNAI, NORTH, TIRUPUR]

const CASES: Array<{ name: string; garage: GaragePlace; cities?: CityPlace[]; expected: string | null }> = [
  { name: 'pinned in one city only', garage: { lat: 13.0067, lng: 80.2573, city: 'Chennai' }, expected: 'c-chennai' },
  // Both reaches hold these pins: the nearer centre wins, whatever the city field says.
  { name: 'overlap, nearer Ponneri', garage: { lat: 13.28, lng: 80.2, city: 'Chennai' }, expected: 'c-north' },
  { name: 'overlap, nearer Chennai', garage: { lat: 13.15, lng: 80.25, city: 'Ponneri' }, expected: 'c-chennai' },
  { name: 'pinned outside every city', garage: { lat: 9.4533, lng: 77.8024, city: 'Chennai' }, expected: null },
  { name: 'unpinned, name in another case and spacing', garage: { lat: null, lng: null, city: '  TIRUPUR ' }, expected: 'c-tirupur' },
  { name: 'unpinned Madras is Chennai', garage: { lat: null, lng: null, city: 'Madras' }, expected: 'c-chennai' },
  { name: 'unpinned, no such city', garage: { lat: null, lng: null, city: 'Sivakasi' }, expected: null },
  { name: 'unpinned, empty city field', garage: { lat: null, lng: null, city: '' }, expected: null },
  { name: 'no cities at all', garage: { lat: 13.0067, lng: 80.2573, city: 'Chennai' }, cities: [], expected: null },
  {
    name: 'two centres at the same spot: the name first in the alphabet',
    garage: { lat: 13.0067, lng: 80.2573, city: null },
    cities: [CHENNAI, { ...CHENNAI, id: 'c-twin', name: 'Anna Nagar' }],
    expected: 'c-twin',
  },
]

describe('garage_city_of (0069) is cityOfGarage', () => {
  test('the function says the rule, clause for clause', () => {
    expect(functionBody()).toBe(EXPECTED_BODY)
    // The name key is lib/cities.ts cityNameKey's.
    for (const name of [' Chennai ', 'MADRAS', 'Tirupur', 'Madras Road']) {
      expect(sqlNameKey(name)).toBe(cityNameKey(name))
    }
  })

  for (const { name, garage, cities, expected } of CASES) {
    test(name, () => {
      const list = cities ?? CITIES
      expect(cityOfGarage(garage, list)?.id ?? null).toBe(expected)
      expect(sqlCityOf(garage, list)?.id ?? null).toBe(expected)
    })
  }
})

describe('what keeps vendors.city_id right', () => {
  const text = sql.replace(/\s+/g, ' ')

  test('every garage write that touches the pin or the city field sets it, before the row is written', () => {
    expect(text).toContain(
      'CREATE TRIGGER "vendors_set_city_id" BEFORE INSERT OR UPDATE OF "lat", "lng", "city" ON "vendors" FOR EACH ROW EXECUTE FUNCTION "vendors_set_city_id"();'
    )
    expect(text).toContain('NEW."city_id" := public."garage_city_of"(NEW."lat", NEW."lng", NEW."city");')
  })

  test('any change to cities recomputes every garage, writing only the rows that change', () => {
    expect(text).toContain(
      'CREATE TRIGGER "cities_recompute_garage_cities" AFTER INSERT OR UPDATE OR DELETE ON "cities" FOR EACH STATEMENT EXECUTE FUNCTION "cities_recompute_garage_cities"();'
    )
    // Garage writes wait while a city change commits, so neither misses the other.
    expect(text).toContain('LOCK TABLE public."vendors" IN SHARE ROW EXCLUSIVE MODE; UPDATE public."vendors" v')
    expect(text).toContain(
      'FROM (SELECT "id", public."garage_city_of"("lat", "lng", "city") AS "city_id" FROM public."vendors") fresh WHERE fresh."id" = v."id" AND v."city_id" IS DISTINCT FROM fresh."city_id";'
    )
  })

  test('the column points at a city (emptied when it goes), is indexed, and every garage there is today is backfilled', () => {
    expect(text).toContain('ADD COLUMN IF NOT EXISTS "city_id" uuid REFERENCES "cities" ("id") ON DELETE SET NULL;')
    expect(text).toContain('CREATE INDEX IF NOT EXISTS "vendors_city_id_idx" ON "vendors" ("city_id");')
    expect(text).toContain(
      'UPDATE "vendors" SET "city_id" = "garage_city_of"("lat", "lng", "city") WHERE "city_id" IS DISTINCT FROM "garage_city_of"("lat", "lng", "city");'
    )
    // The backfill comes after the triggers and after Chennai is seeded.
    expect(text.lastIndexOf('UPDATE "vendors" SET "city_id"')).toBeGreaterThan(text.indexOf('CREATE TRIGGER "cities_recompute_garage_cities"'))
    expect(text.lastIndexOf('UPDATE "vendors" SET "city_id"')).toBeGreaterThan(text.indexOf('INSERT INTO "cities"'))
  })

  test("the centre is stored once per city, longitude first", () => {
    expect(text).toContain(
      'ADD COLUMN IF NOT EXISTS "centre" gis.geography(Point, 4326) GENERATED ALWAYS AS (gis.ST_SetSRID(gis.ST_MakePoint("lng", "lat"), 4326)::gis.geography) STORED;'
    )
  })
})
