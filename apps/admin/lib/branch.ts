/**
 * "Add a branch…" (0069): the sheet's draft, words and checks, pure so they
 * are unit-tested without a browser (branch.test.ts). What the server copies
 * is its own rule (lib/branches.ts there); this only collects the choices.
 */
import { branchName, cityNameKey } from '@repo/core/cities'
import type { BranchInput } from '@repo/core/api/admin-cities'
import type { PickedLocation } from '@repo/ui/features/location-picker'
import type { ServiceRowFields } from './service-rows'

/** The select's value for a town that is not a city yet. */
export const ANOTHER_TOWN = 'another'

export interface BranchDraft {
  businessName: string
  /** Typed by hand: the suggested "<name> – <city>" no longer follows the city. */
  nameEdited: boolean
  /** A city's id, or ANOTHER_TOWN. */
  cityChoice: string
  /** The town typed when cityChoice is ANOTHER_TOWN. */
  townTyped: string
  address: string
  pincode: string
  pin: PickedLocation | null
  serviceIds: string[]
  copyHours: boolean
  copyPhotos: boolean
  sameOwner: boolean
}

type CityOption = { id: string; name: string }

/** Every box ticked, as the owner asked: all services, hours, photos and the same login. */
export function branchDraftFrom(
  garageName: string,
  serviceIds: string[],
  cities: readonly CityOption[]
): BranchDraft {
  const first = cities[0]
  return {
    businessName: branchName(garageName, first?.name ?? ''),
    nameEdited: false,
    cityChoice: first?.id ?? ANOTHER_TOWN,
    townTyped: '',
    address: '',
    pincode: '',
    pin: null,
    serviceIds,
    copyHours: true,
    copyPhotos: true,
    sameOwner: true,
  }
}

/** The branch's city name as chosen or typed. */
export function branchCityName(draft: BranchDraft, cities: readonly CityOption[]): string {
  if (draft.cityChoice === ANOTHER_TOWN) return draft.townTyped.trim()
  return cities.find((city) => city.id === draft.cityChoice)?.name ?? ''
}

/**
 * A new city chosen, or a town typed: the suggested name follows it until
 * admin types a name of their own. A typed town that is a city by name
 * (Madras for Chennai) picks that city instead.
 */
export function withCity(
  draft: BranchDraft,
  garageName: string,
  change: { cityChoice?: string; townTyped?: string },
  cities: readonly CityOption[]
): BranchDraft {
  let next = { ...draft, ...change }
  if (change.townTyped !== undefined) {
    const known = cities.find((city) => cityNameKey(city.name) === cityNameKey(change.townTyped))
    if (known) next = { ...next, cityChoice: known.id, townTyped: '' }
  }
  return next.nameEdited ? next : { ...next, businessName: branchName(garageName, branchCityName(next, cities)) }
}

/** What stops the branch being added, in the sheet's words, or null. */
export function branchProblem(draft: BranchDraft, cities: readonly CityOption[], atGarage: boolean): string | null {
  if (!draft.businessName.trim()) return 'Enter the branch’s name.'
  if (!branchCityName(draft, cities)) return 'Choose the branch’s city, or type its town.'
  const pincode = draft.pincode.trim()
  if (pincode && !/^\d{6}$/.test(pincode)) return 'The pincode is 6 digits.'
  if (atGarage && (!draft.address.trim() || !pincode)) {
    return 'Customers come to this garage, so the branch needs its address and pincode.'
  }
  return null
}

/** The request the sheet sends. */
export function branchInput(draft: BranchDraft, cities: readonly CityOption[]): BranchInput {
  return {
    businessName: draft.businessName.trim(),
    city: branchCityName(draft, cities),
    address: draft.address.trim(),
    pincode: draft.pincode.trim(),
    ...(draft.pin && { lat: draft.pin.lat, lng: draft.pin.lng }),
    serviceIds: draft.serviceIds,
    copyHours: draft.copyHours,
    copyPhotos: draft.copyPhotos,
    sameOwner: draft.sameOwner,
  }
}

const rupees = (value: string) => `₹${Number(value).toLocaleString('en-IN')}`

/** A service's price beside its tick: "₹599", "₹499 to ₹899", "Inspection ₹199". */
export function branchPriceLabel(row: Pick<ServiceRowFields, 'pricingType' | 'price' | 'priceHatchback' | 'priceSedan' | 'priceSuv'>): string {
  if (row.pricingType === 'per_vehicle') {
    const prices = [row.priceHatchback, row.priceSedan, row.priceSuv]
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
    if (prices.length === 0) return rupees(row.price)
    const low = Math.min(...prices)
    const high = Math.max(...prices)
    return low === high ? rupees(String(low)) : `${rupees(String(low))} to ${rupees(String(high))}`
  }
  if (row.pricingType === 'on_inspection') return `Inspection ${rupees(row.price)}`
  return rupees(row.price)
}
