/**
 * Branch groups (0081, owner-approved screens 18 Nov 2026): one business,
 * several garages. Each branch stays a whole garage of its own (bookings,
 * slots, team, documents, reviews, bank); the group adds the Branches card,
 * changing services and prices at every branch at once, and the customers'
 * "Also at" and "1 of 3 … branches".
 *
 * The rules are here, pure, so they are unit-tested without a database
 * (branch-groups.test.ts):
 *
 *   - what a group and a branch are called (groupNameOf, branchLabelOf);
 *   - how a service at one branch is found at another: by its name, trimmed
 *     and in any case (serviceKey);
 *   - what "All N branches" does (planBranchServices): a price or other
 *     change, or a new service, reaches every branch, and a branch without
 *     that service gets it added; a delete skips a branch without it. Only
 *     services and prices: hours, photos, team and bank stay per branch.
 *
 * The preview and the save both run planBranchServices over the same rows,
 * and the save is refused when its plan is not the one previewed
 * (planKey), so what admin confirmed is what is written.
 */

import { createHash } from 'node:crypto'
import { resolveServicePricing, type ServicePricingType } from './pricing.js'

// ─── Names ───────────────────────────────────────────────────────────────────

/** Between a business and its area: "Shine Auto Spa – Anna Nagar". */
const SEPARATORS = [' – ', ' — ', ' - '] as const

/** The name split at its first separator; `area` null when there is none. */
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
 * A new group's name: the business name without its area, the part before
 * " – " or " - " ("Shine Auto Spa – Anna Nagar" → "Shine Auto Spa"), or the
 * whole name when it has none.
 */
export function groupNameOf(businessName: string): string {
  return splitName(businessName).business
}

/**
 * What a branch is called beside its group's other branches: its area
 * ("Anna Nagar"), or its whole name when the name has no area.
 */
export function branchLabelOf(businessName: string): string {
  const { business, area } = splitName(businessName)
  return area ?? business
}

/** How a service is found at another branch: its name, trimmed, in any case. */
export function serviceKey(name: string): string {
  return name.trim().toLowerCase()
}

// ─── Change all branches at once ─────────────────────────────────────────────

/** What of a service a save changed; only these reach the other branches. */
export const CHANGE_FIELDS = ['name', 'price', 'duration', 'description', 'category', 'commission'] as const
export type ChangeField = (typeof CHANGE_FIELDS)[number]

/** A service as the editor sends it (admin.validation's serviceInputSchema). */
export interface ServiceValues {
  name: string
  description?: string
  category: string
  pricingType: ServicePricingType
  price?: number
  priceHatchback?: number
  priceSedan?: number
  priceSuv?: number
  approxPrice?: number | null
  durationMins?: number | null
  commissionRate?: number | null
}

/** A plain service of a branch, as stored (never a package or an add-on, never deleted). */
export interface GroupService {
  id: string
  vendorId: string
  name: string
  description: string | null
  category: string
  pricingType: ServicePricingType
  price: string
  priceHatchback: string | null
  priceSedan: string | null
  priceSuv: string | null
  approxPrice: string | null
  durationMins: number | null
  commissionRate: string | null
  isActive: boolean
  /** The live packages it is part of, by name: a delete is refused while there are any. */
  packageNames: string[]
}

/** A branch of the group, not in the Bin, in the group's order (the main branch first). */
export interface GroupGarage {
  id: string
  businessName: string
}

export type BranchServicesChange =
  | {
      kind: 'save'
      /** Saved services of this garage that changed, with the fields that did. */
      changed: Array<{ serviceId: string; fields: ChangeField[]; service: ServiceValues }>
      /** New services. */
      added: ServiceValues[]
    }
  | { kind: 'delete'; serviceId: string }

/** The columns one write sets. */
export interface ServiceColumns {
  name?: string
  description?: string | null
  category?: string
  pricingType?: ServicePricingType
  price?: string
  priceHatchback?: string | null
  priceSedan?: string | null
  priceSuv?: string | null
  approxPrice?: string | null
  durationMins?: number | null
  commissionRate?: string | null
}

/** A service's price and duration, as the preview shows them. */
export interface PriceView {
  pricingType: ServicePricingType
  price: number | null
  priceHatchback: number | null
  priceSedan: number | null
  priceSuv: number | null
  approxPrice: number | null
  durationMins: number | null
}

/** What happens at one branch for one service. */
export interface BranchLine {
  vendorId: string
  /** The branch's area, or its name (branchLabelOf). */
  branch: string
  /**
   * update: it has the service and it changes; add: it gets the service;
   * delete: it has it and it goes; skip: it doesn't have it, nothing to delete.
   */
  action: 'update' | 'add' | 'delete' | 'skip'
  serviceIds: string[]
  before: PriceView | null
  after: PriceView | null
  /** Its price, duration or details were not this garage's before the change. */
  wasDifferent: boolean
  /** The branch has the service hidden: it stays hidden. */
  hidden: boolean
}

export interface PlanItem {
  kind: 'change' | 'new' | 'delete'
  /** The service's name, as it will be (the deleted one's for a delete). */
  name: string
  /** The name before a rename, else null. */
  previousName: string | null
  lines: BranchLine[]
}

export interface BranchPlan {
  branches: Array<{ id: string; label: string }>
  items: PlanItem[]
  writes: {
    updates: Array<{ serviceId: string; vendorId: string; columns: ServiceColumns }>
    inserts: Array<{ vendorId: string; columns: Required<Pick<ServiceColumns, 'name' | 'category' | 'pricingType' | 'price'>> & ServiceColumns }>
    deletes: Array<{ serviceId: string; vendorId: string }>
  }
  /** Fingerprint of the writes and what they were made from: the save must match the preview's. */
  key: string
}

export type BranchPlanResult =
  | ({ ok: true } & BranchPlan)
  | { ok: false; status: 404 | 409; code: string; message: string }

const money = (value: string | null): number | null => (value === null ? null : Number(value))

function viewOf(service: Pick<GroupService, 'pricingType' | 'price' | 'priceHatchback' | 'priceSedan' | 'priceSuv' | 'approxPrice' | 'durationMins'>): PriceView {
  return {
    pricingType: service.pricingType,
    price: money(service.price),
    priceHatchback: money(service.priceHatchback),
    priceSedan: money(service.priceSedan),
    priceSuv: money(service.priceSuv),
    approxPrice: money(service.approxPrice),
    durationMins: service.durationMins,
  }
}

/** The columns a change writes: only the fields that changed. */
export function columnsFor(fields: readonly ChangeField[], values: ServiceValues): ServiceColumns {
  const columns: ServiceColumns = {}
  for (const field of fields) {
    if (field === 'name') columns.name = values.name.trim()
    if (field === 'description') columns.description = values.description?.trim() || null
    if (field === 'category') columns.category = values.category
    if (field === 'duration') columns.durationMins = values.durationMins ?? null
    if (field === 'commission' && values.commissionRate !== undefined) {
      columns.commissionRate = values.commissionRate === null ? null : values.commissionRate.toFixed(2)
    }
    if (field === 'price') {
      const pricing: ServiceColumns = resolveServicePricing(values)
      // As the editor's own save: an approx price left out keeps what is stored.
      if (values.pricingType === 'on_inspection' && values.approxPrice === undefined) delete pricing.approxPrice
      Object.assign(columns, pricing)
    }
  }
  return columns
}

/** Every field, for a new service. */
function insertColumns(values: ServiceValues) {
  const columns = columnsFor(CHANGE_FIELDS, values)
  return {
    ...columns,
    name: values.name.trim(),
    category: values.category,
    pricingType: values.pricingType,
    price: columns.price ?? '0.00',
  }
}

/** The service with the columns applied, as the preview's "after". */
function applied(service: GroupService | null, columns: ServiceColumns): PriceView {
  const base: GroupService = service ?? {
    id: '', vendorId: '', name: '', description: null, category: 'others', pricingType: 'flat', price: '0',
    priceHatchback: null, priceSedan: null, priceSuv: null, approxPrice: null, durationMins: null,
    commissionRate: null, isActive: true, packageNames: [],
  }
  return viewOf({ ...base, ...(columns as Partial<GroupService>) })
}

/** The stored value of each changed field, to compare two branches' copies. */
function fieldValues(service: GroupService, fields: readonly ChangeField[]): string {
  return JSON.stringify(
    fields
      .filter((field) => field !== 'name')
      .map((field) => {
        if (field === 'price') return viewOf({ ...service, durationMins: null })
        if (field === 'duration') return service.durationMins
        if (field === 'description') return service.description ?? ''
        if (field === 'category') return service.category
        return service.commissionRate === null ? null : Number(service.commissionRate)
      })
  )
}

const SERVICE_GONE = {
  ok: false as const,
  status: 409 as const,
  code: 'SERVICE_DELETED',
  message: 'A service in this list was deleted since the page loaded. Reload to see the latest services, then save again.',
}

/**
 * What "All N branches" does, from the group's rows as they are now. The
 * garage being edited is `sourceId`; its own services are matched by id,
 * every other branch's by name (serviceKey). A changed service is updated
 * (only the fields that changed) wherever it is found, hidden copies
 * included, and added where it is not; a new service is added, or updated
 * where a branch already has one by that name; a deleted one is deleted
 * wherever it is found and skipped where it is not. A delete is refused
 * while any branch's copy is in a package, as the garage's own delete is.
 */
export function planBranchServices(input: {
  sourceId: string
  garages: readonly GroupGarage[]
  services: readonly GroupService[]
  change: BranchServicesChange
}): BranchPlanResult {
  const { sourceId, garages, services, change } = input
  const branches = garages.map((garage) => ({ id: garage.id, label: branchLabelOf(garage.businessName) }))
  const labelOf = new Map(branches.map((branch) => [branch.id, branch.label]))
  const servicesOf = (vendorId: string) => services.filter((service) => service.vendorId === vendorId)
  const sourceService = (id: string) => services.find((service) => service.id === id && service.vendorId === sourceId) ?? null
  const byKey = (vendorId: string, ...names: string[]) => {
    for (const name of names) {
      const found = servicesOf(vendorId).filter((service) => serviceKey(service.name) === serviceKey(name))
      if (found.length > 0) return found
    }
    return []
  }

  const items: PlanItem[] = []
  const writes: BranchPlan['writes'] = { updates: [], inserts: [], deletes: [] }
  // One write per service at most: two lines of one save landing on the
  // same service (two rows renamed into each other) would be a guess.
  const touched = new Set<string>()
  const clash = (name: string, vendorId: string): BranchPlanResult => ({
    ok: false,
    status: 409,
    code: 'BRANCH_SERVICE_CLASH',
    message: `Two of these services are called “${name}” at ${labelOf.get(vendorId) ?? 'one branch'}. Give them different names, or save for this branch only.`,
  })

  if (change.kind === 'delete') {
    const own = sourceService(change.serviceId)
    if (!own) return SERVICE_GONE
    const lines: BranchLine[] = []
    for (const garage of garages) {
      const found = garage.id === sourceId ? [own] : byKey(garage.id, own.name)
      const inPackage = found.find((service) => service.packageNames.length > 0)
      if (inPackage) {
        return {
          ok: false,
          status: 409,
          code: 'SERVICE_IN_PACKAGE',
          message: `Remove “${inPackage.name}” from ${inPackage.packageNames.map((name) => `“${name}”`).join(', ')} at ${labelOf.get(garage.id)} before deleting it.`,
        }
      }
      lines.push({
        vendorId: garage.id,
        branch: labelOf.get(garage.id)!,
        action: found.length > 0 ? 'delete' : 'skip',
        serviceIds: found.map((service) => service.id).sort(),
        before: found[0] ? viewOf(found[0]) : null,
        after: null,
        wasDifferent: false,
        hidden: found.length > 0 && found.every((service) => !service.isActive),
      })
      for (const service of found) writes.deletes.push({ serviceId: service.id, vendorId: garage.id })
    }
    items.push({ kind: 'delete', name: own.name, previousName: null, lines })
    return finish(branches, items, writes)
  }

  for (const edit of change.changed) {
    const own = sourceService(edit.serviceId)
    if (!own) return SERVICE_GONE
    const fields = [...new Set(edit.fields)].sort()
    if (fields.length === 0) continue
    const columns = columnsFor(fields, edit.service)
    const newName = edit.service.name.trim()
    const lines: BranchLine[] = []
    for (const garage of garages) {
      const found = garage.id === sourceId ? [own] : byKey(garage.id, own.name, newName)
      const label = labelOf.get(garage.id)!
      if (found.length === 0) {
        // Not at this branch: it gets the service, all of it.
        const row = insertColumns(edit.service)
        writes.inserts.push({ vendorId: garage.id, columns: row })
        lines.push({
          vendorId: garage.id, branch: label, action: 'add', serviceIds: [], before: null,
          after: applied(null, row), wasDifferent: false, hidden: false,
        })
        continue
      }
      for (const service of found) {
        if (touched.has(service.id)) return clash(service.name, garage.id)
        touched.add(service.id)
        writes.updates.push({ serviceId: service.id, vendorId: garage.id, columns })
      }
      lines.push({
        vendorId: garage.id,
        branch: label,
        action: 'update',
        serviceIds: found.map((service) => service.id).sort(),
        before: viewOf(found[0]!),
        after: applied(found[0]!, columns),
        wasDifferent: garage.id !== sourceId && found.some((service) => fieldValues(service, fields) !== fieldValues(own, fields)),
        hidden: found.every((service) => !service.isActive),
      })
    }
    items.push({
      kind: 'change',
      name: newName,
      previousName: newName === own.name.trim() ? null : own.name,
      lines,
    })
  }

  const addedKeys = new Set<string>()
  for (const values of change.added) {
    const name = values.name.trim()
    if (addedKeys.has(serviceKey(name))) return clash(name, sourceId)
    addedKeys.add(serviceKey(name))
    const row = insertColumns(values)
    const lines: BranchLine[] = []
    for (const garage of garages) {
      const label = labelOf.get(garage.id)!
      // This garage adds it as its own save would; another branch that
      // already has one by this name has it updated, never a second copy.
      const found = garage.id === sourceId ? [] : byKey(garage.id, name)
      if (found.length === 0) {
        writes.inserts.push({ vendorId: garage.id, columns: row })
        lines.push({
          vendorId: garage.id, branch: label, action: 'add', serviceIds: [], before: null,
          after: applied(null, row), wasDifferent: false, hidden: false,
        })
        continue
      }
      const columns = columnsFor(CHANGE_FIELDS, values)
      for (const service of found) {
        if (touched.has(service.id)) return clash(service.name, garage.id)
        touched.add(service.id)
        writes.updates.push({ serviceId: service.id, vendorId: garage.id, columns })
      }
      lines.push({
        vendorId: garage.id,
        branch: label,
        action: 'update',
        serviceIds: found.map((service) => service.id).sort(),
        before: viewOf(found[0]!),
        after: applied(found[0]!, columns),
        wasDifferent: true,
        hidden: found.every((service) => !service.isActive),
      })
    }
    items.push({ kind: 'new', name, previousName: null, lines })
  }

  return finish(branches, items, writes)
}

function finish(
  branches: BranchPlan['branches'],
  items: PlanItem[],
  writes: BranchPlan['writes']
): BranchPlanResult {
  const key = createHash('sha256').update(JSON.stringify({ branches, items, writes })).digest('hex').slice(0, 32)
  return { ok: true, branches, items, writes, key }
}

/** The plan as the editor shows it: no writes. */
export function planPreview(plan: BranchPlan) {
  return { branches: plan.branches, items: plan.items, key: plan.key }
}

// ─── Linking ─────────────────────────────────────────────────────────────────

/**
 * Whether a group still is one once a garage leaves: a group of one is no
 * group (the Branches card says "No other branches yet"), so it is undone.
 */
export const GROUP_MIN_BRANCHES = 2
