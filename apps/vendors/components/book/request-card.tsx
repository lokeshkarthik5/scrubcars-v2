'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatClock, formatWhen } from '@repo/core/format'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { fill, useT } from '@repo/core/i18n'
import { answerByRing } from '@repo/core/moments'
import type { Booking } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { RejectBookingSheet } from '@/components/reject-booking'
import { changeStatusWithUndo, useDeferredStatus } from '@/lib/deferred-status'
import { jobPriceText, serviceOnlyLine } from '@/lib/jobs'
import { Overline, raised } from './parts'

/**
 * A new Detlio request pinned on top of Home (B1), with the answer-by ring
 * (moment 1): the ring drains like a clock while it waits, so the garage
 * answers before it is auto-cancelled. Decline and the red Accept use the
 * existing endpoints, through the same Undo queue and decline sheet as
 * Bookings › New. Money is the owner's.
 */
export function RequestCard({ booking: b, now, more, onChanged }: { booking: Booking; now: number; more: number; onChanged: () => void }) {
  const t = useT()
  const [declining, setDeclining] = useState(false)
  const accepting = useDeferredStatus(b.id) === 'confirmed'
  const isOwner = useIsVendorAdmin()
  const ring = b.responseDeadline ? answerByRing(b.responseDeadline, now) : { fraction: 1, minutesLeft: null }
  const what = [serviceOnlyLine(b), b.customerName, b.vehicle?.model].filter(Boolean).join(' · ')
  const price = jobPriceText(b)
  const label =
    ring.minutesLeft !== null
      ? t('{minutes} minutes left to answer', { minutes: ring.minutesLeft })
      : b.responseDeadline
        ? t('Answer by {time}', { time: formatClock(b.responseDeadline.respondBy) })
        : t('New request')

  return (
    <section aria-label={t('New Detlio request')} className="fx-edge flex flex-col gap-3.5 rounded-surface px-4 pt-3.5 pb-4">
      <div className="flex items-center gap-3.5">
        <div role="img" aria-label={label} className="relative size-[52px] shrink-0">
          <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90" aria-hidden>
            <circle cx="26" cy="26" r="22" fill="none" stroke="rgb(255 255 255 / .1)" strokeWidth="4" />
            <circle
              className="gb-ring__fill"
              cx="26"
              cy="26"
              r="22"
              fill="none"
              stroke="#ff2d4a"
              strokeWidth="4"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1 - ring.fraction}
            />
          </svg>
          <span
            className={cn(
              'absolute inset-0 grid place-items-center font-numeric font-semibold text-text-primary',
              ring.minutesLeft === null && t('New').length > 4 ? 'text-[10px]' : 'text-[14px]'
            )}
          >
            {ring.minutesLeft !== null ? t('{minutes}m', { minutes: ring.minutesLeft }) : t('New')}
          </span>
        </div>
        <Link href={`/bookings/${b.id}`} className="min-w-0 flex-1">
          <Overline tone="red">{t('New Detlio request')}</Overline>
          <p className="mt-1 truncate text-t2 font-semibold text-text-primary">{formatWhen(b.scheduledAtIso, now)}</p>
          <p className="mt-0.5 truncate text-t4 text-[#A8A8B2]">{what}</p>
        </Link>
        {isOwner && (
          <span className={cn('shrink-0 font-semibold text-text-primary', price.words ? 'max-w-[40%] text-right text-[13px] leading-snug' : 'font-numeric text-[20px]')}>
            {price.text}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setDeclining(true)} disabled={accepting} className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary')}>
          {t('Decline')}
        </button>
        <button
          type="button"
          onClick={() => changeStatusWithUndo(b.id, 'confirmed')}
          disabled={accepting}
          className="fx-red-button fx-press h-12 rounded-control text-t3 font-semibold"
        >
          {accepting ? t('Accepting…') : t('Accept')}
        </button>
      </div>
      {more > 0 && (
        <Link href="/bookings?tab=new" className="text-center text-t4 font-medium text-[#A8A8B2]">
          {fill(t('See all {count} new requests'), { count: <span className="font-numeric">{more + 1}</span> })}
        </Link>
      )}
      <RejectBookingSheet booking={b} open={declining} onClose={() => setDeclining(false)} onDone={onChanged} />
    </section>
  )
}
