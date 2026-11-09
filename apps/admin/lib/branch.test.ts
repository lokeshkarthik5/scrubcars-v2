import { describe, expect, test } from 'bun:test'
import {
  ANOTHER_TOWN,
  branchCityName,
  branchDraftFrom,
  branchInput,
  branchPriceLabel,
  branchProblem,
  withCity,
} from './branch'

const CITIES = [
  { id: 'c-chennai', name: 'Chennai' },
  { id: 'c-tirupur', name: 'Tirupur' },
]

describe('Add a branch', () => {
  test('starts with every box ticked and the name following the first city', () => {
    const draft = branchDraftFrom('Spark Car Care', ['s1', 's2', 's3'], CITIES)
    expect(draft).toMatchObject({
      businessName: 'Spark Car Care – Chennai',
      cityChoice: 'c-chennai',
      serviceIds: ['s1', 's2', 's3'],
      copyHours: true,
      copyPhotos: true,
      sameOwner: true,
    })
  })

  test('the suggested name follows the city until admin types one', () => {
    let draft = branchDraftFrom('Spark', [], CITIES)
    draft = withCity(draft, 'Spark', { cityChoice: 'c-tirupur' }, CITIES)
    expect(draft.businessName).toBe('Spark – Tirupur')
    draft = withCity(draft, 'Spark', { cityChoice: ANOTHER_TOWN }, CITIES)
    draft = withCity(draft, 'Spark', { townTyped: 'Sivakasi' }, CITIES)
    expect(draft.businessName).toBe('Spark – Sivakasi')
    expect(branchCityName(draft, CITIES)).toBe('Sivakasi')
    const named = { ...draft, businessName: 'Spark West', nameEdited: true }
    expect(withCity(named, 'Spark', { cityChoice: 'c-chennai' }, CITIES).businessName).toBe('Spark West')
  })

  test('a typed town that is already a city picks that city (Madras is Chennai)', () => {
    const draft = withCity({ ...branchDraftFrom('Spark', [], CITIES), cityChoice: ANOTHER_TOWN }, 'Spark', { townTyped: 'madras' }, CITIES)
    expect(draft.cityChoice).toBe('c-chennai')
    expect(draft.businessName).toBe('Spark – Chennai')
  })

  test('needs a name and a city; an at-garage branch needs its address and pincode', () => {
    const draft = branchDraftFrom('Spark', [], CITIES)
    expect(branchProblem(draft, CITIES, false)).toBeNull()
    expect(branchProblem({ ...draft, businessName: ' ' }, CITIES, false)).toContain('name')
    expect(branchProblem({ ...draft, cityChoice: ANOTHER_TOWN }, CITIES, false)).toContain('city')
    expect(branchProblem(draft, CITIES, true)).toContain('address and pincode')
    expect(branchProblem({ ...draft, address: '1 Main Road', pincode: '64160' }, CITIES, true)).toContain('6 digits')
    expect(branchProblem({ ...draft, address: '1 Main Road', pincode: '641601' }, CITIES, true)).toBeNull()
  })

  test('sends the choices as the API takes them, the pin only when placed', () => {
    const draft = { ...branchDraftFrom('Spark', ['s1'], CITIES), cityChoice: 'c-tirupur', businessName: ' Spark – Tirupur ' }
    expect(branchInput(draft, CITIES)).toEqual({
      businessName: 'Spark – Tirupur',
      city: 'Tirupur',
      address: '',
      pincode: '',
      serviceIds: ['s1'],
      copyHours: true,
      copyPhotos: true,
      sameOwner: true,
    })
    const pinned = { ...draft, pin: { lat: 11.1, lng: 77.3, address: '', city: '', pincode: '', source: 'map_pin' as const } }
    expect(branchInput(pinned, CITIES)).toMatchObject({ lat: 11.1, lng: 77.3 })
  })

  test('each service shows its price', () => {
    const base = { price: '599', priceHatchback: '', priceSedan: '', priceSuv: '' }
    expect(branchPriceLabel({ ...base, pricingType: 'flat' })).toBe('₹599')
    expect(
      branchPriceLabel({ ...base, pricingType: 'per_vehicle', priceHatchback: '499', priceSedan: '699', priceSuv: '899' })
    ).toBe('₹499 to ₹899')
    expect(branchPriceLabel({ ...base, pricingType: 'on_inspection', price: '199' })).toBe('Inspection ₹199')
  })
})
