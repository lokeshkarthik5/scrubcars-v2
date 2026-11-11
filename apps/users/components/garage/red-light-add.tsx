'use client'

import { useRef } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'
import { usePrefersReducedMotion } from '@repo/ui/finish/motion'
import { useT } from '@repo/core/i18n'

/**
 * Sends a small white dot from a just-added button to the booking bar
 * (`[data-fly-target]`), or towards the bottom of the screen while the bar
 * is still rising. One arc, gone on landing; nothing under reduced motion.
 */
export function flyToBookingBar(from: HTMLElement | null) {
  if (!from || typeof document === 'undefined' || !document.body.animate) return
  const start = from.getBoundingClientRect()
  const target = document.querySelector<HTMLElement>('[data-fly-target]')?.getBoundingClientRect()
  const x0 = start.left + start.width / 2
  const y0 = start.top + start.height / 2
  const x1 = target ? target.left + 40 : Math.min(window.innerWidth, 428) / 4
  const y1 = target ? target.top + target.height / 2 : window.innerHeight - 46
  const dot = document.createElement('i')
  dot.className = 'gp-flydot'
  dot.setAttribute('aria-hidden', 'true')
  document.body.appendChild(dot)
  const flight = dot.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
      {
        transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 60}px) scale(0.8)`,
        opacity: 1,
        offset: 0.5,
      },
      { transform: `translate(${x1}px, ${y1}px) scale(0.4)`, opacity: 0 },
    ],
    { duration: 520, easing: 'cubic-bezier(.5,0,.3,1)' }
  )
  flight.onfinish = () => dot.remove()
  flight.oncancel = () => dot.remove()
}

/**
 * The red-light Add (§1, §5): a graphite button with a red + and a dim red
 * light waiting under it; once added it reads "Added", the light switches
 * fully on, a tick draws itself and a small dot flies to the booking bar.
 * Red only as light: the solid red button is Book now's alone.
 *
 * A toggle (aria-pressed), named in full so five Adds on a page are five
 * different things to a screen reader; 44px tall to the thumb; the same
 * width in both states so nothing shifts under the finger.
 */
export function RedLightAdd({
  name,
  added,
  onToggle,
  disabled = false,
  fly = true,
  className,
}: {
  name: string
  added: boolean
  onToggle: () => void
  disabled?: boolean
  /** The dot to the booking bar: on the garage page, not at checkout. */
  fly?: boolean
  className?: string
}) {
  const t = useT()
  const ref = useRef<HTMLButtonElement>(null)
  const reduce = usePrefersReducedMotion()
  return (
    <button
      ref={ref}
      type="button"
      aria-label={added ? t('Remove {name} from booking', { name }) : t('Add {name} to booking', { name })}
      aria-pressed={added}
      disabled={disabled}
      onClick={() => {
        if (!added && fly && !reduce) flyToBookingBar(ref.current)
        onToggle()
      }}
      className={cn(
        'gp-add relative z-10 inline-flex h-11 min-w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-[12px] px-3.5 pb-[3px] text-t4 font-semibold text-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70 disabled:opacity-50',
        className
      )}
    >
      {added ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="gp-add__tick size-[15px] shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      ) : (
        <IconPlus size={15} stroke={2.2} aria-hidden="true" className="gp-add__plus shrink-0" />
      )}
      {added ? t('Added') : t('Add')}
      <span aria-hidden="true" className="gp-add__light" />
    </button>
  )
}
