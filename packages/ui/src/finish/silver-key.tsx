'use client'

import { useRef } from 'react'
import { cn } from '@repo/core/utils'
import { TierMedalIcon } from '@repo/ui/features/tier-medal'
import { replay } from './motion'
import { useT } from '@repo/core/i18n'

/**
 * The "Silver+ / Silver & Gold" key (§3): a two-line raised key that turns
 * brushed silver when on, with a coin-flip of its medal and one glint across
 * it. A toggle button (aria-pressed), named in full for screen readers since
 * "Silver+" alone says little. Only drawn while the tier filter is offered.
 */
export function SilverKey({
  on,
  onToggle,
  label,
  quiet,
  pinned = false,
  className,
}: {
  on: boolean
  onToggle: () => void
  /** "Silver+" */
  label: string
  /** "Silver & Gold" */
  quiet: string
  pinned?: boolean
  className?: string
}) {
  const t = useT()
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={on}
      aria-label={t('{label}: {quiet} garages only', { label, quiet })}
      onClick={() => {
        if (!on) {
          // The coin and the glint play when it turns on, never on the way off.
          const coin = ref.current?.querySelector('[data-coin]')
          coin?.classList.remove('fx-coin')
          void (coin as HTMLElement | undefined)?.offsetWidth
          coin?.classList.add('fx-coin')
          replay(ref.current?.querySelector('.fx-glint') ?? null)
        }
        onToggle()
      }}
      className={cn(
        'fx-press relative flex shrink-0 items-center gap-2.5 overflow-hidden rounded-[18px] pl-3.5 pr-4 text-left transition-[height,color] duration-200',
        pinned ? 'h-11' : 'h-14',
        on ? 'fx-silver' : 'fx-raised text-text-primary',
        className
      )}
    >
      <span aria-hidden="true" className="fx-glint" />
      <span aria-hidden="true" data-coin="" className="grid [perspective:60px] place-items-center">
        <TierMedalIcon tier="silver" size={18} />
      </span>
      <span aria-hidden="true" className="flex flex-col gap-0.5">
        <span className="whitespace-nowrap text-[14px] font-semibold">{label}</span>
        <span
          className={cn(
            'whitespace-nowrap text-t5 font-medium',
            on ? 'text-[#4A4E58]' : 'text-[#8E8E98]',
            pinned && 'hidden'
          )}
        >
          {quiet}
        </span>
      </span>
    </button>
  )
}
