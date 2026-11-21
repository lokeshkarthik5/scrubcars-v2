import type { ServiceCategory } from './types'

/**
 * Detlio's commission on the mechanical and body work added on 16 Nov 2026
 * (General service, Repairs, Dent & paint; 0080), in percent. The owner may
 * still change it: change it here and in the server's twin
 * (apps/server/src/lib/commission.ts MECHANICAL_AND_BODY_RATE), and the
 * garage-facing sentence on Earnings ("Commission is 8% on washes, …", in
 * apps/vendors and apps/vendors-app, with its Tamil).
 */
export const MECHANICAL_AND_BODY_PERCENT = 5

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
  general_service: MECHANICAL_AND_BODY_PERCENT,
  repairs: MECHANICAL_AND_BODY_PERCENT,
  dent_paint: MECHANICAL_AND_BODY_PERCENT,
}

