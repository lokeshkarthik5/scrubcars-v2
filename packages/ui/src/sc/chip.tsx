'use client'

import { cn } from '@repo/core/utils'

interface ChipProps {
  label: string
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
  className?: string
}

/**
 * Selected chips are a white fill with dark text — the same "chosen" look as
 * the date and time pickers — not red. Red marks what to press; a row of red
 * selections reads as a row of buttons.
 */
export function Chip({ label, selected, onClick, disabled, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // Selection is otherwise carried only by the fill colour.
      aria-pressed={selected ?? false}
      className={cn(
        // tap-target: a 44px touch area around the 30px chip (globals.css).
        'tap-target shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
        disabled && 'cursor-not-allowed bg-brand-black text-text-muted line-through opacity-60',
        !disabled && selected && 'border-brand-white bg-brand-white text-brand-black',
        !disabled && !selected && 'border-border bg-surface text-text-primary',
        className
      )}
    >
      {label}
    </button>
  )
}

export function FilterChip({
  label,
  active,
  onClick,
  count,
  className,
}: {
  label: string
  active?: boolean
  onClick?: () => void
  /** How many the filter shows, set after the label in the numeric face. */
  count?: number
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ?? false}
      // "Live 12", spaced: read from the content it would run together as
      // "Live12", since the gap between the two is only layout.
      aria-label={count !== undefined ? `${label} ${count}` : undefined}
      className={cn(
        'tap-target shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
        active
          ? 'border-brand-white bg-brand-white text-brand-black'
          : 'border-border bg-surface text-text-secondary',
        count !== undefined && 'inline-flex items-center gap-1.5 whitespace-nowrap',
        className
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'font-numeric',
            // 60% black on white is 5.2:1 and 85% muted on a card 5.1:1; the
            // 55% and 70% these were came to 4.4:1 and 3.9:1.
            active ? 'text-brand-black/60' : count === 0 ? 'text-text-muted/85' : 'text-text-muted'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}
