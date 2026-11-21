/**
 * Settings → Services in Others (0080): every garage's services filed under
 * Others whose names look like servicing, repairs or dent work, for the
 * first sort after launch. The API lists Others; the keyword rule is core's
 * (category-hints.ts), so the page and the editor's hint never disagree.
 * Pure, so it is tested here rather than in the page.
 */
import type { AdminOthersService } from '@repo/core/api/admin'
import { matchCategoryHint, type HintCategory } from '@repo/core/category-hints'

export type OthersTab = 'check' | 'moved' | 'dismissed'

export const OTHERS_TABS: ReadonlyArray<{ key: OthersTab; label: string }> = [
  { key: 'check', label: 'To check' },
  { key: 'moved', label: 'Moved' },
  { key: 'dismissed', label: 'Not this' },
]

/** How many rows show before "Show more". */
export const OTHERS_PAGE_SIZE = 50

export interface OthersRow {
  service: AdminOthersService
  category: HintCategory
  keyword: string
  /** Where it stands on this page: moved here (with Undo), turned down, or to check. */
  state: OthersTab
}

/**
 * The services with a hint, in the API's order (garage, then name), with
 * what this page did to them since it opened: `moved` holds this session's
 * moves (the API no longer lists them in Others after a reload), and
 * `dismissed` this session's "Not this" and "Show again" over what the API
 * said.
 */
export function othersRows(
  services: readonly AdminOthersService[],
  moved: Readonly<Record<string, HintCategory>>,
  dismissed: Readonly<Record<string, boolean>>
): OthersRow[] {
  return services.flatMap((service): OthersRow[] => {
    const hint = matchCategoryHint(service.name)
    if (!hint) return []
    const isDismissed = dismissed[service.id] ?? service.categoryHintDismissedAt !== null
    const state: OthersTab = moved[service.id] ? 'moved' : isDismissed ? 'dismissed' : 'check'
    return [{ service, category: moved[service.id] ?? hint.category, keyword: hint.keyword, state }]
  })
}

/** Each tab's count. A row moved here counts as Moved, not To check. */
export function othersCounts(rows: readonly OthersRow[]): Record<OthersTab, number> {
  const counts: Record<OthersTab, number> = { check: 0, moved: 0, dismissed: 0 }
  for (const row of rows) counts[row.state]++
  return counts
}

/**
 * The rows a tab lists. To check keeps a row moved on this page in place,
 * marked Moved with its Undo, so the list does not jump under the admin.
 */
export function rowsForTab(rows: readonly OthersRow[], tab: OthersTab, movedHere: ReadonlySet<string>): OthersRow[] {
  if (tab === 'check') return rows.filter((row) => row.state === 'check' || movedHere.has(row.service.id))
  return rows.filter((row) => row.state === tab)
}

const rupees = (value: string | null) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`

/** "₹1,199 – ₹1,699", "₹1,800", "Inspection ₹499": the price under the name. */
export function othersPriceLabel(
  service: Pick<AdminOthersService, 'pricingType' | 'price' | 'priceHatchback' | 'priceSedan' | 'priceSuv'>
): string {
  if (service.pricingType === 'on_inspection') return `Inspection ${rupees(service.price)}`
  if (service.pricingType === 'per_vehicle') {
    const tiers = [service.priceHatchback, service.priceSedan, service.priceSuv]
      .filter((tier): tier is string => tier !== null)
      .map(Number)
    if (tiers.length === 0) return rupees(service.price)
    const low = Math.min(...tiers)
    const high = Math.max(...tiers)
    return low === high ? rupees(String(low)) : `${rupees(String(low))} – ${rupees(String(high))}`
  }
  return rupees(service.price)
}
