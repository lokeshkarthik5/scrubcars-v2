'use client'

import { useState } from 'react'
import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconMessageReport } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { MarkedPhoto } from '@repo/ui/features/marked-photo'
import { answerConditionCheck, markAlreadyThere } from '@repo/core/api/condition-check'
import { bookingReference } from '@repo/core/booking-types'
import {
  CAR_CHECK_ANGLE_LABELS,
  CONDITION_NOTE_MAX,
  beforeMarks,
  carCheckSlots,
  markLabel,
  newMarksForCustomer,
  photoById,
} from '@repo/core/condition-check'
import { formatClock } from '@repo/core/format'
import type { Booking, ConditionMark, JobPhoto } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { useT } from '@repo/core/i18n'
import { ScCard } from '@/components/ui/card'
import { MainAction } from '@/components/main-action'
import { RaiseComplaintSheet } from '@/components/complaints/raise-complaint-sheet'

/**
 * The car condition check on the customer's booking page (0075), right
 * under the status (condition-check mockups 3 and 5):
 *
 *  - "Your car's condition before the job": the garage's walk-round with
 *    Detlio's marks circled, "Looks right" (recorded with who and when) and
 *    "Something's wrong" (a short note the garage and the Detlio team read;
 *    the job still goes ahead). No answer holds nothing up.
 *  - Once the job is done, "New mark found – rear bumper" for a mark the
 *    after photos show that the before ones did not: the two photos side by
 *    side, "Raise a complaint" (today's complaint form, about this booking,
 *    filled in) and "It was already there". Nothing blames anyone.
 *
 * Nothing renders while the check is off for the garage or there is nothing
 * to show (the server sends null).
 */
export function ConditionCheckCard({
  booking,
  onChanged,
  onHelp,
}: {
  booking: Booking
  /** Re-read the booking after an answer. */
  onChanged: () => Promise<void> | void
  /** Opens Help with this booking. */
  onHelp: () => void
}) {
  const check = booking.conditionCheck
  if (!check) return null
  return (
    <>
      <NewMarkCards booking={booking} onChanged={onChanged} />
      {check.sentAt && <BeforeCheck booking={booking} onChanged={onChanged} onHelp={onHelp} />}
    </>
  )
}

function BeforeCheck({
  booking,
  onChanged,
  onHelp,
}: {
  booking: Booking
  onChanged: () => Promise<void> | void
  onHelp: () => void
}) {
  const t = useT()
  const check = booking.conditionCheck!
  const photos = check.photos
  const slots = carCheckSlots(photos, 'before').filter(
    (slot): slot is { angle: typeof slot.angle; photo: JobPhoto } => slot.photo !== null
  )
  const marks = beforeMarks(check)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected =
    slots.find((slot) => slot.photo.id === selectedId) ??
    slots.find((slot) => marks.some((mark) => mark.photoId === slot.photo.id)) ??
    slots[0]
  const [busy, setBusy] = useState(false)
  const [writing, setWriting] = useState(false)
  const car = booking.vehicle?.model ?? t('car')

  const looksRight = async () => {
    setBusy(true)
    try {
      await answerConditionCheck(booking.id, { answer: 'looks_right' })
      await onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Couldn't save your answer. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScCard className="flex flex-col gap-3">
      <div>
        <h2 className="text-t3 font-semibold text-text-primary">{t("Your car's condition before the job")}</h2>
        <p className="mt-0.5 text-t5 text-text-secondary">
          {t('{vendorName} photographed your {car} at {time}.', {
            vendorName: booking.vendorName,
            car,
            time: formatClock(check.sentAt!),
          })}{' '}
          {marks.length === 0
            ? t('Detlio found no marks.')
            : marks.length === 1
              ? t('Detlio marked 1 thing already there.')
              : t('Detlio marked {count} things already there.', { count: marks.length })}
        </p>
      </div>

      {selected && (
        <MarkedPhoto
          src={selected.photo.url}
          alt={t('Your car, {angle}', { angle: t(CAR_CHECK_ANGLE_LABELS[selected.angle]).toLowerCase() })}
          marks={marks
            .filter((mark) => mark.photoId === selected.photo.id)
            .map((mark) => ({ id: mark.id, box: mark.box, label: markLabel(mark) }))}
          className="rounded-[14px]"
        />
      )}

      {marks.length > 0 && (
        <ul aria-label={t('Marks already there')} className="flex flex-col gap-1">
          {marks.map((mark) => (
            <li key={mark.id}>
              <button
                type="button"
                onClick={() => setSelectedId(mark.photoId)}
                className="flex min-h-8 items-center gap-2 text-left text-t4 text-text-primary"
              >
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border-2 border-brand-red" />
                {markLabel(mark)}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul aria-label={t('Car check photos')} className="grid grid-cols-4 gap-1.5">
        {slots.map(({ angle, photo }) => {
          const label = t(CAR_CHECK_ANGLE_LABELS[angle])
          return (
            <li key={photo.id} className="flex flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={() => setSelectedId(photo.id)}
                aria-pressed={photo.id === selected?.photo.id}
                aria-label={t('Show the {angle} photo', { angle: label.toLowerCase() })}
                className={cn(
                  'block aspect-[4/3] w-full overflow-hidden rounded-[8px] bg-surface',
                  photo.id === selected?.photo.id ? 'ring-2 ring-brand-white' : 'ring-1 ring-inset ring-white/10'
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
              </button>
              <span className="text-[11px] text-text-secondary">{label}</span>
            </li>
          )
        })}
      </ul>

      {check.answer ? (
        <div role="status" className="flex items-start gap-2 rounded-[12px] border border-border bg-surface px-3 py-2.5">
          <IconCircleCheck size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />
          <p className="text-t4 text-text-primary">
            {check.answer.kind === 'looks_right'
              ? t('You said it looks right, at {time}.', { time: formatClock(check.answer.at) })
              : t('You told {vendorName} something is wrong. The Detlio team can see it too.', {
                  vendorName: booking.vendorName,
                })}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <MainAction
            fullWidth
            disabled={busy}
            onClick={looksRight}
            className="h-[52px] rounded-full py-0 text-t3 font-medium"
          >
            {busy ? t('Saving...') : t('Looks right')}
          </MainAction>
          <ScButton variant="text" disabled={busy} onClick={() => setWriting(true)}>
            {t("Something's wrong")}
          </ScButton>
        </div>
      )}

      <p className="text-center text-t5 text-text-muted">
        {t('Detlio can miss small scratches. The photos are kept with this booking as the record.')}
      </p>

      <SomethingWrongSheet
        open={writing}
        onClose={() => setWriting(false)}
        booking={booking}
        onSent={onChanged}
        onHelp={() => {
          setWriting(false)
          onHelp()
        }}
      />
    </ScCard>
  )
}

/** "Something's wrong": a short note for the garage (and the team), then Send. */
function SomethingWrongSheet({
  open,
  onClose,
  booking,
  onSent,
  onHelp,
}: {
  open: boolean
  onClose: () => void
  booking: Booking
  onSent: () => Promise<void> | void
  onHelp: () => void
}) {
  const t = useT()
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!note.trim()) return
    setSending(true)
    setError('')
    try {
      await answerConditionCheck(booking.id, { answer: 'something_wrong', note: note.trim() })
      setNote('')
      onClose()
      await onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Couldn't send it. Check your connection and try again."))
    } finally {
      setSending(false)
    }
  }

  return (
    <ScSheet open={open} onClose={onClose} dismissible={!sending} aria-label={t("Something's wrong")} className="px-4 pt-1">
      <form onSubmit={send} className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">{t("Something's wrong")}</h2>
            <p className="mt-1 text-t5 text-text-secondary">
              {t('Tell {vendorName} what is not right in the photos. The Detlio team sees it too, and the job can still go ahead.', {
                vendorName: booking.vendorName,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label={t('Close')}
            className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center disabled:opacity-40"
          >
            <IconCircleX size={22} className="text-text-secondary" />
          </button>
        </div>
        <ScTextarea
          data-clarity-mask="true"
          id="condition-note"
          label={t("What's wrong?")}
          rows={4}
          maxLength={CONDITION_NOTE_MAX}
          placeholder={t('e.g. The dent on the bonnet was not there')}
          value={note}
          onChange={(e) => {
            setNote(e.target.value)
            setError('')
          }}
        />
        {error && (
          <p role="alert" className="text-t5 text-error">
            {error}
          </p>
        )}
        <ScButton type="submit" disabled={sending || !note.trim()} className="min-h-11">
          {sending ? t('Sending…') : t('Send to the garage')}
        </ScButton>
        <ScButton type="button" variant="text" onClick={onHelp}>
          {t('Help with this booking')}
        </ScButton>
      </form>
    </ScSheet>
  )
}

/** Each possible new mark the customer has not dismissed, once the job is done. */
function NewMarkCards({ booking, onChanged }: { booking: Booking; onChanged: () => Promise<void> | void }) {
  const marks = newMarksForCustomer(booking.conditionCheck)
  if (marks.length === 0) return null
  return (
    <>
      {marks.map((mark) => (
        <NewMarkCard key={mark.id} booking={booking} mark={mark} onChanged={onChanged} />
      ))}
    </>
  )
}

function NewMarkCard({
  booking,
  mark,
  onChanged,
}: {
  booking: Booking
  mark: ConditionMark
  onChanged: () => Promise<void> | void
}) {
  const t = useT()
  const photos = booking.conditionCheck!.photos
  const after = photoById(photos, mark.photoId)
  const before = photoById(photos, mark.beforePhotoId)
  const [busy, setBusy] = useState(false)
  const [complaining, setComplaining] = useState(false)
  const title = t('New mark found – {part}', { part: mark.part })

  const alreadyThere = async () => {
    setBusy(true)
    try {
      await markAlreadyThere(booking.id, mark.id)
      await onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Couldn't save your answer. Try again."))
    } finally {
      setBusy(false)
    }
  }

  const chip = (text: string) => (
    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-brand-black/80 px-2 py-0.5 font-numeric text-[11px] font-medium text-text-primary">
      {text}
    </span>
  )

  return (
    <ScCard role="region" className="flex flex-col gap-3 border-warning/50 bg-warning-muted" aria-label={title}>
      <h2 className="flex items-center gap-2 text-t3 font-semibold text-warning">
        <IconAlertTriangle size={18} aria-hidden />
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {before && (
          <MarkedPhoto src={before.url} alt={t('Before the job')} marks={[]} className="rounded-[12px]">
            {chip(t('Before · {time}', { time: formatClock(before.createdAt) }))}
          </MarkedPhoto>
        )}
        {after && (
          <MarkedPhoto
            src={after.url}
            alt={t('After the job')}
            marks={[{ id: mark.id, box: mark.box, label: markLabel(mark) }]}
            labels={false}
            className="rounded-[12px]"
          >
            {chip(t('After · {time}', { time: formatClock(after.createdAt) }))}
          </MarkedPhoto>
        )}
      </div>
      <p className="text-t4 text-text-secondary">
        {t("It isn't in the photos from before the job. It may be nothing (light, water, dirt). If it is damage, tell us and the Detlio team will look into it with the garage.")}
      </p>
      <ScButton variant="outline" onClick={() => setComplaining(true)} className="min-h-11">
        <span className="flex items-center justify-center gap-2">
          <IconMessageReport size={18} aria-hidden />
          {t('Raise a complaint')}
        </span>
      </ScButton>
      <ScButton variant="text" disabled={busy} onClick={alreadyThere}>
        {busy ? t('Saving...') : t('It was already there')}
      </ScButton>

      <RaiseComplaintSheet
        open={complaining}
        onClose={() => setComplaining(false)}
        booking={{ id: booking.id, reference: `#${bookingReference(booking.id)}`, vendorName: booking.vendorName }}
        prefill={{
          category: 'damage',
          message: t('{label}: it is not in the car check photos from before the job.', { label: markLabel(mark) }),
        }}
      />
    </ScCard>
  )
}
