'use client'

import { useState } from 'react'
import { IconCircleCheck, IconCircleX } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { Chip } from '@repo/ui/sc/chip'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { ApiError } from '@repo/core/api/client'
import { useReportBypass } from '@repo/core/api/hooks/use-bypass-reports'
import {
  BYPASS_ANONYMITY_LINE,
  BYPASS_KINDS,
  BYPASS_KIND_LABELS,
  BYPASS_NUMBERS,
  BYPASS_QUESTION,
  BYPASS_THANKS_BODY,
  BYPASS_THANKS_TITLE,
  bypassRewardLine,
  type BypassKind,
} from '@repo/core/bypass-reports'

/** The booking a report is about. */
export interface BypassBooking {
  id: string
  /** "#3F2A9C1B", as the booking page shows it. */
  reference: string
  vendorName: string
}

interface ReportBypassSheetProps {
  open: boolean
  onClose: () => void
  booking: BypassBooking
  /** Detlio credit is on: the form says what a confirmed report earns. */
  rewardOffered: boolean
  rewardAmount: string
}

/**
 * "Did the garage ask you to book directly or pay outside Detlio?": what
 * happened (one chip) and an optional note, then send. The booking and its
 * garage go with it on their own. The garage is never told who reported it;
 * a reward, when credit is on, comes only once Detlio has confirmed it.
 *
 * Red once, on Send: the sheet's one main action.
 */
export function ReportBypassSheet({ open, onClose, booking, rewardOffered, rewardAmount }: ReportBypassSheetProps) {
  const send = useReportBypass()
  const [kind, setKind] = useState<BypassKind | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const canSend = kind !== null && !send.isPending

  // Closing starts the next one from empty.
  const close = () => {
    if (send.isPending) return
    onClose()
    setKind(null)
    setNote('')
    setError('')
    setSent(false)
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!kind || !canSend) return
    setError('')
    const trimmed = note.trim()
    send.mutate(
      { bookingId: booking.id, kind, ...(trimmed ? { note: trimmed } : {}) },
      {
        onSuccess: () => setSent(true),
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : "Couldn't send this. Check your connection and try again."),
      }
    )
  }

  return (
    <ScSheet
      open={open}
      onClose={close}
      dismissible={!send.isPending}
      aria-label={sent ? BYPASS_THANKS_TITLE : 'Tell us about the garage'}
      className="px-4 pt-1"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">{sent ? BYPASS_THANKS_TITLE : BYPASS_QUESTION}</h2>
            {!sent && (
              <p className="mt-1 text-[12px] text-text-secondary">
                About booking <span className="font-numeric font-medium">{booking.reference}</span> ·{' '}
                {booking.vendorName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            disabled={send.isPending}
            aria-label="Close"
            className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center disabled:opacity-40"
          >
            <IconCircleX size={22} className="text-text-secondary" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col gap-4" role="status">
            <div className="flex items-start gap-3 rounded-[12px] border border-border bg-surface px-3.5 py-3">
              <IconCircleCheck size={20} className="mt-0.5 shrink-0 text-success" aria-hidden />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-text-primary">{BYPASS_THANKS_BODY}</p>
                {rewardOffered && (
                  <p className="mt-1 text-[12px] text-text-secondary">{bypassRewardLine(Number(rewardAmount))}</p>
                )}
              </div>
            </div>
            <ScButton variant="secondary" onClick={close} className="min-h-11">
              Done
            </ScButton>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[11px] font-medium text-text-secondary">What happened?</legend>
              <div className="flex flex-wrap gap-2">
                {BYPASS_KINDS.map((value) => (
                  <Chip
                    key={value}
                    label={BYPASS_KIND_LABELS[value]}
                    selected={kind === value}
                    onClick={() => setKind(value)}
                    className="min-h-11 text-left"
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1">
              <ScTextarea
                data-clarity-mask="true"
                id="bypass-note"
                label="Anything to add? (optional)"
                rows={3}
                maxLength={BYPASS_NUMBERS.noteMax}
                placeholder="What they said, and when"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-describedby={error ? 'bypass-note-hint bypass-error' : 'bypass-note-hint'}
              />
              <p id="bypass-note-hint" className="text-right text-[11px] text-text-muted">
                <span className="font-numeric">
                  {note.length}/{BYPASS_NUMBERS.noteMax}
                </span>
              </p>
            </div>

            <div className="flex flex-col gap-1 text-[12px] text-text-secondary">
              <p>{BYPASS_ANONYMITY_LINE}</p>
              {rewardOffered && <p>{bypassRewardLine(Number(rewardAmount))}</p>}
            </div>

            {error && (
              <p id="bypass-error" role="alert" className="text-[12px] text-error">
                {error}
              </p>
            )}

            <ScButton type="submit" disabled={!canSend} className="min-h-11">
              {send.isPending ? 'Sending…' : 'Send'}
            </ScButton>
          </form>
        )}
      </div>
    </ScSheet>
  )
}
