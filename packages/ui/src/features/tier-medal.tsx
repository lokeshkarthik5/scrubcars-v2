'use client'

import { useId, useState } from 'react'
import { IconCircleCheck } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'
import {
  TIER_KEPT_LINE,
  TIER_LABELS,
  TIER_NOTES,
  tierMedalName,
  tierStandards,
  type Tier,
} from '@repo/core/tiers'
import { ScSheet } from '@repo/ui/sc/modal'

/**
 * The tier medals (0063): Bronze, Silver and Gold, the signs that replace
 * the "Documents verified" shield and the "Detlio Certified" seal. Customers
 * get only the medal the garage shows (the server's `tier`), never its
 * numbers.
 *
 * A small round medal on a ribbon, in a metal tone each, muted to sit on the
 * dark brand: never brand red (that is the one main action on a screen), and
 * no glow or motion.
 */

/** Each metal's light and dark stop, and the ribbon's colour. */
const METALS: Record<Tier, { light: string; dark: string; ribbon: string; text: string; chip: string }> = {
  bronze: { light: '#E0A672', dark: '#8A5528', ribbon: '#6B4424', text: 'text-[#E3AE7E]', chip: 'bg-[#E0A672]/12' },
  silver: { light: '#EEF1F4', dark: '#8B939C', ribbon: '#5B636C', text: 'text-[#D7DCE1]', chip: 'bg-[#D7DCE1]/10' },
  gold: { light: '#F6DB8A', dark: '#B0802A', ribbon: '#7D5A1C', text: 'text-[#F0D07A]', chip: 'bg-[#F0D07A]/12' },
}

/** The medal itself, drawn: a ribbon and a disc with a rim. Decorative. */
export function TierMedalIcon({ tier, size = 16, className }: { tier: Tier; size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const metal = METALS[tier]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      data-tier={tier}
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={metal.light} />
          <stop offset="1" stopColor={metal.dark} />
        </linearGradient>
      </defs>
      <path d="M4.2 0.8h2.6l1.6 4.2-2.3 1.1z" fill={metal.ribbon} />
      <path d="M11.8 0.8H9.2L7.6 5l2.3 1.1z" fill={metal.ribbon} opacity="0.85" />
      <circle cx="8" cy="10.2" r="5.2" fill={`url(#m${id})`} />
      <circle cx="8" cy="10.2" r="3.4" fill="none" stroke="#000" strokeOpacity="0.22" strokeWidth="0.9" />
    </svg>
  )
}

/**
 * On a garage card: the medal alone, right after the name, so it adds no
 * row and no width a 360px card does not have. Named for screen readers and
 * with a tooltip for a pointer ("Gold garage").
 */
export function TierMark({ tier, className }: { tier: Tier; className?: string }) {
  const name = tierMedalName(tier)
  return (
    <span role="img" aria-label={name} title={name} className={cn('inline-flex shrink-0', className)}>
      <TierMedalIcon tier={tier} size={16} />
    </span>
  )
}

/**
 * Inline with words, for a summary line (checkout, the Service History
 * certificate): the medal and "Gold".
 */
export function TierChip({ tier, className }: { tier: Tier; className?: string }) {
  const metal = METALS[tier]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        metal.chip,
        metal.text,
        className
      )}
    >
      <TierMedalIcon tier={tier} size={12} />
      {TIER_LABELS[tier]}
      <span className="sr-only"> garage</span>
    </span>
  )
}

/**
 * On the garage page: the medal with its words, one line on what it means,
 * and "What this means", which opens every standard behind it in plain
 * words (a tier meets every one below it too).
 */
export function TierSeal({ tier, className }: { tier: Tier; className?: string }) {
  const [open, setOpen] = useState(false)
  const metal = METALS[tier]
  const name = tierMedalName(tier)
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <div className="flex flex-wrap items-center gap-x-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 self-start rounded-md px-2 py-0.5 text-[12px] font-semibold',
            metal.chip,
            metal.text
          )}
        >
          <TierMedalIcon tier={tier} size={15} />
          {name}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap-target text-[12px] font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
        >
          What this means
        </button>
      </div>
      <p className="text-[11px] text-text-muted">{TIER_NOTES[tier]}</p>

      <ScSheet open={open} onClose={() => setOpen(false)} aria-label={`${name}: what this means`} className="px-4 pt-1">
        <div className="flex items-center gap-2 pt-2">
          <TierMedalIcon tier={tier} size={24} />
          <h2 className="text-[17px] font-semibold text-text-primary">{name}</h2>
        </div>
        <p className="mt-1.5 text-[13px] text-text-secondary">Detlio shows this medal on a garage that:</p>
        {tierStandards(tier).map((group) => (
          <section key={group.tier} className="mt-3" aria-label={`${TIER_LABELS[group.tier]} standards`}>
            {tier !== 'bronze' && (
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-text-muted">
                <TierMedalIcon tier={group.tier} size={12} />
                {TIER_LABELS[group.tier]}
              </p>
            )}
            <ul className="flex flex-col gap-2.5">
              {group.lines.map((line) => (
                <li key={line} className="flex items-start gap-2 text-[13px] leading-snug text-text-primary">
                  <IconCircleCheck size={16} aria-hidden="true" className="mt-px shrink-0 text-success" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="mt-3 text-[12px] text-text-muted">{TIER_KEPT_LINE}</p>
      </ScSheet>
    </div>
  )
}
