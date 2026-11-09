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
 * Pure, so the rules are unit-tested without a database (branches.test.ts).
 */

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
