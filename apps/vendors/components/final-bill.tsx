'use client'

import { useState } from 'react'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { raiseFinalBill } from '@repo/core/api/job-records'
import {
  finalBillFigures,
  finalBillStatusLabel,
  formatRupees,
} from '@repo/core/job-records'
import type { Booking, FinalBill } from '@repo/core/types'

/** Mirror the server's limits (lib/final-bill.ts) so the form refuses first. */
const MAX_LINES = 20
const MAX_DESCRIPTION = 80

type Line = { description: string; amount: string }

const STATUS_BADGE: Record<FinalBill['status'], 'pending' | 'success' | 'muted'> = {
  due: 'pending',
  paid: 'success',
  not_needed: 'muted',
  cancelled: 'muted',
}

/**
 * Where the form starts. A replacement starts from the bill it replaces. A
 * first bill starts from the services booked, at their booked prices: what
 * was paid at booking is taken off the whole bill, so a bill that listed only
 * the repair would lose the services already paid for (a foam wash on the
 * same booking, say) without anyone noticing.
 */
function linesFrom(bill: FinalBill | null, booking: Booking): Line[] {
  if (bill) {
    return bill.lines.map((line) => ({ description: line.description, amount: String(line.amount) }))
  }
  const booked = booking.items
    .slice(0, MAX_LINES)
    .map((item) => ({ description: item.name.slice(0, MAX_DESCRIPTION), amount: String(item.amount) }))
  return booked.length > 0 ? booked : [{ description: '', amount: '' }]
}

/** "Dent Inspection ₹299 · Foam wash ₹600": what the booking's payment was for. */
function bookedSummary(booking: Booking): string {
  return booking.items.map((item) => `${item.name} ${formatRupees(item.amount)}`).join(' · ')
}

/** Why the form cannot be sent yet, in the garage's words; null when it can. */
function formProblem(lines: Line[], total: number): string | null {
  if (lines.some((line) => !line.description.trim())) return 'Describe every line.'
  if (lines.some((line) => line.description.trim().length > MAX_DESCRIPTION)) {
    return `Keep each line under ${MAX_DESCRIPTION} characters.`
  }
  if (
    lines.some((line) => {
      const n = Number(line.amount)
      return !Number.isFinite(n) || n <= 0 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6
    })
  ) {
    return 'Give every line an amount in rupees.'
  }
  if (total < 1) return 'The bill must come to at least ₹1.'
  return null
}

interface FinalBillPanelProps {
  booking: Booking
  /** Re-read the job list once the bill changes. */
  onChanged: () => void
}

/**
 * The final bill of an inspection job, on the garage's job card.
 *
 * The customer prepaid the inspection fee. After inspecting (and usually
 * doing) the work, the garage lists what it came to here; the customer gets
 * the bill in the Detlio app and pays anything above what they already paid
 * there. A bill that comes to no more than was paid needs nothing from them.
 * An unpaid bill can be replaced; a paid one is final.
 */
export function FinalBillPanel({ booking, onChanged }: FinalBillPanelProps) {
  const bill = booking.finalBill
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<Line[]>(() => linesFrom(bill, booking))
  const [note, setNote] = useState(bill?.note ?? '')
  const [sending, setSending] = useState(false)
  const who = booking.customerName ?? 'this customer'

  if (!bill && !booking.canRaiseFinalBill) return null

  const paidBefore = bill?.paidBefore ?? booking.paidAtBooking
  const figures = finalBillFigures(
    lines.map((line) => line.amount),
    paidBefore
  )
  const problem = formProblem(lines, figures.total)

  const openForm = () => {
    setLines(linesFrom(bill, booking))
    setNote(bill?.note ?? '')
    setOpen(true)
  }

  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  const handleSend = async () => {
    if (problem || sending) return
    setSending(true)
    try {
      await raiseFinalBill(booking.id, {
        lines: lines.map((line) => ({
          description: line.description.trim(),
          amount: Number(line.amount),
        })),
        note: note.trim() || undefined,
      })
      setOpen(false)
      // "Saved", not "sent": the customer sees it when they open their
      // booking in the app, and nothing here knows when that is.
      toast.success(
        figures.amountDue > 0
          ? `Final bill saved. ${who} can pay ${formatRupees(figures.amountDue)} from their booking in the Detlio app.`
          : 'Final bill saved. Nothing more to pay.'
      )
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the bill')
      onChanged()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      {bill ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-text-primary">Final bill</p>
            <ScBadge variant={STATUS_BADGE[bill.status]}>{finalBillStatusLabel(bill.status)}</ScBadge>
          </div>
          <p className="text-[12px] text-text-secondary">
            Total <span className="font-numeric text-text-primary">{formatRupees(bill.total)}</span>
            {' · '}Paid at booking{' '}
            <span className="font-numeric text-text-primary">{formatRupees(bill.paidBefore)}</span>
            {bill.amountDue > 0 && (
              <>
                {' · '}
                {bill.status === 'paid' ? 'Paid in app' : 'Customer pays'}{' '}
                <span className="font-numeric text-text-primary">{formatRupees(bill.amountDue)}</span>
              </>
            )}
          </p>
          {bill.status !== 'paid' && booking.canRaiseFinalBill && (
            <ScButton
              variant="secondary"
              onClick={openForm}
              aria-label={`Replace final bill for ${who}`}
              className="mt-1 min-h-11"
            >
              Replace bill
            </ScButton>
          )}
        </div>
      ) : (
        <ScButton
          variant="secondary"
          onClick={openForm}
          aria-label={`Raise final bill for ${who}`}
          className="min-h-11"
        >
          Raise final bill
        </ScButton>
      )}

      <ScSheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!sending}
        aria-label={`Final bill for ${who}`}
        className="px-4"
      >
        <h2 className="text-base font-semibold text-text-primary">Final bill</h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          The bill is for the whole job: the services booked, plus the work and parts.{' '}
          {paidBefore > 0 ? (
            <>
              {who} paid <span className="font-numeric">{formatRupees(paidBefore)}</span> at
              booking and pays anything above that in the Detlio app.
            </>
          ) : (
            <>{who} pays it in the Detlio app.</>
          )}
        </p>
        {paidBefore > 0 && booking.items.length > 0 && (
          <p className="mt-1 text-[12px] text-text-secondary">
            Paid at booking for: <span className="font-numeric">{bookedSummary(booking)}</span>
          </p>
        )}

        <ul className="mt-4 flex flex-col gap-3">
          {lines.map((line, i) => (
            <li key={i} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <ScInput
                  label={`Line ${i + 1}`}
                  placeholder="e.g. Rear bumper dent repair"
                  maxLength={MAX_DESCRIPTION}
                  value={line.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                />
              </div>
              <div className="w-28 shrink-0">
                <ScInput
                  label="Amount (₹)"
                  aria-label={`Line ${i + 1} amount in rupees`}
                  inputMode="decimal"
                  placeholder="0"
                  className="font-numeric"
                  value={line.amount}
                  onChange={(e) => updateLine(i, { amount: e.target.value.replace(/[^\d.]/g, '') })}
                />
              </div>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLines((current) => current.filter((_, j) => j !== i))}
                  aria-label={`Remove line ${i + 1}`}
                  className="flex size-11 shrink-0 items-center justify-center text-text-muted hover:text-text-primary"
                >
                  <IconTrash size={16} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>

        {lines.length < MAX_LINES && (
          <button
            type="button"
            onClick={() => setLines((current) => [...current, { description: '', amount: '' }])}
            className="mt-2 flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-text-primary"
          >
            <IconPlus size={15} aria-hidden />
            Add line
          </button>
        )}

        <div className="mt-2">
          <ScTextarea
            label="Note for the customer (optional)"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Live, so the garage sees exactly what the customer will be asked. */}
        <div aria-live="polite" className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3 text-[13px]">
          <div className="flex justify-between">
            <span className="text-text-secondary">Total</span>
            <span className="font-numeric font-medium text-text-primary">{formatRupees(figures.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Paid at booking</span>
            <span className="font-numeric font-medium text-text-primary">−{formatRupees(paidBefore)}</span>
          </div>
          <div className="flex justify-between text-[15px] font-semibold text-text-primary">
            <span>{figures.amountDue > 0 ? 'Customer pays in the app' : 'Nothing more to pay'}</span>
            <span className="font-numeric">{formatRupees(figures.amountDue)}</span>
          </div>
        </div>

        {problem && lines.some((line) => line.description || line.amount) && (
          <p className="mt-2 text-[12px] text-error">{problem}</p>
        )}

        <div className="mt-5 flex gap-2">
          <ScButton variant="secondary" disabled={sending} onClick={() => setOpen(false)}>
            Cancel
          </ScButton>
          <ScButton disabled={!!problem || sending} onClick={handleSend}>
            {sending ? 'Sending…' : bill ? 'Send new bill' : 'Send final bill'}
          </ScButton>
        </div>
      </ScSheet>
    </div>
  )
}
