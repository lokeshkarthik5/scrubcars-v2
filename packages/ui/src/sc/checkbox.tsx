'use client'

import { cn } from '@repo/core/utils'

interface ScCheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function ScCheckbox({
  label,
  checked,
  onChange,
  disabled,
  className,
}: ScCheckboxProps) {
  return (
    <label
      className={cn(
        // A full-height row, so the 16px box is not the only thing to hit.
        'flex min-h-11 cursor-pointer items-center gap-2 text-[12px] text-text-primary',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        // Ticked is white, as chosen things are; a red tick read as a red
        // button in a form whose one red is its Save.
        className="size-4 shrink-0 rounded border-border bg-surface accent-brand-white"
      />
      {label}
    </label>
  )
}
