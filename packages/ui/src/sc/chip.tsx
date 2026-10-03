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
        'shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
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
}: {
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ?? false}
      className={cn(
        'shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
        active
          ? 'border-brand-white bg-brand-white text-brand-black'
          : 'border-border bg-surface text-text-secondary'
      )}
    >
      {label}
    </button>
  )
}
