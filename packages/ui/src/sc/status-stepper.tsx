'use client'

import { IconCheck } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

type StepState = 'done' | 'current' | 'upcoming'

/** The steps a time can be given for, by key. */
export type StepKey = 'requested' | 'confirmed' | 'in_progress' | 'completed'

interface Step {
  key: StepKey
  label: Partial<Record<StepState, string>> & { upcoming: string }
  caption: Record<StepState, string>
}

/**
 * The customer's timeline, in the order a booking actually moves.
 *
 * "Requested" is its own step because that is what exists the moment checkout
 * finishes: the request is sent (and paid for), and the garage has not agreed
 * to anything yet. The previous three-step version opened on "Confirmed",
 * which a pending booking then had to relabel "Waiting" — so the first thing a
 * customer saw after paying read as a promise of a slot nobody had accepted.
 *
 * Labels and captions follow the step's state, so a step says what is true
 * now: "Waiting for garage" while the request is open, "Accepted" once it
 * isn't. The words are the customer app's status words, the same as its
 * status bar, chips and list (Requested → Accepted → In progress → Done);
 * only the customer app draws this timeline.
 */
const STEPS: Step[] = [
  {
    key: 'requested',
    label: { upcoming: 'Requested' },
    caption: {
      done: 'Sent to the garage',
      current: 'Sent to the garage',
      upcoming: 'Sent to the garage',
    },
  },
  {
    key: 'confirmed',
    label: { current: 'Waiting for garage', upcoming: 'Accepted' },
    caption: {
      done: 'Your slot is reserved',
      current: 'Shows here as soon as the garage accepts',
      upcoming: 'The garage accepts your slot',
    },
  },
  {
    key: 'in_progress',
    label: { upcoming: 'In progress' },
    caption: {
      done: 'Work started on your car',
      current: 'Work has started on your car',
      upcoming: 'Starts at your booked time',
    },
  },
  {
    key: 'completed',
    label: { upcoming: 'Done' },
    caption: {
      done: 'Your car is ready',
      current: 'Your car is ready',
      upcoming: 'Marked here when the work is done',
    },
  },
]

/**
 * How far each status has got: the last finished step, and the step under way
 * (null when nothing is — a confirmed booking is waiting for its time, not on
 * anyone's part). An unknown status reads as a request, the state that claims
 * least.
 */
const PROGRESS: Record<
  string,
  { doneThrough: number; current: number | null }
> = {
  pending: { doneThrough: 0, current: 1 },
  confirmed: { doneThrough: 1, current: null },
  in_progress: { doneThrough: 1, current: 2 },
  completed: { doneThrough: 3, current: null },
}

export function StatusStepper({
  status,
  times,
}: {
  status: string
  /**
   * When each reached step happened, already formatted ("10:42 am"). Shown
   * under its step; a step with no time recorded (an older booking) simply
   * shows none, and a step not reached yet never shows one.
   */
  times?: Partial<Record<StepKey, string>>
}) {
  const progress = PROGRESS[status] ?? PROGRESS.pending

  return (
    <ol aria-label="Booking progress" className="flex flex-col">
      {STEPS.map((step, i) => {
        const state: StepState =
          i <= progress.doneThrough
            ? 'done'
            : i === progress.current
              ? 'current'
              : 'upcoming'
        const done = state === 'done'
        const active = state !== 'upcoming'
        const isLast = i === STEPS.length - 1

        return (
          <li
            key={step.key}
            className="flex gap-3"
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2',
                  done
                    ? 'border-brand-white bg-brand-white'
                    : state === 'current'
                      ? 'border-brand-white'
                      : 'border-text-muted'
                )}
              >
                {done && (
                  <IconCheck
                    size={13}
                    stroke={3}
                    className="text-brand-black"
                  />
                )}
                {/* Live, not finished: the page polls, and this is the step
                    the next change lands on. The pulse stops under reduced
                    motion (see globals.css); the dot stays. */}
                {state === 'current' && (
                  <span className="pulse-dot h-2 w-2 rounded-full bg-brand-white" />
                )}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'my-1 min-h-[22px] w-px flex-1',
                    done ? 'bg-brand-white/30' : 'bg-border'
                  )}
                />
              )}
            </div>
            <div className={cn(isLast ? 'pb-0' : 'pb-4', 'pt-0')}>
              <p
                className={cn(
                  'text-[14px] font-semibold leading-tight',
                  active ? 'text-text-primary' : 'text-text-muted'
                )}
              >
                {step.label[state] ?? step.label.upcoming}
              </p>
              <p
                className={cn(
                  'mt-0.5 text-[12px] leading-tight',
                  active ? 'text-text-secondary' : 'text-text-muted'
                )}
              >
                {step.caption[state]}
              </p>
              {active && times?.[step.key] && (
                <p className="mt-0.5 font-numeric text-[11px] leading-tight text-text-muted">
                  {times[step.key]}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
