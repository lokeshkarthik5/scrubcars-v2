'use client'

import { cn } from '@repo/core/utils'

interface ScSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** The accessible name — what is switched on. Required: a switch has no text. */
  label: string
  disabled?: boolean
  /**
   * 'default' is white when on, as chosen things are. 'warning' is amber when
   * on, for a state to notice rather than a setting — pausing bookings.
   */
  tone?: 'default' | 'warning'
  className?: string
}

/**
 * An on/off setting that takes effect the moment it is tapped.
 *
 * A real switch (role="switch", aria-checked), so it announces as on or off
 * rather than as a button whose state lives only in its colour. The track is
 * the 44×24 the settings screen always drew; the button around it is a full
 * 44px touch target. Never red: red marks what to press, and an "on" switch
 * in red read as a button waiting to be pressed.
 */
export function ScSwitch({
  checked,
  onChange,
  label,
  disabled,
  tone = 'default',
  className,
}: ScSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex h-11 w-14 shrink-0 items-center justify-center rounded-full disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          checked
            ? tone === 'warning'
              ? 'bg-warning'
              : 'bg-brand-white'
            : 'border border-border bg-surface-elevated'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full shadow transition-[left] duration-150 motion-reduce:transition-none',
            checked
              ? cn('left-[22px]', tone === 'warning' ? 'bg-brand-white' : 'bg-brand-black')
              : 'left-0.5 bg-text-secondary'
          )}
        />
      </span>
    </button>
  )
}
