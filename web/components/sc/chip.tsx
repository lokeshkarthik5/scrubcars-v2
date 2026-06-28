'use client'

import { cn } from '@/lib/utils'

interface ChipProps {
  label: string
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
  className?: string
}

export function Chip({ label, selected, onClick, disabled, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
        disabled && 'cursor-not-allowed bg-brand-black text-text-muted line-through opacity-60',
        !disabled && selected && 'border-brand-red bg-accent-muted text-brand-red',
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
      className={cn(
        'shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
        active
          ? 'border-brand-red bg-accent-muted text-brand-red'
          : 'border-border bg-surface text-text-secondary'
      )}
    >
      {label}
    </button>
  )
}
