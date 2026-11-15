'use client'

import { useId, type ReactNode } from 'react'
import { cn } from '@repo/core/utils'

/**
 * A number box for the pickup fee's screens (0079), in the garage editor's
 * km box look: "₹ 15", "3 km", "1.3 ×". It commits on leaving it or Enter,
 * so the page saves on tap without a Save button.
 */
export function FeeInput({
  value,
  onChange,
  onCommit,
  prefix,
  suffix,
  label,
  invalid,
  disabled,
  describedBy,
  className,
}: {
  value: string
  onChange: (value: string) => void
  onCommit?: () => void
  prefix?: string
  suffix?: string
  /** The box's accessible name. */
  label: string
  invalid?: boolean
  disabled?: boolean
  describedBy?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-11 w-[104px] shrink-0 items-center gap-1.5 rounded-[12px] border bg-surface px-3.5 transition-colors focus-within:border-text-secondary',
        invalid ? 'border-error' : 'border-border',
        disabled && 'opacity-60',
        className
      )}
    >
      {prefix && (
        <span aria-hidden="true" className="text-[13px] text-text-muted">
          {prefix}
        </span>
      )}
      <input
        value={value}
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className="w-full min-w-0 bg-transparent font-numeric text-[16px] font-medium text-text-primary outline-none placeholder:text-text-muted"
      />
      {suffix && (
        <span aria-hidden="true" className="shrink-0 text-[13px] text-text-muted">
          {suffix}
        </span>
      )}
    </div>
  )
}

/** One row of a fee card: the name and its line on the left, the box (or boxes) on the right. */
export function FeeRow({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint: ReactNode
  error?: string | null
  children: (ids: { hintId: string }) => ReactNode
}) {
  const id = useId()
  return (
    <div className="border-t border-border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] tracking-[-0.01em] text-text-primary">{label}</p>
          <p id={`${id}-hint`} className="mt-0.5 text-[12.5px] text-text-muted">
            {hint}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{children({ hintId: `${id}-hint` })}</div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-error">
          {error}
        </p>
      )}
    </div>
  )
}

/** "₹110", "Free", "₹399 (top)". */
export function rupeesCell(fee: number, top = false): string {
  if (fee <= 0) return 'Free'
  return `₹${fee.toLocaleString('en-IN')}${top ? ' (top)' : ''}`
}

/** A box's text as a number, or null when it isn't one. */
export function parseBox(value: string): number | null {
  const trimmed = value.trim().replace(/^₹/, '')
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}
