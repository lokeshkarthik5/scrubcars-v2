/**
 * "Add a branch" (0069): a second garage for the same business, often in
 * another city, started from an existing one so admin does not type its
 * services and hours again (owner request, 10 Nov 2026).
 *
 * What comes along is decided here, from the source garage's own rows:
 *
 *   - the services admin ticked, which must be the source's own live plain
 *     services (a stale tab naming one deleted since is refused whole, as the
 *     editor's Save is);
 *   - each live package whose every member was ticked (a package cannot sell
 *     a service the branch does not have);
 *   - the garage's live add-ons, which go with any service, whenever at least
 *     one service is copied.
 *
 * Never: documents (each branch needs its own), bookings, reviews, tiers,
 * marks or notes. The branch starts Pending and not shown to customers.
 *
 * Who owns it, and whether the pickup & drop agreement comes along, follow
 * the owner's phone number admin gives (owner decisions, 10 Nov 2026):
 * planBranchOwner and branchPickupTerms below.
 *
 * Pure, so the rules are unit-tested without a database (branches.test.ts).
 */

import type { VendorPickupAnswer } from './pickup.js'

export interface BranchSourceService {
  id: string
  /** 'package' for a package; every other category is a plain service. */
  category: string
  isAddon: boolean
  isActive: boolean
}

export interface BranchSourcePackage {
  id: string
  isActive: boolean
  memberIds: readonly string[]
}

export type BranchCopyPlan =
  | {
      ok: true
      /** Plain services to copy, in the source's order. */
      serviceIds: string[]
      /** Packages whose every member is copied. */
      packageIds: string[]
      /** Add-ons, only when at least one service is copied. */
      addOnIds: string[]
    }
  | { ok: false; code: 'SERVICE_NOT_FOUND'; message: string }

export function planBranchCopy(input: {
  ticked: readonly string[]
  services: readonly BranchSourceService[]
  packages: readonly BranchSourcePackage[]
}): BranchCopyPlan {
  const plain = input.services.filter((service) => !service.isAddon && service.category !== 'package' && service.isActive)
  const plainIds = new Set(plain.map((service) => service.id))
  const ticked = new Set(input.ticked)
  for (const id of ticked) {
    if (!plainIds.has(id)) {
      return {
        ok: false,
        code: 'SERVICE_NOT_FOUND',
        message: 'A ticked service is no longer on this garage. Reload to see its services, then add the branch again.',
      }
    }
  }
  const serviceIds = plain.filter((service) => ticked.has(service.id)).map((service) => service.id)
  const packageIds = input.packages
    .filter(
      (pkg) => pkg.isActive && pkg.memberIds.length > 0 && pkg.memberIds.every((member) => ticked.has(member))
    )
    .map((pkg) => pkg.id)
  const addOnIds =
    serviceIds.length > 0
      ? input.services.filter((service) => service.isAddon && service.isActive).map((service) => service.id)
      : []
  return { ok: true, serviceIds, packageIds, addOnIds }
}

// ─── The owner's login ───────────────────────────────────────────────────────

/**
 * The branch's owner, as the transaction writes it: an account that already
 * has the number (made a garage owner if it is not one yet), or a new one
 * for that number, set up as Add a garage does (createOwner).
 */
export type BranchOwner =
  | { kind: 'existing'; userId: string; makeVendorOwner: boolean }
  | { kind: 'new'; name: string; phone: string }

export type BranchOwnerPlan =
  | {
      ok: true
      /** The source garage's own owner: one login, both garages in the garage app. */
      sameLogin: boolean
      owner: BranchOwner
    }
  | { ok: false; code: 'OWNER_NAME_REQUIRED'; message: string }

/**
 * Who owns the branch, from the owner's phone number admin gave. The source
 * owner's own number is the same login, so the garage app's switcher shows
 * both garages; any other number is that person's own login, found by the
 * number or set up for it, and a new account needs a name. Either way the
 * owner gets the branch's vendor_admin seat, so no branch is ever left with
 * no one who can sign in to it.
 */
export function planBranchOwner(input: {
  sourceOwnerId: string
  /** Already 10 digits (the request schema's phone rule). */
  phone: string
  name: string | null | undefined
  /** The account that has this number, if any. */
  account: { id: string; isVendorOwner: boolean } | null | undefined
}): BranchOwnerPlan {
  const { account } = input
  if (account) {
    return {
      ok: true,
      sameLogin: account.id === input.sourceOwnerId,
      owner: { kind: 'existing', userId: account.id, makeVendorOwner: !account.isVendorOwner },
    }
  }
  const name = input.name?.trim()
  if (!name) {
    return {
      ok: false,
      code: 'OWNER_NAME_REQUIRED',
      message: 'No Detlio account has this number yet. Enter the owner’s name to set one up.',
    }
  }
  return { ok: true, sameLogin: false, owner: { kind: 'new', name, phone: input.phone } }
}

// ─── Pickup & drop's agreement ───────────────────────────────────────────────

export interface BranchPickupTerms {
  pickup: VendorPickupAnswer | null
  pickupTermsAcceptedAt: Date | null
  pickupTermsAcceptedBy: string | null
}

/**
 * The agreement follows the login. The same login is the same business, so
 * the branch keeps the source's signed responsibility (the record says who
 * accepted it and when). Another login has signed nothing: pickup & drop is
 * off ('no', with no terms on file) until that garage signs its own, which
 * admin records with the editor's "The garage has agreed to this" tick, or
 * the garage itself in its settings. The radius and "All over <city>" are
 * kept by the caller, so turning it on later needs only the tick.
 */
export function branchPickupTerms(source: BranchPickupTerms, sameLogin: boolean): BranchPickupTerms {
  if (sameLogin) {
    return {
      pickup: source.pickup,
      pickupTermsAcceptedAt: source.pickupTermsAcceptedAt,
      pickupTermsAcceptedBy: source.pickupTermsAcceptedBy,
    }
  }
  return {
    // Never answered stays never answered; any answer becomes off.
    pickup: source.pickup === null ? null : 'no',
    pickupTermsAcceptedAt: null,
    pickupTermsAcceptedBy: null,
  }
}
