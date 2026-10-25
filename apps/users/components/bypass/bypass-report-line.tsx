'use client'

import { useState } from 'react'
import { IconChevronRight, IconFlag } from '@tabler/icons-react'
import { useBypassStatus } from '@repo/core/api/hooks/use-bypass-reports'
import { bookingReference } from '@repo/core/booking-types'
import { BYPASS_QUESTION_SHORT, bypassReportStatusLine } from '@repo/core/bypass-reports'
import type { Booking } from '@repo/core/types'
import { ReportBypassSheet } from './report-bypass-sheet'

/**
 * Whether a booking may be one to report, before asking the server: from
 * the garage's acceptance on (a cancelled one only if the garage had
 * accepted it). The server decides the rest (30 days after it ended, one
 * per booking, five a year).
 */
export function mayBeReportable(booking: Pick<Booking, 'status' | 'acceptedAtIso'>): boolean {
  if (booking.status === 'confirmed' || booking.status === 'in_progress' || booking.status === 'completed') return true
  return booking.status === 'cancelled' && Boolean(booking.acceptedAtIso)
}

/**
 * The booking page's quiet line under Help: "Did the garage ask you to book
 * directly?", opening the report sheet, while the booking can be reported;
 * once reported, where the report stands. Nothing at all otherwise.
 */
export function BypassReportLine({ booking }: { booking: Booking }) {
  const [open, setOpen] = useState(false)
  const { data } = useBypassStatus(booking.id, mayBeReportable(booking))
  if (!data) return null

  if (data.report) {
    return (
      <p className="flex items-start gap-2 px-1 text-[12px] text-text-secondary" role="status">
        <IconFlag size={15} aria-hidden className="mt-px shrink-0 text-text-muted" />
        <span>
          {bypassReportStatusLine({
            status: data.report.status,
            reward: data.report.reward,
            rewardRupees: Number(data.report.rewardAmount),
          })}
        </span>
      </p>
    )
  }
  if (!data.canReport) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mx-1 flex min-h-11 items-center justify-between gap-3 rounded-[10px] px-1 text-left text-[13px] text-text-secondary transition-colors hover:text-text-primary"
      >
        <span className="flex items-center gap-2">
          <IconFlag size={16} aria-hidden className="shrink-0 text-text-muted" />
          {BYPASS_QUESTION_SHORT}
        </span>
        <IconChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
      </button>
      <ReportBypassSheet
        open={open}
        onClose={() => setOpen(false)}
        booking={{ id: booking.id, reference: `#${bookingReference(booking.id)}`, vendorName: booking.vendorName }}
        rewardOffered={data.rewardOffered}
        rewardAmount={data.rewardAmount}
      />
    </>
  )
}
