'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconCircleCheck, IconCircleX } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { Chip } from '@repo/ui/sc/chip'
import { Figures } from '@repo/ui/sc/figures'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { ApiError } from '@repo/core/api/client'
import type { CustomerComplaint } from '@repo/core/api/complaints'
import { useRaiseComplaint } from '@repo/core/api/hooks/use-complaints'
import {
  COMPLAINT_ACKNOWLEDGE_HOURS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_MESSAGE_MAX,
  COMPLAINT_MESSAGE_MIN,
  COMPLAINT_RESOLVE_DAYS,
  complaintReceivedLine,
  type ComplaintCategory,
} from '@repo/core/complaints'

/**
 * "Complaint C-000123 received — we'll get back to you within 24 hours.",
 * the number whole in the numeric face (like a booking's #reference) and
 * the 24 too.
 */
function ReceivedLine({ number }: { number: string }) {
  const [before, after = ''] = complaintReceivedLine(number).split(number)
  return (
    <>
      {before}
      <span className="font-numeric">{number}</span>
      <Figures text={after} />
    </>
  )
}

/** The booking a complaint is about, when it comes from one. */
export interface ComplaintBooking {
  id: string
  /** "#3F2A9C1B", as the booking page shows it. */
  reference: string
  vendorName: string
}

interface RaiseComplaintSheetProps {
  open: boolean
  onClose: () => void
  /** From a booking's Help sheet; null on the Contact page. */
  booking: ComplaintBooking | null
}

/**
 * Raising a complaint: what it is about (one chip), what happened, and
 * submit. The booking and its garage go with it on their own; the customer
 * never picks them. Once it is in, the sheet shows the complaint's number and
 * the 24-hour promise, which is what the customer quotes from then on.
 *
 * Red once, on Submit: the sheet's one main action.
 */
export function RaiseComplaintSheet({ open, onClose, booking }: RaiseComplaintSheetProps) {
  const raise = useRaiseComplaint()
  const [category, setCategory] = useState<ComplaintCategory | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [received, setReceived] = useState<CustomerComplaint | null>(null)

  const trimmed = message.trim()
  const canSubmit = category !== null && trimmed.length >= COMPLAINT_MESSAGE_MIN && !raise.isPending

  // Closing starts the next complaint from empty; the one sent is in Profile.
  const close = () => {
    if (raise.isPending) return
    onClose()
    setCategory(null)
    setMessage('')
    setError('')
    setReceived(null)
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!category || !canSubmit) return
    setError('')
    raise.mutate(
      { category, message: trimmed, ...(booking ? { bookingId: booking.id } : {}) },
      {
        onSuccess: setReceived,
        onError: (err) =>
          setError(
            err instanceof ApiError
              ? err.message
              : "Couldn't send your complaint. Check your connection and try again."
          ),
      }
    )
  }

  return (
    <ScSheet
      open={open}
      onClose={close}
      dismissible={!raise.isPending}
      aria-label={received ? 'Complaint received' : 'Raise a complaint'}
      className="px-4 pt-1"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">
              {received ? 'Complaint received' : 'Raise a complaint'}
            </h2>
            {!received && (
              <p className="mt-1 text-[12px] text-text-secondary">
                {booking ? (
                  <>
                    About booking <span className="font-numeric font-medium">{booking.reference}</span>{' '}
                    · {booking.vendorName}
                  </>
                ) : (
                  'Tell us what went wrong. If it is about a booking, raising it from the booking’s Help is quicker.'
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            disabled={raise.isPending}
            aria-label="Close"
            className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center disabled:opacity-40"
          >
            <IconCircleX size={22} className="text-text-secondary" />
          </button>
        </div>

        {received ? (
          <div className="flex flex-col gap-4" role="status">
            <div className="flex items-start gap-3 rounded-[12px] border border-border bg-surface px-3.5 py-3">
              <IconCircleCheck size={20} className="mt-0.5 shrink-0 text-success" aria-hidden />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-text-primary">
                  <ReceivedLine number={received.number} />
                </p>
                <p className="mt-1 text-[12px] text-text-secondary">
                  Quote <span className="font-numeric font-medium text-text-primary">{received.number}</span>{' '}
                  if you call or message us about it. You can follow it, and read our answer, in
                  Profile under My complaints.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href="/profile#my-complaints"
                onClick={close}
                className="flex min-h-11 flex-1 items-center justify-center rounded-[10px] border border-border text-[13px] font-medium text-text-primary transition-colors hover:bg-surface"
              >
                My complaints
              </Link>
              <ScButton variant="secondary" onClick={close} className="min-h-11 flex-1">
                Done
              </ScButton>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[11px] font-medium text-text-secondary">What is it about?</legend>
              <div className="flex flex-wrap gap-2">
                {COMPLAINT_CATEGORIES.map((value) => (
                  <Chip
                    key={value}
                    label={COMPLAINT_CATEGORY_LABELS[value]}
                    selected={category === value}
                    onClick={() => {
                      setCategory(value)
                      setError('')
                    }}
                    className="min-h-11"
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1">
              <ScTextarea
                id="complaint-message"
                label="What happened?"
                rows={5}
                maxLength={COMPLAINT_MESSAGE_MAX}
                placeholder="What went wrong, and what you would like us to do"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value)
                  setError('')
                }}
              />
              <p className="flex justify-between text-[11px] text-text-muted">
                <span>
                  {trimmed.length > 0 && trimmed.length < COMPLAINT_MESSAGE_MIN
                    ? `At least ${COMPLAINT_MESSAGE_MIN} characters`
                    : ''}
                </span>
                <span className="font-numeric">
                  {message.length}/{COMPLAINT_MESSAGE_MAX}
                </span>
              </p>
            </div>

            <p className="text-[12px] text-text-secondary">
              You get a complaint number at once. We acknowledge every complaint within{' '}
              <span className="font-numeric">{COMPLAINT_ACKNOWLEDGE_HOURS}</span> hours and aim to
              resolve it within <span className="font-numeric">{COMPLAINT_RESOLVE_DAYS}</span> days.
            </p>

            {error && (
              <p role="alert" className="text-[12px] text-error">
                {error}
              </p>
            )}

            <ScButton type="submit" disabled={!canSubmit} className="min-h-11">
              {raise.isPending ? 'Sending…' : 'Submit complaint'}
            </ScButton>
          </form>
        )}
      </div>
    </ScSheet>
  )
}
