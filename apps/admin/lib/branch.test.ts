import { describe, expect, test } from 'bun:test'
import {
  ANOTHER_TOWN,
  branchCityName,
  branchDraftFrom,
  branchInput,
  branchPriceLabel,
  branchProblem,
  isSameOwnerLogin,
  withCity,
} from './branch'

const OWNER = '9840011203'

const CITIES = [
  { id: 'c-chennai', name: 'Chennai' },
  { id: 'c-tirupur', name: 'Tirupur' },
]

describe('Add a branch', () => {
  test('starts with every box ticked and the name following the first city', () => {
    const draft = branchDraftFrom('Spark Car Care', ['s1', 's2', 's3'], CITIES, OWNER)
    expect(draft).toMatchObject({
      businessName: 'Spark Car Care – Chennai',
      cityChoice: 'c-chennai',
      serviceIds: ['s1', 's2', 's3'],
      copyHours: true,
      copyPhotos: true,
      ownerPhone: OWNER,
      ownerName: '',
    })
    expect(isSameOwnerLogin(draft, OWNER)).toBe(true)
  })

  test('the suggested name follows the city until admin types one', () => {
    let draft = branchDraftFrom('Spark', [], CITIES, OWNER)
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
    const draft = withCity({ ...branchDraftFrom('Spark', [], CITIES, OWNER), cityChoice: ANOTHER_TOWN }, 'Spark', { townTyped: 'madras' }, CITIES)
    expect(draft.cityChoice).toBe('c-chennai')
    expect(draft.businessName).toBe('Spark – Chennai')
  })

  test('needs a name and a city; an at-garage branch needs its address and pincode', () => {
    const draft = branchDraftFrom('Spark', [], CITIES, OWNER)
    expect(branchProblem(draft, CITIES, false, OWNER)).toBeNull()
    expect(branchProblem({ ...draft, businessName: ' ' }, CITIES, false, OWNER)).toContain('name')
    expect(branchProblem({ ...draft, cityChoice: ANOTHER_TOWN }, CITIES, false, OWNER)).toContain('city')
    expect(branchProblem(draft, CITIES, true, OWNER)).toContain('address and pincode')
    expect(branchProblem({ ...draft, address: '1 Main Road', pincode: '64160' }, CITIES, true, OWNER)).toContain('6 digits')
    expect(branchProblem({ ...draft, address: '1 Main Road', pincode: '641601' }, CITIES, true, OWNER)).toBeNull()
  })

  test('the owner’s number is 10 digits; a different number needs the owner’s name', () => {
    const draft = branchDraftFrom('Spark', [], CITIES, OWNER)
    expect(branchProblem({ ...draft, ownerPhone: '98400' }, CITIES, false, OWNER)).toBe('The owner’s phone number is 10 digits.')
    expect(branchProblem({ ...draft, ownerPhone: ` ${OWNER} ` }, CITIES, false, OWNER)).toBeNull()
    const other = { ...draft, ownerPhone: '9000006930' }
    expect(isSameOwnerLogin(other, OWNER)).toBe(false)
    expect(branchProblem(other, CITIES, false, OWNER)).toContain('owner’s name')
    expect(branchProblem({ ...other, ownerName: 'Meena' }, CITIES, false, OWNER)).toBeNull()
  })

  test('sends the choices as the API takes them, the pin only when placed', () => {
    const draft = { ...branchDraftFrom('Spark', ['s1'], CITIES, OWNER), cityChoice: 'c-tirupur', businessName: ' Spark – Tirupur ' }
    expect(branchInput(draft, CITIES, OWNER)).toEqual({
      businessName: 'Spark – Tirupur',
      city: 'Tirupur',
      address: '',
      pincode: '',
      serviceIds: ['s1'],
      copyHours: true,
      copyPhotos: true,
      ownerPhone: OWNER,
    })
    const pinned = { ...draft, pin: { lat: 11.1, lng: 77.3, address: '', city: '', pincode: '', source: 'map_pin' as const } }
    expect(branchInput(pinned, CITIES, OWNER)).toMatchObject({ lat: 11.1, lng: 77.3 })
  })

  test('the name goes only with a different number, trimmed', () => {
    const draft = { ...branchDraftFrom('Spark', [], CITIES, OWNER), ownerName: ' Meena ' }
    expect(branchInput(draft, CITIES, OWNER)).not.toHaveProperty('ownerName')
    expect(branchInput({ ...draft, ownerPhone: ' 9000006930 ' }, CITIES, OWNER)).toMatchObject({
      ownerPhone: '9000006930',
      ownerName: 'Meena',
    })
  })

  test('each service shows its price', () => {
    const base = { price: '599', priceHatchback: '', priceSedan: '', priceSuv: '' }
    expect(branchPriceLabel({ ...base, pricingType: 'flat' })).toBe('₹599')
    expect(
      branchPriceLabel({ ...base, pricingType: 'per_vehicle', priceHatchback: '499', priceSedan: '699', priceSuv: '899' })
    ).toBe('₹499 to ₹899')
    expect(branchPriceLabel({ ...base, pricingType: 'on_inspection', price: '199' })).toBe('Inspection ₹199')
    expect(branchPriceLabel({ ...base, pricingType: 'on_inspection', price: '' })).toBe('Price on inspection')
    expect(branchPriceLabel({ ...base, pricingType: 'on_inspection', price: '0' })).toBe('Price on inspection')
  })
})
