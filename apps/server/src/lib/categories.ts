import type { serviceCategoryEnum } from '../db/schema.js'

export type ServiceCategory = (typeof serviceCategoryEnum.enumValues)[number]

// Server-side label map for the public listing's serviceTags. Keyed exhaustively
// on the enum, so adding a category to serviceCategoryEnum fails the build here
// until it gets a label — the drift that let 'others' ship label-less in
// migration 0002. The apps' copy is packages/core/src/categories.ts;
// categories.parity.test.ts keeps the two the same.
export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  car_wash: 'Car wash',
  detailing: 'Detailing',
  coating: 'Coating',
  scratch_removal: 'Scratch removal',
  general_service: 'General service',
  repairs: 'Repairs',
  dent_paint: 'Dent & paint',
  others: 'Others',
  package: 'Package',
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as ServiceCategory] ?? category
}

/**
 * The order categories are listed in everywhere, as the apps' twin
 * (packages/core/src/categories.ts CATEGORY_ORDER) has it: wash and
 * detailing work, then the mechanical and body work, Others, packages.
 */
export const CATEGORY_ORDER: readonly ServiceCategory[] = [
  'car_wash',
  'detailing',
  'coating',
  'scratch_removal',
  'general_service',
  'repairs',
  'dent_paint',
  'others',
  'package',
]

/** A category's place in CATEGORY_ORDER; an unknown one sorts last. */
export function categoryRank(category: string): number {
  const at = CATEGORY_ORDER.indexOf(category as ServiceCategory)
  return at === -1 ? CATEGORY_ORDER.length : at
}
