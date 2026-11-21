import type { ServiceCategory } from '@repo/core/types'
import { msg, t } from './i18n/translate'

// The single source of truth for category labels.
//
// Typed as Record<ServiceCategory, string> rather than Record<string, string>
// on purpose: the wide key type is what let 'others' ship in migration 0002
// without a label, so vendor cards rendered a raw lowercase "others" for a
// year. With the exhaustive key, adding a value to ServiceCategory breaks the
// build here until it gets a label.
export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  car_wash: msg('Car wash'),
  detailing: msg('Detailing'),
  coating: msg('Coating'),
  scratch_removal: msg('Scratch removal'),
  general_service: msg('General service'),
  repairs: msg('Repairs'),
  dent_paint: msg('Dent & paint'),
  others: msg('Others'),
  package: msg('Package'),
}

/** A plain service's category: every value but 'package' (a shape, not a kind of work). */
export type PlainServiceCategory = Exclude<ServiceCategory, 'package'>

/**
 * The order categories are listed in everywhere (owner, 16 Nov 2026): the
 * wash and detailing work, then the mechanical and body work, Others last.
 * Chips, the filter sheet, the admin editor's headings and every select
 * read it, so a new category is placed once, here.
 */
export const PLAIN_CATEGORY_ORDER: readonly PlainServiceCategory[] = [
  'car_wash',
  'detailing',
  'coating',
  'scratch_removal',
  'general_service',
  'repairs',
  'dent_paint',
  'others',
]

/** The mechanical and body work added on 16 Nov 2026 (0080), marked "New" in admin's picker. */
export const NEW_CATEGORIES: readonly PlainServiceCategory[] = ['general_service', 'repairs', 'dent_paint']

/** Every category, plain ones in order, then 'package'. */
export const CATEGORY_ORDER: readonly ServiceCategory[] = [...PLAIN_CATEGORY_ORDER, 'package']

/** A category's place in CATEGORY_ORDER; an unknown one sorts last. */
export function categoryRank(category: string): number {
  const at = CATEGORY_ORDER.indexOf(category as ServiceCategory)
  return at === -1 ? CATEGORY_ORDER.length : at
}

export interface CategoryGroup<T> {
  category: ServiceCategory
  items: T[]
}

/**
 * Items under their category, in CATEGORY_ORDER, each group keeping the
 * items' own order. A category with no items is left out. For the screens
 * that list services under small category headings (admin editor, garage
 * "Your services", the customer garage page).
 */
export function groupByCategory<T>(
  items: readonly T[],
  categoryOf: (item: T) => string
): CategoryGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const category = categoryOf(item)
    groups.set(category, [...(groups.get(category) ?? []), item])
  }
  return [...groups]
    .sort(([a], [b]) => categoryRank(a) - categoryRank(b))
    .map(([category, list]) => ({ category: category as ServiceCategory, items: list }))
}

/**
 * Whether a list is worth showing under headings: only when it holds two or
 * more kinds of work (the mockups' rule), so a wash-only garage keeps one run.
 */
export function showCategoryHeadings<T>(groups: readonly CategoryGroup<T>[]): boolean {
  return groups.length >= 2
}

// Categories a vendor may pick on the plain "add a service" form. 'package' is
// deliberately absent: a package is only valid with member services attached,
// so it is created through the package builder, never by picking a dropdown
// value on a form that cannot collect items.
export const SERVICE_CATEGORY_OPTIONS: Array<{
  value: ServiceCategory
  label: string
}> = PLAIN_CATEGORY_ORDER.map((value) => ({ value, label: CATEGORY_LABELS[value] }))

// Filter chips on the customer home screen. 'all' is a UI-only key.
export const CATEGORY_FILTERS: Array<{
  key: ServiceCategory | 'all'
  label: string
}> = [
  { key: 'all', label: msg('All') },
  { key: 'package', label: msg('Packages') },
  { key: 'car_wash', label: msg('Car Wash') },
  { key: 'detailing', label: msg('Detailing') },
  { key: 'coating', label: msg('Coating') },
  { key: 'scratch_removal', label: msg('Scratch Removal') },
  { key: 'general_service', label: msg('General service') },
  { key: 'repairs', label: msg('Repairs') },
  { key: 'dent_paint', label: msg('Dent & paint') },
  { key: 'others', label: msg('Others') },
]

/**
 * The category's name in the language in use. The constants above stay
 * English (they are the keys); a screen showing one of them says t(label).
 */
export function categoryLabel(category: string): string {
  return t(CATEGORY_LABELS[category as ServiceCategory] ?? category)
}
