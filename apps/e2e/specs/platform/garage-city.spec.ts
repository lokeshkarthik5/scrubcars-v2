/**
 * The garage's stored city (0069), against the real database: the triggers
 * in drizzle/0069_cities_reach.sql write `vendors.city_id` with
 * garage_city_of, and the customer lists read it by primary key. This checks
 * the database's choice is lib/cities.ts cityOfGarage's, which stays the
 * definition (its SQL text is pinned in apps/server/src/lib/cities.trigger.test.ts).
 *
 * Read-only for every other spec: the first test reads in one snapshot, and
 * the second adds its cities inside a transaction that is always rolled back,
 * so no list, count or page ever sees them. Its cities sit in the Arabian Sea,
 * far from every fixture, apart from one placed on CITIES.far's pin to see
 * the recompute move a garage (also rolled back).
 */
import { test, expect } from '../../support/fixtures'
import { sql } from '../../support/db'
import { CITIES } from '../../support/seed-ids'
import { cityOfGarage, type CityPlace, type GaragePlace } from '../../../server/src/lib/cities'

type CityRow = { id: string; name: string; lat: number; lng: number; reach_km: number }

const toPlace = (row: CityRow): CityPlace => ({ id: row.id, name: row.name, lat: row.lat, lng: row.lng, reachKm: row.reach_km })

/** Thrown to roll the transaction back once its checks have run. */
class RolledBack extends Error {}

async function inRolledBackTransaction(body: (tx: typeof sql) => Promise<void>) {
  const outcome = await sql
    .begin(async (tx) => {
      await tx`SET LOCAL lock_timeout = '5s'`
      await body(tx as unknown as typeof sql)
      throw new RolledBack()
    })
    .catch((error: unknown) => error)
  if (!(outcome instanceof RolledBack)) throw outcome
}

test.describe("the garage's stored city @p0", () => {
  test("every seeded garage's city_id is cityOfGarage's choice", async () => {
    // One snapshot, so a city another spec adds meanwhile is in both reads or neither.
    const { cities, garages } = await sql.begin('isolation level repeatable read', async (tx) => {
      const cities = await tx<CityRow[]>`SELECT id, name, lat, lng, reach_km FROM cities`
      const garages = await tx<Array<{ id: string; lat: number | null; lng: number | null; city: string; city_id: string | null }>>`
        SELECT id, lat, lng, city, city_id FROM vendors
      `
      return { cities, garages }
    })
    const places = cities.map(toPlace)
    expect(garages.length).toBeGreaterThan(50)
    const disagreements = garages
      .map((garage) => ({ id: garage.id, stored: garage.city_id, rule: cityOfGarage(garage, places)?.id ?? null }))
      .filter((row) => row.stored !== row.rule)
    expect(disagreements).toEqual([])
    // The seed has garages in a city and in none, so both answers were checked.
    expect(garages.some((garage) => garage.city_id !== null)).toBe(true)
    expect(garages.some((garage) => garage.city_id === null)).toBe(true)
  })

  test('overlapping cities, the name match, Madras and none: the database picks as cityOfGarage does, and the triggers keep it', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Two overlapping cities, and a twin of the first's centre for the tie.
      await tx`
        INSERT INTO cities (name, lat, lng, reach_km, customers_see) VALUES
          ('E2E Parity Alpha', 20.0, 66.0, 60, true),
          ('E2E Parity Beta', 20.4, 66.0, 40, true),
          ('E2E Parity Twin', 21.5, 66.0, 20, true),
          ('E2E Parity Aardvark', 21.5, 66.0, 20, true)
      `
      const places = (await tx<CityRow[]>`SELECT id, name, lat, lng, reach_km FROM cities`).map(toPlace)
      const idOf = (name: string) => places.find((place) => place.name === name)?.id ?? null

      const cases: Array<{ name: string; garage: GaragePlace; expected: string | null }> = [
        // 0.30° north of Alpha is 33 km from it and 11 km from Beta: both reaches hold it.
        { name: 'overlap, nearer Beta', garage: { lat: 20.3, lng: 66.0, city: 'Chennai' }, expected: idOf('E2E Parity Beta') },
        { name: 'overlap, nearer Alpha', garage: { lat: 20.1, lng: 66.0, city: 'E2E Parity Beta' }, expected: idOf('E2E Parity Alpha') },
        { name: 'outside every city', garage: { lat: 18.0, lng: 64.0, city: 'E2E Parity Alpha' }, expected: null },
        { name: 'same centre: the name first', garage: { lat: 21.5, lng: 66.01, city: null }, expected: idOf('E2E Parity Aardvark') },
        { name: 'unpinned name, any case and spacing', garage: { lat: null, lng: null, city: '  e2e PARITY beta ' }, expected: idOf('E2E Parity Beta') },
        { name: 'unpinned Madras is Chennai', garage: { lat: null, lng: null, city: 'Madras' }, expected: idOf('Chennai') },
        { name: 'unpinned, no such city', garage: { lat: null, lng: null, city: 'Sivakasi' }, expected: null },
        { name: 'unpinned, empty', garage: { lat: null, lng: null, city: '' }, expected: null },
      ]
      for (const { name, garage, expected } of cases) {
        const [row] = await tx<Array<{ id: string | null }>>`
          SELECT garage_city_of(${garage.lat}::double precision, ${garage.lng}::double precision, ${garage.city}::text) AS id
        `
        expect({ name, database: row.id }).toEqual({ name, database: expected })
        expect({ name, rule: cityOfGarage(garage, places)?.id ?? null }).toEqual({ name, rule: expected })
      }

      // A city added on a garage's pin takes the garage at once (the recompute on cities)…
      const cityOfFar = async () =>
        (await tx<Array<{ city_id: string | null }>>`SELECT city_id FROM vendors WHERE id = ${CITIES.far.id}`)[0].city_id
      expect(await cityOfFar()).toBeNull()
      const [onFar] = await tx<Array<{ id: string }>>`
        INSERT INTO cities (name, lat, lng, reach_km, customers_see)
        VALUES ('E2E Parity Faraway', ${CITIES.far.pin.lat}, ${CITIES.far.pin.lng}, 10, true) RETURNING id
      `
      expect(await cityOfFar()).toBe(onFar.id)
      // …moving the garage's pin out of it lets it go (the trigger on vendors)…
      await tx`UPDATE vendors SET lat = lat + 1 WHERE id = ${CITIES.far.id}`
      expect(await cityOfFar()).toBeNull()
      await tx`UPDATE vendors SET lat = lat - 1 WHERE id = ${CITIES.far.id}`
      expect(await cityOfFar()).toBe(onFar.id)
      // …and shrinking the city, or deleting it, does too.
      await tx`UPDATE cities SET lat = lat + 0.5 WHERE id = ${onFar.id}`
      expect(await cityOfFar()).toBeNull()
      await tx`UPDATE cities SET lat = lat - 0.5 WHERE id = ${onFar.id}`
      expect(await cityOfFar()).toBe(onFar.id)
      await tx`DELETE FROM cities WHERE id = ${onFar.id}`
      expect(await cityOfFar()).toBeNull()
    })
  })
})
