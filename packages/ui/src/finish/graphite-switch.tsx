'use client'

import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@repo/core/utils'
import { usePrefersReducedMotion } from './motion'
import { RedLight } from './red-light'

export interface GraphiteOption<T extends string> {
  value: T
  label: string
  /** The quiet second line ("Drive it in"); hidden while the switch is pinned. */
  quiet?: string
  /**
   * The quiet line in the red tone, for something waiting on the person (the
   * garage's "2 waiting" under New, in place of the red number badge).
   */
  quietTone?: 'red'
  icon?: ReactNode
  /**
   * The icon alone on the top line, with the label drawn small under it where
   * a quiet line would be (the garage's Calendar). The label still names the
   * radio, so it needs no quiet line of its own.
   */
  iconOnly?: boolean
}

/**
 * The graphite mode switch (§1, §3): a recessed track with a raised
 * brushed-graphite key that slides to the choice with a small liquid stretch
 * (it reaches across both places, then settles), and a red light under it
 * once it has settled. Two-line options are 56 tall; `pinned` (the switch
 * stuck to the top on glass) shrinks them to 44 and hides the quiet line.
 * `size="sm"` is the small one-line switch that sits beside a heading (the
 * garage calendar's Month | Day): 36 tall, still a 44px target.
 *
 * A radiogroup, as ScSegmented is and for its reason: the choice narrows the
 * one list on screen, there are no panels. Arrow keys move the choice; only
 * the chosen option is a Tab stop. Each radio is named by its label alone,
 * with the quiet line as its description.
 */
export function GraphiteSwitch<T extends string>({
  value,
  onChange,
  options,
  pinned = false,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: GraphiteOption<T>[]
  pinned?: boolean
  size?: 'md' | 'sm'
  className?: string
  'aria-label': string
}) {
  const id = useId()
  const reduce = usePrefersReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const keyRef = useRef<HTMLSpanElement>(null)
  const placed = useRef<{ left: number; width: number } | null>(null)
  // The light comes on once the key has landed, not while it travels.
  const [lit, setLit] = useState(true)

  const index = Math.max(0, options.findIndex((option) => option.value === value))
  const small = size === 'sm'

  const place = useCallback(
    (animate: boolean) => {
      const track = trackRef.current
      const key = keyRef.current
      const button = track?.querySelectorAll<HTMLElement>('[role="radio"]')[index]
      if (!track || !key || !button) return
      const to = { left: button.offsetLeft, width: button.offsetWidth }
      const from = placed.current
      if (animate && from && !reduce && (from.left !== to.left || from.width !== to.width)) {
        const left = Math.min(from.left, to.left)
        const right = Math.max(from.left + from.width, to.left + to.width)
        key.animate(
          [
            { transform: `translateX(${from.left}px)`, width: `${from.width}px` },
            { transform: `translateX(${left}px) scaleY(0.92)`, width: `${right - left}px`, offset: 0.42 },
            { transform: `translateX(${to.left}px)`, width: `${to.width}px` },
          ],
          { duration: 460, easing: 'cubic-bezier(.3,.85,.25,1)' }
        )
      }
      key.style.transform = `translateX(${to.left}px)`
      key.style.width = `${to.width}px`
      placed.current = to
    },
    [index, reduce]
  )

  // Before paint, so the key is never drawn in the wrong place for a frame.
  useLayoutEffect(() => {
    place(placed.current !== null)
  }, [place])

  // The pinned switch is narrower inside; the key follows without a slide.
  useLayoutEffect(() => {
    place(false)
  }, [pinned, place])

  useEffect(() => {
    const track = trackRef.current
    if (!track || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => place(false))
    observer.observe(track)
    return () => observer.disconnect()
  }, [place])

  const choose = (next: T) => {
    if (next === value) return
    if (!reduce) {
      setLit(false)
      window.setTimeout(() => setLit(true), 300)
    }
    onChange(next)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (!forward && !back) return
    event.preventDefault()
    const next = (index + (forward ? 1 : -1) + options.length) % options.length
    choose(options[next].value)
    trackRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'fx-recessed relative grid',
        small ? 'rounded-[14px] p-[3px]' : 'rounded-[18px] p-1',
        className
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        ref={keyRef}
        aria-hidden="true"
        className={cn(
          'fx-graphite pointer-events-none absolute left-0 overflow-hidden',
          small ? 'inset-y-[3px] rounded-[11px]' : 'inset-y-1 rounded-[14px]'
        )}
      >
        <RedLight
          state={lit ? 'on' : 'off'}
          className={cn(
            'absolute left-1/2',
            small ? 'bottom-[3px] -ml-2 w-4' : '-ml-2.5',
            !small && (pinned ? 'bottom-[3px]' : 'bottom-1')
          )}
        />
      </span>
      {options.map((option, i) => {
        const selected = i === index
        // An icon-only option's label sits on the quiet line's place, and
        // goes with it when the switch is pinned (still naming the radio).
        const labelUnder = Boolean(option.iconOnly && option.icon)
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-labelledby={`${id}-${i}`}
            aria-describedby={option.quiet && !labelUnder ? `${id}-${i}-q` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => choose(option.value)}
            className={cn(
              'relative z-[1] grid content-center justify-center gap-x-1.5 gap-y-0.5 transition-[color,min-height] duration-200',
              'grid-cols-[auto_auto] items-center',
              small
                ? 'tap-target min-h-9 rounded-[11px] px-2.5'
                : cn('rounded-[14px] px-1', pinned ? 'min-h-9 pb-1' : 'min-h-12 pb-1.5'),
              selected ? 'text-text-primary' : 'text-[#8E8E98] hover:text-text-secondary'
            )}
          >
            {option.icon && (
              <span
                aria-hidden="true"
                className={cn(
                  'grid place-items-center [&_svg]:size-[18px]',
                  selected && 'drop-shadow-[0_0_4px_rgb(255_255_255/0.35)]',
                  labelUnder
                    ? 'col-span-2'
                    : // A tight three-way switch drops the icons below 400px,
                      // as the old one did, rather than wrap a label.
                      options.length > 2 && 'hidden min-[400px]:grid'
                )}
              >
                {option.icon}
              </span>
            )}
            <span
              id={`${id}-${i}`}
              className={cn(
                'whitespace-nowrap',
                labelUnder
                  ? cn(
                      'col-span-2 text-center text-t5',
                      selected ? 'font-semibold text-[#A8A8B2]' : 'font-medium text-[#8E8E98]',
                      pinned && 'sr-only'
                    )
                  : cn(
                      small ? 'text-[13px]' : 'text-[14px]',
                      selected ? 'font-semibold' : 'font-medium',
                      // With no icon beside it the label has the row to
                      // itself, so it centres over its quiet line.
                      !option.icon
                        ? 'col-span-2'
                        : options.length > 2
                          ? 'max-[399px]:col-span-2'
                          : undefined
                    )
              )}
            >
              {option.label}
            </span>
            {option.quiet && !labelUnder && (
              <span
                id={`${id}-${i}-q`}
                className={cn(
                  'col-span-2 whitespace-nowrap text-center text-t5 transition-colors',
                  option.quietTone === 'red'
                    ? 'font-semibold text-[#F45A66]'
                    : cn('font-medium', selected ? 'text-[#A8A8B2]' : 'text-[#8E8E98]'),
                  pinned && 'hidden'
                )}
              >
                {option.quiet}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
