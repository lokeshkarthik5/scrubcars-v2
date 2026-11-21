'use client'

import {
  IconDots,
  IconDroplet,
  IconEngine,
  IconLayoutGrid,
  IconPackage,
  IconShieldCheck,
  IconSparkles,
  IconSpray,
  IconTool,
  IconWand,
} from '@tabler/icons-react'
import { CATEGORY_LABELS, PLAIN_CATEGORY_ORDER } from '@repo/core/categories'
import type { ServiceCategory } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { ScSheet } from '@repo/ui/sc/modal'
import { useT } from '@repo/core/i18n'
import { t } from '@repo/core/i18n/translate'

export type ServiceFilter = ServiceCategory | 'all'

/**
 * The filter's services: All and Packages, then every plain category in the
 * order used everywhere (General service, Repairs and Dent & paint before
 * Others, 0080).
 */
export const SERVICE_FILTERS: ServiceFilter[] = ['all', 'package', ...PLAIN_CATEGORY_ORDER]

const ICONS: Record<ServiceFilter, typeof IconDroplet> = {
  all: IconLayoutGrid,
  package: IconPackage,
  car_wash: IconDroplet,
  detailing: IconSparkles,
  coating: IconShieldCheck,
  scratch_removal: IconWand,
  general_service: IconEngine,
  repairs: IconTool,
  dent_paint: IconSpray,
  others: IconDots,
}

/** "All services", "Packages", "Car wash" … as the filter button and its sheet say them. */
export function serviceFilterLabel(filter: ServiceFilter): string {
  if (filter === 'all') return t('All services')
  if (filter === 'package') return t('Packages')
  return t(CATEGORY_LABELS[filter])
}

export function ServiceFilterIcon({ filter, size = 18 }: { filter: ServiceFilter; size?: number }) {
  const Icon = ICONS[filter]
  return <Icon size={size} aria-hidden />
}

/**
 * The glass filter sheet (§3): every service as a tile, two to a row, each
 * with how many of the garages here offer it, rising in one after another.
 * A tap applies it and closes the sheet. The counts are of the garages loaded
 * for this mode (a "+" while more remain); a count the list cannot vouch for
 * is left off rather than shown as 0.
 */
export function FilterSheet({
  open,
  value,
  counts,
  onChange,
  onClose,
}: {
  open: boolean
  value: ServiceFilter
  /** Garages per service; null for a service the list cannot count. */
  counts: Record<ServiceFilter, string | null>
  onChange: (value: ServiceFilter) => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <ScSheet
      open={open}
      onClose={onClose}
      aria-label={t('Choose a service')}
      className="fx-glass mx-2.5 mb-2.5 w-[calc(100%-20px)] rounded-[26px] border border-white/14 bg-[rgb(16_16_20/0.82)] px-2.5 pb-3"
    >
      <h2 className="mx-2.5 mb-2 text-t3 font-semibold text-text-primary">{t('Service')}</h2>
      <div className="grid grid-cols-2 gap-2 px-0.5 pb-1">
        {SERVICE_FILTERS.map((filter, i) => {
          const selected = filter === value
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                onChange(filter)
                // A moment to see the tile turn pearl before the sheet goes.
                window.setTimeout(onClose, 160)
              }}
              style={{ '--fx-i': i, '--fx-delay': '80ms' } as React.CSSProperties}
              className={cn(
                'fx-rise fx-press flex h-14 items-center gap-2.5 rounded-[16px] px-3 text-left text-t3',
                selected ? 'fx-pearl font-semibold' : 'fx-raised font-medium text-[#E8E8EC]'
              )}
            >
              <span className={cn('shrink-0', selected ? 'text-brand-black' : 'text-[#B8B8C0]')}>
                <ServiceFilterIcon filter={filter} />
              </span>
              {/* Two lines rather than cut short: "Scratch removal" and
                  "General service" do not fit beside a count. */}
              <span className="line-clamp-2 min-w-0 break-words leading-[1.15]">
                {serviceFilterLabel(filter)}
              </span>
              {counts[filter] && (
                <span
                  className={cn(
                    'ml-auto font-numeric text-t4 font-semibold',
                    selected ? 'text-[#55555E]' : 'text-[#9A9AA3]'
                  )}
                >
                  {counts[filter]}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </ScSheet>
  )
}
