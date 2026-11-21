/**
 * Branches (0081, owner-approved screens 18 Nov 2026,
 * reference/mockups/garage-tools/2-branches.html): the Branches card, the
 * Add a branch sheet's "Joins the … group" line, and changing services and
 * prices at every branch at once. The words and the editor's change list,
 * pure so they are unit-tested without a browser (branch-groups.test.ts).
 * Which branch gets what is the server's (lib/branch-groups.ts there): the
 * preview comes from it.
 */
import type {
  AdminBranch,
  BranchChangeField,
  BranchPlanLine,
  BranchPriceView,
  BranchServicesChange,
  BranchState,
} from '@repo/core/api/admin-branches'
import { istDateKey } from '@repo/core/garage-book'
import { durationLabel, toServicePayload, type ServiceRow } from './service-editor'
import { rowsToSave } from './service-rows'

/** The editor's own words for a garage's state (the garage list's chips). */
export const BRANCH_STATE_LABELS: Record<BranchState, string> = {
  live: 'Live',
  paused: 'Paused',
  not_live: 'Not live yet',
}

/** Under the card's branches (mockup 1). */
export const BRANCHES_NOTE =
  'Each branch has its own bookings, slots, team, documents and reviews. Services and prices can be changed for all branches at once from any branch’s Services tab.'

/** The card of a garage in no group. */
export const NO_BRANCHES_NOTE =
  'No other branches yet. Add a branch to start one from this garage, or link a garage that was copied before.'

/** Under "All N branches" (mockup 3). */
export const ALL_BRANCHES_NOTE = 'Only services and prices. Hours, photos, team and bank stay as each branch has them.'

/** "4.6 (212)", or "No reviews yet"; a new garage (under 3 counted) says how many it has. */
export function branchRatingText(branch: Pick<AdminBranch, 'rating' | 'reviewCount'>): string {
  if (branch.rating !== null) return `${branch.rating.toFixed(1)} (${branch.reviewCount})`
  if (branch.reviewCount === 0) return 'No reviews yet'
  return branch.reviewCount === 1 ? '1 review' : `${branch.reviewCount} reviews`
}

/** A branch added today and not live yet: the amber line under its address. */
export function addedTodayLine(branch: Pick<AdminBranch, 'state' | 'createdAt'>, now = new Date()): string | null {
  if (branch.state === 'live') return null
  return istDateKey(new Date(branch.createdAt)) === istDateKey(now)
    ? 'Added today. Not shown to customers until it’s checked.'
    : null
}

/** "14, 2nd Avenue, Anna Nagar · 600040", without the parts it has not got. */
export function branchAddressLine(branch: Pick<AdminBranch, 'address' | 'pincode'>): string {
  return [branch.address.trim(), branch.pincode.trim()].filter(Boolean).join(' · ')
}

/** "4 branches". */
export const branchCount = (count: number) => (count === 1 ? '1 branch' : `${count} branches`)

/** "Anna Nagar, Velachery, OMR and T. Nagar". */
export function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "All 4 branches". */
export const allBranchesLabel = (count: number) => `All ${count} branches`

/** The services editor's banner, for a garage in a group (mockup 3). */
export function servicesBanner(groupName: string, count: number) {
  return {
    lead: 'This garage is one of ',
    strong: `${count} ${groupName} branches`,
    rest: '. When you save, you choose: this branch only, or all of them.',
  }
}

/** Add a branch's line (mockup 2): the group it joins, as it is called or will be. */
export function joinsGroupLine(groupName: string) {
  return {
    lead: 'Joins the ',
    strong: groupName,
    rest: ' group: customers see the other branches, and you can change services and prices for all branches at once.',
  }
}

// ─── What changed, for "All N branches" ──────────────────────────────────────

type Payload = ReturnType<typeof toServicePayload>

const FIELD_PARTS: Record<BranchChangeField, (payload: Payload) => unknown> = {
  name: (payload) => payload.name,
  price: (payload) => [
    payload.pricingType,
    payload.price ?? null,
    payload.priceHatchback ?? null,
    payload.priceSedan ?? null,
    payload.priceSuv ?? null,
    payload.approxPrice ?? null,
  ],
  duration: (payload) => payload.durationMins ?? null,
  description: (payload) => payload.description ?? '',
  category: (payload) => payload.category,
  commission: (payload) => payload.commissionRate ?? null,
}

const FIELDS = Object.keys(FIELD_PARTS) as BranchChangeField[]

/** The service as the change sends it: the editor's own payload, without its id. */
function values(payload: Payload): Omit<Payload, 'id'> {
  const rest: Partial<Payload> = { ...payload }
  delete rest.id
  return rest as Omit<Payload, 'id'>
}

/**
 * What a save changes in the services, as "All N branches" sends it: each
 * saved service that changed, with the fields that did (only those reach
 * the other branches), and each new one. A "Not this" on a category hint is
 * this garage's own: sent with no fields, so it is saved here and goes
 * nowhere else. Null when nothing that reaches the other branches changed,
 * so Save changes then saves as before, without asking.
 */
export function branchServicesChange(
  saved: readonly ServiceRow[],
  draft: readonly ServiceRow[]
): Extract<BranchServicesChange, { kind: 'save' }> | null {
  const before = new Map(saved.filter((row) => row.id).map((row) => [row.id!, toServicePayload(row)]))
  const changed: Extract<BranchServicesChange, { kind: 'save' }>['changed'] = []
  const added: Extract<BranchServicesChange, { kind: 'save' }>['added'] = []
  for (const row of rowsToSave([...draft])) {
    const now = toServicePayload(row)
    if (!row.id) {
      // Its "Not this" goes too: the server keeps it on this garage's own
      // copy only, as this garage's own save does.
      added.push(values(now))
      continue
    }
    const was = before.get(row.id)
    if (!was) continue
    const fields = FIELDS.filter(
      (field) => JSON.stringify(FIELD_PARTS[field](was)) !== JSON.stringify(FIELD_PARTS[field](now))
    )
    if (fields.length > 0 || was.categoryHintDismissed !== now.categoryHintDismissed) {
      changed.push({ serviceId: row.id, fields, service: values(now) })
    }
  }
  const reachesOthers = added.length > 0 || changed.some((edit) => edit.fields.length > 0)
  return reachesOthers ? { kind: 'save', changed, added } : null
}

// ─── The preview ─────────────────────────────────────────────────────────────

const rupees = (value: number) => `₹${value.toLocaleString('en-IN')}`

/** "₹549", "₹400 to ₹600", "₹299 inspection", "Price on inspection". */
export function planPriceText(view: BranchPriceView): string {
  if (view.pricingType === 'per_vehicle') {
    const tiers = [view.priceHatchback, view.priceSedan, view.priceSuv].filter(
      (value): value is number => value !== null && value > 0
    )
    if (tiers.length === 0) return view.price ? rupees(view.price) : 'No prices set'
    const low = Math.min(...tiers)
    const high = Math.max(...tiers)
    return low === high ? rupees(low) : `${rupees(low)} to ${rupees(high)}`
  }
  if (view.pricingType === 'on_inspection') {
    return view.price && view.price > 0 ? `${rupees(view.price)} inspection` : 'Price on inspection'
  }
  return rupees(view.price ?? 0)
}

/** "₹249, 30 min": a new service's price and length. */
export function planNewText(view: BranchPriceView): string {
  return view.durationMins ? `${planPriceText(view)}, ${durationLabel(view.durationMins)}` : planPriceText(view)
}

/** The flag after a branch's line. */
export function lineNote(line: BranchPlanLine, kind: 'change' | 'new' | 'delete'): string | null {
  if (kind === 'delete') return line.hidden ? '(hidden there)' : null
  if (line.hidden) return '(hidden there, stays hidden)'
  if (kind === 'new' && line.action === 'update') return '(already there)'
  if (line.action === 'add') return '(added there)'
  return line.wasDifferent ? '(was different)' : null
}

/** A change line's before → after when only the duration moved, else the prices. */
export function lineFigures(line: BranchPlanLine): { before: string | null; after: string } {
  const after = line.after!
  if (!line.before) return { before: null, after: planNewText(after) }
  const priceBefore = planPriceText(line.before)
  const priceAfter = planPriceText(after)
  if (priceBefore === priceAfter && line.before.durationMins !== after.durationMins) {
    const minutes = (mins: number | null) => (mins ? durationLabel(mins) : 'No duration')
    return { before: minutes(line.before.durationMins), after: minutes(after.durationMins) }
  }
  return { before: priceBefore, after: priceAfter }
}

/** A new service added at every branch: one line instead of four. */
export function addedAtAll(lines: readonly BranchPlanLine[]): boolean {
  return lines.length > 0 && lines.every((line) => line.action === 'add')
}

/** "Deleted", or "Doesn’t have it · skipped". */
export const deleteLineText = (line: BranchPlanLine) =>
  line.action === 'skip' ? 'Doesn’t have it · skipped' : 'Deleted'
