'use client'

import { useState } from 'react'
import { IconCircleCheck, IconRosetteDiscountCheckFilled } from '@tabler/icons-react'
import {
  CERTIFIED_KEPT_LINE,
  CERTIFIED_LABEL,
  CERTIFIED_NOTE,
  CERTIFIED_STANDARDS,
} from '@repo/core/certification'
import { cn } from '@repo/core/utils'
import { ScSheet } from '@repo/ui/sc/modal'

/**
 * The "Detlio Certified" seal (0048): the garage meets Detlio's standards and
 * passed an in-person check. Customers get only whether it is certified,
 * never its numbers.
 *
 * A rosette in the brand white: calmer than the success-green documents
 * shield it stands in for on a card, and never brand red (that is the one
 * main action on a screen).
 */

/**
 * On a garage card: the rosette alone, right after the name, in place of the
 * documents shield (certification needs the documents, so one sign says
 * both). No new row and no width a 360px card does not have. Named for
 * screen readers and with a tooltip for a pointer.
 */
export function CertifiedMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={CERTIFIED_LABEL}
      title={CERTIFIED_LABEL}
      className={cn('inline-flex shrink-0 text-text-primary', className)}
    >
      <IconRosetteDiscountCheckFilled size={16} aria-hidden="true" />
    </span>
  )
}

/**
 * On the garage page: the seal with its words, one line on what it means,
 * and "What this means", which opens the standards in plain words.
 */
export function CertifiedSeal({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="inline-flex items-center gap-1 self-start rounded-md bg-surface-elevated px-2 py-0.5 text-[12px] font-semibold text-text-primary">
          <IconRosetteDiscountCheckFilled size={14} aria-hidden="true" className="shrink-0" />
          {CERTIFIED_LABEL}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap-target text-[12px] font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
        >
          What this means
        </button>
      </div>
      <p className="text-[11px] text-text-muted">{CERTIFIED_NOTE}</p>

      <ScSheet open={open} onClose={() => setOpen(false)} aria-label={`${CERTIFIED_LABEL}: what this means`} className="px-4 pt-1">
        <div className="flex items-center gap-2 pt-2">
          <IconRosetteDiscountCheckFilled size={22} aria-hidden="true" className="shrink-0 text-text-primary" />
          <h2 className="text-[17px] font-semibold text-text-primary">{CERTIFIED_LABEL}</h2>
        </div>
        <p className="mt-1.5 text-[13px] text-text-secondary">A certified garage:</p>
        <ul className="mt-2 flex flex-col gap-2.5">
          {CERTIFIED_STANDARDS.map((line) => (
            <li key={line} className="flex items-start gap-2 text-[13px] leading-snug text-text-primary">
              <IconCircleCheck size={16} aria-hidden="true" className="mt-px shrink-0 text-success" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-text-muted">{CERTIFIED_KEPT_LINE}</p>
      </ScSheet>
    </div>
  )
}
