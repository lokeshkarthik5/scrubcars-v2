'use client'

import { useState } from 'react'
import { IconAlertTriangle, IconCircleCheck, IconLoader2, IconMessageCircle } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useT } from '@repo/core/i18n'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { MarkedPhoto } from '@repo/ui/features/marked-photo'
import { markWasThere } from '@repo/core/api/condition-check'
import { beforeMarks, markLabel, newMarksForGarage, photoById } from '@repo/core/condition-check'
import { formatClock } from '@repo/core/format'
import type { Booking, ConditionMark } from '@repo/core/types'
import { firstName } from '@/lib/jobs'

/**
 * Under the walk-round's tiles on the job page (0075): where the before
 * check stands. Not sent: how many marks Detlio found (or that it is still
 * looking) and "Check the marks", which opens the screen that sends it.
 * Sent: when, and the customer's answer — "Looks right", or their
 * "Something's wrong" note, which the garage reads here.
 */
export function CarCheckSummary({ booking: b }: { booking: Booking }) {
  const t = useT()
  const check = b.conditionCheck
  if (!check) return null
  const who = firstName(b.customerName)
  const marks = beforeMarks(check)
  const reading = check.unread.length > 0
  const href = `/bookings/${b.id}/condition`

  if (!check.sentAt) {
    if (check.taken.before === 0) return null
    return (
      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <p className="flex items-center gap-2 text-[15px] text-text-primary" role="status">
          {reading ? (
            <>
              <IconLoader2 size={18} className="shrink-0 animate-spin text-text-secondary" aria-hidden />
              {t('Detlio is looking for scratches and dents…')}
            </>
          ) : check.ai ? (
            marks.length === 1 ? (
              t('Detlio found 1 mark. Check it, then send it to {who}.', { who })
            ) : (
              t('Detlio found {count} marks. Check them, then send them to {who}.', { count: marks.length, who })
            )
          ) : (
            t('Check the photos for marks, then send them to {who}.', { who })
          )}
        </p>
        <ScButtonLink href={href} variant="outline" size="lg" fullWidth>
          {t('Check the marks')}
        </ScButtonLink>
      </div>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      <p className="flex items-center gap-2 text-[15px] text-text-primary">
        <IconCircleCheck size={18} className="shrink-0 text-success" aria-hidden />
        {t('Car check sent to {who} at {time}', { who, time: formatClock(check.sentAt) })}
      </p>
      {check.answer?.kind === 'looks_right' && (
        <p className="text-[14px] text-text-secondary">{t('{who} said it looks right.', { who })}</p>
      )}
      {check.answer?.kind === 'something_wrong' && (
        <div className="rounded-[14px] border border-warning/40 bg-warning-muted px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[14px] font-medium text-warning">
            <IconMessageCircle size={16} aria-hidden />
            {t("{who} says something's wrong", { who })}
          </p>
          <p className="mt-1 whitespace-pre-line text-[15px] text-text-primary">“{check.answer.note}”</p>
        </div>
      )}
      {!check.answer && (
        <p className="text-[14px] text-text-secondary">
          {t("{who} hasn't answered yet. The job can go ahead.", { who })}
        </p>
      )}
      <ScButtonLink href={href} variant="text" size="md" className="self-start px-0">
        {t('See the marks')}
      </ScButtonLink>
    </div>
  )
}

/**
 * The garage's "It was there" on the first possible new mark it has not
 * answered, shared by the warning card and the docked bar's button row.
 */
export function useWasThere(b: Booking, onAnswered: () => void) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const marks = newMarksForGarage(b.conditionCheck)
  const mark: ConditionMark | undefined = marks[0]
  const answer = async () => {
    if (!mark) return
    setBusy(true)
    try {
      await markWasThere(b.id, mark.id)
      onAnswered()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Could not save that. Try again.'))
    } finally {
      setBusy(false)
    }
  }
  return { mark, more: Math.max(0, marks.length - 1), busy, answer }
}

/** "It was there", for the warning's mark. */
export function WasThereButton({
  state,
  className,
}: {
  state: ReturnType<typeof useWasThere>
  className?: string
}) {
  const t = useT()
  if (!state.mark) return null
  return (
    <ScButton
      variant="outline"
      size="lg"
      disabled={state.busy}
      onClick={state.answer}
      aria-label={t('It was there: {label}', { label: markLabel(state.mark) })}
      className={className}
    >
      {state.busy ? t('Saving...') : t('It was there')}
    </ScButton>
  )
}

/**
 * Above Complete job (and pickup & drop's last steps), once an after photo
 * shows a possible new mark (condition-check mockup 4): the two photos side
 * by side, and what to do. It warns; it never blocks. With `button`, "It was
 * there" sits in the card (pickup & drop); otherwise the docked bar puts it
 * beside Complete job.
 */
export function NewMarkWarning({
  booking: b,
  state,
  button = false,
}: {
  booking: Booking
  state: ReturnType<typeof useWasThere>
  button?: boolean
}) {
  const t = useT()
  const mark = state.mark
  if (!mark) return null
  const after = photoById(b.jobPhotos, mark.photoId)
  const before = photoById(b.jobPhotos, mark.beforePhotoId)
  const title = t('Possible new mark – {part}', { part: mark.part })

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2.5 rounded-[16px] border border-warning/40 bg-warning-muted p-3"
    >
      <p className="flex items-center gap-2 text-[16px] font-semibold text-warning">
        <IconAlertTriangle size={18} aria-hidden />
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {before && (
          <MarkedPhoto src={before.url} alt={t('Before')} marks={[]} className="rounded-[12px]">
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-brand-black/80 px-2 py-0.5 text-[12px] font-medium text-text-primary">
              {t('Before')}
            </span>
          </MarkedPhoto>
        )}
        {after && (
          <MarkedPhoto
            src={after.url}
            alt={t('After')}
            marks={[{ id: mark.id, box: mark.box, label: markLabel(mark) }]}
            labels={false}
            className="rounded-[12px]"
          >
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-brand-black/80 px-2 py-0.5 text-[12px] font-medium text-text-primary">
              {t('After')}
            </span>
          </MarkedPhoto>
        )}
      </div>
      <p className="text-[14px] text-text-primary">
        {t("It wasn't in the before photos. Check it now: the customer will see it.")}
      </p>
      {state.more > 0 && (
        <p className="text-[13px] text-text-secondary">
          {t('{count} more possible marks after this one.', { count: state.more })}
        </p>
      )}
      {button && <WasThereButton state={state} />}
    </section>
  )
}
