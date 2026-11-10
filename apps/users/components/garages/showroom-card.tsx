'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { IconArrowUpRight, IconHome, IconStarFilled } from '@tabler/icons-react'
import { prefetchGarage } from '@repo/core/api/hooks/use-vendors'
import { bookingTypeParam } from '@repo/core/booking-types'
import { anywhereInCityLine } from '@repo/core/reach'
import { distanceLabel, driveTimeLabel } from '@repo/core/drive-time'
import { hoursLeftShare, openStatus } from '@repo/core/opening-hours'
import { NEW_GARAGE_LABEL, hasStarScore } from '@repo/core/ratings'
import { isApproximate, useHydratedLocation } from '@repo/core/stores/location-store'
import type { BookingType, Vendor } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { GarageCover, GarageMonogram } from '@repo/ui/features/garage-cover'
import { OutsideCityChip } from '@repo/ui/features/outside-city'
import { TierMark } from '@repo/ui/features/tier-medal'
import { HoursRing } from '@repo/ui/finish/hours-ring'
import { usePrefersReducedMotion, useSeenOnce } from '@repo/ui/finish/motion'
import { useCountUp } from '@repo/ui/finish/odometer'
import { morphNavigate, rememberOpenedFromList } from '@/lib/view-transition'
import { useDrift } from './drift'
import { NextFreeRow } from './next-free-row'

/** How long a press must be held for the quick look. */
const HOLD_MS = 450

/**
 * The garages whose card has played its arrival (the figures counting up,
 * the car driving the road, the hours ring) this session. Kept outside the
 * component because the card is made again whenever the list is (Back from
 * a garage, a new page of results): a card already seen comes back calm,
 * settled, rather than playing it all again. A reload starts afresh.
 */
const played = new Set<string>()

function everyMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000)
  return () => window.clearInterval(timer)
}

/**
 * The minute it is now, on the client only (null in the server's HTML and
 * the first render that hydrates it), so the landing page's server-rendered
 * cards and the browser never disagree about "Open", and a card left on
 * screen turns "Closed" at closing time.
 */
function useClientMinute(): number | null {
  return useSyncExternalStore(
    everyMinute,
    () => Math.floor(Date.now() / 60_000),
    () => null
  )
}

/**
 * The Showroom garage card (customer UI round, Nov 2026, §3), the list's
 * default card: swipeable photos with the name, tier medal and a NEW tag on a
 * shade; "{area} · Known for …"; open or closed on glass with the
 * opening-hours ring; the heart; one row of how good, how far, how much
 * (rating | km and drive | starting price) that counts up once as the card
 * comes into view, a pearl ↗; the road on the hairline between photo and
 * facts, along which a small car drives to the garage; the chips; and the
 * Next free row.
 *
 * It leans a little toward a mouse, the photos drift with the scroll, and a
 * press held for 450ms opens the quick look (`onQuickLook`) instead of the
 * garage. Under reduced motion none of it moves. The figures that move are
 * hidden from screen readers, which read one plain line instead (and so do
 * the specs: `[data-distance]` holds "6.2 km · ~20 min").
 *
 * The link is the photo, the name and the facts. The heart, the photo dots
 * and the times are controls of their own beside it, never inside it.
 */
export function ShowroomCard({
  vendor,
  mode,
  action,
  chips,
  approxDistance,
  onQuickLook,
}: {
  vendor: Vendor
  mode: BookingType
  /** The heart, over the photo's top-right corner. */
  action?: ReactNode
  /** Chips after the facts ("Can collect your car"). */
  chips?: ReactNode
  approxDistance?: boolean
  onQuickLook?: (vendor: Vendor) => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const reduce = usePrefersReducedMotion()
  const cardRef = useRef<HTMLElement>(null)
  const seen = useSeenOnce(cardRef)
  // Decided once, as the card is made: whether it has played before.
  const [firstTime] = useState(() => !played.has(vendor.id))
  useEffect(() => {
    if (seen) played.add(vendor.id)
  }, [seen, vendor.id])
  // The arrival plays on the first sighting only.
  const play = seen && firstTime
  useDrift(cardRef, !reduce)
  const location = useHydratedLocation()
  const [photo, setPhoto] = useState(0)
  const [holding, setHolding] = useState(false)
  const [leaning, setLeaning] = useState(false)
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null)
  const heldOpen = useRef(false)
  const swipe = useRef<{ x: number; y: number; dx: number; sideways: boolean } | null>(null)
  const swiped = useRef(false)
  const [dragX, setDragX] = useState(0)

  const modeParam = bookingTypeParam(mode)
  const anywhere = anywhereInCityLine(vendor, mode)
  const href = modeParam ? `/garage/${vendor.id}?mode=${modeParam}` : `/garage/${vendor.id}`
  const photos = vendor.photos
  const stars = hasStarScore(vendor)
  const km = vendor.distanceKm
  const approx = approxDistance ?? isApproximate(location)
  const minute = useClientMinute()
  const now = minute === null ? null : new Date(minute * 60_000)
  const status = now ? openStatus(vendor.openingHours, now, vendor.closures) : null
  const hoursLeft = now ? hoursLeftShare(vendor.openingHours, now, vendor.closures) : null
  const knownFor = vendor.knownFor?.label
  const what = knownFor
    ? `Known for ${knownFor.toLowerCase()}`
    : vendor.serviceTags.slice(0, 2).join(', ')
  const subline = [vendor.area, what].filter(Boolean).join(' · ')

  const rating = useCountUp(vendor.rating, 1, play)
  const distanceValue = km === null ? null : km < 1 ? Math.round(km * 1000) : km
  const distance = useCountUp(distanceValue ?? 0, km !== null && km < 1 ? 0 : 1, play)
  const price = useCountUp(vendor.startingPrice, 0, play)

  // The garage page starts loading the moment a finger lands on the card.
  const warm = () => {
    void prefetchGarage(queryClient, vendor.id)
    router.prefetch(href)
  }

  const cancelHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer)
    hold.current = null
    setHolding(false)
  }
  useEffect(() => cancelHold, [])

  const onPointerDown = (event: React.PointerEvent) => {
    // A swipe ended on the last press; this one is new.
    swiped.current = false
    // The heart, the photo dots and the times are controls of their own.
    if ((event.target as Element).closest('button, [data-slot]')) return
    warm()
    if (!onQuickLook || event.button !== 0) return
    heldOpen.current = false
    const timer = window.setTimeout(() => {
      hold.current = null
      setHolding(false)
      heldOpen.current = true
      onQuickLook(vendor)
    }, HOLD_MS)
    hold.current = { timer, x: event.clientX, y: event.clientY }
    setHolding(true)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    // A finger that moves is scrolling or swiping the photos, not holding.
    if (hold.current && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 8) cancelHold()
    if (reduce || event.pointerType !== 'mouse') return
    const card = cardRef.current
    const r = card?.getBoundingClientRect()
    if (!card || !r || !r.width || !r.height) return
    const x = (event.clientX - r.left) / r.width
    const y = (event.clientY - r.top) / r.height
    card.style.setProperty('--ry', `${((x - 0.5) * 5).toFixed(2)}deg`)
    card.style.setProperty('--rx', `${((0.5 - y) * 4).toFixed(2)}deg`)
    if (!leaning) setLeaning(true)
  }
  const onPointerLeave = () => {
    cancelHold()
    const card = cardRef.current
    card?.style.setProperty('--rx', '0deg')
    card?.style.setProperty('--ry', '0deg')
    setLeaning(false)
  }

  // The photos swipe by hand rather than as a scrolling strip: a scroller
  // inside the card's link would be a region nobody can reach by keyboard,
  // and the dots below are the keyboard's way through them. A sideways drag
  // of 40px turns the page; the tap that ends a swipe never opens the garage.
  const onPhotoPointerDown = (event: React.PointerEvent) => {
    if (photos.length < 2) return
    swipe.current = { x: event.clientX, y: event.clientY, dx: 0, sideways: false }
  }
  const onPhotoPointerMove = (event: React.PointerEvent) => {
    const s = swipe.current
    if (!s) return
    const dx = event.clientX - s.x
    const dy = event.clientY - s.y
    if (!s.sideways && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) s.sideways = true
    if (!s.sideways) return
    s.dx = dx
    setDragX(dx)
  }
  const onPhotoPointerUp = () => {
    const s = swipe.current
    swipe.current = null
    setDragX(0)
    if (!s?.sideways) return
    swiped.current = true
    if (s.dx < -40) setPhoto((i) => Math.min(photos.length - 1, i + 1))
    else if (s.dx > 40) setPhoto((i) => Math.max(0, i - 1))
  }

  // One plain line for screen readers (and the specs), in place of the
  // figures that count: "4.6 stars, 12 reviews. 6.2 km · ~20 min. From ₹499."
  const spoken = (
    <p className="sr-only">
      {stars ? `${vendor.rating.toFixed(1)} stars, ${vendor.reviewCount} reviews. ` : `${NEW_GARAGE_LABEL}. `}
      {km !== null && (
        <>
          <span data-distance="">{`${distanceLabel(km, approx)} · ${driveTimeLabel(km)}`}</span>.{' '}
        </>
      )}
      {vendor.startingPrice > 0 && `From ₹${vendor.startingPrice}.`}
    </p>
  )

  return (
    <article
      ref={cardRef}
      data-seen={play && !reduce ? '' : undefined}
      data-lean={leaning ? '' : undefined}
      data-holding={holding ? '' : undefined}
      // Found by the garage page's Back, which folds into this card.
      data-vt-card={vendor.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={onPointerLeave}
      onMouseEnter={warm}
      onContextMenu={(event) => {
        // A long press on a phone would open the browser's link menu over
        // the quick look.
        if (onQuickLook) event.preventDefault()
      }}
      className="showroom fx-edge relative overflow-hidden rounded-[22px]"
    >
      <Link
        href={href}
        onClick={(event) => {
          // The press was held (the quick look opened) or was a swipe of the
          // photos: either way the garage does not open.
          if (heldOpen.current || swiped.current) {
            event.preventDefault()
            heldOpen.current = false
            swiped.current = false
            return
          }
          // A new tab or window is the browser's own business.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
          // The card grows into the garage page (§5), which folds back into
          // it on Back; where the browser cannot, the plain switch.
          event.preventDefault()
          rememberOpenedFromList(vendor.id)
          morphNavigate({
            name: 'vt-garage',
            direction: 'open',
            from: cardRef.current,
            to: () => document.querySelector<HTMLElement>('[data-vt-garage]'),
            navigate: () => router.push(href),
          })
        }}
        className="block select-none"
        draggable={false}
      >
        <div className="relative h-[196px] overflow-hidden bg-surface-elevated">
          {photos.length > 0 ? (
            <div
              onPointerDown={onPhotoPointerDown}
              onPointerMove={onPhotoPointerMove}
              onPointerUp={onPhotoPointerUp}
              onPointerCancel={onPhotoPointerUp}
              className="absolute inset-0 flex touch-pan-y transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
              style={{
                transform: `translateX(calc(${-photo * 100}% + ${dragX}px))`,
                transitionDuration: dragX ? '0ms' : undefined,
              }}
            >
              {photos.map((src, i) => (
                <div key={src} className="relative h-full w-full shrink-0 overflow-hidden">
                  <Image
                    src={src}
                    alt={i === 0 ? vendor.name : ''}
                    fill
                    sizes="(max-width: 428px) 100vw, 428px"
                    className="showroom__photo object-cover"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          ) : (
            // No photo on file: the garage's own designed cover, never stock
            // imagery that could pass for the garage.
            <GarageCover vendor={vendor} showMeta={false} />
          )}
          <span aria-hidden="true" className="showroom__shade pointer-events-none absolute inset-0" />

          {status && (
            <span className="fx-glass pointer-events-none absolute left-3 top-3 inline-flex h-[30px] max-w-[calc(100%-4.5rem)] items-center gap-1.5 rounded-pill px-2.5 text-t4 font-medium text-white">
              <HoursRing share={status.isOpen ? hoursLeft : null} play={play && !reduce} />
              <span className="truncate">
                {status.isOpen ? 'Open' : status.closedToday ? 'Closed today' : 'Closed'}
                {status.detail && <span className="text-white/75"> · {status.detail}</span>}
              </span>
            </span>
          )}

          <div className="pointer-events-none absolute inset-x-3.5 bottom-3 flex items-center gap-3">
            {vendor.logoUrl ? (
              <span className="relative size-[42px] shrink-0 overflow-hidden rounded-[12px] border-[1.5px] border-white/75 bg-surface shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_6px_14px_rgb(0_0_0/0.5)]">
                <Image src={vendor.logoUrl} alt="" fill sizes="42px" className="object-cover" />
              </span>
            ) : (
              <GarageMonogram
                vendor={vendor}
                className="size-[42px] shrink-0 rounded-[12px] text-[14px] shadow-[0_6px_14px_rgb(0_0_0/0.5)]"
              />
            )}
            <div className="min-w-0">
              {/* One sign after the name, the tier medal, then NEW for a
                  garage without a score yet; the name gives way first. The
                  signs sit beside the heading, not in it, so the heading's
                  name stays the garage's name; the medal keeps its own
                  label and the spoken line says "New". */}
              <div className="flex min-w-0 items-center gap-1.5">
                <h3 className="min-w-0 truncate text-t2 font-semibold text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">
                  {vendor.name}
                </h3>
                {vendor.tier && <TierMark tier={vendor.tier} />}
                {!stars && (
                  <span className="fx-pearl shrink-0 rounded-[6px] px-1.5 py-1 text-[9.5px] font-semibold uppercase leading-none tracking-[0.08em]">
                    New
                  </span>
                )}
              </div>
              {subline && <p className="truncate text-t4 font-medium text-white/72">{subline}</p>}
            </div>
          </div>
        </div>

        <div className="relative flex items-stretch px-3.5 py-3">
          {km !== null && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-3.5 -top-px z-[2] h-0">
              <span className="showroom__road-line absolute left-1 right-1.5 top-0 h-px" />
              <span className="absolute left-0 top-[-3px] size-[7px] rounded-full bg-white shadow-[0_0_0_2px_rgb(255_255_255/0.18)]" />
              <span className="showroom__road-pin absolute right-0 top-[-4px] size-[9px] rounded-full" />
              <svg viewBox="0 0 24 24" className="showroom__car absolute top-[-15px] size-[17px] text-white drop-shadow-[0_2px_4px_rgb(0_0_0/0.8)]">
                <path
                  fill="currentColor"
                  d="M2.5 15.6v-2.3c0-.9.6-1.6 1.4-1.8l2.6-.6l2.6-3.1c.4-.5 1-.8 1.7-.8h4.6c.7 0 1.3.3 1.7.8l2.7 3.1l1.9.4c.8.2 1.4.9 1.4 1.8v2.5c0 .5-.4.9-.9.9h-1.1a2.4 2.4 0 0 0-4.6 0H8.6a2.4 2.4 0 0 0-4.6 0h-.6c-.5 0-.9-.4-.9-1z"
                />
                <circle fill="currentColor" cx="6.3" cy="16.6" r="1.7" />
                <circle fill="currentColor" cx="17.7" cy="16.6" r="1.7" />
              </svg>
            </span>
          )}

          {spoken}

          <div aria-hidden="true" className="flex min-w-0 flex-1 items-stretch">
            {stars && (
              <Fact>
                <b className="flex items-center gap-1">
                  <IconStarFilled size={13} className="text-warning" />
                  {rating}
                </b>
                <span>
                  {vendor.reviewCount} {vendor.reviewCount === 1 ? 'review' : 'reviews'}
                </span>
              </Fact>
            )}
            {km !== null && (
              <Fact>
                <b>
                  {approx && '~'}
                  {distance} {km < 1 ? 'm' : 'km'}
                </b>
                <span>{driveTimeLabel(km)} drive</span>
              </Fact>
            )}
            {vendor.startingPrice > 0 && (
              <Fact>
                <b>₹{price}</b>
                <span>starting price</span>
              </Fact>
            )}
          </div>
          <span aria-hidden="true" className="fx-pearl ml-1.5 grid size-[42px] shrink-0 self-center place-items-center rounded-full">
            <IconArrowUpRight size={18} />
          </span>
        </div>

        {(chips || anywhere || vendor.outsideServiceCity || (mode === 'dropin' && vendor.doorstepEnabled)) && (
          <div className="-mt-0.5 flex flex-wrap gap-1.5 px-3.5 pb-3">
            {mode === 'dropin' && vendor.doorstepEnabled && (
              <span className="fx-raised inline-flex h-[26px] items-center gap-1.5 rounded-pill px-2.5 text-t4 font-medium text-[#D4D4DA]">
                <IconHome size={13} aria-hidden className="text-[#A8A8B2]" />
                Comes to you too
              </span>
            )}
            {/* "Comes anywhere in Chennai" (0069): on Doorstep or Pickup &
                drop, a garage that covers its whole city says so. */}
            {anywhere && (
              <span className="fx-raised inline-flex h-[26px] items-center gap-1.5 rounded-pill px-2.5 text-t4 font-medium text-[#D4D4DA]">
                <IconHome size={13} aria-hidden className="text-[#A8A8B2]" />
                {anywhere}
              </span>
            )}
            {chips}
            {/* A garage in another town says so on its card, so nobody opens
                it, or books it, thinking it is in Chennai. */}
            {vendor.outsideServiceCity && <OutsideCityChip outside={vendor.outsideServiceCity} />}
          </div>
        )}
      </Link>

      {photos.length > 1 && (
        // The dots sit over the middle of the card, right where a thumb
        // lands to open the garage. On a touch screen a tap there opens the
        // card (the photos change by swipe); a mouse can still click a dot,
        // and the keyboard still reaches every one.
        <div className="pointer-events-none absolute left-1/2 top-[130px] z-[2] flex -translate-x-1/2 gap-0.5 [@media(hover:hover)]:pointer-events-auto">
          {photos.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Photo ${i + 1} of ${photos.length}`}
              aria-current={i === photo ? 'true' : undefined}
              onClick={() => setPhoto(i)}
              className="grid h-6 place-items-center px-0.5"
            >
              <span
                className={cn(
                  'block h-1.5 rounded-[3px] transition-[width,background-color] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none',
                  i === photo ? 'w-4 bg-white' : 'w-1.5 bg-white/45'
                )}
              />
            </button>
          ))}
        </div>
      )}

      {action && <div className="absolute right-3 top-3 z-[3]">{action}</div>}

      <NextFreeRow vendor={vendor} mode={mode} visible={seen} />
    </article>
  )
}

/** One of the facts: a figure over its caption, the next divided by a fading line. */
function Fact({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-1 flex-col justify-center gap-[3px] px-2.5 first:pl-0',
        '[&+&]:before:absolute [&+&]:before:inset-y-[3px] [&+&]:before:left-0 [&+&]:before:w-px [&+&]:before:bg-gradient-to-b [&+&]:before:from-transparent [&+&]:before:via-white/14 [&+&]:before:to-transparent',
        '[&>b]:whitespace-nowrap [&>b]:font-numeric [&>b]:text-[16px] [&>b]:font-semibold [&>b]:text-white',
        '[&>span]:truncate [&>span]:text-t5 [&>span]:font-medium [&>span]:text-[#8E8E98]'
      )}
    >
      {children}
    </div>
  )
}
