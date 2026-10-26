/**
 * Chennai's neighbourhoods for coverage gaps and garage areas. Moved to
 * @repo/core so the server-built lists (collection lists, Telegram) can name
 * a garage's area too; re-exported here for the admin's existing imports.
 */
export {
  CHENNAI_LOCALITIES,
  nearestLocality,
  garageAreaName,
} from '@repo/core/localities'
