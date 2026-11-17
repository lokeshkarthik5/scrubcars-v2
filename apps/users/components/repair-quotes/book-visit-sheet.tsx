'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconClock, IconInfoCircle } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScSheet } from '@repo/ui/sc/modal'
import { RedLight } from '@repo/ui/finish/red-light'
import type { CustomerRepairQuote } from '@repo/core/api/repair-quotes'
import { useBookRepairVisit, useRepairVisitTimes } from '@repo/core/api/hooks/use-repair-quotes'
import { useT, useTn } from '@repo/core/i18n'
import { nextFreeDayLabel, nextFreeTimeLabels, upcomingNextFree } from '@repo/core/next-free'
import { priceRangeLabel } from '@repo/core/repair-quotes'
import { cn } from '@repo/core/utils'

/**
 * Book a visit (0076): the garage looks at the car and confirms the price
 * before any work. Booked as today's "price on inspection" visit with no
 * fee (0073): the inspection is free, nothing is paid now, the garage's
 * estimate is shown as the guide, and its final bill (with extra work
 * needing the customer's OK) is the price. The times are the garage's next
 * free ones for that visit.
 */
export function BookVisitSheet({
  requestId,
  quote,
  onClose,
}: {
  requestId: string
  quote: CustomerRepairQuote | null
  onClose: () => void
}) {
  const t = useT()
  const tn = useTn()
  const router = useRouter()
  const times = useRepairVisitTimes(requestId, quote?.id ?? null)
  const book = useBookRepairVisit(requestId)
  const [picked, setPicked] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const free = upcomingNextFree(times.data)
  const chosen = picked && free?.times.includes(picked) ? picked : null

  const close = () => {
    setPicked(null)
    setError(null)
    onClose()
  }

  const confirm = async () => {
    if (!quote || !chosen) return
    setError(null)
    try {
      const { bookingId } = await book.mutateAsync({ quoteId: quote.id, scheduledAt: chosen })
      router.push(`/bookings/${bookingId}`)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('Couldn’t book the visit. Try again.'))
    }
  }

  return (
    <ScSheet open={quote !== null} onClose={close} dismissible={!book.isPending} aria-label={t('Book a visit')}>
      {quote && (
        <div className="flex flex-col px-4">
          <h2 className="pt-1 text-t2 font-semibold text-text-primary">
            {t('Book a visit at {garage}', { garage: quote.garage.name })}
          </h2>
          <p className="mt-1 text-t4 text-text-secondary">
            {t('They look at the car and confirm the price before any work.')}
          </p>
          <dl className="mt-2 divide-y divide-line">
            <div className="flex min-h-12 items-center justify-between">
              <dt className="text-t3 text-text-primary">{t('Inspection')}</dt>
              <dd className="font-numeric text-t3 text-text-primary">{t('Free')}</dd>
            </div>
            <div className="flex min-h-12 items-center justify-between">
              <dt className="text-t3 text-text-primary">{t('Their estimate')}</dt>
              <dd className="font-numeric text-t3 text-text-primary">{priceRangeLabel(quote.priceFrom ?? 0, quote.priceTo ?? 0)}</dd>
            </div>
            {quote.days !== null && (
              <div className="flex min-h-12 items-center justify-between">
                <dt className="text-t3 text-text-primary">{t('Days needed')}</dt>
                <dd className="font-numeric text-t3 text-text-primary">{tn(quote.days, '{count} day', '{count} days')}</dd>
              </div>
            )}
          </dl>

          <div className="mt-3.5 flex flex-col gap-2">
            {times.isPending ? (
              <div className="h-[76px] rounded-[12px] shimmer" />
            ) : !free ? (
              <p className="text-t4 text-text-secondary">
                {t('No free time at this garage this week. Try another garage.')}
              </p>
            ) : (
              <>
                <p className="flex items-center gap-1.5">
                  <IconClock size={14} aria-hidden className="text-success drop-shadow-[0_0_4px_rgb(34_197_94/0.5)]" />
                  <span className="text-over font-semibold uppercase text-[#9A9AA3]">{t('Next free')}</span>
                  <span aria-hidden="true" className="text-over text-[#8E8E98]">·</span>
                  <span className="text-over font-semibold uppercase text-[#E8E8EC]">{t(nextFreeDayLabel(free))}</span>
                </p>
                <div role="radiogroup" aria-label={t('Visit time')} className="flex gap-2">
                  {free.times.map((time, i) => (
                    <button
                      key={time}
                      type="button"
                      role="radio"
                      aria-checked={chosen === time}
                      onClick={() => setPicked(time)}
                      className={cn(
                        'fx-press relative flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-[12px] px-1.5 font-numeric text-t4 font-semibold',
                        chosen === time ? 'fx-graphite text-white' : 'fx-raised text-[#E8E8EC]'
                      )}
                    >
                      {nextFreeTimeLabels(free)[i]}
                      <RedLight state={chosen === time ? 'on' : 'off'} className="absolute bottom-1 left-1/2 -ml-2.5" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <p className="my-3.5 flex items-start gap-1.5 text-t5 text-dim">
            <IconInfoCircle size={14} aria-hidden className="mt-px shrink-0" />
            {t('The final price is set at the garage. Anything more than the bill needs your OK in the app first.')}
          </p>
          {error && (
            <p role="alert" className="mb-2 text-t4 text-error">
              {error}
            </p>
          )}
          <ScButton
            variant="main"
            size="lg"
            onClick={() => void confirm()}
            disabled={!chosen || book.isPending}
            disabledReason={free && !chosen ? t('Pick a time first') : undefined}
          >
            {book.isPending ? t('Booking…') : t('Book visit · Free')}
          </ScButton>
        </div>
      )}
    </ScSheet>
  )
}
