'use client'

import { cn } from '@repo/core/utils'

/**
 * What to do with the ticked rows: how many, whose, Clear, and the actions
 * (the secondary outline ones first, the one red gradient last). It stays in
 * view at the bottom of the list; on a phone it floats above the tab bar.
 * `count` is the ticked rows on screen, the ones the actions act on; rows
 * still ticked but hidden by a filter are said apart ("2 hidden by
 * filters") and left alone. Nothing is rendered while nothing is ticked.
 */
export function BulkBar({
  count,
  onClear,
  names,
  label = 'Selected rows',
  hidden = 0,
  children,
  className,
}: {
  count: number
  /** Ticked rows the filters hide: kept, but not acted on. */
  hidden?: number
  onClear: () => void
  /** The ticked rows' names, in one truncated line. */
  names?: string[]
  label?: string
  children: React.ReactNode
  className?: string
}) {
  if (count === 0 && hidden === 0) return null
  return (
    <div
      role="region"
      aria-label={label}
      className={cn(
        'z-30 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface-elevated px-3 py-2.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]',
        'sticky bottom-4',
        'max-md:fixed max-md:inset-x-3 max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom))]',
        className
      )}
    >
      <p className="flex min-w-0 flex-1 items-baseline gap-2 text-[13px]">
        <span className="shrink-0 font-semibold text-text-primary">
          <span className="font-numeric">{count}</span> selected
        </span>
        {hidden > 0 && (
          <span className="shrink-0 text-tone-attention-text">
            (<span className="font-numeric">{hidden}</span> hidden by filters)
          </span>
        )}
        {names && names.length > 0 && (
          <span className="min-w-0 truncate text-text-secondary max-md:hidden">
            {names.join(', ')}
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="min-h-10 rounded-[10px] px-3 text-[13px] font-medium text-text-primary hover:bg-surface"
        >
          Clear
        </button>
        {count > 0 && children}
      </div>
    </div>
  )
}
