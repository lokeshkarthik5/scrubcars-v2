import type { ReactNode } from 'react'
import { ScCard } from '@repo/ui/sc/card'
import { formatOfferFigure } from '@repo/core/offer-figure'
import type { CouponReward } from '@repo/core/coupons'
import { cn } from '@repo/core/utils'

interface CouponTicketProps {
  reward: CouponReward
  title: string
  conditions: string[]
  /** Rupees off, or a free wash's ceiling, for the stub's figure. */
  amountOff?: number | null
  percentOff?: number | null
  stamps?: number | null
  /** The printed code, or a voucher's own code. */
  code?: string | null
  /** A used, expired or withdrawn coupon steps back. */
  dimmed?: boolean
  /** The page's heading level for the title. */
  as?: 'h1' | 'h2' | 'h3'
  children?: ReactNode
}

/** The stub's figure: "₹100", "20%", "FREE" or "+2". */
function figureOf(props: CouponTicketProps): { text: string; under: string } {
  switch (props.reward) {
    case 'amount':
      return { text: formatOfferFigure({ kind: 'amount', rupees: props.amountOff ?? 0 }).text, under: 'off' }
    case 'percent':
      return { text: formatOfferFigure({ kind: 'percent', value: props.percentOff ?? 0 }).text, under: 'off' }
    case 'free_wash':
      return { text: 'FREE', under: 'car wash' }
    case 'stamps':
      return { text: `+${props.stamps ?? 0}`, under: props.stamps === 1 ? 'stamp' : 'stamps' }
  }
}

/**
 * A Detlio coupon as a ticket: the figure on a stub, then what it is and
 * every condition, in the words the server generated from the batch (never
 * typed by anyone). Quiet on purpose: the page's one red button is below it.
 */
export function CouponTicket(props: CouponTicketProps) {
  const figure = figureOf(props)
  const Heading = props.as ?? 'h2'
  return (
    <ScCard className={cn('flex items-stretch overflow-hidden p-0', props.dimmed && 'opacity-60')}>
      <div className="flex w-[96px] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-dashed border-border bg-surface-elevated px-2 py-4 text-center">
        <span className="font-numeric text-[26px] font-bold leading-none text-text-primary">{figure.text}</span>
        <span className="text-[11px] text-text-secondary">{figure.under}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 py-3.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Detlio coupon</p>
        <Heading className="text-[15px] font-semibold leading-snug text-text-primary">{props.title}</Heading>
        <ul className="flex flex-col gap-0.5 text-[12px] text-text-secondary">
          {props.conditions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {props.code && <p className="font-numeric text-[12px] tracking-wide text-text-primary">{props.code}</p>}
        {props.children}
      </div>
    </ScCard>
  )
}
