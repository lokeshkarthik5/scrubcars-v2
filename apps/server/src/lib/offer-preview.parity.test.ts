import { describe, expect, test } from 'bun:test'
import { endsSoonLabel, offerMetaLine, tillLabel } from './offers.js'

// The admin's "Preview on Home" builds the card's small print with a twin of
// these rules in packages/core, which the server does not depend on. Loaded
// by path at run time, as copy-rules.parity.test.ts does. If the two drift,
// the preview shows an admin something Home will not.
const coreUrl = new URL('../../../../packages/core/src/offer-preview.ts', import.meta.url).href

type Core = {
  offerMetaLine: typeof offerMetaLine
  tillLabel: typeof tillLabel
  endsSoonLabel: typeof endsSoonLabel
}

// Fixed clock: Mon 12 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-12T06:30:00Z')

const ENDS = [
  // Midnight IST at the start of Sun 18 Oct: "Till Sat 17 Oct".
  new Date('2026-10-17T18:30:00Z'),
  // 18 Oct, 6 PM IST.
  new Date('2026-10-18T12:30:00Z'),
  // 18 Oct, 11:59 PM IST.
  new Date('2026-10-18T18:29:00Z'),
  // 12 Oct, 12:30 AM IST: earlier today.
  new Date('2026-10-11T19:00:00Z'),
  // A month on, across a year end.
  new Date('2026-12-31T18:30:00Z'),
  new Date('2027-01-01T06:15:00Z'),
]

describe('offer small print', () => {
  test('the server and the admin preview write the same line', async () => {
    const core = (await import(coreUrl)) as Core
    const rows = [
      { code: 'DETAIL20', discountType: 'percentage' as const, maxDiscountAmount: '300.00', minOrderAmount: null },
      { code: 'DETAIL20', discountType: 'percentage' as const, maxDiscountAmount: '149.50', minOrderAmount: '1000.00' },
      { code: 'FLAT100', discountType: 'fixed' as const, maxDiscountAmount: null, minOrderAmount: '1500.00' },
      { code: 'NOCAP', discountType: 'percentage' as const, maxDiscountAmount: null, minOrderAmount: null },
    ]
    for (const row of rows) {
      for (const endsAt of [...ENDS, null]) {
        expect(core.offerMetaLine({ ...row, endsAt })).toBe(offerMetaLine({ ...row, endsAt }))
      }
    }
  })

  test('the same end dates and "ends soon" labels', async () => {
    const core = (await import(coreUrl)) as Core
    for (const endsAt of ENDS) {
      expect(core.tillLabel(endsAt)).toBe(tillLabel(endsAt))
      expect(core.endsSoonLabel(endsAt, NOW)).toBe(endsSoonLabel(endsAt, NOW))
    }
  })
})
