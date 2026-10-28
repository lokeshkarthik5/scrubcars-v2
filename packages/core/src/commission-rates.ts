import type { ServiceCategory } from './types'

/**
 * Detlio's commission by category, in percent, for the admin services
 * editor's "Commission % (optional)" hint (0064): what an empty box means.
 * The rules themselves are the server's (apps/server/src/lib/commission.ts
 * COMMISSION_RATES); commission-rates.parity.test.ts keeps these the same.
 */
export const CATEGORY_COMMISSION_PERCENT: Record<ServiceCategory, number> = {
  car_wash: 8,
  package: 8,
  others: 8,
  detailing: 5,
  coating: 5,
  scratch_removal: 5,
}
