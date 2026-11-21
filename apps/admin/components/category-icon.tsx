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
import type { ServiceCategory } from '@repo/core/types'

/**
 * Each category's icon, as the customer filter sheet and the garage portal
 * draw them (Tabler): the editor's headings, template lines, Add service's
 * picker and the "Move to …" buttons.
 */
const CATEGORY_ICONS: Record<ServiceCategory, typeof IconDroplet> = {
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

export function CategoryIcon({
  category,
  size = 16,
  className,
}: {
  category: ServiceCategory
  size?: number
  className?: string
}) {
  const Icon = CATEGORY_ICONS[category] ?? IconDots
  return <Icon size={size} stroke={1.6} aria-hidden="true" className={className} />
}
