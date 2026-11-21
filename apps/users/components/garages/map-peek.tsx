'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { IconArrowUpRight } from '@tabler/icons-react'
import { usePrefersReducedMotion } from '@repo/ui/finish/motion'
import { Odometer } from '@repo/ui/finish/odometer'
import type { BookingType, Vendor } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import {
  PEEK_PLANE_PX,
  inPeekFrame,
  peekScreenPoint,
  peekTilt,
  peekZoom,
  type PeekFrame,
} from '@/lib/map-3d'
import type { LatLng } from '@/lib/map-view'
import { whenIdle } from '@/lib/when-idle'
import { useT } from '@repo/core/i18n'
import { LUXURY_MAKE_PARAM, LUXURY_PARAM } from '@repo/core/luxury'

const PeekBasemap = dynamic(() => import('./peek-basemap').then((m) => m.PeekBasemap), {
  ssr: false,
})

/** The card's height, and where on it the customer stands (the plane's anchor). */
const CARD_HEIGHT = 156
const ANCHOR_Y = 72
/** The CSS perspective, and its eye a quarter of the way down the card. */
const PERSPECTIVE = 620
const EYE_Y = CARD_HEIGHT * 0.25
const HALF = PEEK_PLANE_PX / 2
/** The tilt the peek settles at, before any scroll. */
const OPEN_TILT = 52

/**
 * The card as the customer sees it once open, `width` wide: the clear area a
 * dot must land in keeps below the dark fade at the top (a dot higher up is
 * all but hidden by it) and above the two glass chips at the bottom.
 */
function peekFrame(width: number): PeekFrame {
  return {
    width,
    height: CARD_HEIGHT,
    anchorY: ANCHOR_Y,
    eyeY: EYE_Y,
    perspective: PERSPECTIVE,
    tilt: OPEN_TILT,
    inset: { top: 36, right: 16, bottom: 46, left: 16 },
  }
}

/**
 * The map peek under the search (customer UI round, Nov 2026, §3): a small
 * dark map of the customer's area tilted back in 3D, the current mode's
 * garages around them as red dots dropping in one after another (zoomed so
 * they all land on the card; across a city too wide for it, the nearest), the customer a white
 * dot, the nearest garage tagged with its km, and "N garages near you" and
 * "Map ↗" on glass. The whole card opens /map on the same mode and category
 * (and "Luxury specialists", when on).
 * It tilts a little further, and the map drifts, as the list scrolls.
 *
 * Real coordinates throughout: the dots are placed with the same Web
 * Mercator pixels MapLibre draws (lib/map-3d.ts), then projected through the
 * tilt, so they stand upright over their streets. The streets themselves
 * load last (PeekBasemap). Under reduced motion it opens already tilted with
 * every dot in place, and does not move on scroll.
 */
export function MapPeek({
  vendors,
  origin,
  centre,
  mode,
  category,
  luxury = false,
  luxuryMake,
  countLabel,
}: {
  /** The current mode's garages, every category (the dots). */
  vendors: readonly Vendor[]
  /** Where the customer is; none for "All of Chennai", which then has no white dot. */
  origin?: LatLng
  /** The map's middle: the customer, or the city centre. */
  centre: LatLng
  mode: BookingType
  category?: string
  /** "Luxury specialists" is on (0083): the map opens with it on too. */
  luxury?: boolean
  /** "Specialists for your <Make>"'s See all is on: that make only, on the map too. */
  luxuryMake?: string
  /**
   * "12 garages near you"; with no count (a small city, 0070), the words
   * alone: "Detlio in Madurai".
   */
  countLabel: { count: string | null; words: string }
}) {
  const t = useT()
  const reduce = usePrefersReducedMotion()
  const cardRef = useRef<HTMLAnchorElement>(null)
  const [width, setWidth] = useState(358)
  const [opening, setOpening] = useState(0)
  const [scrollY, setScrollY] = useState(0)
  const [streets, setStreets] = useState(false)

  const pinned = useMemo(
    () => vendors.filter((v): v is Vendor & { lat: number; lng: number } => v.lat != null && v.lng != null),
    [vendors]
  )
  // The zoom and the dots shown are fitted to the card as it settles (open,
  // unscrolled), so the garages around the customer are all on it; garages
  // that would land off the card (across the city) are left out.
  const frame = useMemo(() => peekFrame(width), [width])
  const zoom = useMemo(() => peekZoom(centre, pinned, frame), [centre, pinned, frame])
  const shown = useMemo(
    () => pinned.filter((v) => inPeekFrame(peekScreenPoint(v, centre, zoom, frame), frame, 8)),
    [pinned, centre, zoom, frame]
  )
  const nearestId = useMemo(() => {
    if (!origin) return null
    let best: { id: string; km: number } | null = null
    for (const v of pinned) {
      if (v.distanceKm != null && (!best || v.distanceKm < best.km)) best = { id: v.id, km: v.distanceKm }
    }
    return best?.id ?? null
  }, [origin, pinned])

  // The card's width, for where the plane's middle is.
  useEffect(() => {
    const card = cardRef.current
    if (!card || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  // The opening: the map tilts back over a second, a quarter second in.
  // Under reduced motion it is simply open.
  const opened = reduce ? 1 : opening
  useEffect(() => {
    if (reduce) return
    let raf = 0
    const start = performance.now() + 250
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / 1000))
      setOpening(1 - Math.pow(1 - k, 4))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [reduce])

  // Scroll: a little more tilt and a slow drift, only while the card is on screen.
  useEffect(() => {
    const card = cardRef.current
    if (reduce || !card) return
    let raf = 0
    let visible = true
    const onScroll = () => {
      if (!visible || raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setScrollY(window.scrollY)
      })
    }
    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
          })
        : null
    observer?.observe(card)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      observer?.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [reduce])

  // The streets, once the browser has nothing better to do.
  useEffect(() => whenIdle(() => setStreets(true)), [])

  const tilt = peekTilt(opened, scrollY)
  const drift = reduce ? 0 : Math.min(40, scrollY * 0.3)
  const now = { ...frame, tilt }
  const place = (point: LatLng) => peekScreenPoint(point, centre, zoom, now, drift)

  // Dots drop in north to south, the way the mockup reads.
  const order = [...shown].sort((a, b) => b.lat - a.lat)
  const me = origin ? place(origin) : null
  const dropped = reduce || opened > 0.5

  const query = new URLSearchParams({ bookingType: mode })
  if (category) query.set('category', category)
  if (luxury) query.set(LUXURY_PARAM, '1')
  if (luxuryMake) query.set(LUXURY_MAKE_PARAM, luxuryMake)

  return (
    <Link
      ref={cardRef}
      href={`/map?${query.toString()}`}
      aria-label={
        countLabel.count
          ? t('Open the map: {count} {words}', { count: countLabel.count, words: countLabel.words })
          : t('Open the map: {words}', { words: countLabel.words })
      }
      className="map-peek fx-press relative block h-[156px] overflow-hidden rounded-[22px]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 [perspective:620px] [perspective-origin:50%_25%]"
      >
        <span
          className="map-peek__plane absolute"
          style={{
            width: PEEK_PLANE_PX,
            height: PEEK_PLANE_PX,
            left: `calc(50% - ${HALF}px)`,
            top: ANCHOR_Y - HALF,
            transformOrigin: `${HALF}px ${HALF}px`,
            transform: `translateY(${drift}px) rotateX(${tilt}deg)`,
          }}
        >
          {streets && <PeekBasemap centre={centre} zoom={zoom} />}
        </span>
      </span>

      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        {order.map((vendor, i) => {
          const at = place(vendor)
          if (!at) return null
          const near = vendor.id === nearestId
          const settled = near ? peekScreenPoint(vendor, centre, zoom, frame) : null
          return (
            <span key={vendor.id} className="absolute size-0" style={{ left: at.x, top: at.y }}>
              <span
                className={cn('map-peek__pin', dropped && 'map-peek__pin--in')}
                style={{ animationDelay: `${(i + 3) * 70}ms` }}
              >
                <span className="map-peek__shadow" />
                <span className="map-peek__dot" />
                {near && vendor.distanceKm != null && (
                  <span
                    className={cn(
                      'fx-glass absolute whitespace-nowrap rounded-[10px] px-2 py-1.5 font-numeric text-[12px] font-semibold leading-none text-white',
                      // Over the dot; beside it, on the side away from the
                      // customer's dot, when over it would be under the top fade.
                      !settled || settled.y >= 52
                        ? '-top-[42px] left-0 -translate-x-1/2'
                        : settled.x < width / 2
                          ? '-top-[18px] right-[10px]'
                          : '-top-[18px] left-[10px]'
                    )}
                  >
                    {vendor.distanceKm.toFixed(1)} km
                  </span>
                )}
              </span>
            </span>
          )
        })}
        {me && (
          <span className="absolute size-0" style={{ left: me.x, top: me.y }}>
            <span className={cn('map-peek__me', dropped && 'map-peek__me--in')} />
          </span>
        )}
      </span>

      <span aria-hidden="true" className="map-peek__fade pointer-events-none absolute inset-0" />
      <span
        aria-hidden="true"
        className="fx-glass absolute bottom-2.5 left-2.5 inline-flex h-[30px] items-center gap-1.5 rounded-pill px-3 text-t4 font-medium text-[#E8E8EC]"
      >
        <span className="size-[7px] rounded-full bg-red-light shadow-[0_0_8px_rgb(228_0_43/0.9)]" />
        {countLabel.count && <Odometer value={countLabel.count} className="font-semibold text-white" />}
        {countLabel.words}
      </span>
      <span
        aria-hidden="true"
        className="fx-glass absolute bottom-2.5 right-2.5 inline-flex h-[30px] items-center gap-1 rounded-pill pl-3 pr-2.5 text-t4 font-semibold text-white"
      >
        {t('Map')}
        <IconArrowUpRight size={14} />
      </span>
    </Link>
  )
}
