'use client'

import { useState } from 'react'
import { IconCameraPlus, IconTool, IconX } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { StatusChip } from '@repo/ui/sc/status-chip'
import { askExtraWork, withdrawExtraWork } from '@repo/core/api/job-records'
import { formatINR } from '@repo/core/format'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import type { StatusTone } from '@repo/core/status-tone'
import type { Booking, ExtraWork } from '@repo/core/types'
import { JobSheetRow } from '@/components/job-sheet-row'
import { resizeForUpload } from '@/lib/resize-image'

/** Mirror the server's limits (lib/extra-work.ts) so the form refuses first. */
const MAX_DESCRIPTION = 80
const MAX_NOTE = 500
const MAX_PHOTOS = 3

/** One colour per meaning (UX audit, garage finding 7): green only once it is paid. */
const STATE: Record<ExtraWork['state'], { label: string; tone: StatusTone }> = {
  awaiting: { label: 'Waiting for customer', tone: 'progress' },
  paid: { label: 'Approved & paid — go ahead', tone: 'done' },
  declined: { label: 'Declined by customer', tone: 'closed' },
  withdrawn: { label: 'Withdrawn', tone: 'closed' },
  closed: { label: 'Closed with the booking', tone: 'closed' },
}

/** Why the form cannot be sent yet; null when it can. */
function formProblem(description: string, amount: string): string | null {
  if (!description.trim()) return 'Say what the extra work is.'
  const n = Number(amount)
  if (!amount || !Number.isFinite(n) || n < 1)
    return 'Give a price of at least ₹1.'
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6)
    return 'Use at most two decimals.'
  return null
}

interface ExtraWorkPanelProps {
  booking: Booking
  /** Re-read the job list once a request changes. */
  onChanged: () => void
}

/**
 * Extra work on the garage's job card (0041): found something more to do
 * while the car is in — worn brake pads, a cracked wiper — ask the customer
 * here, with a price and photos. They approve by paying it in the Detlio
 * app, or decline; the badge says which. Do the work once it reads
 * "Approved & paid — go ahead". An unpaid request can be withdrawn, and the
 * job can't be marked completed while one waits for an answer.
 *
 * Not on a job priced on inspection: its final bill covers what the
 * inspection finds, so the card says to add it there.
 */
export function ExtraWorkPanel({ booking, onChanged }: ExtraWorkPanelProps) {
  const [listOpen, setListOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  const who = booking.customerName ?? 'the customer'
  const canAsk = booking.extraWorkRefusal === null
  const isVendorAdmin = useIsVendorAdmin()

  // Asked for before, it stays on the card for good (paid, declined…); on a
  // job that is on, the card offers to ask.
  const jobOn =
    booking.status === 'confirmed' || booking.status === 'in_progress'
  if (booking.extraWork.length === 0 && !jobOn) return null

  const handleWithdraw = async (work: ExtraWork) => {
    if (withdrawing) return
    setWithdrawing(work.id)
    try {
      await withdrawExtraWork(booking.id, work.id)
      toast.success('Extra work withdrawn.')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not withdraw it'
      )
    } finally {
      setWithdrawing(null)
      onChanged()
    }
  }

  const latest = booking.extraWork[0]
  const live = booking.extraWork.filter(
    (work) => work.state === 'awaiting' || work.state === 'paid'
  )
  const total = live.reduce((sum, work) => sum + Number(work.amount), 0)
  const refusal =
    booking.extraWorkRefusal === 'on_inspection'
      ? 'This job is priced on inspection: add any extra work to its final bill.'
      : booking.extraWorkRefusal === 'too_many_open'
        ? `${who} has 3 requests to answer. Wait for an answer, or withdraw one, to ask for more.`
        : null

  return (
    <>
      <JobSheetRow
        icon={<IconTool size={22} stroke={1.6} />}
        title={
          <>
            Extra work
            {/* The sum is the owner's; each request's own price stays in the sheet. */}
            {isVendorAdmin && total > 0 && (
              <span className="font-numeric">{` · ${formatINR(total, { paise: true })}`}</span>
            )}
          </>
        }
        detail={
          latest
            ? `${latest.description} · ${STATE[latest.state].label}`
            : (refusal ?? 'Found more to do? Ask the customer')
        }
        aria-label={
          latest
            ? `Extra work for ${who}`
            : canAsk
              ? `Ask ${who} for extra work`
              : undefined
        }
        onOpen={
          latest
            ? () => setListOpen(true)
            : canAsk
              ? () => setAsking(true)
              : undefined
        }
      />

      <ScSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        aria-label={`Extra work for ${who}`}
        className="px-4"
      >
        <h2 className="text-[20px] font-semibold text-text-primary">
          Extra work
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {booking.extraWork.map((work) => (
            <div
              key={work.id}
              className="flex flex-col gap-2 rounded-[16px] bg-surface px-4 py-3 ring-1 ring-inset ring-border"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-[16px] text-text-primary">
                  {work.description}
                </p>
                <span className="shrink-0 font-numeric text-[18px] font-semibold text-text-primary">
                  {formatINR(Number(work.amount), { paise: true })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <StatusChip tone={STATE[work.state].tone}>
                  {STATE[work.state].label}
                </StatusChip>
                {work.photos.length > 0 && (
                  <span className="font-numeric text-[13px] text-text-secondary">
                    {work.photos.length === 1
                      ? '1 photo'
                      : `${work.photos.length} photos`}
                  </span>
                )}
              </div>
              {work.state === 'awaiting' && (
                <ScButton
                  variant="outline"
                  size="md"
                  disabled={withdrawing !== null}
                  onClick={() => handleWithdraw(work)}
                  aria-label={`Withdraw extra work ${work.description} for ${who}`}
                >
                  {withdrawing === work.id ? 'Withdrawing…' : 'Withdraw'}
                </ScButton>
              )}
            </div>
          ))}
          {refusal ? (
            <p className="text-[14px] text-text-secondary">{refusal}</p>
          ) : canAsk ? (
            <ScButton
              variant="outline"
              size="lg"
              onClick={() => {
                setListOpen(false)
                setAsking(true)
              }}
              aria-label={`Ask ${who} for extra work`}
            >
              Ask for extra work
            </ScButton>
          ) : null}
        </div>
      </ScSheet>

      {asking && (
        <ExtraWorkSheet
          booking={booking}
          onClose={() => setAsking(false)}
          onSent={() => {
            setAsking(false)
            onChanged()
          }}
        />
      )}
    </>
  )
}

function ExtraWorkSheet({
  booking,
  onClose,
  onSent,
}: {
  booking: Booking
  onClose: () => void
  onSent: () => void
}) {
  const who = booking.customerName ?? 'the customer'
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<Array<{ blob: Blob; preview: string }>>(
    []
  )
  const [preparing, setPreparing] = useState(false)
  const [sending, setSending] = useState(false)
  const problem = formProblem(description, amount)

  const handleFiles = async (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []).slice(
      0,
      Math.max(0, MAX_PHOTOS - photos.length)
    )
    input.value = ''
    if (files.length === 0) return
    setPreparing(true)
    try {
      for (const file of files) {
        try {
          // Shrunk to a JPEG in the browser first, which also drops the
          // photo's location data, as for job photos.
          const blob = await resizeForUpload(file)
          setPhotos((current) =>
            current.length >= MAX_PHOTOS
              ? current
              : [...current, { blob, preview: URL.createObjectURL(blob) }]
          )
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : 'That photo could not be used'
          )
        }
      }
    } finally {
      setPreparing(false)
    }
  }

  const handleSend = async () => {
    if (problem || sending) return
    setSending(true)
    try {
      await askExtraWork(booking.id, {
        description: description.trim(),
        amount: Number(amount),
        note: note.trim() || undefined,
        photos: photos.map((photo) => photo.blob),
      })
      toast.success(
        `Sent. ${who} can approve and pay ${formatINR(Number(amount), { paise: true })} in the Detlio app.`
      )
      onSent()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send it')
    } finally {
      setSending(false)
    }
  }

  return (
    <ScSheet
      open
      onClose={onClose}
      dismissible={!sending}
      aria-label={`Extra work for ${who}`}
      className="px-4"
    >
      <h2 className="text-[20px] font-semibold text-text-primary">
        Ask for extra work
      </h2>
      {/* A whole sentence from one template string: a name glued into JSX
          text lost its space in the built page ("Meena Krishnanapproves"). */}
      <p className="mt-1 text-[14px] text-text-secondary">
        {`${who} approves it by paying in the Detlio app. Don't start it until it says Approved & paid.`}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <ScInput
          label="What needs doing"
          placeholder="e.g. Replace front brake pads"
          maxLength={MAX_DESCRIPTION}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <ScInput
          label="Price (₹)"
          aria-label="Price in rupees"
          inputMode="decimal"
          placeholder="0"
          className="font-numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
        />

        <div className="flex flex-col gap-1.5">
          <p className="text-[14px] font-medium text-text-primary">
            Photos{' '}
            <span className="font-numeric text-text-secondary">
              {photos.length}/{MAX_PHOTOS}
            </span>
          </p>
          <p className="text-[13px] text-text-secondary">
            Optional. Show the customer what you found.
          </p>
          <ul className="flex flex-wrap gap-2">
            {photos.map((photo, i) => (
              <li key={photo.preview} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
                <img
                  src={photo.preview}
                  alt=""
                  className="size-16 rounded-[10px] object-cover ring-1 ring-inset ring-border"
                />
                <button
                  type="button"
                  onClick={() =>
                    setPhotos((current) => current.filter((_, j) => j !== i))
                  }
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-surface-elevated text-text-primary ring-1 ring-border"
                >
                  <IconX size={14} aria-hidden />
                </button>
              </li>
            ))}
            {photos.length < MAX_PHOTOS && (
              <li>
                <label className="flex size-16 cursor-pointer items-center justify-center rounded-[10px] bg-surface text-text-secondary ring-1 ring-inset ring-border">
                  <IconCameraPlus size={20} aria-hidden />
                  <span className="sr-only">Add photos of the extra work</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={preparing || sending}
                    className="sr-only"
                    onChange={(e) => void handleFiles(e.currentTarget)}
                  />
                </label>
              </li>
            )}
          </ul>
        </div>

        <ScTextarea
          label="Note for the customer (optional)"
          rows={2}
          maxLength={MAX_NOTE}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {problem && (description || amount) && (
        <p role="status" className="mt-2 text-[13px] text-error">
          {problem}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <ScButton
          variant="outline"
          size="lg"
          disabled={sending}
          onClick={onClose}
        >
          Cancel
        </ScButton>
        <ScButton
          variant="main"
          size="lg"
          disabled={!!problem || sending || preparing}
          onClick={handleSend}
        >
          {sending ? 'Sending…' : 'Send to customer'}
        </ScButton>
      </div>
    </ScSheet>
  )
}
