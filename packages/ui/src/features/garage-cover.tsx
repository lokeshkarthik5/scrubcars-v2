import {
  coverMetaParts,
  coverToneFor,
  garageInitials,
  type CoverTone,
} from '@repo/core/garage-cover'
import type { Vendor } from '@repo/core/types'
import { cn } from '@repo/core/utils'

/**
 * The "no-photo look": a garage without photos gets a designed cover rather
 * than a grey box with a shop icon — its initials drawn large in outline,
 * where it is and how it can be booked in small caps, a soft diagonal line
 * texture, on one of five brand colours picked from its id (so it is the
 * same on every screen). A garage without a logo gets a monogram tile in
 * the matching colour. Real photos and logos always win; the callers
 * decide that. Both are decorative (aria-hidden): the garage's name is
 * always in the card's or page's heading.
 */

/** The cover's glow, from the approved mockup (no-photo-look.html). */
const COVER_GLOW: Record<CoverTone, string> = {
  red: 'radial-gradient(90% 120% at 85% 110%, rgba(225,29,46,.42), transparent 60%), linear-gradient(150deg, #1d1012, #0e0a0b)',
  blue: 'radial-gradient(90% 120% at 85% 110%, rgba(59,130,246,.38), transparent 60%), linear-gradient(150deg, #0f1520, #0a0c10)',
  green:
    'radial-gradient(90% 120% at 85% 110%, rgba(16,185,129,.32), transparent 60%), linear-gradient(150deg, #0e1714, #0a0d0c)',
  bronze:
    'radial-gradient(90% 120% at 85% 110%, rgba(217,151,62,.36), transparent 60%), linear-gradient(150deg, #19140d, #0d0b09)',
  plum: 'radial-gradient(90% 120% at 85% 110%, rgba(168,85,247,.32), transparent 60%), linear-gradient(150deg, #16101a, #0c0a0e)',
}

/** The monogram tile's fill, in the cover's colour. */
const MONOGRAM_FILL: Record<CoverTone, string> = {
  red: 'linear-gradient(140deg, #5a1a20, #2a0e11)',
  blue: 'linear-gradient(140deg, #1d3456, #0f1a2c)',
  green: 'linear-gradient(140deg, #174434, #0c2119)',
  bronze: 'linear-gradient(140deg, #5a4120, #2a1f10)',
  plum: 'linear-gradient(140deg, #3a2a48, #181220)',
}

const LINES =
  'repeating-linear-gradient(115deg, rgba(255,255,255,.035) 0 1px, transparent 1px 9px)'

/** How large the outlined initials are, by where the cover is drawn. */
const MONO_SIZE = {
  /** The map strip's 112px card. */
  compact: 'text-[96px]',
  /** A garage card's 150px cover. */
  card: 'text-[124px]',
  /** The garage page's 210px hero. */
  hero: 'text-[176px]',
} as const

export type GarageCoverVendor = Pick<
  Vendor,
  | 'id'
  | 'name'
  | 'area'
  | 'lat'
  | 'lng'
  | 'outsideServiceCity'
  | 'dropinEnabled'
  | 'doorstepEnabled'
> &
  Partial<Pick<Vendor, 'pickupEnabled'>>

/**
 * The designed cover, filling its (positioned) parent. `metaClassName`
 * places the small-caps line when something else sits at the top-left (the
 * garage page's back button); `showMeta={false}` leaves it out where the
 * corner is taken (the map's open-status chip).
 */
export function GarageCover({
  vendor,
  size = 'card',
  showMeta = true,
  metaClassName,
  className,
}: {
  vendor: GarageCoverVendor
  size?: keyof typeof MONO_SIZE
  showMeta?: boolean
  metaClassName?: string
  className?: string
}) {
  const tone = coverToneFor(vendor.id)
  const initials = garageInitials(vendor.name)
  const meta = showMeta ? coverMetaParts(vendor) : []

  return (
    <div
      aria-hidden="true"
      data-testid="garage-cover"
      data-tone={tone}
      className={cn('absolute inset-0 overflow-hidden', className)}
      style={{ background: COVER_GLOW[tone] }}
    >
      <div className="absolute inset-0" style={{ background: LINES }} />
      {initials && (
        <span
          className={cn(
            'pointer-events-none absolute -right-1.5 bottom-[-0.22em] select-none font-numeric font-bold leading-none tracking-[-0.06em] text-transparent',
            MONO_SIZE[size]
          )}
          style={{ WebkitTextStroke: '1.2px rgba(255,255,255,.16)' }}
        >
          {initials}
        </span>
      )}
      {meta.length > 0 && (
        <p
          className={cn(
            'absolute left-3 top-3 flex max-w-[calc(100%-4.5rem)] items-center gap-1.5 overflow-hidden whitespace-nowrap text-[10.5px] uppercase tracking-[0.08em] text-white/60',
            metaClassName
          )}
        >
          {meta.map((part, i) => (
            <span
              key={`${i}-${part}`}
              className="flex min-w-0 items-center gap-1.5"
            >
              {i > 0 && (
                <i className="size-1 shrink-0 rounded-full bg-white/45" />
              )}
              <span className="truncate">{part}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

/**
 * The monogram tile where a logo would be: the garage's initials on its
 * cover colour. Sized and placed by the caller (`className`), like the logo
 * tile it stands in for.
 */
export function GarageMonogram({
  vendor,
  className,
}: {
  vendor: Pick<Vendor, 'id' | 'name'>
  className?: string
}) {
  const tone = coverToneFor(vendor.id)
  return (
    <div
      aria-hidden="true"
      data-testid="garage-monogram"
      data-tone={tone}
      className={cn(
        'flex items-center justify-center overflow-hidden border border-white/55 font-numeric font-bold tracking-[-0.02em] text-white',
        className
      )}
      style={{ background: MONOGRAM_FILL[tone] }}
    >
      {garageInitials(vendor.name)}
    </div>
  )
}
