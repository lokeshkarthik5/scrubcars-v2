import type { ServiceCategory } from '@repo/core/types'

// The single source of truth for category labels.
//
// Typed as Record<ServiceCategory, string> rather than Record<string, string>
// on purpose: the wide key type is what let 'others' ship in migration 0002
// without a label, so vendor cards rendered a raw lowercase "others" for a
// year. With the exhaustive key, adding a value to ServiceCategory breaks the
// build here until it gets a label.
export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  car_wash: 'Car wash',
  detailing: 'Detailing',
  coating: 'Coating',
  scratch_removal: 'Scratch removal',
  others: 'Others',
  package: 'Package',
}

// Categories a vendor may pick on the plain "add a service" form. 'package' is
// deliberately absent: a package is only valid with member services attached,
// so it is created through the package builder, never by picking a dropdown
// value on a form that cannot collect items.
export const SERVICE_CATEGORY_OPTIONS: Array<{
  value: ServiceCategory
  label: string
}> = (['car_wash', 'detailing', 'coating', 'scratch_removal', 'others'] as const).map(
  (value) => ({ value, label: CATEGORY_LABELS[value] })
)

// Filter chips on the customer home screen. 'all' is a UI-only key.
export const CATEGORY_FILTERS: Array<{
  key: ServiceCategory | 'all'
  label: string
}> = [
  { key: 'all', label: 'All' },
  { key: 'package', label: 'Packages' },
  { key: 'car_wash', label: 'Car Wash' },
  { key: 'detailing', label: 'Detailing' },
  { key: 'coating', label: 'Coating' },
  { key: 'scratch_removal', label: 'Scratch Removal' },
  { key: 'others', label: 'Others' },
]

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as ServiceCategory] ?? category
}
