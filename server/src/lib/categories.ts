import type { serviceCategoryEnum } from '../db/schema.js'

export type ServiceCategory = (typeof serviceCategoryEnum.enumValues)[number]

// Server-side label map for the public listing's serviceTags. Keyed exhaustively
// on the enum, so adding a category to serviceCategoryEnum fails the build here
// until it gets a label — the drift that let 'others' ship label-less in
// migration 0002. The web app has its own copy in web/lib/categories.ts; keep
// the wording in the two in sync.
export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  car_wash: 'Car wash',
  detailing: 'Detailing',
  coating: 'Coating',
  scratch_removal: 'Scratch removal',
  others: 'Others',
  package: 'Package',
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as ServiceCategory] ?? category
}
