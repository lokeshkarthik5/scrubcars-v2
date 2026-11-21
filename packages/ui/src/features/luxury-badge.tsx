'use client'

import { Fragment, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { IconCircleCheck, IconSteeringWheel } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'
import { fill, useT } from '@repo/core/i18n'
import {
  LUXURY_BADGE_LABEL,
  LUXURY_NAME,
  LUXURY_SHEET_BRANDS,
  LUXURY_SHEET_FOOT,
  LUXURY_SHEET_INTRO,
  LUXURY_STANDARDS,
  handlesBrands,
} from '@repo/core/luxury'
import { ScSheet } from '@repo/ui/sc/modal'

/**
 * Luxury car specialists (0083, owner-approved screens 21 Nov 2026): the
 * quiet grey badge a garage the Detlio team approved for luxury cars shows.
 * Never red, never a metal: it sits apart from the Bronze / Silver / Gold
 * medal (tier-medal.tsx), which stays exactly where it was. The native twin
 * is apps/users-app/components/garage/luxury.tsx.
 */

const noSubscribe = () => () => undefined

/** True once in the browser (false in the server's HTML), for the sheet's portal. */
function useInBrowser(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false)
}

/** The badge's mark: a steering wheel, in the chip's own grey. */
export function LuxuryIcon({ size = 13, className }: { size?: number; className?: string }) {
  return <IconSteeringWheel size={size} aria-hidden="true" className={className} />
}

/** On a garage card, with "Comes to you too" and the other chips: "Luxury specialist". */
export function LuxuryCardChip({ className }: { className?: string }) {
  const t = useT()
  return (
    <span
      className={cn(
        'fx-raised inline-flex h-[26px] items-center gap-1.5 rounded-pill px-2.5 text-t4 font-medium text-[#D4D4DA]',
        className
      )}
    >
      <LuxuryIcon size={13} className="text-[#A8A8B2]" />
      {t(LUXURY_BADGE_LABEL)}
    </span>
  )
}

/**
 * On the garage page, under the area and the medal: the badge with "What
 * this means", and "Handles BMW · Mercedes-Benz · …" with the customer's own
 * make in white. "What this means" opens a sheet built like the medal's:
 * what Detlio checked, the brands, and that prices are the same for
 * everyone.
 */
export function LuxuryBlock({
  brands,
  customerMake,
  className,
}: {
  brands: readonly string[]
  /** The customer's main car's make as they typed it ("benz"), or null. */
  customerMake?: string | null
  className?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const named = handlesBrands(brands, customerMake)
  const name = t(LUXURY_NAME)
  const inBrowser = useInBrowser()
  // On document.body: the garage page's sections arrive with an animation
  // that leaves a transform behind, which would pin a fixed sheet inside the
  // section instead of the screen.
  const sheet = (
    <ScSheet
      open={open}
      onClose={() => setOpen(false)}
      aria-label={t('{name}: what this means', { name })}
      className="px-4 pt-1"
    >
      <div className="flex items-center gap-2 pt-2">
        <LuxuryIcon size={24} className="text-text-primary" />
        <h2 className="text-[17px] font-semibold text-text-primary">{name}</h2>
      </div>
      <p className="mt-1.5 text-[13px] text-text-secondary">{t(LUXURY_SHEET_INTRO)}</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {LUXURY_STANDARDS.map((line) => (
          <li key={line} className="flex items-start gap-2 text-[13px] leading-snug text-text-primary">
            <IconCircleCheck size={16} aria-hidden="true" className="mt-px shrink-0 text-success" />
            <span>{t(line)}</span>
          </li>
        ))}
      </ul>
      {named.length > 0 && (
        <section className="mt-4" aria-label={t(LUXURY_SHEET_BRANDS)}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-text-muted">
            {t(LUXURY_SHEET_BRANDS)}
          </p>
          <ul className="flex flex-wrap gap-2">
            {named.map((item) => (
              <li
                key={item.brand}
                className={cn(
                  'rounded-pill border px-3 py-1 text-[13px] font-medium',
                  item.mine ? 'border-white/40 text-text-primary' : 'border-white/12 text-[#D4D4DA]'
                )}
              >
                {item.brand}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-4 text-[12px] text-text-muted">{t(LUXURY_SHEET_FOOT)}</p>
    </ScSheet>
  )
  return (
    <div className={cn('flex flex-col gap-1', className)} data-luxury-block="">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="inline-flex items-center gap-1.5 self-start rounded-md bg-white/[0.07] px-2 py-0.5 text-[12px] font-semibold text-[#D7D7DD]">
          <LuxuryIcon size={15} className="text-[#B4B4BC]" />
          {t(LUXURY_BADGE_LABEL)}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap-target text-[12px] font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
        >
          {t('What this means')}
        </button>
      </div>
      {named.length > 0 && (
        <p className="text-[12px] leading-snug text-text-muted">
          {fill(t('Handles {brands}'), {
            brands: (
              <>
                {named.map((item, i) => (
                  <Fragment key={item.brand}>
                    {i > 0 && ' · '}
                    <span className={item.mine ? 'font-semibold text-text-primary' : undefined}>{item.brand}</span>
                  </Fragment>
                ))}
              </>
            ),
          })}
        </p>
      )}

      {inBrowser && createPortal(sheet, document.body)}
    </div>
  )
}
