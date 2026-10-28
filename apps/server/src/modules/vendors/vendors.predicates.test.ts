import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { isCertified, type CertificationRow } from '../../lib/certification.js'
import { isPickupOffered, type PickupSettings } from '../../lib/pickup.js'
import { holdsSilver } from '../../lib/tiers.js'
import {
  CERTIFIED_GARAGE,
  LISTED_TO_CUSTOMERS,
  NOT_IN_BIN,
  PICKUP_OFFERED,
  SILVER_GARAGE,
  isInBin,
  isListedToCustomers,
  vendorPageOpen,
  vendorPagesOpen,
  type ListedRow,
} from './vendors.predicates.js'

const STATUSES = ['pending', 'active', 'suspended', 'archived'] as const

const BINNED_AT = new Date('2026-10-14T12:42:00Z')

/** Every garage the four facts can describe. */
const everyRow = (): ListedRow[] =>
  STATUSES.flatMap((status) =>
    [true, false].flatMap((isVerified) =>
      [null, new Date('2026-10-01T04:30:00Z')].flatMap((bookingsPausedAt) =>
        [null, BINNED_AT].map((deletedAt) => ({
          status,
          isVerified,
          bookingsPausedAt,
          deletedAt,
        }))
      )
    )
  )

describe('isListedToCustomers', () => {
  test('only an Active, verified garage that is not paused and not in the Bin is listed', () => {
    const listed = everyRow().filter(isListedToCustomers)
    expect(listed).toEqual([
      { status: 'active', isVerified: true, bookingsPausedAt: null, deletedAt: null },
    ])
  })

  test('Active is not enough: unverified, paused or binned garages are not listed', () => {
    const live = { status: 'active', isVerified: true, bookingsPausedAt: null, deletedAt: null }
    expect(isListedToCustomers({ ...live, isVerified: false })).toBe(false)
    expect(isListedToCustomers({ ...live, bookingsPausedAt: '2026-10-01T04:30:00Z' })).toBe(false)
    // The Bin wins over everything else being right, as it arrives from the
    // API (a string) or from the database (a Date).
    expect(isListedToCustomers({ ...live, deletedAt: BINNED_AT })).toBe(false)
    expect(isListedToCustomers({ ...live, deletedAt: BINNED_AT.toISOString() })).toBe(false)
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
    // the Bin is.
    const page = dialect.sqlToQuery(vendorPageOpen('e2e00000-0000-4000-8000-000000000301'))
    expect(page.sql).toBe(
      '("vendors"."id" = $1 and "vendors"."status" = $2 and "vendors"."is_verified" = $3 and "vendors"."deleted_at" is null)'
    )
    expect(page.params).toEqual(['e2e00000-0000-4000-8000-000000000301', 'active', true])
  })

  test("Saved garages joins on the page's own rule: a garage in the Bin, suspended or unverified is left out, a paused one is not", () => {
    const pages = new PgDialect().sqlToQuery(vendorPagesOpen())
    expect(pages.sql).toBe(
      '("vendors"."status" = $1 and "vendors"."is_verified" = $2 and "vendors"."deleted_at" is null)'
    )
    expect(pages.params).toEqual(['active', true])
    // The same rule, read over every garage the four facts describe.
    const open = (row: ListedRow) => row.status === 'active' && row.isVerified && row.deletedAt === null
    const shown = everyRow().filter(open)
    expect(shown).toHaveLength(2)
    expect(shown.every((row) => !isInBin(row) && row.status === 'active' && row.isVerified)).toBe(true)
    expect(shown.some((row) => row.bookingsPausedAt !== null)).toBe(true)
  })
})

describe('the SQL the customer lists run', () => {
  const { sql, params } = new PgDialect().sqlToQuery(LISTED_TO_CUSTOMERS)

  // The twin above is what the tests can run; the SQL is what the lists run.
  // Pinned word for word, so neither can gain or lose a condition alone.
  test('is the same four conditions as the twin', () => {
    expect(sql).toBe(
      "(v.status = 'active' AND v.is_verified = true AND v.bookings_paused_at IS NULL AND v.deleted_at IS NULL)"
    )
    expect(params).toEqual([])
  })

  test('evaluated as the twin reads it, it agrees on every garage', () => {
    // A tiny reading of exactly the four clauses above, so a row the SQL
    // would list is a row the twin calls listed, and no other.
    const clauses = sql.slice(1, -1).split(' AND ')
    const sqlListed = (row: ListedRow) =>
      clauses.every((clause) => {
        if (clause === "v.status = 'active'") return row.status === 'active'
        if (clause === 'v.is_verified = true') return row.isVerified === true
        if (clause === 'v.bookings_paused_at IS NULL') return row.bookingsPausedAt === null
        if (clause === 'v.deleted_at IS NULL') return row.deletedAt === null
        throw new Error(`a condition the twin does not know: ${clause}`)
      })
    for (const row of everyRow()) {
      expect(sqlListed(row)).toBe(isListedToCustomers(row))
    }
  })
})

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
