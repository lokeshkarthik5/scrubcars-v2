'use client'

import { useState } from 'react'
import {
  IconCheck,
  IconCurrentLocation,
  IconMapPin,
  IconSearch,
} from '@tabler/icons-react'
import { LocationPromptSheet } from '@repo/ui/features/location-prompt-sheet'
import { ScSheet } from '@repo/ui/sc/modal'
import { track } from '@repo/core/analytics'
import { useZones } from '@repo/core/api/hooks/use-zones'
import { useLocationStore } from '@repo/core/stores/location-store'
import { searchZones, type Zone } from '@repo/core/zones'
import type { BookingType } from '@repo/core/types'
import { cn } from '@repo/core/utils'

/** The line said when "Near me" cannot work: the browser has location blocked. */
export const NEAR_ME_BLOCKED_LINE =
  'Location is off for this site. Pick your area instead — distances work the same.'

/**
 * Picks an area: its centre and name go into the location store at once, with
 * no permission asked (customer reach, 0062), and the list re-sorts by
 * distance from it. Records "picked an area" (area_pick) with the zone's
 * slug.
 */
export function useAreaPick(mode?: BookingType) {
  const setArea = useLocationStore((s) => s.setArea)
  return (zone: Pick<Zone, 'slug' | 'name' | 'lat' | 'lng'>) => {
    setArea(zone)
    track('area_pick', mode ? { area: zone.slug, mode } : { area: zone.slug })
  }
}

/**
 * "Near me": our explainer first (LocationPromptSheet), then the browser's
 * prompt, only when asked. With location already blocked there is no prompt
 * to show, so the caller says so (`blocked`) and offers the areas instead.
 */
export function useNearMe(mode?: BookingType) {
  const [explaining, setExplaining] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const ask = () => {
    track('area_pick', mode ? { area: 'near-me', mode } : { area: 'near-me' })
    if (useLocationStore.getState().permission === 'denied') {
      setBlocked(true)
      return
    }
    setBlocked(false)
    setExplaining(true)
  }
  /** Closes the explainer; true when the browser refused, so the areas come back with the line. */
  const closeExplainer = (): boolean => {
    setExplaining(false)
    const { permission, location } = useLocationStore.getState()
    const refused = permission === 'denied' && location?.source !== 'gps'
    if (refused) setBlocked(true)
    return refused
  }
  return { explaining, blocked, ask, closeExplainer, dismissBlocked: () => setBlocked(false) }
}

/** The friendly line under the chips, or at the top of the sheet. */
export function NearMeBlocked() {
  return (
    <p role="status" className="text-[13px] leading-snug text-text-secondary">
      {NEAR_ME_BLOCKED_LINE}
    </p>
  )
}

/**
 * The area sheet: "Near me", then every zone with a search box, then "All of
 * Chennai". Opened by "More" on the landing page's chips and by the location
 * button at the top of the garage list and Home's Nearby card, so the
 * customer always picks a place the same way.
 */
export function AreaPicker({
  open,
  onClose,
  mode,
}: {
  open: boolean
  onClose: () => void
  /** The tab the list is on, for the area_pick event. */
  mode?: BookingType
}) {
  const location = useLocationStore((s) => s.location)
  const selectChennai = useLocationStore((s) => s.selectChennai)
  const pickArea = useAreaPick(mode)
  const nearMe = useNearMe(mode)
  const [query, setQuery] = useState('')
  // Open again by itself after "Near me" was refused at the browser's
  // prompt, so the customer lands back on the areas with the line.
  const [reopened, setReopened] = useState(false)

  const close = () => {
    setQuery('')
    setReopened(false)
    nearMe.dismissBlocked()
    // Closed without a place: not offered again by itself for a week, as
    // "Not now" on the location explainer always did.
    if (!useLocationStore.getState().location) useLocationStore.getState().dismissPrompt()
    onClose()
  }

  const choose = (zone: Zone) => {
    pickArea(zone)
    close()
  }

  const askNearMe = () => {
    nearMe.ask()
    // The explainer opens in place of this sheet (two sheets never stack);
    // a blocked browser keeps this one open with the line at its top.
    if (useLocationStore.getState().permission !== 'denied') {
      setReopened(false)
      onClose()
    }
  }

  return (
    <>
      <ScSheet open={open || reopened} onClose={close} aria-label="Where's your car?" className="px-4">
        <div className="flex flex-col gap-4 pt-1">
          <div>
            <h2 className="text-[20px] font-normal tracking-[-0.015em] text-text-primary">
              Where&apos;s your car?
            </h2>
            <p className="mt-1 text-[13px] text-text-secondary">
              Pick your area to see distances and drive times. No location
              permission needed.
            </p>
          </div>

          {nearMe.blocked && <NearMeBlocked />}

          <button
            type="button"
            onClick={askNearMe}
            className="press flex min-h-12 items-center gap-3 rounded-[14px] border border-line bg-white/[0.03] px-4 text-left text-[15px] text-text-primary"
          >
            <IconCurrentLocation size={18} aria-hidden className="shrink-0" />
            <span className="min-w-0 flex-1">Near me</span>
            {location?.source === 'gps' && (
              <IconCheck size={16} aria-label="Chosen" className="shrink-0" />
            )}
          </button>

          <label className="flex items-center gap-2 rounded-[14px] border border-line bg-white/[0.03] px-3.5">
            <IconSearch size={16} aria-hidden className="shrink-0 text-text-secondary" />
            <input
              type="search"
              aria-label="Search areas"
              placeholder="Search areas"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent py-3 text-[16px] text-text-primary outline-none placeholder:text-text-muted"
            />
          </label>

          <AreaList query={query} chosen={location?.source === 'area' ? location.zone : undefined} onChoose={choose} />

          <button
            type="button"
            onClick={() => {
              selectChennai()
              close()
            }}
            className="min-h-11 self-center px-3 text-[15px] text-text-primary underline underline-offset-2"
          >
            All of Chennai
          </button>
        </div>
      </ScSheet>

      <LocationPromptSheet
        open={nearMe.explaining}
        onClose={() => {
          if (nearMe.closeExplainer()) setReopened(true)
        }}
      />
    </>
  )
}

/**
 * The zones, filtered by the search. Its own component so the zones are
 * only read (useZones) while the sheet is open: ScSheet renders nothing when
 * closed.
 */
function AreaList({
  query,
  chosen,
  onChoose,
}: {
  query: string
  chosen: string | undefined
  onChoose: (zone: Zone) => void
}) {
  const found = searchZones(useZones(), query)
  return (
    <ul aria-label="Areas" className="flex flex-col">
      {found.map((zone) => {
        const on = chosen === zone.slug
        return (
          <li key={zone.slug}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onChoose(zone)}
              className={cn(
                'flex min-h-12 w-full items-center gap-3 border-b border-line px-1 text-left text-[15px] text-text-primary',
                on && 'font-medium'
              )}
            >
              <IconMapPin size={16} aria-hidden className="shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1">{zone.name}</span>
              {on && <IconCheck size={16} aria-hidden className="shrink-0" />}
            </button>
          </li>
        )
      })}
      {found.length === 0 && (
        <li className="py-4 text-[13px] text-text-secondary">
          No area called &ldquo;{query.trim()}&rdquo; yet. Try a nearby one, or
          All of Chennai.
        </li>
      )}
    </ul>
  )
}
