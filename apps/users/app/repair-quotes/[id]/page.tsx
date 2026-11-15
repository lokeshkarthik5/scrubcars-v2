'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { IconCalendarCheck } from '@tabler/icons-react'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { StatusChip } from '@repo/ui/sc/status-chip'
import type { CustomerRepairQuote, CustomerRepairRequest } from '@repo/core/api/repair-quotes'
import { useCancelRepairRequest, useMyRepairRequest } from '@repo/core/api/hooks/use-repair-quotes'
import { useNow } from '@repo/core/hooks/use-now'
import { useT, useTn } from '@repo/core/i18n'
import { CUSTOMER_QUOTE_WORD, QUOTE_TONE, showsQuotes } from '@repo/core/repair-quotes'
import { CustomerShell } from '@/components/customer-shell'
import { AnswerByRing } from '@/components/moments/answer-by-ring'
import { ScCard } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { BookVisitSheet } from '@/components/repair-quotes/book-visit-sheet'
import { BoxedPhoto } from '@/components/repair-quotes/boxed-photo'
import { QuoteCard, QuoteLine } from '@/components/repair-quotes/quote-card'

/**
 * One repair request (0076): while no garage has answered, "Sent to N
 * garages" with the answer-by ring and each garage's state; once any has,
 * the quotes — each garage's estimate, days, "Needs to see the car", rating,
 * distance, note and "Final bills match quotes" — with Book a visit. Cancel
 * while it is open. Pushes about it open here. Signed-in customers only.
 */
export default function RepairRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useT()
  const { id } = use(params)
  const request = useMyRepairRequest(id)
  const now = useNow(1000)

  return (
    <CustomerShell showNav className="gap-4 py-2">
      <PageHeader title={t('Repair quotes')} backHref="/repair-quotes/new" />
      {request.isPending ? (
        <SkeletonCard />
      ) : !request.data ? (
        <ErrorState
          message={t('Couldn’t load this request. Check your connection.')}
          onRetry={() => void request.refetch()}
        />
      ) : (
        <RequestBody request={request.data} now={now} />
      )}
    </CustomerShell>
  )
}

function RequestBody({ request, now }: { request: CustomerRepairRequest; now: number }) {
  const t = useT()
  const tn = useTn()
  const cancel = useCancelRepairRequest()
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | undefined>()
  const [booking, setBooking] = useState<CustomerRepairQuote | null>(null)
  const open = request.state === 'open'
  const quoted = request.quotes.filter((quote) => quote.state === 'quoted')
  const others = request.quotes.filter((quote) => quote.state !== 'quoted')
  const car = request.vehicle.label.split(' ').slice(1).join(' ') || request.vehicle.label
  const thumb = request.photos[request.brief.box?.image ?? 0] ?? request.photos[0]

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-1 pb-1">
        <p className="text-t4 text-dim">
          {request.vehicle.label} · {request.title}
        </p>
        {showsQuotes(request) ? (
          <>
            <h2 className="text-title font-semibold text-text-primary">
              {quoted.length === 0
                ? t('No quotes yet for your {car}', { car })
                : tn(quoted.length, '{count} quote for your {car}', '{count} quotes for your {car}', { car })}
            </h2>
            <p className="text-t3 text-text-secondary">
              {t('Estimates from your video. The garage sets the final price once it sees the car.')}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-title font-semibold text-text-primary">
                {tn(request.sentTo, 'Sent to {count} garage', 'Sent to {count} garages')}
              </h2>
              {open && request.answerBy && (
                <AnswerByRing deadline={{ respondBy: request.answerBy, windowMins: request.answerWindowMins }} now={now} />
              )}
            </div>
            {open && (
              <p className="text-t3 text-text-secondary">
                {t('Answers within {hours} working hours. We’ll tell you as each one comes in.', {
                  hours: request.answerWindowMins / 60,
                })}
              </p>
            )}
          </>
        )}
      </section>

      <StateBanner request={request} />

      {showsQuotes(request) ? (
        <>
          {quoted.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} canBook={open} onBook={setBooking} />
          ))}
          {others.map((quote) => (
            <QuoteLine key={quote.id} quote={quote} />
          ))}
        </>
      ) : (
        <>
          <section aria-label={t('Garages asked')} className="hub-card px-5">
            <ul className="divide-y divide-line">
              {request.quotes.map((quote) => (
                <li key={quote.id} className="flex min-h-14 items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-t3 text-text-primary">{quote.garage.name}</span>
                  <StatusChip tone={QUOTE_TONE[quote.state]}>{t(CUSTOMER_QUOTE_WORD[quote.state])}</StatusChip>
                </li>
              ))}
            </ul>
          </section>
          <ScCard className="flex items-center gap-3">
            {thumb && (
              <BoxedPhoto src={thumb.url} alt={t('Your car')} box={null} className="h-14 w-[76px] shrink-0 rounded-[10px]" />
            )}
            <p className="text-t4 text-text-secondary">{request.brief.text}</p>
          </ScCard>
        </>
      )}

      {open && (
        <>
          <p className="text-center text-t4 text-dim">
            {t('Quotes stay open for {hours} hours.', { hours: 48 })}
          </p>
          <button
            type="button"
            onClick={() => setCancelling(true)}
            className="mx-auto min-h-11 px-3 text-[14px] text-[#A1A1AA] underline-offset-4 hover:underline"
          >
            {t('Cancel request')}
          </button>
        </>
      )}

      <ConfirmSheet
        open={cancelling}
        onClose={() => {
          setCancelling(false)
          setCancelError(undefined)
        }}
        onConfirm={async () => {
          try {
            await cancel.mutateAsync(request.id)
            setCancelling(false)
          } catch (err) {
            setCancelError(err instanceof Error ? err.message : t('Couldn’t cancel it. Try again.'))
          }
        }}
        level="light"
        title={t('Cancel this request?')}
        body={t('Garages stop seeing it and can’t send quotes. Nothing was paid.')}
        confirmLabel={t('Cancel request')}
        cancelLabel={t('Keep it')}
        busy={cancel.isPending}
        error={cancelError}
      />

      <BookVisitSheet requestId={request.id} quote={booking} onClose={() => setBooking(null)} />
    </div>
  )
}

/** Booked, cancelled or closed: said once, above the garages. */
function StateBanner({ request }: { request: CustomerRepairRequest }) {
  const t = useT()
  if (request.state === 'booked') {
    const garage = request.quotes.find((quote) => quote.bookingId)?.garage.name
    return (
      <ScCard className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <IconCalendarCheck size={18} aria-hidden className="shrink-0 text-success" />
          <span className="text-t4 text-text-primary">
            {garage ? t('Visit booked at {garage}', { garage }) : t('Visit booked')}
          </span>
        </span>
        {request.bookingId && (
          <Link href={`/bookings/${request.bookingId}`} className="flex min-h-11 shrink-0 items-center text-t4 font-semibold text-text-primary underline-offset-4 hover:underline">
            {t('See booking')}
          </Link>
        )}
      </ScCard>
    )
  }
  if (request.state === 'cancelled' || request.state === 'expired') {
    return (
      <ScCard className="flex items-center justify-between gap-3">
        <span className="text-t4 text-text-secondary">
          {request.state === 'cancelled' ? t('You cancelled this request.') : t('This request has closed.')}
        </span>
        <Link href="/repair-quotes/new" className="flex min-h-11 shrink-0 items-center text-t4 font-semibold text-text-primary underline-offset-4 hover:underline">
          {t('Send a new one')}
        </Link>
      </ScCard>
    )
  }
  return null
}
