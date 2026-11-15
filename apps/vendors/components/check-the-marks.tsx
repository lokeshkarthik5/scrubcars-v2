'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { IconArrowLeft, IconLoader2, IconPlus } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useT } from '@repo/core/i18n'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { Chip } from '@repo/ui/sc/chip'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { ScInput } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { MarkedPhoto } from '@repo/ui/features/marked-photo'
import {
  addConditionMark,
  removeConditionMark,
  restoreConditionMark,
  sendConditionCheck,
} from '@repo/core/api/condition-check'
import {
  CAR_CHECK_ANGLE_LABELS,
  DAMAGE_KINDS,
  DAMAGE_KIND_LABELS,
  MARK_PART_MAX,
  beforeMarks,
  carCheckSlots,
  markLabel,
  type DamageKind,
} from '@repo/core/condition-check'
import { formatClock } from '@repo/core/format'
import type { Booking, ConditionMark, JobPhoto } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { firstName } from '@/lib/jobs'

/** Back to the job's page. */
export function BackToJob({ id }: { id: string }) {
  const t = useT()
  return (
    <Link
      href={`/bookings/${id}`}
      aria-label={t('Go back')}
      className="press -ml-2 flex size-12 shrink-0 items-center justify-center rounded-full text-text-primary"
    >
      <IconArrowLeft size={22} aria-hidden="true" />
    </Link>
  )
}

/**
 * "Check the marks" (0075, condition-check mockup 2): the walk-round's
 * before photos with Detlio's marks circled, a list of every mark with
 * Remove (and Undo), "Add a mark Detlio missed", and "Send to customer".
 * Once sent it only shows: the photos and marks are the record.
 */
export function CheckTheMarks({ booking: b, onChanged }: { booking: Booking; onChanged: () => void }) {
  const t = useT()
  const router = useRouter()
  const check = b.conditionCheck!
  const who = firstName(b.customerName)
  const car = b.vehicle?.model ?? t('car')
  const slots = carCheckSlots(b.jobPhotos, 'before').filter(
    (slot): slot is { angle: typeof slot.angle; photo: JobPhoto } => slot.photo !== null
  )
  const marks = beforeMarks(check, true).filter((mark) => slots.some((slot) => slot.photo.id === mark.photoId))
  const kept = marks.filter((mark) => !mark.removed)
  const sent = check.sentAt !== null
  const reading = check.unread.length

  // The photo in view: the first with a mark, else the first taken.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected =
    slots.find((slot) => slot.photo.id === selectedId) ??
    slots.find((slot) => kept.some((mark) => mark.photoId === slot.photo.id)) ??
    slots[0]
  const [busyMark, setBusyMark] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [adding, setAdding] = useState(false)

  const toggle = async (mark: ConditionMark) => {
    setBusyMark(mark.id)
    try {
      if (mark.removed) await restoreConditionMark(b.id, mark.id)
      else await removeConditionMark(b.id, mark.id)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Could not save that. Try again.'))
    } finally {
      setBusyMark(null)
    }
  }

  const send = async () => {
    setSending(true)
    try {
      await sendConditionCheck(b.id)
      toast.success(t('Car check sent to {who}', { who }))
      onChanged()
      router.push(`/bookings/${b.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Could not send the car check. Try again.'))
      onChanged()
    } finally {
      setSending(false)
    }
  }

  const missing = check.gate?.missing ?? 0

  return (
    <AppShell
      navType="vendor"
      className={cn('gap-4 py-4', !sent && 'pb-[calc(9rem+env(safe-area-inset-bottom))]')}
    >
      <header className="flex items-center gap-2">
        <BackToJob id={b.id} />
        <h1 className="text-[22px] font-semibold leading-tight text-text-primary">{t('Check the marks')}</h1>
      </header>

      <p className="text-[16px] text-text-secondary" role="status">
        {sent
          ? t('Sent to {who} at {time}. The photos and marks stay with the booking.', {
              who,
              time: formatClock(check.sentAt!),
            })
          : reading > 0
            ? t('Detlio is still looking at {count} photos…', { count: reading })
            : !check.ai
              ? t('Add any scratches or dents you see on {who}’s {car}, then send.', { who, car })
              : kept.length === 1
                ? t('Detlio found 1 mark on {who}’s {car}. Remove it if it is wrong, then send.', { who, car })
                : t('Detlio found {count} marks on {who}’s {car}. Remove any that are wrong, then send.', {
                    count: kept.length,
                    who,
                    car,
                  })}
      </p>

      {selected ? (
        <>
          <MarkedPhoto
            src={selected.photo.url}
            alt={t(CAR_CHECK_ANGLE_LABELS[selected.angle])}
            marks={kept
              .filter((mark) => mark.photoId === selected.photo.id)
              .map((mark) => ({ id: mark.id, box: mark.box, label: markLabel(mark) }))}
          >
            <span className="absolute bottom-2 left-2 rounded-full bg-brand-black/80 px-2.5 py-0.5 text-[14px] font-medium text-text-primary">
              {t(CAR_CHECK_ANGLE_LABELS[selected.angle])}
            </span>
          </MarkedPhoto>

          <ul aria-label={t('Car check photos')} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {slots.map(({ angle, photo }) => {
              const count = kept.filter((mark) => mark.photoId === photo.id).length
              const label = t(CAR_CHECK_ANGLE_LABELS[angle])
              return (
                <li key={photo.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(photo.id)}
                    aria-pressed={photo.id === selected.photo.id}
                    aria-label={
                      count === 1
                        ? t('{angle} photo, 1 mark', { angle: label })
                        : t('{angle} photo, {count} marks', { angle: label, count })
                    }
                    className={cn(
                      'relative block h-14 w-[72px] overflow-hidden rounded-[12px] bg-surface',
                      photo.id === selected.photo.id ? 'ring-2 ring-brand-white' : 'ring-1 ring-inset ring-border'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                    {count > 0 && (
                      <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-brand-red font-numeric text-[11px] font-semibold text-white">
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <EmptyState title={t('No car check photos yet')} subtitle={t('Take them on the job page first.')} />
      )}

      {marks.length > 0 && (
        <ul aria-label={t('Marks')} className="flex flex-col divide-y divide-border">
          {marks.map((mark) => {
            const label = markLabel(mark)
            return (
              <li key={mark.id} className="flex min-h-14 items-center gap-3 py-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-3 shrink-0 rounded-full border-2',
                    mark.removed ? 'border-text-muted' : 'border-brand-red'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setSelectedId(mark.photoId)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={cn(
                      'block text-[16px]',
                      mark.removed ? 'text-text-muted line-through' : 'text-text-primary'
                    )}
                  >
                    {t(DAMAGE_KIND_LABELS[mark.kind])}
                  </span>
                  <span className="block text-[14px] text-text-secondary">
                    {mark.part}
                    {mark.unsure && <> · {t("Detlio wasn't sure")}</>}
                    {mark.source === 'garage' && <> · {t('Added by you')}</>}
                  </span>
                </button>
                {!sent && (
                  <button
                    type="button"
                    disabled={busyMark !== null}
                    onClick={() => toggle(mark)}
                    aria-label={
                      mark.removed ? t('Undo removing {label}', { label }) : t('Remove {label}', { label })
                    }
                    className="min-h-11 shrink-0 px-1 text-[15px] text-text-primary underline underline-offset-4 disabled:opacity-50"
                  >
                    {busyMark === mark.id ? (
                      <IconLoader2 size={16} className="animate-spin" aria-hidden />
                    ) : mark.removed ? (
                      t('Undo')
                    ) : (
                      t('Remove')
                    )}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!sent && selected && (
        <ScButton variant="outline" size="lg" onClick={() => setAdding(true)}>
          <IconPlus size={18} aria-hidden="true" />
          {t('Add a mark Detlio missed')}
        </ScButton>
      )}

      <p className="text-[14px] text-text-secondary">
        {t('Detlio can miss small scratches. The photos are the record, for you and the customer.')}
      </p>

      {!sent && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[428px] border-t border-border bg-brand-black/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          {missing > 0 && (
            <p id="car-check-missing" className="mb-2 text-[15px] text-warning">
              {missing === 1
                ? t('Take 1 more car check photo first.')
                : t('Take {count} more car check photos first.', { count: missing })}
            </p>
          )}
          <ScButton
            variant="main"
            size="lg"
            fullWidth
            disabled={!check.canSend || sending}
            aria-describedby={missing > 0 ? 'car-check-missing' : undefined}
            onClick={send}
          >
            {sending ? t('Sending…') : t('Send to customer')}
          </ScButton>
        </div>
      )}

      {selected && (
        <AddMarkSheet
          open={adding}
          onClose={() => setAdding(false)}
          bookingId={b.id}
          photo={selected.photo}
          angleLabel={t(CAR_CHECK_ANGLE_LABELS[selected.angle])}
          onAdded={onChanged}
        />
      )}
    </AppShell>
  )
}

/** "Add a mark Detlio missed" on the photo in view: what, and where on the car. */
function AddMarkSheet({
  open,
  onClose,
  bookingId,
  photo,
  angleLabel,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  bookingId: string
  photo: JobPhoto
  angleLabel: string
  onAdded: () => void
}) {
  const t = useT()
  const [kind, setKind] = useState<DamageKind>('scratch')
  const [part, setPart] = useState('')
  const [saving, setSaving] = useState(false)

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!part.trim()) return
    setSaving(true)
    try {
      await addConditionMark(bookingId, { photoId: photo.id, kind, part: part.trim() })
      setPart('')
      onAdded()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Could not save that. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScSheet open={open} onClose={onClose} dismissible={!saving} aria-label={t('Add a mark Detlio missed')} className="px-4 pt-1">
      <form onSubmit={add} className="flex flex-col gap-4">
        <div>
          <h2 className="text-[18px] font-semibold text-text-primary">{t('Add a mark Detlio missed')}</h2>
          <p className="mt-1 text-[14px] text-text-secondary">{t('On the {angle} photo.', { angle: angleLabel.toLowerCase() })}</p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-medium text-text-secondary">{t('What is it?')}</legend>
          <div className="flex flex-wrap gap-2">
            {DAMAGE_KINDS.map((value) => (
              <Chip
                key={value}
                label={t(DAMAGE_KIND_LABELS[value])}
                selected={kind === value}
                onClick={() => setKind(value)}
                className="min-h-11"
              />
            ))}
          </div>
        </fieldset>
        <ScInput
          id="mark-part"
          label={t('Where on the car')}
          placeholder={t('e.g. rear left door')}
          maxLength={MARK_PART_MAX}
          value={part}
          onChange={(event) => setPart(event.target.value)}
        />
        <ScButton type="submit" variant="main" size="lg" disabled={saving || !part.trim()}>
          {saving ? t('Saving...') : t('Add mark')}
        </ScButton>
      </form>
    </ScSheet>
  )
}
