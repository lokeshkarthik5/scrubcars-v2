'use client'

import {
  IconDots,
  IconDroplet,
  IconEngine,
  IconPackage,
  IconShieldCheck,
  IconSparkles,
  IconSpray,
  IconTool,
  IconWand,
} from '@tabler/icons-react'
import { categoryLabel } from '@repo/core/categories'
import type { ServiceCategory } from '@repo/core/types'

/**
 * Each category's icon, as the customer filter sheet draws it (Tabler, the
 * same 1.6 line). The garage app's twin is in its services tab.
 */
export const CATEGORY_ICONS: Record<ServiceCategory, typeof IconDroplet> = {
  car_wash: IconDroplet,
  detailing: IconSparkles,
  coating: IconShieldCheck,
  scratch_removal: IconWand,
  general_service: IconEngine,
  repairs: IconTool,
  dent_paint: IconSpray,
  others: IconDots,
  package: IconPackage,
}

/**
 * "Your services" small heading (16 Nov 2026): the category's icon, its
 * name and how many services are under it. Read as "Repairs 2".
 */
export function CategoryHeading({
  category,
  count,
}: {
  category: ServiceCategory
  count: number
}) {
  const Icon = CATEGORY_ICONS[category]
  return (
    <h3 className="flex items-center gap-1.5 px-1 pt-1 text-[12px] font-medium text-text-secondary">
      <Icon size={14} stroke={1.6} aria-hidden="true" />
      <span>{categoryLabel(category)}</span>
      <span className="font-numeric text-text-muted">{count}</span>
    </h3>
  )
}
