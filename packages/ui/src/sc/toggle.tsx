'use client'

import { cn } from '@repo/core/utils'

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
          // Which option is active is otherwise carried only by a background
          // colour — nothing a screen reader or a test can read.
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          // The same selected look as ScSegmented — raised graphite and a
          // white label. A red fill made a choice look like the Pay button
          // at the bottom of the same screen.
          className={cn(
            // 36px drawn, a 44px touch area (tap-target, globals.css).
            'tap-target flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors',
            value === opt.value
              ? 'bg-surface-elevated text-text-primary shadow-sm'
              : 'bg-transparent text-text-secondary'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
