import Link from 'next/link'
import type { AdminVendor } from '@repo/core/api/admin'
import { listHref, withTeamLine } from '@/lib/collection'

/**
 * The Garages table's note that a teammate is collecting for this garage:
 * "With Raga · due 29 Oct · 3/11", linking to the list. Nothing when the
 * garage is on no open list (or the API is older than collection lists).
 */
export function WithTeamCell({ vendor }: { vendor: AdminVendor }) {
  const open = vendor.openCollection
  if (!open) return null
  const line = withTeamLine(open)
  const initial = open.assigneeName.trim().charAt(0).toUpperCase() || '?'
  return (
    <Link
      href={listHref(open.listId)}
      aria-label={`${line}: open the list`}
      className="relative z-10 inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-1 pr-2.5 text-[12px] text-text-primary transition-colors hover:bg-surface-elevated"
    >
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-tone-progress-tint text-[11px] font-semibold text-tone-progress-text"
      >
        {initial}
      </span>
      <span className="truncate font-numeric">{line}</span>
    </Link>
  )
}
