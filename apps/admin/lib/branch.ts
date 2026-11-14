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
  /** The branch owner's phone; starts as the source owner's (the same login). */
  ownerPhone: string
  /** Asked for only when the number is not the source owner's. */
  ownerName: string
}

type CityOption = { id: string; name: string }

/** Under the owner's phone (owner, 10 Nov 2026). */
export const BRANCH_OWNER_HINT =
  'Same number: same login, both garages show in the garage app. A different number gets its own login.'

/** When the number is another login's and the source does pickup & drop. */
export const BRANCH_PICKUP_UNSIGNED =
  'Pickup & drop stays off until this garage signs its own agreement.'

/**
 * Every box ticked, as the owner asked: all services, hours, photos, and
 * the source owner's number, so the same login.
 */
export function branchDraftFrom(
  garageName: string,
  serviceIds: string[],
  cities: readonly CityOption[],
  ownerPhone: string
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
    ownerPhone,
    ownerName: '',
  }
}

/**
 * The number is the source owner's, so the same login. The server decides
 * by the account that has the number; trimmed here as its schema trims.
 */
export function isSameOwnerLogin(draft: Pick<BranchDraft, 'ownerPhone'>, sourceOwnerPhone: string): boolean {
  return draft.ownerPhone.trim() === sourceOwnerPhone.trim()
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
export function branchProblem(
  draft: BranchDraft,
  cities: readonly CityOption[],
  atGarage: boolean,
  sourceOwnerPhone: string
): string | null {
  if (!draft.businessName.trim()) return 'Enter the branch’s name.'
  if (!branchCityName(draft, cities)) return 'Choose the branch’s city, or type its town.'
  const pincode = draft.pincode.trim()
  if (pincode && !/^\d{6}$/.test(pincode)) return 'The pincode is 6 digits.'
  if (atGarage && (!draft.address.trim() || !pincode)) {
    return 'Customers come to this garage, so the branch needs its address and pincode.'
  }
  if (!/^\d{10}$/.test(draft.ownerPhone.trim())) return 'The owner’s phone number is 10 digits.'
  if (!isSameOwnerLogin(draft, sourceOwnerPhone) && !draft.ownerName.trim()) {
    return 'Enter the owner’s name: a different number gets its own login.'
  }
  return null
}

/** The request the sheet sends; the name only with a different number. */
export function branchInput(draft: BranchDraft, cities: readonly CityOption[], sourceOwnerPhone: string): BranchInput {
  return {
    businessName: draft.businessName.trim(),
    city: branchCityName(draft, cities),
    address: draft.address.trim(),
    pincode: draft.pincode.trim(),
    ...(draft.pin && { lat: draft.pin.lat, lng: draft.pin.lng }),
    serviceIds: draft.serviceIds,
    copyHours: draft.copyHours,
    copyPhotos: draft.copyPhotos,
    ownerPhone: draft.ownerPhone.trim(),
    ...(!isSameOwnerLogin(draft, sourceOwnerPhone) && { ownerName: draft.ownerName.trim() }),
  }
}

const rupees = (value: string) => `₹${Number(value).toLocaleString('en-IN')}`

/** A service's price beside its tick: "₹599", "₹499 to ₹899", "Inspection ₹199", "Price on inspection". */
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
  // No fee (0073): never "Inspection ₹0".
  if (row.pricingType === 'on_inspection') {
    return Number(row.price) > 0 ? `Inspection ${rupees(row.price)}` : 'Price on inspection'
  }
  return rupees(row.price)
}
