/**
 * Branches (0081): one business, several garages. What customers see of it,
 * the same on the website and the phone app:
 *
 *   - the garage page's "Also at" row: the other live branches, each with
 *     how far it is from the customer when their place is known
 *     (alsoAtChips); a tap opens that branch's own page;
 *   - the search card's "1 of 3 Shine Auto Spa branches", when two or more
 *     branches are live (branchesLine), so two similar cards don't look
 *     like a mistake.
 *
 * The server sends only live branches (the lists' own rule), so nothing here
 * filters: a branch not shown to customers never arrives.
 */
import { distanceLabel } from '@repo/core/drive-time'
import { t } from '@repo/core/i18n/translate'
import { straightLineKm } from '@repo/core/map'

/** Between a business and its area: "Shine Auto Spa – Anna Nagar". */
const SEPARATORS = [' – ', ' — ', ' - '] as const

function splitName(businessName: string): { business: string; area: string | null } {
  const name = businessName.trim()
  let at = -1
  let length = 0
  for (const separator of SEPARATORS) {
    const index = name.indexOf(separator)
    if (index > 0 && (at === -1 || index < at)) {
      at = index
      length = separator.length
    }
  }
  if (at === -1) return { business: name, area: null }
  const business = name.slice(0, at).trim()
  const area = name.slice(at + length).trim()
  return business && area ? { business, area } : { business: name, area: null }
}

/**
 * A new group's name: the business name without its area ("Shine Auto Spa –
 * Anna Nagar" → "Shine Auto Spa"), or the whole name. The server's rule
 * (groupNameOf in apps/server/src/lib/branch-groups.ts,
 * branch-groups.parity.test.ts): admin says it before the group exists.
 */
export function groupNameOf(businessName: string): string {
  return splitName(businessName).business
}

/** A branch beside the others: its area ("Anna Nagar"), or its whole name. */
export function branchLabelOf(businessName: string): string {
  const { business, area } = splitName(businessName)
  return area ?? business
}

/** One of the garage's other live branches, as GET /vendors/:id sends it. */
export interface GarageBranch {
  id: string
  /** Its area ("Velachery"), or its name when it has none. */
  name: string
  lat: number | null
  lng: number | null
}

/** A card's group, as the list sends it: only when two or more are live. */
export interface BranchGroupLine {
  name: string
  liveCount: number
}

/** "1 of 3 Shine Auto Spa branches", or null with fewer than two live. */
export function branchesLine(group: BranchGroupLine | null | undefined): string | null {
  if (!group || group.liveCount < 2) return null
  return t('1 of {count} {name} branches', { count: String(group.liveCount), name: group.name })
}

export interface AlsoAtChip {
  id: string
  /** "Velachery · 4.2 km", or "Velachery" when how far is not known. */
  label: string
  /** For a screen reader: "Velachery, 4.2 km away. Open this branch". */
  accessibleName: string
}

/**
 * The "Also at" chips, in the group's order. The distance is the straight
 * line from the customer's place (an area's centre reads "~", as the page's
 * own distance does), and left off when the place or the branch's pin is
 * not known.
 */
export function alsoAtChips(
  branches: readonly GarageBranch[] | null | undefined,
  from: { lat: number; lng: number } | null,
  approximate = false
): AlsoAtChip[] {
  return (branches ?? []).map((branch) => {
    const km =
      from && branch.lat !== null && branch.lng !== null
        ? straightLineKm(from, { lat: branch.lat, lng: branch.lng })
        : null
    const distance = km === null ? null : distanceLabel(km, approximate)
    return {
      id: branch.id,
      label: distance ? `${branch.name} · ${distance}` : branch.name,
      accessibleName: distance
        ? t('{name}, {distance} away. Open this branch', { name: branch.name, distance })
        : t('{name}. Open this branch', { name: branch.name }),
    }
  })
}
