'use client'

import { type ReactNode, useRef } from 'react'
import { cn } from '@repo/core/utils'

/**
 * Pick one of N, where every choice re-filters the same content.
 *
 * The app had six hand-rolled copies of this — bookings status, earnings
 * period, the At Garage / Doorstep switches on home and the garage page,
 * settings — in two different looks (a raised surface and a red-filled pill),
 * so the same control read differently depending on which screen you were on.
 * This is the one look.
 *
 * Deliberately NOT the Radix Tabs component. Tabs promise panels: their
 * triggers advertise `aria-controls` pointing at a tabpanel, and screen readers
 * announce "tab 2 of 4" for a region that will appear. These switches have no
 * panels — they narrow one list that is always on screen — so they are a
 * radiogroup, which is what "choose one of these" actually means. Use
 * `components/ui/tabs` where real panels exist (vendor settings).
 */

export interface ScSegmentedOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

interface ScSegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ScSegmentedOption<T>[]
  /** `sm` is for tight slots like a TopBar corner. */
  size?: 'sm' | 'md'
  'aria-label'?: string
  className?: string
}

export function ScSegmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  ...props
}: ScSegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null)

  // A radiogroup is expected to move between options with the arrow keys; only
  // the selected option is in the tab order, so Tab jumps past the whole group.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (!forward && !back) return

    event.preventDefault()
    const enabled = options.filter((option) => !option.disabled)
    const current = enabled.findIndex((option) => option.value === value)
    const next =
      (current + (forward ? 1 : -1) + enabled.length) % enabled.length

    onChange(enabled[next].value)
    // Focus follows selection, as it does in a native radiogroup.
    ref.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [options.indexOf(enabled[next])]?.focus()
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={props['aria-label']}
      onKeyDown={onKeyDown}
      className={cn(
        'flex bg-surface',
        size === 'sm' ? 'rounded-[9px] p-0.5' : 'rounded-[12px] p-1',
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            // Only the selected option is tabbable, so Tab moves past the group
            // rather than through every choice in it.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/60',
              'disabled:pointer-events-none disabled:opacity-40',
              size === 'sm'
                ? 'rounded-[7px] px-2 py-1 text-[11px]'
                : 'rounded-[9px] py-2.5 text-[13px]',
              // The selected option carries the brand colour as an accent — a
              // red hairline and label on a raised surface — rather than a
              // solid red fill, which at four options competes with the red
              // active item in the bottom nav directly below it.
              selected
                ? 'bg-surface-elevated text-brand-red shadow-sm ring-1 ring-brand-red/50'
                : 'text-text-secondary'
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
