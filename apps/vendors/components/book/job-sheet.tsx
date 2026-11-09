'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-toastify'
import type { OwnJob } from '@repo/core/api/garage-book'
import { useUpdateWalkIn } from '@repo/core/api/hooks/use-garage-book'
import { carName, jobTime, plateText, rupees, type JobPayment } from '@repo/core/garage-book'
import { cn } from '@repo/core/utils'
import { NumberPlate } from '@repo/ui/finish/number-plate'
import { ScSheet } from '@repo/ui/sc/modal'
import { Overline, Seg, raised } from './parts'

const PAYMENTS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'later', label: 'Pay later' },
] as const

/**
 * A walk-in, opened from Today or Jobs: what it is, how it is paid, and the
 * next step (Start, Done) or Cancel. Done runs moment 3 (`onDone`). Prices
 * are the owner's; staff see the job without them.
 */
export function JobSheet({
  job,
  open,
  onClose,
  onDone,
}: {
  job: OwnJob | null
  open: boolean
  onClose: () => void
  onDone: (job: OwnJob) => void
}) {
  const update = useUpdateWalkIn()
  const [confirmCancel, setConfirmCancel] = useState(false)
  if (!job) return null
  const plate = plateText(job.car?.plate)

  const change = (patch: Parameters<typeof update.mutate>[0]['patch'], after?: (next: OwnJob) => void) =>
    update.mutate(
      { id: job.id, patch },
      {
        onSuccess: (next) => after?.(next),
        onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save that. Try again."),
      }
    )

  return (
    <ScSheet open={open} onClose={onClose} aria-label={`${job.name}'s job`} className="px-4">
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Overline>Walk-in · {jobTime(job.scheduledAt)}</Overline>
            <h2 className="mt-1 truncate text-t2 font-semibold text-text-primary">{job.name}</h2>
            <p className="text-t4 text-[#A8A8B2]">{carName(job.car) || 'Car not noted'}</p>
          </div>
          {plate && <NumberPlate plate={plate} size="sm" />}
        </div>

        <ul className="flex flex-col">
          {job.lines.map((line, index) => (
            <li key={index} className="flex justify-between border-b border-[#1d1d23] py-2 text-t3 text-text-primary">
              <span>
                {line.label}
                {line.qty > 1 && <span className="text-[#A8A8B2]"> ×{line.qty}</span>}
              </span>
              {line.pricePaise !== undefined && <span className="font-numeric">{rupees(line.pricePaise * line.qty)}</span>}
            </li>
          ))}
          {job.totalPaise !== undefined && (
            <li className="flex justify-between pt-2 text-t3 font-semibold text-text-primary">
              <span>Total</span>
              <span className="font-numeric">{rupees(job.totalPaise)}</span>
            </li>
          )}
        </ul>

        {job.status !== 'done' && job.status !== 'cancelled' && (
          <div className="flex flex-col gap-2">
            <span className="text-t4 font-semibold text-[#D4D4DA]">Payment</span>
            <Seg<JobPayment> label="Payment" value={job.payment} options={PAYMENTS} onChange={(payment) => change({ payment })} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {job.status === 'booked' && (
            <button type="button" disabled={update.isPending} onClick={() => change({ status: 'in_progress' })} className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary')}>
              Start
            </button>
          )}
          {(job.status === 'booked' || job.status === 'in_progress') && (
            <button
              type="button"
              disabled={update.isPending}
              onClick={() =>
                change({ status: 'done' }, (next) => {
                  onClose()
                  onDone(next)
                })
              }
              className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary', job.status === 'in_progress' && 'col-span-2')}
            >
              Mark done
            </button>
          )}
        </div>

        <Link href={`/book/customers/${encodeURIComponent(job.customerId)}`} className="text-center text-t4 font-medium text-[#A8A8B2]">
          Open {job.name.split(' ')[0]}&apos;s page
        </Link>

        {job.status !== 'done' && job.status !== 'cancelled' && (
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => (confirmCancel ? change({ status: 'cancelled' }, onClose) : setConfirmCancel(true))}
            className="min-h-11 text-t4 font-medium text-[#FF8A95]"
          >
            {confirmCancel ? 'Tap again to cancel this job' : 'Cancel this job'}
          </button>
        )}
      </div>
    </ScSheet>
  )
}
