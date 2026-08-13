'use client'

import { cn } from '@/lib/utils'

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
        'flex cursor-pointer items-center gap-2 text-[12px] text-text-primary',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 rounded border-border bg-surface accent-brand-red"
      />
      {label}
    </label>
  )
}
