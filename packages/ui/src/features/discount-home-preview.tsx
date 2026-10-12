'use client'

import type { ReactNode } from 'react'
import { IconUsers } from '@tabler/icons-react'
import { formatOfferFigure, stripOfferCode } from '@repo/core/offer-figure'
import type { OfferCardPreview } from '@repo/core/offer-preview'
import { cn } from '@repo/core/utils'
import { OfferCarousel, OfferCoupon } from '@repo/ui/home/offer-coupon'
import { ScCard } from '@repo/ui/sc/card'

export interface PreviewCard {
  key: string
  card: OfferCardPreview
}

interface DiscountHomePreviewProps {
  /**
   * The one being edited first, so it is the card in view, then the others
   * Home would show beside it; at most three. Empty while "Show on Home" is
   * off.
   */
  cards: PreviewCard[]
  /** "On Home", "Tap opens", "Order": what the card does, in plain words. */
  facts: { label: string; value: ReactNode }[]
  /** "Estimated reach: 214 customers" and the line explaining the count. */
  reach: { headline: ReactNode; detail: ReactNode; tone?: 'neutral' | 'warning' } | null
  className?: string
}

/**
 * The discount form's right-hand column: the coupon exactly as the customer's
 * Home draws it (the shared OfferCoupon, fed the same small print the server
 * writes), then who it reaches and what a tap does. Sticky on a wide screen,
 * so it stays beside the field being typed; under the form on a phone.
 */
export function DiscountHomePreview({
  cards,
  facts,
  reach,
  className,
}: DiscountHomePreviewProps) {
  return (
    <aside aria-label="Preview on Home" className={cn('flex flex-col gap-4', className)}>
      <ScCard className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">Preview on Home</h2>
          <span className="text-[11px] text-text-muted">Live as you type</span>
        </div>
        {/* A 390pt phone's column at every window width: 16px gutters, as
            Home has, so the ticket is the 358px a customer sees and a title
            breaks where it will on Home. Without the cap the carousel sizes
            its slides to the column, ~890px on a tablet, and the preview
            would show a title Home cuts short as fitting.

            Inert: OfferCoupon draws each ticket as a "use offer" button,
            which here would be a dead stop on the way to Save. What the card
            says is read out from the line below instead. */}
        {cards[0] && (
          <p className="sr-only">
            {describeCard(cards[0].card)}
            {cards.length > 1 &&
              ` ${cards.length - 1} more ${cards.length === 2 ? 'offer' : 'offers'} beside it.`}
          </p>
        )}
        <div
          inert
          className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[22px] border border-border bg-brand-black px-4 pb-5 pt-4"
        >
          {cards.length > 0 ? (
            <OfferCarousel label="Offers on Home">
              {cards.map(({ key, card }) => (
                <OfferCoupon
                  key={key}
                  eyebrow={card.eyebrow}
                  title={card.title}
                  metaLines={card.metaLines}
                  figure={card.figure}
                  code={card.code}
                />
              ))}
            </OfferCarousel>
          ) : (
            <p className="py-8 text-center text-[12px] text-text-muted">
              Switch on Show on Home to see the card customers will get.
            </p>
          )}
          {/* What sits under the offers on Home, so the card is seen in place. */}
          <div
            aria-hidden="true"
            className="mt-6 h-12 rounded-t-[22px] border border-b-0 border-border bg-surface px-4 pt-3 text-[12px] text-text-muted"
          >
            Your car
          </div>
        </div>
      </ScCard>

      {(reach || facts.length > 0) && (
        <ScCard className="flex flex-col gap-0 px-0 py-0">
          {reach && (
            <div className="flex items-start gap-3 px-4 py-4">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-secondary"
              >
                <IconUsers size={18} stroke={1.5} />
              </span>
              <div className="min-w-0" aria-live="polite">
                <p className="text-[15px] font-semibold text-text-primary">{reach.headline}</p>
                <p
                  className={cn(
                    'text-[12px]',
                    reach.tone === 'warning' ? 'text-warning' : 'text-text-secondary'
                  )}
                >
                  {reach.detail}
                </p>
              </div>
            </div>
          )}
          {facts.length > 0 && (
            <dl
              className={cn(
                'grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3.5 text-[12px]',
                reach && 'border-t border-border'
              )}
            >
              {facts.map((fact) => (
                <div key={fact.label} className="contents">
                  <dt className="text-text-muted">{fact.label}</dt>
                  <dd className="text-text-primary">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </ScCard>
      )}
    </aside>
  )
}

/** The draft card as one sentence, for a screen reader. */
function describeCard(card: OfferCardPreview): string {
  return [
    `${card.eyebrow.label} · Offer`,
    card.title,
    formatOfferFigure(card.figure).text,
    `Code ${card.code}`,
    // The coupon prints the code once, on the stub; so does this.
    ...card.metaLines.map((line) => stripOfferCode(line, card.code)).filter(Boolean),
  ].join('. ') + '.'
}
