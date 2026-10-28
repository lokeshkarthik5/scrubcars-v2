'use client'

import { useState } from 'react'
import { IconChevronDown, IconCurrentLocation } from '@tabler/icons-react'
import { LocationPromptSheet } from '@repo/ui/features/location-prompt-sheet'
import { useZones } from '@repo/core/api/hooks/use-zones'
import { useHydratedLocation } from '@repo/core/stores/location-store'
import type { BookingType } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { AreaPicker, NearMeBlocked, useAreaPick, useNearMe } from './area-picker'

const CHIP =
  'press flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] transition-colors'

/**
 * "Where's your car?" (customer reach, 0062): the landing page's area
 * chips. "Near me" (our explainer, then GPS), the owner's priority areas
 * (one tap: no permission), and "More", the sheet with every area and a
 * search. The chosen one is white, as chosen things are.
 *
 * Server-rendered with nothing chosen; the stored choice shows once the page
 * has hydrated (useHydratedLocation), so the HTML and the first client
 * render agree.
 */
export function AreaChips({ mode }: { mode: BookingType }) {
  const zones = useZones()
  const location = useHydratedLocation()
  const pickArea = useAreaPick(mode)
  const nearMe = useNearMe(mode)
  const [moreOpen, setMoreOpen] = useState(false)

  const priority = zones.filter((zone) => zone.priority)
  const chosenSlug = location?.source === 'area' ? location.zone : undefined
  // An area picked from More, outside the chips: named on the More chip.
  const chosenElsewhere =
    chosenSlug && !priority.some((zone) => zone.slug === chosenSlug)
      ? (zones.find((zone) => zone.slug === chosenSlug)?.name ?? location?.label)
      : null
  const nearMeOn = location?.source === 'gps'

  return (
    <section
      aria-labelledby="where-is-your-car"
      className="hub-card flex flex-col gap-3 p-4"
    >
      <h2
        id="where-is-your-car"
        className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary"
      >
        Where&apos;s your car?
      </h2>
      {nearMe.blocked && <NearMeBlocked />}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={nearMeOn}
          onClick={nearMe.ask}
          className={cn(
            CHIP,
            nearMeOn
              ? 'border-transparent bg-brand-white text-brand-black'
              : 'border-line bg-white/[0.03] text-text-primary'
          )}
        >
          <IconCurrentLocation size={15} aria-hidden className="shrink-0" />
          Near me
        </button>
        {priority.map((zone) => {
          const on = chosenSlug === zone.slug
          return (
            <button
              key={zone.slug}
              type="button"
              aria-pressed={on}
              onClick={() => {
                nearMe.dismissBlocked()
                pickArea(zone)
              }}
              className={cn(
                CHIP,
                on
                  ? 'border-transparent bg-brand-white text-brand-black'
                  : 'border-line bg-white/[0.03] text-text-primary'
              )}
            >
              {zone.name}
            </button>
          )
        })}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-pressed={chosenElsewhere ? true : undefined}
          onClick={() => setMoreOpen(true)}
          className={cn(
            CHIP,
            chosenElsewhere
              ? 'border-transparent bg-brand-white text-brand-black'
              : 'border-line bg-white/[0.03] text-text-primary'
          )}
        >
          {chosenElsewhere ?? 'More'}
          <IconChevronDown size={14} aria-hidden className="shrink-0" />
        </button>
      </div>

      <AreaPicker open={moreOpen} onClose={() => setMoreOpen(false)} mode={mode} />
      <LocationPromptSheet open={nearMe.explaining} onClose={nearMe.closeExplainer} />
    </section>
  )
}
