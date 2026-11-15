'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconPlayerPlayFilled, IconX } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useT } from '@repo/core/i18n'
import { msg } from '@repo/core/i18n/translate'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScModal, ScSheet } from '@repo/ui/sc/modal'
import type { GarageRepairQuote } from '@repo/core/api/repair-quotes'
import { useAnswerRepairQuote } from '@repo/core/api/hooks/use-repair-quotes'
import { REPAIR_QUOTE_RULES, priceRangeLabel, timeLeftLabel } from '@repo/core/repair-quotes'

/** The car type as the garage prices it (English, shown as `t(…)`). */
const CAR_TYPE: Record<string, string> = {
  hatchback: msg('hatchback'),
  sedan: msg('sedan'),
  suv: msg('SUV'),
}

/** "Maruti Swift · hatchback", in the language in use. */
export function carLine(quote: Pick<GarageRepairQuote, 'vehicle'>, t: (english: string) => string) {
  const type = CAR_TYPE[quote.vehicle.type]
  return `${quote.vehicle.label} · ${type ? t(type) : quote.vehicle.type}`
}

/**
 * The video and pictures of a repair request, small, in a row: a tap opens
 * one large (the video plays with its controls). Links are short-lived and
 * private; nothing is downloaded.
 */
export function RepairMediaRow({ quote }: { quote: GarageRepairQuote }) {
  const t = useT()
  const [open, setOpen] = useState<{ kind: 'video' | 'photo'; url: string } | null>(null)
  return (
    <>
      <div className="flex gap-2 overflow-x-auto">
        {quote.video && (
          <button
            type="button"
            onClick={() => setOpen({ kind: 'video', url: quote.video!.url })}
            aria-label={t('Play the video, {secs} seconds', { secs: quote.video.secs ?? 0 })}
            className="relative block h-[72px] w-24 shrink-0 overflow-hidden rounded-[12px] bg-surface-elevated"
          >
            {quote.photos[0] && (
              // The first frame stands in as the video's poster.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quote.photos[0].url} alt="" className="h-full w-full object-cover" />
            )}
            <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-white">
              <IconPlayerPlayFilled size={20} />
            </span>
            {quote.video.secs !== null && (
              <span className="absolute bottom-1 left-1.5 font-numeric text-[11px] font-semibold text-white">
                0:{String(quote.video.secs).padStart(2, '0')}
              </span>
            )}
          </button>
        )}
        {quote.photos.map((photo, index) => (
          <button
            key={photo.url || index}
            type="button"
            onClick={() => setOpen({ kind: 'photo', url: photo.url })}
            aria-label={t('Open picture {n}', { n: index + 1 })}
            className="block size-[72px] shrink-0 overflow-hidden rounded-[12px] bg-surface-elevated"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      <ScModal open={open !== null} onClose={() => setOpen(null)} aria-label={t('The damage')} className="max-w-[440px] p-2">
        {open && (
          <div className="relative">
            {open.kind === 'video' ? (
              <video src={open.url} controls autoPlay playsInline className="max-h-[70vh] w-full rounded-[14px] bg-black" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.url} alt={t('The damage')} className="max-h-[70vh] w-full rounded-[14px] object-contain" />
            )}
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label={t('Close')}
              className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/70 text-white"
            >
              <IconX size={16} aria-hidden />
            </button>
          </div>
        )}
      </ScModal>
    </>
  )
}

/** Detlio's summary, and what the customer wrote. */
export function RepairBriefBox({ quote }: { quote: GarageRepairQuote }) {
  const t = useT()
  return (
    <>
      <div className="rounded-[12px] border border-border bg-brand-black px-3 py-2.5">
        <p className="text-[12px] text-text-secondary">
          {quote.brief.source === 'customer' ? t('The customer’s summary') : t('Detlio’s summary')}
        </p>
        <p className="mt-0.5 text-[14px] text-text-primary">{quote.brief.text}</p>
        <p className="mt-1.5 text-[12px] text-text-secondary">
          {t('Customer wrote: “{note}”', { note: quote.note })}
        </p>
      </div>
      {quote.brief.source !== 'customer' && (
        <p className="text-[12px] text-text-secondary">
          {t('The summary is written by Detlio from the video. Check the video before you quote.')}
        </p>
      )}
    </>
  )
}

/**
 * A repair quote waiting for this garage (0075), in the Requests list: the
 * clock, the damage, the car, how far, the video and pictures, the summary,
 * and Can't do / Can do. Nothing of the customer's but their car and words:
 * no name, no phone (that comes with a booked visit).
 */
export function WaitingRepairQuoteCard({ quote, now }: { quote: GarageRepairQuote; now: number }) {
  const t = useT()
  const titleId = `repair-${quote.id}-title`
  const [declining, setDeclining] = useState(false)
  const left = Date.parse(quote.respondBy) - now
  return (
    <ScCard
      id={`repair-${quote.id}`}
      role="region"
      aria-labelledby={titleId}
      data-repair-quote-card=""
      className="flex flex-col gap-3 border-warning/40"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-warning">{t('Repair quote · new')}</p>
        <p
          className="shrink-0 font-numeric text-[13px] font-semibold text-warning"
          aria-label={t('Time left to answer: {time}', { time: timeLeftLabel(left) })}
        >
          {timeLeftLabel(left)}
        </p>
      </div>
      <div>
        <h2 id={titleId} className="text-[17px] font-semibold text-text-primary">
          {quote.title}
        </h2>
        <p className="mt-1 text-[13px] text-text-primary">{carLine(quote, t)}</p>
        <p className="text-[13px] text-text-secondary">
          {quote.area
            ? t('{area} · {km} km from you', { area: quote.area, km: quote.distanceKm })
            : t('{km} km from you', { km: quote.distanceKm })}
        </p>
      </div>
      <RepairMediaRow quote={quote} />
      <RepairBriefBox quote={quote} />
      <div className="flex gap-2">
        <ScButton variant="outline" onClick={() => setDeclining(true)} className="flex-1">
          {t('Can’t do')}
        </ScButton>
        <Link
          href={`/requests/repair/${quote.id}`}
          className="flex h-[52px] flex-1 items-center justify-center rounded-full bg-(image:--gradient-cta) text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_22px_-12px_rgba(228,0,43,0.6)]"
        >
          {t('Can do')}
        </Link>
      </div>
      <DeclineSheet quote={quote} open={declining} onClose={() => setDeclining(false)} />
    </ScCard>
  )
}

/** "Can't do", with an optional reason the customer reads. */
function DeclineSheet({ quote, open, onClose }: { quote: GarageRepairQuote; open: boolean; onClose: () => void }) {
  const t = useT()
  const answer = useAnswerRepairQuote()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const send = async () => {
    setError(null)
    try {
      await answer.mutateAsync({ quoteId: quote.id, answer: { canDo: false, ...(reason.trim() && { reason: reason.trim() }) } })
      toast.success(t('Sent. The customer can ask other garages.'))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not answer. Please try again.'))
    }
  }
  return (
    <ScSheet open={open} onClose={onClose} dismissible={!answer.isPending} aria-label={t('Can’t do this repair')}>
      <div className="flex flex-col gap-3 px-4">
        <h2 className="text-[17px] font-semibold text-text-primary">{t('Can’t do this repair?')}</h2>
        <p className="text-[13px] text-text-secondary">{quote.title}</p>
        <ScTextarea
          label={t('Reason for the customer (optional)')}
          value={reason}
          maxLength={REPAIR_QUOTE_RULES.garageNoteMax}
          rows={2}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('We don’t do paint work.')}
        />
        {error && (
          <p role="alert" className="text-[13px] text-error">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <ScButton variant="outline" onClick={onClose} disabled={answer.isPending} className="flex-1">
            {t('Keep it')}
          </ScButton>
          <ScButton variant="main" onClick={() => void send()} disabled={answer.isPending} className="flex-1">
            {answer.isPending ? t('Sending…') : t('Send')}
          </ScButton>
        </div>
      </div>
    </ScSheet>
  )
}

/** How a repair quote ended for this garage, in a word (English, shown as `t(…)`). */
const CLOSED_WORD: Record<string, string> = {
  quoted: msg('Quote sent'),
  declined: msg('Can’t do'),
  missed: msg('Time ran out'),
  closed: msg('Closed'),
}

export function ClosedRepairQuoteCard({ quote }: { quote: GarageRepairQuote }) {
  const t = useT()
  const titleId = `repair-${quote.id}-title`
  const booked = quote.bookingId !== null
  return (
    <ScCard id={`repair-${quote.id}`} role="region" aria-labelledby={titleId} data-repair-quote-card="" className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="min-w-0 text-[15px] font-semibold text-text-primary">
          {t('Repair quote')} · {quote.title}
        </h2>
        <ScBadge variant={booked || quote.state === 'quoted' ? 'success' : 'muted'} className="shrink-0">
          {booked ? t('Visit booked') : t(CLOSED_WORD[quote.state] ?? msg('Closed'))}
        </ScBadge>
      </div>
      <p className="text-[13px] text-text-secondary">
        {carLine(quote, t)}
        {quote.state === 'quoted' && quote.priceFrom !== null && quote.priceTo !== null && (
          <> · <span className="font-numeric">{priceRangeLabel(quote.priceFrom, quote.priceTo)}</span></>
        )}
      </p>
      {booked && (
        <Link href="/bookings" className="min-h-11 self-start pt-2 text-[13px] font-medium text-text-primary underline underline-offset-4">
          {t('See it on Bookings')}
        </Link>
      )}
    </ScCard>
  )
}
