'use client'

import { IconCheck, IconClock, IconEye } from '@tabler/icons-react'
import { DetlioMark } from '@repo/ui/sc/rating-marks'
import { StatusChip } from '@repo/ui/sc/status-chip'
import type { CustomerRepairQuote } from '@repo/core/api/repair-quotes'
import { useT, useTn } from '@repo/core/i18n'
import { priceRangeLabel } from '@repo/core/repair-quotes'
import { ScCard } from '@/components/ui/card'

/** "d. 4.8 (126) · 2.1 km", or "New on Detlio · 2.1 km" under three counted reviews. */
export function GarageLine({ quote }: { quote: CustomerRepairQuote }) {
  const t = useT()
  const km = `${quote.distanceKm.toFixed(1)} km`
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-t4 text-text-secondary">
      {quote.garage.rating !== null ? (
        <>
          <DetlioMark size={14} rating={quote.garage.rating} className="self-baseline text-text-primary" />
          <span aria-hidden="true" className="font-numeric font-medium text-text-primary">{quote.garage.rating.toFixed(1)}</span>
          <span className="font-numeric">({quote.garage.reviewCount})</span>
          <span aria-hidden="true">·</span>
        </>
      ) : (
        <>
          <span>{t('New on Detlio')}</span>
          <span aria-hidden="true">·</span>
        </>
      )}
      <span className="font-numeric">{km}</span>
    </span>
  )
}

/**
 * One garage's "Can do": the estimate, the days, whether it must see the car
 * first, its "Final bills match quotes" badge, its note, and Book a visit
 * (only while the request is open).
 */
export function QuoteCard({
  quote,
  canBook,
  onBook,
}: {
  quote: CustomerRepairQuote
  canBook: boolean
  onBook: (quote: CustomerRepairQuote) => void
}) {
  const t = useT()
  const tn = useTn()
  const titleId = `quote-${quote.id}`
  return (
    <ScCard role="region" aria-labelledby={titleId} data-repair-quote="" className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span id={titleId} className="block truncate text-t3 font-semibold text-text-primary">
            {quote.garage.name}
          </span>
          <GarageLine quote={quote} />
        </span>
        <StatusChip tone="done">{t('Can do')}</StatusChip>
      </div>
      <div className="flex items-baseline gap-3.5">
        <span className="font-numeric text-[22px] font-semibold leading-none text-text-primary">
          {priceRangeLabel(quote.priceFrom ?? 0, quote.priceTo ?? 0)}
        </span>
        {quote.days !== null && (
          <span className="flex items-center gap-1 text-t4 text-[#A8A8B2]">
            <IconClock size={14} aria-hidden />
            <span className="font-numeric">{tn(quote.days, '{count} day', '{count} days')}</span>
          </span>
        )}
      </div>
      {(quote.needsInspection || quote.billsMatchQuotes) && (
        <div className="flex flex-wrap gap-1.5">
          {quote.needsInspection && (
            <span className="fx-raised inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-t5 font-medium text-[#D4D4DA]">
              <IconEye size={13} aria-hidden />
              {t('Needs to see the car')}
            </span>
          )}
          {quote.billsMatchQuotes && (
            <span className="fx-raised inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-t5 font-medium text-[#D4D4DA]">
              <IconCheck size={13} aria-hidden className="text-success" />
              {t('Final bills match quotes')}
            </span>
          )}
        </div>
      )}
      {quote.note && <p className="text-t4 text-[#A1A1AA]">“{quote.note}”</p>}
      {canBook && (
        <button
          type="button"
          onClick={() => onBook(quote)}
          aria-label={t('Book a visit at {garage}', { garage: quote.garage.name })}
          className="flex h-11 items-center justify-center rounded-full border border-white/25 text-t4 font-semibold text-text-primary transition-colors hover:bg-surface"
        >
          {t('Book a visit')}
        </button>
      )}
    </ScCard>
  )
}

/** A garage that can't do it, or hasn't answered: a single line. */
export function QuoteLine({ quote }: { quote: CustomerRepairQuote }) {
  const t = useT()
  const word =
    quote.state === 'declined' ? t('Can’t do') : quote.state === 'waiting' ? t('Waiting') : t('No answer')
  return (
    <ScCard className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-t3 font-medium text-[#D4D4DA]">{quote.garage.name}</span>
        {quote.state === 'declined' && quote.declineReason ? (
          <span className="block text-t4 text-dim">“{quote.declineReason}”</span>
        ) : (
          <GarageLine quote={quote} />
        )}
      </span>
      <StatusChip tone="closed">{word}</StatusChip>
    </ScCard>
  )
}
