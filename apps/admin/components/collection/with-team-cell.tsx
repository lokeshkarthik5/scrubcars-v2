import Link from 'next/link'
import type { AdminVendor } from '@repo/core/api/admin'
import { cn } from '@repo/core/utils'
import { listHref, withTeamLine, withTeamShort } from '@/lib/collection'

/**
 * The note that a teammate is collecting for this garage, linking to the
 * list. In the Garages table (`compact`) it is short enough for the Marks
 * column, "Priya · 31 Oct · 0/2", and still reads out (and is found) as
 * "With Priya · due 31 Oct · 0/2", which is its tooltip too; the side panel
 * shows that whole line, a phone row the name alone. Nothing when the garage is on no open list (or the
 * API is older than collection lists).
 */
export function WithTeamCell({
  vendor,
  compact = false,
  className,
}: {
  vendor: AdminVendor
  compact?: boolean
  className?: string
}) {
  const open = vendor.openCollection
  if (!open) return null
  const line = withTeamLine(open)
  const initial = open.assigneeName.trim().charAt(0).toUpperCase() || '?'
  return (
    <Link
      href={listHref(open.listId)}
      aria-label={`${line}: open the list`}
      title={compact ? line : undefined}
      className={cn(
        'relative z-10 inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-1 pr-2.5 text-[12px] text-text-primary transition-colors hover:bg-surface-elevated',
        compact && 'min-h-6 pr-2',
        className
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-tone-progress-tint text-[11px] font-semibold text-tone-progress-text"
      >
        {initial}
      </span>
      {compact ? (
        <span className="truncate whitespace-nowrap font-numeric">
          <span className="sr-only">With </span>
          {open.assigneeName}
          {/* A phone row has room for the name only. */}
          <span className="max-md:hidden">
            {withTeamShort(open).slice(open.assigneeName.length)}
          </span>
        </span>
      ) : (
        <span className="truncate font-numeric">{line}</span>
      )}
    </Link>
  )
}
