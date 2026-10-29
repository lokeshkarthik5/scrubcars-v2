import {
  IconBrush,
  IconDroplets,
  IconMotorbike,
  IconPackage,
  IconShieldCheck,
  IconSparkles,
  IconTool,
  type TablerIcon,
} from '@tabler/icons-react'
import { serviceIconFor, type ServiceIcon } from '@repo/core/service-media'
import type { Service } from '@repo/core/types'
import { cn } from '@repo/core/utils'

/** One clean icon per kind of work (no-photo look, mockup C). */
const ICONS: Record<ServiceIcon, TablerIcon> = {
  wash: IconDroplets,
  detailing: IconSparkles,
  coating: IconShieldCheck,
  scratch: IconBrush,
  bike: IconMotorbike,
  package: IconPackage,
  others: IconTool,
}

/** Its matching tint, from the approved mockup (`.g-*` in no-photo-look.html). */
const TINTS: Record<ServiceIcon, string> = {
  wash: 'linear-gradient(140deg, #1b3150, #0e1726)',
  detailing: 'linear-gradient(140deg, #4a3518, #1f170c)',
  coating: 'linear-gradient(140deg, #123c30, #0a1c17)',
  scratch: 'linear-gradient(140deg, #4a3518, #1f170c)',
  bike: 'linear-gradient(140deg, #3a2a48, #181220)',
  package: 'linear-gradient(140deg, #4b1a20, #200c0f)',
  others: 'linear-gradient(140deg, #2c2c34, #151519)',
}

const LINES =
  'repeating-linear-gradient(115deg, rgba(255,255,255,.05) 0 1px, transparent 1px 7px)'

/**
 * A service without photos: its category icon on a matching tint, where the
 * picture would be (the card's thumbnail, the top of its sheet). Never a
 * drawing or an AI picture that could pass for the garage's work.
 * Decorative: the name is always beside it.
 */
export function ServiceIconTile({
  service,
  size = 'card',
  className,
}: {
  service: Pick<Service, 'category' | 'name'>
  size?: 'card' | 'sheet'
  className?: string
}) {
  const kind = serviceIconFor(service.category, service.name)
  const Glyph = ICONS[kind]
  return (
    <span
      aria-hidden="true"
      data-testid="service-icon-tile"
      data-icon={kind}
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden',
        size === 'sheet' && 'size-14 rounded-[15px]',
        className
      )}
      style={{ background: TINTS[kind] }}
    >
      <span className="absolute inset-0" style={{ background: LINES }} />
      <Glyph
        size={size === 'sheet' ? 24 : 26}
        stroke={1.6}
        className="relative text-white opacity-90"
      />
    </span>
  )
}
