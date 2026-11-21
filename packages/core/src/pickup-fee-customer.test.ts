import { describe, expect, test } from 'bun:test'
import { DEFAULT_PICKUP_FEE_SETTINGS as S, detlioPlan, FREE_PICKUP_FEE, garagePlan } from './pickup-fee-maths'
import { addressPickupFee, askFeeNote, askSuggestion, cardPickupChip, cardPickupFee } from './pickup-fee-customer'

const plan = detlioPlan(S)
const home = { lat: 12.3, lng: 76.64 }
// 6371 km earth (straightLineKm): 111.195 km to a degree of latitude.
const north = (km: number) => ({ lat: home.lat + km / 111.195, lng: home.lng })

describe('the list chip', () => {
  test('Free pickup for a garage on Free, and for one on an API without the fee', () => {
    expect(cardPickupChip({ pickupEnabled: true, pickupFee: garagePlan(FREE_PICKUP_FEE, S), distanceKm: 2.1 })).toBe('Free pickup')
    expect(cardPickupChip({ pickupEnabled: true, distanceKm: 2.1 })).toBe('Free pickup')
  })
  test('the fee for the card’s distance', () => {
    expect(cardPickupChip({ pickupEnabled: true, pickupFee: plan, distanceKm: 4.8 })).toBe('Pickup ₹99')
    expect(cardPickupChip({ pickupEnabled: true, pickupFee: plan, distanceKm: 8.5 })).toBe('Pickup ₹120')
  })
  test('no chip for a garage that doesn’t collect, or a distance fee with no distance', () => {
    expect(cardPickupFee({ pickupEnabled: false, pickupFee: plan, distanceKm: 4.8 })).toBeNull()
    expect(cardPickupFee({ pickupEnabled: true, pickupFee: plan, distanceKm: null })).toBeNull()
    expect(cardPickupFee({ pickupEnabled: true, pickupFee: { ...plan, mode: 'fixed', fixed: 150 }, distanceKm: null })).toBe(150)
  })
})

describe('an address', () => {
  test('Velan: 4.8 km straight, 6.2 km by road, ₹99', () => {
    expect(addressPickupFee(plan, north(4.8), home, 699)).toEqual({ fee: 99, roadKm: 6.2 })
    expect(addressPickupFee(plan, { lat: null, lng: null }, home)).toBeNull()
  })
  test('Ask for pickup: about ₹120, at most ₹150 for 11 km by road', () => {
    const s = askSuggestion({ suggested: plan, askRaisePct: 25, maxCharge: 599 }, north(8.5), home, 699)
    expect(s).toEqual({ suggested: 120, max: 150, roadKm: 11 })
    expect(askFeeNote(11, 25)).toBe(
      "Detlio's suggestion for 11 km by road. The garage confirms the fee, up to 25% more. You see it before you pay."
    )
  })
})
