'use client'

import { cn } from '@repo/core/utils'

export interface SavedView<V extends string> {
  value: V
  label: string
  /** How many rows the view holds; left out when it isn't known. */
  count?: number
}

/**
 * The views a list opens on, with how many each holds ("Needs action 3",
 * "Live 14"): one segmented row above the table that scrolls sideways on a
 * phone. Each is a toggle button, named "Label N" so the count is read with
 * it. `trailing` sits at the end of the row, outside the group.
 */
export function SavedViews<V extends string>({
  label,
  views,
  value,
  onChange,
  trailing,
  className,
}: {
  label: string
  views: SavedView<V>[]
  value: V
  onChange: (v: V) => void
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        '-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      <div
        role="group"
        aria-label={label}
        className="flex shrink-0 gap-1 rounded-[10px] border border-border bg-surface p-1"
      >
        {views.map((view) => {
          const active = view.value === value
          return (
            <button
              key={view.value}
              type="button"
              aria-pressed={active}
              aria-label={
                view.count !== undefined
                  ? `${view.label} ${view.count}`
                  : undefined
              }
              onClick={() => onChange(view.value)}
              className={cn(
                'inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-surface-elevated text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {view.label}
              {view.count !== undefined && (
                <span
                  className={cn(
                    'font-numeric',
                    active ? 'text-text-secondary' : 'text-text-muted'
                  )}
                >
                  {view.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {trailing}
    </div>
  )
}
