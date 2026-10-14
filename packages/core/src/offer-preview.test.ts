import { describe, expect, test } from 'bun:test'
import {
  homeOrder,
  offerCardPreview,
  offerMetaLine,
  PREVIEW_TITLE_PLACEHOLDER,
  splitMetaLine,
  tapOpensLabel,
  tillLabel,
  type OfferDraft,
  type OrderRow,
} from './offer-preview'

// Fixed clock: Mon 12 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-12T06:30:00Z')
/** Midnight IST at the start of Sun 18 Oct: the code works all of Sat 17 Oct. */
const SAT_17_OCT_END = '2026-10-17T18:30:00.000Z'

function draft(overrides: Partial<OfferDraft> = {}): OfferDraft {
  return {
    code: 'detail20',
    title: '20% off any service',
    discountType: 'percentage',
    percentOff: 20,
    amountOff: null,
    maxDiscountAmount: 300,
    minOrderAmount: null,
    endsAt: SAT_17_OCT_END,
    vendorName: 'Next Level Auto Detailing',
    ...overrides,
  }
}

describe('the small print', () => {
  test('cap, minimum, code and end date, from the columns', () => {
    expect(
      offerMetaLine({
        code: 'DETAIL20',
        discountType: 'percentage',
        maxDiscountAmount: 300,
        minOrderAmount: '1000.00',
        endsAt: new Date(SAT_17_OCT_END),
      })
    ).toBe('Up to ₹300 · Min ₹1,000 · Code DETAIL20 · Till Sat 17 Oct')
  })

  test('a cap means nothing on a flat amount, and money keeps its paise', () => {
    expect(
      offerMetaLine({ code: 'FLAT', discountType: 'fixed', maxDiscountAmount: 300, minOrderAmount: 149.5, endsAt: null })
    ).toBe('Min ₹149.50 · Code FLAT')
  })

  test('an end that is not midnight names its time', () => {
    expect(tillLabel(new Date('2026-10-18T12:30:00Z'))).toBe('Till 18 Oct, 6 PM')
    expect(tillLabel(new Date('2026-10-18T18:29:00Z'))).toBe('Till 18 Oct, 11:59 PM')
  })

  test('splits into the money-and-code line and the end-date line', () => {
    expect(splitMetaLine('Up to ₹300 · Code DETAIL20 · Till Sat 17 Oct')).toEqual([
      'Up to ₹300 · Code DETAIL20',
      'Till Sat 17 Oct',
    ])
    expect(splitMetaLine('Code DETAIL20')).toEqual(['Code DETAIL20'])
  })
})

describe('offerCardPreview', () => {
  test('a garage offer, as Home will draw it', () => {
    expect(offerCardPreview(draft())).toEqual({
      eyebrow: { kind: 'garage', label: 'Next Level Auto Detailing' },
      title: '20% off any service',
      figure: { kind: 'percent', value: 20 },
      code: 'DETAIL20',
      metaLines: ['Up to ₹300 · Code DETAIL20', 'Till Sat 17 Oct'],
    })
  })

  test('a Detlio-wide flat offer, half typed', () => {
    const preview = offerCardPreview(
      draft({ vendorName: null, discountType: 'fixed', amountOff: null, percentOff: null, title: '  ', code: '', endsAt: null })
    )
    expect(preview.eyebrow).toEqual({ kind: 'detlio', label: 'Detlio' })
    expect(preview.title).toBe(PREVIEW_TITLE_PLACEHOLDER)
    expect(preview.figure).toEqual({ kind: 'amount', rupees: 0 })
    expect(preview.metaLines).toEqual(['Code CODE'])
  })

  test('where a tap goes', () => {
    expect(tapOpensLabel('Next Level Auto Detailing')).toBe('Next Level Auto Detailing, code applied at checkout')
    expect(tapOpensLabel(null)).toBe('Garage list, code applied at checkout')
  })
})

describe('homeOrder', () => {
  function row(id: string, overrides: Partial<OrderRow> = {}): OrderRow {
    return {
      id,
      showOnHome: true,
      isActive: true,
      homePriority: 0,
      startsAt: null,
      endsAt: '2026-10-20T00:00:00.000Z',
      createdAt: '2026-10-01T00:00:00.000Z',
      ...overrides,
    }
  }

  test('priority first, then the one ending soonest, then the newest', () => {
    const others = [
      row('top', { homePriority: 2 }),
      row('soon', { endsAt: '2026-10-14T00:00:00.000Z' }),
      row('later', { endsAt: '2026-10-30T00:00:00.000Z' }),
    ]
    expect(homeOrder(row('me', { homePriority: 1 }), others, NOW)).toEqual({ position: 2, total: 4 })
    expect(homeOrder(row('me'), others, NOW)).toEqual({ position: 3, total: 4 })
    expect(homeOrder(row('me', { createdAt: '2026-10-12T00:00:00.000Z' }), [row('old')], NOW)).toEqual({
      position: 1,
      total: 2,
    })
  })

  test('only offers live on Home now count, and the code being edited is not counted twice', () => {
    const others = [
      row('me', { homePriority: 2 }),
      row('off', { showOnHome: false }),
      row('inactive', { isActive: false }),
      row('ended', { endsAt: '2026-10-01T00:00:00.000Z' }),
      row('later', { startsAt: '2026-11-01T00:00:00.000Z' }),
    ]
    expect(homeOrder(row('me'), others, NOW)).toEqual({ position: 1, total: 1 })
  })

  test('null while the draft would not be on Home now', () => {
    expect(homeOrder(row('me', { showOnHome: false }), [], NOW)).toBeNull()
    expect(homeOrder(row('me', { endsAt: null }), [], NOW)).toBeNull()
    expect(homeOrder(row('me', { startsAt: '2026-11-01T00:00:00.000Z' }), [], NOW)).toBeNull()
  })
})
