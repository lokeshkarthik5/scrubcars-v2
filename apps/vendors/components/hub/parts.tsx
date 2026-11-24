'use client'

import Link from 'next/link'
import { IconChevronRight, type IconDroplet } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

/**
 * The garage portal's five tabs in the customer Home's "hub" look (owner,
 * 22 Nov 2026; mockups reference/mockups/garage-hub): big rounded cards
 * (`hub-card`, radius 28), large light numbers, small grey labels, round
 * 40px icon discs, two-tile rows, list cards with soft square row icons, and
 * outline pills. The customer app draws the same parts in
 * apps/users/components/home/tile.tsx and profile/profile-hub.tsx; these are
 * the portal's own copies (no imports across apps).
 */

type Icon = typeof IconDroplet

/** A big light figure: the hero's 56px, a tile's 34–40px. */
export const BIG_FIGURE = 'font-numeric font-light leading-none tracking-[-0.035em] text-text-primary'

/** The soft 40px disc in a card's top corner. Decoration: the label says it. */
export function Disc({ icon: Icon }: { icon: Icon }) {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-text-primary">
      <Icon size={20} stroke={1.5} />
    </span>
  )
}

/**
 * One of a two-tile row: a label and its disc on top, the figure pushed to
 * the bottom with a quiet line under it. A link when `href` is given (the
 * whole tile is one target), otherwise a plain card.
 */
export function HubTile({
  label,
  icon,
  value,
  line,
  href,
  ariaLabel,
  className,
}: {
  /** Already translated. */
  label: string
  icon: Icon
  value: React.ReactNode
  line?: React.ReactNode
  href?: string
  /** Replaces the tile's text for a screen reader: carry the figure in it. */
  ariaLabel?: string
  className?: string
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        {/* Two lines, so a longer label (Tamil) wraps rather than ends in an ellipsis. */}
        <span className="line-clamp-2 min-w-0 text-t4 text-dim">{label}</span>
        <Disc icon={icon} />
      </span>
      <span className={cn(BIG_FIGURE, 'mt-auto block truncate pt-3 text-[clamp(26px,8.5vw,34px)]')}>{value}</span>
      {line && <span className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-dim">{line}</span>}
    </>
  )
  const cls = cn('hub-card flex min-h-[150px] min-w-0 flex-col pt-3.5 pr-3.5 pb-[18px] pl-5', className)
  return href ? (
    <Link href={href} aria-label={ariaLabel} className={cn(cls, 'press')}>
      {body}
    </Link>
  ) : (
    <div aria-label={ariaLabel} role={ariaLabel ? 'group' : undefined} className={cls}>
      {body}
    </div>
  )
}

/** Two tiles side by side. */
export function TileRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

/** One card of rows, each with a soft square icon and a chevron. */
export function HubList({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div aria-label={label} role={label ? 'group' : undefined} className={cn('hub-card flex flex-col divide-y divide-line overflow-hidden py-1', className)}>
      {children}
    </div>
  )
}

/** A row's soft square icon. Decoration: the row's words say it. */
export function RowIcon({ icon: Icon }: { icon: Icon }) {
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/[0.06] text-text-primary">
      <Icon size={16} stroke={1.6} />
    </span>
  )
}

const ROW =
  'press flex min-h-[52px] w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left text-t3 text-text-primary transition-colors hover:bg-white/[0.03]'

/**
 * A row of a list card: icon, label (and a quiet line under it), the current
 * value on the right, a chevron. The label comes first in the link's text,
 * so "Documents …" is still found by its name.
 */
export function HubRow({
  icon,
  label,
  sub,
  value,
  href,
  onClick,
  ariaHaspopup,
}: {
  icon: Icon
  label: React.ReactNode
  sub?: React.ReactNode
  value?: React.ReactNode
  href?: string
  onClick?: () => void
  ariaHaspopup?: 'dialog'
}) {
  const inner = (
    <>
      <RowIcon icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {sub && <span className="block text-[12px] leading-snug text-dim">{sub}</span>}
      </span>
      {value !== undefined && value !== null && value !== '' && (
        <span className="max-w-[45%] shrink-0 truncate text-right text-t4 text-dim">{value}</span>
      )}
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
    <button type="button" onClick={onClick} aria-haspopup={ariaHaspopup} className={ROW}>
      {inner}
    </button>
  )
}

/** A section's small grey heading, with an optional action on the right. */
export function HubSectionHead({
  id,
  title,
  action,
  as: Tag = 'h2',
}: {
  id?: string
  title: React.ReactNode
  action?: React.ReactNode
  as?: 'h2' | 'h3'
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-2">
      <Tag id={id} className="text-t4 font-normal text-dim">
        {title}
      </Tag>
      {action}
    </div>
  )
}

const PILL =
  'press flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-4 text-t4 text-text-primary transition-colors hover:bg-white/[0.07] disabled:opacity-50'

/** The outline pill (Add a service, Download CSV). A button, or a link with `href`. */
export function HubPill({
  children,
  onClick,
  href,
  disabled,
  ariaLabel,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  href?: string
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={cn(PILL, className)}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} className={cn(PILL, className)}>
      {children}
    </button>
  )
}

export type TagTone = 'green' | 'blue' | 'red' | 'amber' | 'neutral'

const TAG_TONE: Record<TagTone, string> = {
  green: 'border-[rgba(74,222,128,0.3)] text-[#4ADE80]',
  blue: 'border-[rgba(59,130,246,0.4)] text-[#93C5FD]',
  red: 'border-[rgba(248,113,113,0.4)] text-[#FCA5A5]',
  amber: 'border-[rgba(251,191,36,0.4)] text-[#FCD34D]',
  neutral: 'border-line text-[#E4E4E7]',
}

/** A small outline tag: Active, In progress, Shown to customers. */
export function HubTag({
  tone = 'neutral',
  dot = false,
  children,
  className,
}: {
  tone?: TagTone
  /** A coloured dot before the words (In progress, 1 under way). */
  dot?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] leading-none whitespace-nowrap',
        TAG_TONE[tone],
        className
      )}
    >
      {dot && (
        <span
          aria-hidden
          className={cn(
            'size-[7px] shrink-0 rounded-full',
            tone === 'blue' ? 'bg-[#3B82F6]' : tone === 'red' ? 'bg-[#F87171]' : 'bg-[#22C55E]'
          )}
        />
      )}
      {children}
    </span>
  )
}

/** The slim progress bar of the Today card. `value` is 0–1. */
export function SlimBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
    >
      <div className="h-full rounded-full bg-text-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}
