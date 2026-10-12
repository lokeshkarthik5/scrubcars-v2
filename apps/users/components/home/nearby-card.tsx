'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconChevronRight, IconMapPin } from '@tabler/icons-react'
import { LocationPromptSheet } from '@repo/ui/features/location-prompt-sheet'
import type { HomeData } from '@repo/core/api/home'

/** The faint line map behind the words, as drawn in the approved mockup. */
function LineMap() {
  return (
    <>
      <svg
        aria-hidden
        className="nearby-map absolute inset-0 h-full w-full"
        viewBox="0 0 358 108"
        preserveAspectRatio="none"
        fill="none"
      >
        <g stroke="rgba(255,255,255,.10)" strokeWidth="1">
          <path d="M120 0 L170 108" />
          <path d="M200 0 C 215 30, 205 64, 230 108" />
          <path d="M262 0 L250 108" />
          <path d="M300 0 C 290 42, 320 64, 312 108" />
          <path d="M340 0 L358 74" />
          <path d="M150 0 L140 108" />
          <path d="M100 22 C 180 30, 260 14, 358 26" />
          <path d="M110 64 C 200 72, 270 56, 358 68" />
          <path d="M130 94 L358 100" />
          <path d="M226 26 L284 62" />
          <path d="M180 70 L214 26" />
        </g>
        <path d="M90 47 C 170 53, 250 37, 358 47" stroke="rgba(255,255,255,.16)" strokeWidth="1.5" />
        <path d="M236 0 C 244 40, 236 76, 246 108" stroke="rgba(255,255,255,.13)" strokeWidth="1.5" />
      </svg>
      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 358 108" fill="none">
        <circle cx="232" cy="56" r="34" stroke="rgba(255,255,255,.14)" strokeDasharray="2 4" />
        <circle cx="252" cy="30" r="4.5" fill="#F5F5F6" />
        <circle cx="206" cy="80" r="4" fill="#F5F5F6" opacity=".75" />
        <circle cx="282" cy="78" r="4" fill="#F5F5F6" opacity=".6" />
        <circle cx="232" cy="56" r="10" fill="rgba(161,161,170,.14)" stroke="rgba(161,161,170,.55)" />
        <circle cx="232" cy="56" r="4" fill="#A1A1AA" />
      </svg>
    </>
  )
}

const shell =
  'hub-card relative flex h-[108px] w-full items-center justify-between overflow-hidden pr-3.5 pl-5 text-left'

/**
 * How many garages there are to drive to, from the customer's rounded
 * location, opening the map. With no location, it asks for one in our own
 * words first (the browser's prompt gives no reason and no second chance).
 *
 * `located` says whether Home sent a location. The server answers null both
 * when none was sent and when its nearby count failed; only the first is a
 * reason to ask for location, so the second hides the card instead of
 * telling a customer who already shared it to turn it on.
 */
export function NearbyCard({ nearby, located }: { nearby: HomeData['nearby']; located: boolean }) {
  const [asking, setAsking] = useState(false)

  if (!nearby) {
    if (located) return null
    return (
      <>
        <button type="button" onClick={() => setAsking(true)} className={shell}>
          <LineMap />
          <span className="relative">
            <span className="block text-[13px] text-dim">Nearby garages</span>
            <span className="mt-[5px] mb-1 block text-[17px] tracking-[-0.012em] text-text-primary">
              Turn on location to see the nearest
            </span>
          </span>
          <span aria-hidden className="relative grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.08] backdrop-blur-sm">
            <IconMapPin size={20} stroke={1.5} />
          </span>
        </button>
        <LocationPromptSheet open={asking} onClose={() => setAsking(false)} />
      </>
    )
  }

  return (
    <Link href="/map" className={shell}>
      <LineMap />
      <span className="relative">
        <span className="block text-[13px] text-dim">Nearby garages</span>
        <span className="mt-[5px] mb-1 block text-[22px] tracking-[-0.022em] text-text-primary">
          {nearby.count === 0 ? (
            'None near you yet'
          ) : (
            <>
              <span className="font-numeric">{nearby.count}</span>{' '}
              {nearby.count === 1 ? 'garage' : 'garages'}
            </>
          )}
        </span>
        {/* Straight-line distance, which is what the server measures; never
            worded as a drive time it does not know. */}
        <span className="block text-[13px] text-dim">
          Within <span className="font-numeric">{nearby.radiusKm}</span> km
          {nearby.closestKm !== null && nearby.count > 0 && (
            <>
              {' '}
              · closest <span className="font-numeric">{nearby.closestKm}</span> km
            </>
          )}
        </span>
      </span>
      <span aria-hidden className="relative grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.08] backdrop-blur-sm">
        <IconChevronRight size={20} stroke={1.5} />
      </span>
    </Link>
  )
}
