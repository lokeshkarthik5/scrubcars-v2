'use client'

import { useMemo } from 'react'
import type { AdminVendor } from '@repo/core/api/admin'
import {
  MISSING_LABELS,
  MISSING_TONES,
  type MissingKey,
} from '@repo/core/onboarding-marks'
import { cn } from '@repo/core/utils'
import { missingChipKeys, missingCounts } from '@/lib/onboarding-marks'

/**
 * The "Missing info" filters above the Garages table: one chip per thing
 * some garage still owes us, with how many ("Photos 9"), red ones first. A
 * group of its own, so the "Show" group keeps its six chips. Pressing the
 * pressed chip clears it. On a phone the chips are one line that scrolls
 * sideways rather than three lines of chips. Nothing renders while no garage misses anything,
 * or from an API older than `missing`.
 */
export function MissingChips({
  vendors,
  value,
  onChange,
  className,
}: {
  vendors: AdminVendor[]
  value: MissingKey | null
  onChange: (k: MissingKey | null) => void
  className?: string
}) {
  const counts = useMemo(() => missingCounts(vendors), [vendors])
  const keys = missingChipKeys(counts)
  // A filter from the URL that no garage matches any more stays, at 0, so
  // it can be turned off.
  if (value && !keys.includes(value)) keys.push(value)
  if (keys.length === 0) return null

  return (
    <div
      role="group"
      aria-label="Missing"
      className={cn(
        // A phone gets one line that scrolls sideways, edge to edge; a
        // laptop wraps.
        'flex items-center gap-2',
        'max-md:-mx-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden',
        'md:flex-wrap',
        className
      )}
    >
      <span
        aria-hidden
        className="shrink-0 whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-text-muted"
      >
        Missing info
      </span>
      {keys.map((key) => {
        const active = value === key
        const label = MISSING_LABELS[key]
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-label={`${label} ${counts[key]}`}
            onClick={() => onChange(active ? null : key)}
            className={cn(
              'tap-target inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
              active
                ? 'border-brand-white bg-brand-white text-brand-black'
                : 'border-border bg-surface text-text-secondary'
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-1.5 rounded-full',
                MISSING_TONES[key] === 'red'
                  ? 'bg-tone-late-dot'
                  : 'bg-tone-attention-dot'
              )}
            />
            {label}
            <span
              className={cn(
                'font-numeric',
                active ? 'text-brand-black/60' : 'text-text-muted'
              )}
            >
              {counts[key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
