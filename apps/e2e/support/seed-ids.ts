/**
 * Re-export of the fixture ids the seed writes.
 *
 * The constants live next to the seed (apps/server/src/db/seeds/e2e-ids.ts) so
 * there is exactly one definition: if a spec and the seed ever disagreed about
 * an id, the failure would look like a product bug rather than a fixture drift.
 */
export * from '../../server/src/db/seeds/e2e-ids'
