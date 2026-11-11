import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { isCertified, type CertificationRow } from '../../lib/certification.js'
import { isPickupOffered, type PickupSettings } from '../../lib/pickup.js'
import { holdsSilver } from '../../lib/tiers.js'
import { sql as sqlTag } from 'drizzle-orm'
import {
  CERTIFIED_GARAGE,
  CITY_SHOWN,
  doorstepCovers,
  doorstepReach,
  GARAGE_CITY_ID,
  LISTED_TO_CUSTOMERS,
  NOT_IN_BIN,
  PICKUP_OFFERED,
  SILVER_GARAGE,
  silverAndAboveCondition,
  isInBin,
  isListedToCustomers,
  pickupCovers,
  pickupReach,
  vendorOpenForItsBookings,
  vendorPageOpen,
  vendorPagesOpen,
  type ListedRow,
} from './vendors.predicates.js'

const STATUSES = ['pending', 'active', 'suspended', 'archived'] as const

const BINNED_AT = new Date('2026-10-14T12:42:00Z')

/** Every garage the six facts can describe. */
const everyRow = (): ListedRow[] =>
  STATUSES.flatMap((status) =>
    [true, false].flatMap((isVerified) =>
      [null, new Date('2026-10-01T04:30:00Z')].flatMap((bookingsPausedAt) =>
        [null, BINNED_AT].flatMap((deletedAt) =>
          [false, true].flatMap((showWhenCityOff) =>
            [true, false].map((cityShown) => ({
              status,
              isVerified,
              bookingsPausedAt,
              deletedAt,
              showWhenCityOff,
              cityShown,
            }))
          )
        )
      )
    )
  )

const LIVE: ListedRow = {
  status: 'active',
  isVerified: true,
  bookingsPausedAt: null,
  deletedAt: null,
  showWhenCityOff: false,
  cityShown: true,
}

describe('isListedToCustomers', () => {
  test('only an Active, verified garage, not paused, not in the Bin, whose city lets customers see it, is listed', () => {
    const listed = everyRow().filter(isListedToCustomers)
    expect(listed).toEqual([
      { ...LIVE, showWhenCityOff: false, cityShown: true },
      { ...LIVE, showWhenCityOff: true, cityShown: true },
      { ...LIVE, showWhenCityOff: true, cityShown: false },
    ])
  })

  test('Active is not enough: unverified, paused or binned garages are not listed', () => {
    expect(isListedToCustomers({ ...LIVE, isVerified: false })).toBe(false)
    expect(isListedToCustomers({ ...LIVE, bookingsPausedAt: '2026-10-01T04:30:00Z' })).toBe(false)
    // The Bin wins over everything else being right, as it arrives from the
    // API (a string) or from the database (a Date).
    expect(isListedToCustomers({ ...LIVE, deletedAt: BINNED_AT })).toBe(false)
    expect(isListedToCustomers({ ...LIVE, deletedAt: BINNED_AT.toISOString() })).toBe(false)
  })

  test('a city switched off hides its garages, except one admin shows anyway (0069)', () => {
    expect(isListedToCustomers({ ...LIVE, cityShown: false })).toBe(false)
    expect(isListedToCustomers({ ...LIVE, cityShown: false, showWhenCityOff: true })).toBe(true)
    // "Show this garage anyway" is never more than the city's half: it does
    // not bring back a paused or unverified garage.
    expect(isListedToCustomers({ ...LIVE, cityShown: false, showWhenCityOff: true, isVerified: false })).toBe(false)
    expect(
      isListedToCustomers({ ...LIVE, cityShown: false, showWhenCityOff: true, bookingsPausedAt: BINNED_AT })
    ).toBe(false)
  })
})

describe('the Bin', () => {
  test('in the Bin is deleted_at set, whatever the stage', () => {
    for (const row of everyRow()) {
      expect(isInBin(row)).toBe(row.deletedAt !== null)
    }
  })

  test('the raw SQL and the Drizzle condition say the same thing', () => {
    const dialect = new PgDialect()
    expect(dialect.sqlToQuery(NOT_IN_BIN).sql).toBe('v.deleted_at IS NULL')
    // The garage page's lookup: the page rule, so pause is not in it, and
    // the Bin is, and the city's switch (0069), read through CITY_SHOWN for
    // this one row.
    const page = dialect.sqlToQuery(vendorPageOpen('e2e00000-0000-4000-8000-000000000301'))
    const cityShown = dialect.sqlToQuery(CITY_SHOWN).sql
    expect(page.sql).toBe(
      `("vendors"."id" = $1 and "vendors"."status" = $2 and "vendors"."is_verified" = $3 and "vendors"."deleted_at" is null and (SELECT ${cityShown} FROM vendors v WHERE v.id = "vendors"."id"))`
    )
    expect(page.params).toEqual(['e2e00000-0000-4000-8000-000000000301', 'active', true])
  })

  test('an existing booking reads its garage without the city switch: Active, verified, not in the Bin', () => {
    const own = new PgDialect().sqlToQuery(vendorOpenForItsBookings('e2e00000-0000-4000-8000-000000000301'))
    expect(own.sql).toBe(
      '("vendors"."id" = $1 and "vendors"."status" = $2 and "vendors"."is_verified" = $3 and "vendors"."deleted_at" is null)'
    )
  })

  test("Saved garages joins on the page's own rule: a garage in the Bin, suspended, unverified or in a city that is off is left out, a paused one is not", () => {
    const dialect = new PgDialect()
    const pages = dialect.sqlToQuery(vendorPagesOpen())
    expect(pages.sql).toBe(
      `("vendors"."status" = $1 and "vendors"."is_verified" = $2 and "vendors"."deleted_at" is null and (SELECT ${dialect.sqlToQuery(CITY_SHOWN).sql} FROM vendors v WHERE v.id = "vendors"."id"))`
    )
    expect(pages.params).toEqual(['active', true])
    // The same rule, read over every garage the facts describe.
    const open = (row: ListedRow) =>
      row.status === 'active' && row.isVerified && row.deletedAt === null && (row.showWhenCityOff || row.cityShown)
    const shown = everyRow().filter(open)
    expect(shown).toHaveLength(6)
    expect(shown.every((row) => !isInBin(row) && row.status === 'active' && row.isVerified)).toBe(true)
    expect(shown.some((row) => row.bookingsPausedAt !== null)).toBe(true)
  })
})

describe('the SQL the customer lists run', () => {
  const dialect = new PgDialect()
  const { sql, params } = dialect.sqlToQuery(LISTED_TO_CUSTOMERS)
  const cityShown = dialect.sqlToQuery(CITY_SHOWN).sql

  // The twin above is what the tests can run; the SQL is what the lists run.
  // Pinned word for word, so neither can gain or lose a condition alone.
  test('is the same five conditions as the twin', () => {
    expect(sql).toBe(
      `(v.status = 'active' AND v.is_verified = true AND v.bookings_paused_at IS NULL AND v.deleted_at IS NULL AND ${cityShown})`
    )
    expect(params).toEqual([])
  })

  test('evaluated as the twin reads it, it agrees on every garage', () => {
    // A tiny reading of exactly the clauses above, so a row the SQL would
    // list is a row the twin calls listed, and no other. The city clause is
    // read as a whole: what it means is pinned below and in cities.test.ts.
    const body = sql.slice(1, -1).replace(cityShown, 'CITY_SHOWN')
    const clauses = body.split(' AND ')
    const sqlListed = (row: ListedRow) =>
      clauses.every((clause) => {
        if (clause === "v.status = 'active'") return row.status === 'active'
        if (clause === 'v.is_verified = true') return row.isVerified === true
        if (clause === 'v.bookings_paused_at IS NULL') return row.bookingsPausedAt === null
        if (clause === 'v.deleted_at IS NULL') return row.deletedAt === null
        if (clause === 'CITY_SHOWN') return row.showWhenCityOff || row.cityShown
        throw new Error(`a condition the twin does not know: ${clause}`)
      })
    for (const row of everyRow()) {
      expect(sqlListed(row)).toBe(isListedToCustomers(row))
    }
  })
})

describe('the city clause (0069)', () => {
  const dialect = new PgDialect()
  const cityShown = dialect.sqlToQuery(CITY_SHOWN)

  test('"Show this garage anyway", else the city\'s switch, else Other towns (shown when never set)', () => {
    expect(cityShown.params).toEqual([])
    expect(cityShown.sql.startsWith('(v.show_when_city_off OR COALESCE((SELECT cty.customers_see FROM cities cty WHERE ')).toBe(
      true
    )
    expect(cityShown.sql).toContain(
      "COALESCE((SELECT (ots.value->>'visible')::boolean FROM admin_settings ots WHERE ots.key = 'other_towns_visible'), true)"
    )
  })

  test("the garage's city is its stored city_id, read by primary key, never searched for per row", () => {
    // The rule that picks it (nearest centre whose reach holds the pin, else
    // the city field, Madras as Chennai) is the database's trigger, checked
    // against lib/cities.ts cityOfGarage in cities.trigger.test.ts and end to
    // end in apps/e2e/specs/platform/garage-city.spec.ts.
    expect(dialect.sqlToQuery(GARAGE_CITY_ID).sql).toBe('v.city_id')
    expect(cityShown.sql).toBe(
      "(v.show_when_city_off OR COALESCE((SELECT cty.customers_see FROM cities cty WHERE cty.id = v.city_id), COALESCE((SELECT (ots.value->>'visible')::boolean FROM admin_settings ots WHERE ots.key = 'other_towns_visible'), true)))"
    )
    const point = dialectPoint()
    for (const fragment of [
      cityShown.sql,
      dialect.sqlToQuery(doorstepCovers(point)).sql,
      dialect.sqlToQuery(pickupCovers(point)).sql,
      dialect.sqlToQuery(doorstepReach(point).outsideM).sql,
      dialect.sqlToQuery(doorstepReach(point).coverKm).sql,
      dialect.sqlToQuery(pickupReach(point).outsideM).sql,
      dialect.sqlToQuery(pickupReach(point).coverKm).sql,
    ]) {
      // No nearest-city search: no ORDER BY or LIMIT, no centre rebuilt from
      // lat/lng, no name match; every cities read is by its id.
      expect(fragment).not.toMatch(/ORDER BY|LIMIT|cty\.lat|cty\.lng|cty\.name|v\.city\b/)
      for (const read of fragment.match(/FROM cities cty WHERE [^)]*/g) ?? []) {
        expect(read.startsWith('FROM cities cty WHERE cty.id = v.city_id')).toBe(true)
      }
    }
  })

  test('"All over <city>" wins over the drawn area and the radius, and falls back to them with no city', () => {
    const point = dialectPoint()
    const doorstep = dialect.sqlToQuery(doorstepCovers(point)).sql
    expect(doorstep.startsWith(
      'COALESCE(CASE WHEN v.doorstep_whole_city THEN (SELECT gis.ST_DWithin(cty.centre, gis.ST_SetSRID(gis.ST_MakePoint($1, $2), 4326)::gis.geography, cty.reach_km * 1000, false) FROM cities cty WHERE cty.id = v.city_id AND v.geo IS NOT NULL) END, CASE'
    )).toBe(true)
    expect(doorstep).toContain('WHEN v.doorstep_area IS NOT NULL THEN gis.ST_Covers(v.doorstep_area, ')
    expect(doorstep).toContain('COALESCE(v.doorstep_radius_km, $')
    const pickup = dialect.sqlToQuery(pickupCovers(point)).sql
    expect(pickup.startsWith('COALESCE(CASE WHEN v.pickup_whole_city THEN (SELECT gis.ST_DWithin(cty.centre, ')).toBe(true)
    expect(pickup).toContain('COALESCE(v.pickup_radius_km, $')
    expect(pickup).not.toContain('doorstep')
    // "Applies" needs no read at all: on, pinned, and a stored city.
    expect(dialect.sqlToQuery(doorstepReach(point).coverKm).sql).toContain(
      '(v.doorstep_whole_city AND v.geo IS NOT NULL AND v.city_id IS NOT NULL)'
    )
    expect(dialect.sqlToQuery(pickupReach(point).coverKm).sql).toContain(
      '(v.pickup_whole_city AND v.geo IS NOT NULL AND v.city_id IS NOT NULL)'
    )
  })
})

function dialectPoint() {
  return sqlTag`gis.ST_SetSRID(gis.ST_MakePoint(${80.25}, ${13.05}), 4326)::gis.geography`
}

describe('Gold (Detlio Certified)', () => {
  const { sql, params } = new PgDialect().sqlToQuery(CERTIFIED_GARAGE)
  const PREFIX = 'EXISTS (SELECT 1 FROM vendor_certifications vc WHERE vc.vendor_id = v.id AND '

  test('the SQL the lists run is the twin, word for word', () => {
    expect(sql).toBe(`${PREFIX}vc.certified_at IS NOT NULL AND vc.revoked_at IS NULL)`)
    expect(params).toEqual([])
  })

  test('evaluated as the twin reads it, it agrees on every garage (and on one never evaluated)', () => {
    const clauses = sql.slice(PREFIX.length, -1).split(' AND ')
    const sqlCertified = (row: CertificationRow | null) =>
      row !== null &&
      clauses.every((clause) => {
        if (clause === 'vc.certified_at IS NOT NULL') return row.certifiedAt !== null
        if (clause === 'vc.revoked_at IS NULL') return row.revokedAt === null
        throw new Error(`a condition the twin does not know: ${clause}`)
      })
    const at = new Date('2026-10-18T04:30:00Z')
    const rows: Array<CertificationRow | null> = [
      null,
      ...[null, at].flatMap((certifiedAt) => [null, at].map((revokedAt) => ({ certifiedAt, revokedAt }))),
    ]
    for (const row of rows) expect(sqlCertified(row)).toBe(isCertified(row))
    expect(rows.filter(isCertified)).toEqual([{ certifiedAt: at, revokedAt: null }])
  })
})

describe('pickup & drop offered', () => {
  const { sql, params } = new PgDialect().sqlToQuery(PICKUP_OFFERED)

  test('the SQL the pickup list runs is the twin, word for word', () => {
    expect(sql).toBe("(v.pickup IN ('yes', 'nearby') AND v.pickup_terms_accepted_at IS NOT NULL)")
    expect(params).toEqual([])
  })

  test('evaluated as the twin reads it, it agrees on every garage', () => {
    const clauses = sql.slice(1, -1).split(' AND ')
    const sqlOffered = (row: PickupSettings) =>
      clauses.every((clause) => {
        if (clause === "v.pickup IN ('yes', 'nearby')") return row.pickup === 'yes' || row.pickup === 'nearby'
        if (clause === 'v.pickup_terms_accepted_at IS NOT NULL') return row.pickupTermsAcceptedAt !== null
        throw new Error(`a condition the twin does not know: ${clause}`)
      })
    const rows: PickupSettings[] = (['yes', 'nearby', 'no', null] as const).flatMap((pickup) =>
      [null, new Date('2026-10-17T04:30:00Z')].map((pickupTermsAcceptedAt) => ({
        pickup,
        pickupRadiusKm: null,
        pickupTermsAcceptedAt,
      }))
    )
    for (const row of rows) expect(sqlOffered(row)).toBe(isPickupOffered(row))
    expect(rows.filter(isPickupOffered)).toHaveLength(2)
  })
})

describe('Silver', () => {
  const { sql, params } = new PgDialect().sqlToQuery(SILVER_GARAGE)
  const PREFIX = 'EXISTS (SELECT 1 FROM vendor_tier_standings ts WHERE ts.vendor_id = v.id AND '

  test('the SQL the lists run is the twin, word for word', () => {
    expect(sql).toBe(`${PREFIX}ts.silver_at IS NOT NULL)`)
    expect(params).toEqual([])
  })

  test('evaluated as the twin reads it, it agrees on every garage (and on one never evaluated)', () => {
    const clauses = sql.slice(PREFIX.length, -1).split(' AND ')
    const sqlSilver = (row: { silverAt: Date | null } | null) =>
      row !== null &&
      clauses.every((clause) => {
        if (clause === 'ts.silver_at IS NOT NULL') return row.silverAt !== null
        throw new Error(`a condition the twin does not know: ${clause}`)
      })
    const at = new Date('2026-11-02T04:30:00Z')
    for (const row of [null, { silverAt: null }, { silverAt: at }]) expect(sqlSilver(row)).toBe(holdsSilver(row))
  })
})

describe('"Silver & above"', () => {
  const dialect = new PgDialect()
  test('Silver on: Gold or Silver held; Silver off: Gold only; never a hidden medal', () => {
    const both = dialect.sqlToQuery(silverAndAboveCondition(['silver', 'gold'])).sql
    expect(both.startsWith('(v.tier_hidden = false AND (EXISTS (SELECT 1 FROM vendor_certifications')).toBe(true)
    expect(both).toContain(' OR EXISTS (SELECT 1 FROM vendor_tier_standings ts')
    const goldOnly = dialect.sqlToQuery(silverAndAboveCondition(['gold'])).sql
    expect(goldOnly.startsWith('(v.tier_hidden = false AND EXISTS (SELECT 1 FROM vendor_certifications')).toBe(true)
    expect(goldOnly).not.toContain('vendor_tier_standings')
    expect(dialect.sqlToQuery(silverAndAboveCondition(['silver'])).sql).toBe(both)
  })
})
