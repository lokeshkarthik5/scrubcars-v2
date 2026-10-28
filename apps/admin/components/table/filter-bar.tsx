'use client'

import { useId, useState } from 'react'
import { IconAdjustmentsHorizontal, IconSearch } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

export interface FilterBarSearch {
  /** The box's accessible name ("Search bookings"). */
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  id?: string
}

/**
 * The row under the views: a search box, then the filters. On a laptop
 * everything is out; on a phone the filters fold behind one Filter button
 * (with how many are on), so the first row is on the first screen.
 */
export function FilterBar({
  search,
  activeCount = 0,
  children,
  trailing,
  className,
}: {
  search?: FilterBarSearch
  /** How many of the folded filters are on, for the phone's Filter button. */
  activeCount?: number
  children?: React.ReactNode
  /** At the row's end on a laptop ("Columns", a note). */
  trailing?: React.ReactNode
  className?: string
}) {
  const filtersId = useId()
  const [open, setOpen] = useState(false)

  return (
    <div
      className={cn(
        'flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {search && (
          <div className="relative min-w-0 flex-1 md:w-[320px] md:flex-none">
            <IconSearch
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              id={search.id}
              type="search"
              aria-label={search.label}
              placeholder={search.placeholder}
              autoComplete="off"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              className="min-h-11 w-full rounded-[10px] border border-border bg-surface py-2 pl-9 pr-3 text-[13px] text-text-primary placeholder:text-text-muted focus:border-text-secondary focus:outline-none md:min-h-10"
            />
          </div>
        )}
        {children && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={filtersId}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-border px-3 text-[13px] font-medium text-text-primary md:hidden"
          >
            <IconAdjustmentsHorizontal size={16} aria-hidden="true" />
            Filter
            {activeCount > 0 && (
              <span className="font-numeric text-text-secondary">
                · {activeCount}
              </span>
            )}
          </button>
        )}
      </div>
      {children && (
        <div
          id={filtersId}
          className={cn(
            'flex-wrap items-center gap-2 md:flex',
            open ? 'flex' : 'hidden'
          )}
        >
          {children}
        </div>
      )}
      {trailing && (
        <div className="flex items-center gap-2 text-[12px] text-text-secondary md:ml-auto">
          {trailing}
        </div>
      )}
    </div>
  )
}
