import { describe, expect, test } from 'bun:test'
import {
  addedAtAll,
  addedTodayLine,
  branchAddressLine,
  branchRatingText,
  branchServicesChange,
  joinsGroupLine,
  lineFigures,
  lineNote,
  listOf,
  planNewText,
  planPriceText,
  servicesBanner,
} from './branch-groups'
import { emptyServiceRow, type ServiceRow } from './service-editor'

const row = (over: Partial<ServiceRow>): ServiceRow => ({
  ...emptyServiceRow('car_wash'),
  pricingType: 'flat',
  ...over,
})

describe('the Branches card', () => {
  test('a rating, or the words for none', () => {
    expect(branchRatingText({ rating: 4.6, reviewCount: 212 })).toBe('4.6 (212)')
    expect(branchRatingText({ rating: null, reviewCount: 0 })).toBe('No reviews yet')
    expect(branchRatingText({ rating: null, reviewCount: 2 })).toBe('2 reviews')
  })

  test('“Added today” only for a branch not live yet, made today in India', () => {
    const now = new Date('2026-11-18T10:00:00Z')
    expect(addedTodayLine({ state: 'not_live', createdAt: '2026-11-18T03:00:00Z' }, now)).toBe(
      'Added today. Not shown to customers until it’s checked.'
    )
    expect(addedTodayLine({ state: 'live', createdAt: '2026-11-18T03:00:00Z' }, now)).toBeNull()
    expect(addedTodayLine({ state: 'not_live', createdAt: '2026-11-17T03:00:00Z' }, now)).toBeNull()
  })

  test('the address line and the list of branches', () => {
    expect(branchAddressLine({ address: '14, 2nd Avenue, Anna Nagar', pincode: '600040' })).toBe(
      '14, 2nd Avenue, Anna Nagar · 600040'
    )
    expect(branchAddressLine({ address: '', pincode: '' })).toBe('')
    expect(listOf(['Anna Nagar', 'Velachery', 'OMR', 'T. Nagar'])).toBe('Anna Nagar, Velachery, OMR and T. Nagar')
    expect(listOf(['Anna Nagar'])).toBe('Anna Nagar')
  })

  test('the mockups’ words', () => {
    const banner = servicesBanner('Shine Auto Spa', 4)
    expect(banner.lead + banner.strong + banner.rest).toBe(
      'This garage is one of 4 Shine Auto Spa branches. When you save, you choose: this branch only, or all of them.'
    )
    const joins = joinsGroupLine('Shine Auto Spa')
    expect(joins.lead + joins.strong + joins.rest).toBe(
      'Joins the Shine Auto Spa group: customers see the other branches, and you can change services and prices for all branches at once.'
    )
  })
})

describe('branchServicesChange', () => {
  const foam = row({ key: 's1', id: 's1', name: 'Foam wash', price: '499', durationValue: '45' })
  const full = row({ key: 's2', id: 's2', name: 'Full wash', price: '699', durationValue: '60' })

  test('a price change and a new row (mockup 3)', () => {
    const draft = [
      { ...foam, price: '549' },
      full,
      row({ key: 'new-1', name: 'Underbody wash', price: '249', durationValue: '30' }),
      // A blank row never typed in is not sent, as Save changes leaves it out.
      row({ key: 'new-2' }),
    ]
    const change = branchServicesChange([foam, full], draft)!
    expect(change.changed).toEqual([
      {
        serviceId: 's1',
        fields: ['price'],
        service: expect.objectContaining({ name: 'Foam wash', pricingType: 'flat', price: 549, durationMins: 45 }),
      },
    ])
    expect(change.added).toEqual([expect.objectContaining({ name: 'Underbody wash', price: 249, durationMins: 30 })])
    expect(change.added[0]).not.toHaveProperty('id')
  })

  test('each field that changed, and nothing for a hint turned down alone', () => {
    const draft = [{ ...foam, name: 'Snow foam', durationValue: '60', description: 'Hand dried.' }, { ...full, categoryHintDismissed: true }]
    expect(branchServicesChange([foam, full], draft)!.changed).toEqual([
      expect.objectContaining({ serviceId: 's1', fields: ['name', 'duration', 'description'] }),
    ])
    expect(branchServicesChange([foam, full], [foam, { ...full, categoryHintDismissed: true }])).toBeNull()
    expect(branchServicesChange([foam, full], [foam, full])).toBeNull()
  })
})

describe('the preview', () => {
  const view = (over: object = {}) => ({
    pricingType: 'flat' as const, price: 549, priceHatchback: null, priceSedan: null, priceSuv: null,
    approxPrice: null, durationMins: 30, ...over,
  })
  const line = (over: object = {}) => ({
    vendorId: 'g', branch: 'OMR', action: 'update' as const, serviceIds: ['s'], before: view({ price: 529 }),
    after: view(), wasDifferent: true, hidden: false, ...over,
  })

  test('prices as the editor says them', () => {
    expect(planPriceText(view({ price: 1499 }))).toBe('₹1,499')
    expect(planPriceText(view({ pricingType: 'per_vehicle', priceHatchback: 400, priceSedan: 500, priceSuv: 600 }))).toBe('₹400 to ₹600')
    expect(planPriceText(view({ pricingType: 'on_inspection', price: 0 }))).toBe('Price on inspection')
    expect(planNewText(view({ price: 249 }))).toBe('₹249, 30 min')
  })

  test('the line’s flag and figures', () => {
    expect(lineNote(line(), 'change')).toBe('(was different)')
    expect(lineNote(line({ wasDifferent: false }), 'change')).toBeNull()
    expect(lineNote(line({ action: 'add', before: null }), 'change')).toBe('(added there)')
    expect(lineNote(line(), 'new')).toBe('(already there)')
    expect(lineFigures(line())).toEqual({ before: '₹529', after: '₹549' })
    expect(lineFigures(line({ before: view({ durationMins: 45 }) }))).toEqual({ before: '45 min', after: '30 min' })
    expect(addedAtAll([line({ action: 'add' }), line({ action: 'add' })])).toBe(true)
    expect(addedAtAll([line({ action: 'add' }), line()])).toBe(false)
  })
})
