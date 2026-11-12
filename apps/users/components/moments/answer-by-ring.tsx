'use client'

import { formatClock } from '@repo/core/format'
import { answerByRing, type AnswerDeadline } from '@repo/core/moments'
import { usePrefersReducedMotion } from '@repo/ui/finish/motion'
import { useT } from '@repo/core/i18n'

/**
 * "They answer by" (moment 3): while a paid booking waits for the garage,
 * the time it has left to reply drains from a red-lit ring, like the
 * opening-hours ring, with the minutes left in the middle. A live state, so
 * it moves with the clock the page already keeps (the booking page's
 * `now`); the arc draws in once on arrival. When the garage's clock has not
 * started yet (it is shut), the ring is full and names the time instead.
 *
 * The words beside it on the page already say "They answer by …", so the
 * ring itself is drawn, not read.
 */
export function AnswerByRing({ deadline, now }: { deadline: AnswerDeadline; now: number }) {
  const t = useT()
  const reduce = usePrefersReducedMotion()
  const { fraction, minutesLeft } = answerByRing(deadline, now)
  return (
    <div aria-hidden="true" className="relative size-[72px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" strokeWidth="6" stroke="rgb(255 255 255 / 0.1)" />
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          strokeWidth="6"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - fraction}
          data-play={reduce ? undefined : ''}
          className="mo-ring__fill"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        {minutesLeft === null ? (
          <>
            <span className="text-over font-semibold uppercase text-[#8E8E98]">{t('by')}</span>
            <span className="mt-0.5 font-numeric text-t5 font-semibold text-text-primary">
              {formatClock(deadline.respondBy)}
            </span>
          </>
        ) : (
          <>
            <span className="font-numeric text-[20px] font-semibold text-text-primary">{minutesLeft}</span>
            <span className="mt-0.5 text-over font-medium text-[#8E8E98]">{t('min left')}</span>
          </>
        )}
      </span>
    </div>
  )
}
