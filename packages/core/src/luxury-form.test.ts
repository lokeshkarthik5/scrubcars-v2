import { describe, expect, test } from 'bun:test'
import type { GarageLuxury, LuxuryApplication } from '@repo/core/api/luxury'
import { LUXURY_LIMITS } from '@repo/core/luxury'
import {
  EMPTY_LUXURY_FORM,
  formFromApplication,
  formPayload,
  istShortDay,
  luxuryRowLine,
  shownScreen,
  toggleBrand,
} from './luxury-form'

const photos = [1, 2, 3].map((n) => ({ url: `https://cdn.test/vendors/v/luxury/${n}.jpg`, caption: n === 1 ? ' BMW 5 Series ' : '  ' }))

const app = (status: LuxuryApplication['status']): LuxuryApplication => ({
  status,
  brands: ['BMW', 'Mini'],
  photos: photos.map((p) => ({ ...p, caption: p.caption.trim() || null })),
  coveredBay: true,
  products: 'Gtechniq',
  staff: null,
  teamNote: null,
  decidedBy: null,
  decidedAt: null,
  sentAt: '2026-11-20T12:42:00Z',
  timesSent: 1,
  updatedAt: '2026-11-20T12:42:00Z',
})

const data = (over: Partial<GarageLuxury>): GarageLuxury => ({
  tier: 'silver',
  silverOrGold: true,
  application: null,
  badge: null,
  reapplyOn: null,
  limits: LUXURY_LIMITS,
  ...over,
})

describe('the luxury form', () => {
  test('brands toggle on and off, kept in the form order', () => {
    let form = toggleBrand(EMPTY_LUXURY_FORM, 'Mini')
    form = toggleBrand(form, 'BMW')
    expect(form.brands).toEqual(['BMW', 'Mini'])
    expect(toggleBrand(form, 'Mini').brands).toEqual(['BMW'])
  })

  test('no payload until a brand, 3 photos and a bay answer', () => {
    const base = { ...EMPTY_LUXURY_FORM, brands: ['BMW' as const], photos, coveredBay: null }
    expect(formPayload(base)).toBeNull()
    expect(formPayload({ ...base, coveredBay: false, photos: photos.slice(0, 2) })).toBeNull()
    expect(formPayload({ ...base, coveredBay: false, brands: [] })).toBeNull()
  })

  test('the payload trims, and empty text is none', () => {
    const payload = formPayload({ brands: ['BMW'], photos, coveredBay: false, products: '  ', staff: ' 2 detailers ' })
    expect(payload).toEqual({
      brands: ['BMW'],
      photos: [
        { url: photos[0]!.url, caption: 'BMW 5 Series' },
        { url: photos[1]!.url, caption: null },
        { url: photos[2]!.url, caption: null },
      ],
      coveredBay: false,
      products: null,
      staff: '2 detailers',
    })
  })

  test('the form fills in from what was sent', () => {
    expect(formFromApplication(app('more'))).toMatchObject({ brands: ['BMW', 'Mini'], coveredBay: true, products: 'Gtechniq', staff: '' })
    expect(formFromApplication(null)).toEqual(EMPTY_LUXURY_FORM)
  })
})

describe('which screen', () => {
  test('editing opens the form over Under review, and over a removal for a Silver garage', () => {
    expect(shownScreen(data({ application: app('review') }), false)).toBe('review')
    expect(shownScreen(data({ application: app('review') }), true)).toBe('form')
    expect(shownScreen(data({ application: app('removed') }), true)).toBe('form')
    expect(shownScreen(data({ application: app('removed'), silverOrGold: false }), true)).toBe('removed')
    expect(shownScreen(data({ application: app('approved') }), true)).toBe('approved')
  })

  test('the Settings row line', () => {
    expect(luxuryRowLine(data({ silverOrGold: false, tier: 'bronze' }))).toEqual({ line: 'Reach Silver to apply', locked: true })
    expect(luxuryRowLine(data({})).line).toBe('Apply for the badge. For Silver and Gold garages')
    expect(luxuryRowLine(data({ application: app('review') })).line).toBe('Under review')
    expect(luxuryRowLine(data({ application: app('approved') })).line).toBe("You're a Luxury car specialist")
    expect(luxuryRowLine(undefined).locked).toBe(false)
  })

  test('dates are the IST day', () => {
    expect(istShortDay('2026-11-20T12:42:00Z')).toBe('20 Nov')
    expect(istShortDay('2026-11-20T19:00:00Z')).toBe('21 Nov')
  })
})
