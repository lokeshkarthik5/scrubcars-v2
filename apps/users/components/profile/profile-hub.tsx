'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  IconCalendar,
  IconChevronRight,
  IconHeart,
  IconPlus,
  IconTicket,
  IconTrash,
  IconWallet,
  type IconDroplet,
} from '@tabler/icons-react'
import { NumberPlate } from '@repo/ui/finish/number-plate'
import { formatWhen } from '@repo/core/format'
import { tn, useT } from '@repo/core/i18n'
import type { Booking, Vehicle } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { Tile } from '@/components/home/tile'

/**
 * Profile in the Home look (22 Nov 2026, mockup reference/mockups/profile):
 * the parts the page is built from. Every row Profile had is still there;
 * these only change how it looks.
 */

export { bookingFigures } from '@repo/core/profile-figures'

/** Three quiet figures under the name: bookings, garages tried, cars. */
export function ProfileStats({ items }: { items: { value: number; label: string }[] }) {
  return (
    <dl className="mt-5 grid w-full grid-cols-3 border-t border-line pt-4">
      {items.map((item, i) => (
        // The term first, as a list of terms must be; drawn under its figure.
        <div key={item.label} className={cn('flex flex-col-reverse items-center gap-0.5', i > 0 && 'border-l border-line')}>
          <dt className="text-t5 text-dim">{item.label}</dt>
          <dd className="font-numeric text-[26px] leading-none font-light tracking-[-0.02em] text-text-primary">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A big light number at the foot of a tile, with the quiet line under it. */
function TileFigure({ value, line }: { value: React.ReactNode; line: string }) {
  return (
    <>
      <span className="mt-auto font-numeric text-[40px] leading-none font-light tracking-[-0.035em] text-text-primary">
        {value}
      </span>
      <span className="mt-1.5 line-clamp-2 text-t5 leading-snug text-dim">{line}</span>
    </>
  )
}

/**
 * The tiles under the car: My bookings, Saved garages, Detlio credit (while
 * gifts are on, as the row was) and Coupons, two to a row. With three, the
 * last spans the row.
 */
export function ProfileTiles({
  bookings,
  saved,
  credit,
  coupons,
}: {
  bookings: { count: number | null; next: Booking | null }
  saved: { count: number | null; photos: string[] }
  /** Null while gifts are off: no tile. */
  credit: { label: string | null } | null
  coupons: number
}) {
  const t = useT()
  const tiles: { key: string; href: string; label: string; icon: typeof IconDroplet; body: React.ReactNode }[] = [
    {
      key: 'bookings',
      href: '/bookings',
      label: t('My bookings'),
      icon: IconCalendar,
      body: (
        <TileFigure
          value={bookings.count ?? '–'}
          line={
            bookings.next
              ? t('Next: {when}', { when: formatWhen(bookings.next.scheduledAt) })
              : t('None coming up')
          }
        />
      ),
    },
    {
      key: 'saved',
      href: '/profile/saved-garages',
      label: t('Saved garages'),
      icon: IconHeart,
      body:
        saved.photos.length > 0 ? (
          <>
            <span aria-hidden className="mt-auto flex">
              {saved.photos.slice(0, 3).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- garage photos come from R2 at many sizes
                <img
                  key={src}
                  src={src}
                  alt=""
                  className={cn('size-9 rounded-full border-2 border-[#17171a] object-cover', i > 0 && '-ml-2.5')}
                />
              ))}
            </span>
            <span className="mt-1.5 text-t5 text-dim">{tn(saved.count ?? 0, '{count} saved', '{count} saved')}</span>
          </>
        ) : (
          <TileFigure value={saved.count ?? '–'} line={saved.count ? t('Tap to see them') : t('Tap ♡ on a garage to save it')} />
        ),
    },
  ]
  if (credit) {
    tiles.push({
      key: 'credit',
      href: '/profile/credit',
      label: t('Detlio credit'),
      icon: IconWallet,
      body: <TileFigure value={credit.label ?? '–'} line={t('Used on your next booking')} />,
    })
  }
  tiles.push({
    key: 'coupons',
    href: '/profile/coupons',
    label: t('Coupons'),
    icon: IconTicket,
    body: <TileFigure value={coupons} line={t('Have a coupon? Add it here')} />,
  })
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((tile, i) => (
        <Tile
          key={tile.key}
          href={tile.href}
          label={tile.label}
          icon={tile.icon}
          className={cn('min-h-[150px]', tiles.length % 2 === 1 && i === tiles.length - 1 && 'col-span-2')}
        >
          {tile.body}
        </Tile>
      ))}
    </div>
  )
}

/** One card of rows (Gift a wash, Settings & help…), with a disc icon and a chevron. */
export function HubList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('hub-card flex flex-col divide-y divide-line overflow-hidden py-1', className)}>{children}</div>
}

const ROW = 'flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left text-t3 text-text-primary'

/** A row's soft square icon. Decoration: the row's words say it. */
export function RowIcon({ icon: Icon }: { icon: typeof IconDroplet }) {
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/[0.06] text-text-primary">
      <Icon size={16} stroke={1.6} />
    </span>
  )
}

export function HubRow({
  icon,
  label,
  sub,
  value,
  href,
  onClick,
}: {
  icon: typeof IconDroplet
  label: React.ReactNode
  sub?: React.ReactNode
  value?: React.ReactNode
  href?: string
  onClick?: () => void
}) {
  const inner = (
    <>
      <RowIcon icon={icon} />
      <span className="min-w-0 flex-1">
        {label}
        {sub && <span className="block text-t5 text-dim">{sub}</span>}
      </span>
      {value !== undefined && value !== null && <span className="shrink-0 text-t5 text-dim">{value}</span>}
      <IconChevronRight size={16} aria-hidden className="shrink-0 text-text-muted" />
    </>
  )
  if (href) {
    return (
      <Link href={href} className={ROW}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={ROW}>
      {inner}
    </button>
  )
}

/** A section's small grey heading, with an optional action on the right. */
export function HubSectionHead({ id, title, action }: { id?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pt-2">
      <h2 id={id} className="text-t4 font-normal text-dim">
        {title}
      </h2>
      {action}
    </div>
  )
}

/** The outline pill under a card (Add a car, Add address). */
export function HubPill({
  children,
  onClick,
  ariaLabel,
  ariaExpanded,
  className,
}: {
  children: React.ReactNode
  onClick: () => void
  ariaLabel?: string
  ariaExpanded?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      className={cn(
        'press flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-4 text-t4 text-text-primary',
        className
      )}
    >
      {children}
    </button>
  )
}

/**
 * "Your garage": a card per car with its plate drawn large in place of a
 * picture (owner, 22 Nov 2026: Home already shows the car). Two or more
 * swipe sideways, with dots. A car with no plate shows a dashed "Add number
 * plate" that opens Edit. The name opens the car's history.
 */
export function CarCards({
  vehicles,
  promoting,
  deleting,
  onEdit,
  onRemove,
  onMakeDefault,
}: {
  vehicles: Vehicle[]
  promoting: string | null
  deleting: string | null
  onEdit: (id: string) => void
  onRemove: (id: string) => void
  onMakeDefault: (id: string) => void
}) {
  const t = useT()
  const rail = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(0)
  const many = vehicles.length > 1

  // Which card is in view, for the dots.
  useEffect(() => {
    const el = rail.current
    if (!el || !many) return
    const onScroll = () => setShown(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [many])

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={rail}
        className={cn('flex gap-3', many && 'profile-cars -mx-4 overflow-x-auto px-4')}
        aria-label={many ? t('Your cars') : undefined}
        role={many ? 'group' : undefined}
      >
        {vehicles.map((v) => {
          const name = `${v.make} ${v.model}`
          return (
            <article key={v.id} className={cn('hub-card flex shrink-0 flex-col p-5', many ? 'w-[calc(100%-8px)]' : 'w-full')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-t4 text-dim">{t('Your garage')}</span>
                {v.isDefault ? (
                  <span className="rounded-full border border-[rgba(74,222,128,.3)] px-2 py-0.5 text-t5 text-[#4ade80]">
                    {t('Default')}
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={t('Make {make} {model} the default vehicle', { make: v.make, model: v.model })}
                    onClick={() => onMakeDefault(v.id)}
                    disabled={promoting === v.id}
                    className="-my-2 min-h-11 px-1 text-t5 text-dim transition-colors hover:text-text-primary disabled:opacity-40"
                  >
                    {promoting === v.id ? t('Setting...') : t('Set default')}
                  </button>
                )}
              </div>
              {/* The car opens its history: every job, receipts, photos and
                  its next coating or detailing reminder. */}
              <Link
                href={`/profile/cars/${v.id}`}
                aria-label={t('{make} {model}: history', { make: v.make, model: v.model })}
                className="mt-1 flex min-h-11 items-center gap-1"
              >
                <span className="profile-car-title min-w-0 truncate" data-clarity-mask="true">
                  {name}
                </span>
                <span className="ml-auto flex shrink-0 items-center text-t5 text-dim">
                  {t('History')}
                  <IconChevronRight size={14} aria-hidden />
                </span>
              </Link>
              {v.plate ? (
                <NumberPlate plate={v.plate} size="lg" className="mt-3" />
              ) : (
                <button
                  type="button"
                  onClick={() => onEdit(v.id)}
                  className="mt-3 flex h-[60px] w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[rgba(255,255,255,.22)] text-t4 text-dim transition-colors hover:text-text-primary"
                >
                  <IconPlus size={16} aria-hidden />
                  {t('Add number plate')}
                </button>
              )}
              <div className="mt-4 flex gap-2">
                <HubPill onClick={() => onEdit(v.id)} ariaLabel={t('Edit {make} {model}', { make: v.make, model: v.model })}>
                  {t('Edit car')}
                </HubPill>
                <button
                  type="button"
                  aria-label={t('Remove {make} {model}', { make: v.make, model: v.model })}
                  onClick={() => onRemove(v.id)}
                  disabled={deleting === v.id}
                  className="press grid size-11 shrink-0 place-items-center rounded-full border border-line bg-white/[0.04] text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
                >
                  <IconTrash size={16} aria-hidden />
                </button>
              </div>
            </article>
          )
        })}
      </div>
      {many && (
        <div aria-hidden className="flex justify-center gap-1.5">
          {vehicles.map((v, i) => (
            <span
              key={v.id}
              className={cn('h-1.5 rounded-full transition-all', i === shown ? 'w-[18px] bg-[#ddd]' : 'w-1.5 bg-[#444]')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** The faint street lines with a red pin, over the default address. Decoration only. */
export function AddressMapBand() {
  return (
    <div aria-hidden className="relative -mx-5 -mt-5 mb-4 h-[104px] overflow-hidden bg-[#101012]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 360 104" preserveAspectRatio="none" fill="none">
        <g stroke="rgba(255,255,255,.08)" strokeWidth="1.2">
          <path d="M0 28 C80 38 140 8 360 22" />
          <path d="M0 78 C100 68 200 92 360 72" />
          <path d="M60 0 C70 40 50 68 80 104" />
          <path d="M200 0 C190 50 230 68 210 104" />
          <path d="M300 0 L280 104" />
          <path d="M120 0 L135 104" />
        </g>
        <path d="M0 52 L360 48" stroke="rgba(255,255,255,.14)" strokeWidth="3" />
      </svg>
      <span className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E4002B] shadow-[0_0_0_6px_rgba(228,0,43,.2),0_0_24px_rgba(228,0,43,.6)]" />
    </div>
  )
}
