'use client'

import { cn } from '@/lib/utils'

interface ToggleProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function ScToggle<T extends string>({
  options,
  value,
  onChange,
  className,
}: ToggleProps<T>) {
  return (
    <div
      className={cn(
        'flex rounded-[10px] bg-surface p-0.5',
        className
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors',
            value === opt.value
              ? 'bg-brand-red text-brand-white'
              : 'bg-transparent text-text-secondary'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
