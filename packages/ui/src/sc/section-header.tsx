import { cn } from '@repo/core/utils'

interface SectionHeaderProps {
  title: React.ReactNode
  /** One line under the title, for what the section is for. */
  subtitle?: React.ReactNode
  /** Trailing slot: a count, a badge, a "See all". */
  action?: React.ReactNode
  /** The heading's id, for a group that names itself by it (aria-labelledby). */
  id?: string
  className?: string
}

/**
 * The heading over a group on a screen — "Incoming bookings", "Working
 * hours", "Members". 15px semibold, the size the customer checkout heads its
 * steps with, so a section title sits between a screen title (17–20px) and
 * the 13px rows under it.
 */
export function SectionHeader({ title, subtitle, action, id, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold text-text-primary">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-text-secondary">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}
