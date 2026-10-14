import Link from 'next/link'
import type { IconDroplet } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

/** The soft 40pt disc in a tile's top corner. Decoration: the label says it. */
export function TileIcon({ icon: Icon }: { icon: typeof IconDroplet }) {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-text-primary">
      <Icon size={20} stroke={1.5} />
    </span>
  )
}

/**
 * One of the two 164pt tiles under the car: a label and its disc on top, the
 * content pushed to the bottom. The whole tile is one link.
 */
export function Tile({
  href,
  label,
  icon,
  children,
  className,
  onClick,
}: {
  href: string
  label: string
  icon: typeof IconDroplet
  children: React.ReactNode
  className?: string
  /** Runs before the link is followed (e.g. noting which car is booking). */
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn('hub-card press flex h-[164px] min-w-0 flex-col pt-3.5 pr-3.5 pb-[18px] pl-5', className)}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] text-dim">{label}</span>
        <TileIcon icon={icon} />
      </span>
      {children}
    </Link>
  )
}
