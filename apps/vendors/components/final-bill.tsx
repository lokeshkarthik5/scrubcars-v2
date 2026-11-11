'use client'

import { serviceLinesOf } from '@repo/core/add-ons'
import { useState } from 'react'
import { IconPlus, IconReceipt, IconTrash } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useT } from '@repo/core/i18n'
import { t } from '@repo/core/i18n/translate'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { StatusChip } from '@repo/ui/sc/status-chip'
import { raiseFinalBill } from '@repo/core/api/job-records'
import {
  finalBillFigures,
  finalBillStatusLabel,
  formatRupees,
} from '@repo/core/job-records'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import type { StatusTone } from '@repo/core/status-tone'
import type { Booking, FinalBill } from '@repo/core/types'
import { JobSheetRow } from '@/components/job-sheet-row'

/** Mirror the server's limits (lib/final-bill.ts) so the form refuses first. */
const MAX_LINES = 20
const MAX_DESCRIPTION = 80

type Line = { description: string; amount: string }

/** One colour per meaning (UX audit, garage finding 7): green only once it is paid. */
const STATUS_TONE: Record<FinalBill['status'], StatusTone> = {
  due: 'progress',
  paid: 'done',
  not_needed: 'closed',
  cancelled: 'closed',
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
    return bill.lines.map((line) => ({
      description: line.description,
      amount: String(line.amount),
    }))
  }
  // The final bill stays separate from add-ons (0068): paid at booking, and
  // credited nothing, so they aren't lines on it.
  const booked = serviceLinesOf(booking.items).slice(0, MAX_LINES).map((item) => ({
    description: item.name.slice(0, MAX_DESCRIPTION),
    amount: String(item.amount),
  }))
  return booked.length > 0 ? booked : [{ description: '', amount: '' }]
}

/** "Dent Inspection ₹299 · Foam wash ₹600": what the booking's payment was for. */
function bookedSummary(booking: Booking): string {
  return serviceLinesOf(booking.items)
    .map((item) => `${item.name} ${formatRupees(item.amount)}`)
    .join(' · ')
}

/** Why the form cannot be sent yet, in the garage's words (and language); null when it can. */
function formProblem(lines: Line[], total: number): string | null {
  if (lines.some((line) => !line.description.trim()))
    return t('Describe every line.')
  if (lines.some((line) => line.description.trim().length > MAX_DESCRIPTION)) {
    return t('Keep each line under {max} characters.', { max: MAX_DESCRIPTION })
  }
  if (
    lines.some((line) => {
      const n = Number(line.amount)
      return (
        !Number.isFinite(n) ||
        n <= 0 ||
        Math.abs(n * 100 - Math.round(n * 100)) > 1e-6
      )
    })
  ) {
    return t('Give every line an amount in rupees.')
  }
  if (total < 1) return t('The bill must come to at least ₹1.')
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
  const t = useT()
  const bill = booking.finalBill
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<Line[]>(() => linesFrom(bill, booking))
  const [note, setNote] = useState(bill?.note ?? '')
  const [sending, setSending] = useState(false)
  const who = booking.customerName ?? t('this customer')
  const isVendorAdmin = useIsVendorAdmin()

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
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line))
    )

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
          ? t(
              'Final bill saved. {who} can pay {amount} from their booking in the Detlio app.',
              { who, amount: formatRupees(figures.amountDue) }
            )
          : t('Final bill saved. Nothing more to pay.')
      )
      onChanged()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Could not send the bill')
      )
      onChanged()
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* One row on the job's page (garage mockup 03), opening the sheet. */}
      {bill ? (
        <JobSheetRow
          icon={<IconReceipt size={22} stroke={1.6} />}
          title={
            <>
              {t('Final bill')}
              {/* The figures in the row are the owner's; an operator who
                  writes the bill still sees its lines in the sheet. */}
              {isVendorAdmin && (
                <>
                  {' · '}
                  <span className="font-numeric">
                    {formatRupees(bill.total)}
                  </span>
                </>
              )}
            </>
          }
          detail={
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip tone={STATUS_TONE[bill.status]}>
                {finalBillStatusLabel(bill.status)}
              </StatusChip>
              {bill.amountDue > 0 && (
                <span>
                  {bill.status === 'paid' ? t('Paid in app') : t('Customer pays')}
                  {isVendorAdmin && (
                    <>
                      {' '}
                      <span className="font-numeric text-text-primary">
                        {formatRupees(bill.amountDue)}
                      </span>
                    </>
                  )}
                </span>
              )}
            </span>
          }
          aria-label={
            bill.status !== 'paid' && booking.canRaiseFinalBill
              ? t('Replace final bill for {who}', { who })
              : undefined
          }
          onOpen={
            bill.status !== 'paid' && booking.canRaiseFinalBill
              ? openForm
              : undefined
          }
        />
      ) : (
        <JobSheetRow
          icon={<IconReceipt size={22} stroke={1.6} />}
          title={t('Raise final bill')}
          detail={t('Not sent yet · the job is priced on inspection')}
          aria-label={t('Raise final bill for {who}', { who })}
          onOpen={openForm}
        />
      )}

      <ScSheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!sending}
        aria-label={t('Final bill for {who}', { who })}
        className="px-4"
      >
        <h2 className="text-base font-semibold text-text-primary">
          {t('Final bill')}
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          {t('The bill is for the whole job: the services booked, plus the work and parts.')}{' '}
          {paidBefore > 0
            ? t(
                '{who} paid {amount} at booking and pays anything above that in the Detlio app.',
                { who, amount: formatRupees(paidBefore) }
              )
            : t('{who} pays it in the Detlio app.', { who })}
        </p>
        {paidBefore > 0 && booking.items.length > 0 && (
          <p className="mt-1 text-[12px] text-text-secondary">
            {t('Paid at booking for:')}{' '}
            <span className="font-numeric">{bookedSummary(booking)}</span>
          </p>
        )}

        <ul className="mt-4 flex flex-col gap-3">
          {lines.map((line, i) => (
            <li key={i} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <ScInput
                  label={t('Line {n}', { n: i + 1 })}
                  placeholder={t('e.g. Rear bumper dent repair')}
                  maxLength={MAX_DESCRIPTION}
                  value={line.description}
                  onChange={(e) =>
                    updateLine(i, { description: e.target.value })
                  }
                />
              </div>
              <div className="w-28 shrink-0">
                <ScInput
                  label={t('Amount (₹)')}
                  aria-label={t('Line {n} amount in rupees', { n: i + 1 })}
                  inputMode="decimal"
                  placeholder="0"
                  className="font-numeric"
                  value={line.amount}
                  onChange={(e) =>
                    updateLine(i, {
                      amount: e.target.value.replace(/[^\d.]/g, ''),
                    })
                  }
                />
              </div>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLines((current) => current.filter((_, j) => j !== i))
                  }
                  aria-label={t('Remove line {n}', { n: i + 1 })}
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
            onClick={() =>
              setLines((current) => [
                ...current,
                { description: '', amount: '' },
              ])
            }
            className="mt-2 flex min-h-12 items-center gap-1.5 text-[15px] font-medium text-text-primary"
          >
            <IconPlus size={15} aria-hidden />
            {t('Add line')}
          </button>
        )}

        <div className="mt-2">
          <ScTextarea
            label={t('Note for the customer (optional)')}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Live, so the garage sees exactly what the customer will be asked. */}
        <div
          aria-live="polite"
          className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3 text-[13px]"
        >
          <div className="flex justify-between">
            <span className="text-text-secondary">{t('Total')}</span>
            <span className="font-numeric font-medium text-text-primary">
              {formatRupees(figures.total)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">{t('Paid at booking')}</span>
            <span className="font-numeric font-medium text-text-primary">
              −{formatRupees(paidBefore)}
            </span>
          </div>
          <div className="flex justify-between text-[15px] font-semibold text-text-primary">
            <span>
              {figures.amountDue > 0
                ? t('Customer pays in the app')
                : t('Nothing more to pay')}
            </span>
            <span className="font-numeric">
              {formatRupees(figures.amountDue)}
            </span>
          </div>
        </div>

        {problem && lines.some((line) => line.description || line.amount) && (
          // Polite, not an alert: it changes as the lines are typed.
          <p role="status" className="mt-2 text-[12px] text-error">
            {problem}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <ScButton
            variant="outline"
            size="lg"
            disabled={sending}
            onClick={() => setOpen(false)}
          >
            {t('Cancel')}
          </ScButton>
          <ScButton
            variant="main"
            size="lg"
            disabled={!!problem || sending}
            onClick={handleSend}
          >
            {sending ? t('Sending…') : bill ? t('Send new bill') : t('Send final bill')}
          </ScButton>
        </div>
      </ScSheet>
    </>
  )
}
