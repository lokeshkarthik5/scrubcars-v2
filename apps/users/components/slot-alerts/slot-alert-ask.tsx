'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconBell, IconCircleCheck } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { Chip } from '@repo/ui/sc/chip'
import type { SlotDayState } from '@repo/ui/sc/slot-picker'
import { ApiError } from '@repo/core/api/client'
import { useCancelSlotAlert, useSetSlotAlert, useSlotAlerts } from '@repo/core/api/hooks/use-slot-alerts'
import {
  inSlotAlertWindow,
  SLOT_ALERT_WINDOW_HINTS,
  SLOT_ALERT_WINDOW_LABELS,
  SLOT_ALERT_WINDOWS,
  slotAlertDayLabel,
  slotAlertSummary,
  type SlotAlertWindow,
} from '@repo/core/slot-alerts'
import { useAuthStore } from '@repo/core/stores/auth-store'
import type { BookingType } from '@repo/core/types'

/**
 * Checkout's "Notify me if a slot opens" (0047), under the slot picker's
 * times. On a day that is all booked it is a card; on a day with times
 * left it is one quiet line ("None of these suit you?") that opens the same
 * card, with the parts of the day that still have a time greyed out, since
 * those should be booked rather than waited for. Nothing on a day that
 * cannot open up (closed, paused, too long a job, no time left to give
 * notice for).
 *
 * Signed out (a session that ran out at checkout): sign in, and come back
 * to the same checkout. The alert is the customer's own; one per garage and
 * day, at most five; Profile → Slot alerts lists them.
 */
export function SlotAlertAsk({
  state,
  vendorId,
  serviceIds,
  bookingType,
}: {
  state: SlotDayState
  vendorId: string
  serviceIds: string[]
  bookingType: BookingType
}) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const alerts = useSlotAlerts({ enabled: !!user })
  const setAlert = useSetSlotAlert()
  const cancelAlert = useCancelSlotAlert()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<SlotAlertWindow | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  // A part of the day with a time on offer is for booking, not waiting.
  const hasFreeTime = (option: SlotAlertWindow) => state.slots.some((slot) => inSlotAlertWindow(slot, option))
  const waitable = SLOT_ALERT_WINDOWS.filter((option) => !hasFreeTime(option))
  const full = state.slots.length === 0 && state.allBooked
  // Nothing can open up (closed, paused, too long a job), nothing was taken
  // (no time left to give notice for), or every part of the day has a time.
  if (state.unavailable || (!full && state.slots.length === 0) || waitable.length === 0) return null

  const part: SlotAlertWindow = picked && waitable.includes(picked) ? picked : waitable[0]
  const waiting = alerts.data?.items.find((alert) => alert.vendorId === vendorId && alert.date === state.date) ?? null
  const day = slotAlertDayLabel(state.date)

  if (waiting) {
    return (
      <ScCard className="mt-3 flex items-start gap-3" role="status">
        <IconCircleCheck size={20} stroke={1.6} aria-hidden="true" className="mt-px shrink-0 text-text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-text-primary">Waiting for a slot on {slotAlertSummary(waiting)}</p>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            If one opens it shows in Updates, and as a notification if they&apos;re on. It isn&apos;t held for you.{' '}
            <Link href="/profile/slot-alerts" className="font-medium text-text-primary underline">
              Slot alerts
            </Link>
          </p>
          <button
            type="button"
            disabled={cancelAlert.isPending}
            onClick={() => cancelAlert.mutate(waiting.id)}
            className="tap-target -ml-1 mt-1 px-1 text-[12px] font-medium text-text-secondary underline disabled:opacity-40"
          >
            Stop waiting
          </button>
        </div>
      </ScCard>
    )
  }

  if (!full && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap-target mt-3 flex items-center gap-1.5 text-[12px] text-text-secondary"
      >
        <IconBell size={14} stroke={1.6} aria-hidden="true" />
        None of these suit you? <span className="font-medium text-text-primary underline">Notify me if one opens</span>
      </button>
    )
  }

  const submit = () => {
    setProblem(null)
    if (!user) {
      // Back to this checkout, as it is, once signed in.
      router.push(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`)
      return
    }
    setAlert.mutate(
      { vendorId, date: state.date, window: part, bookingType, serviceIds },
      {
        onError: (err) =>
          setProblem(err instanceof ApiError ? err.message : "Couldn't set that up. Check your connection and try again."),
      }
    )
  }

  const hint = SLOT_ALERT_WINDOW_HINTS[part]

  return (
    <ScCard className="mt-3 flex flex-col gap-3">
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary">Notify me if a slot opens</h3>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          If a time frees up on {day}, it shows in Updates, and as a notification if they&apos;re on. It isn&apos;t
          held: the first to book gets it.
        </p>
      </div>

      <div role="group" aria-label="Which part of the day" className="flex flex-wrap gap-2">
        {SLOT_ALERT_WINDOWS.map((option) => (
          <Chip
            key={option}
            label={SLOT_ALERT_WINDOW_LABELS[option]}
            selected={part === option}
            disabled={hasFreeTime(option)}
            onClick={() => {
              setPicked(option)
              setProblem(null)
            }}
          />
        ))}
      </div>
      {(hint || waitable.length < SLOT_ALERT_WINDOWS.length) && (
        <p className="-mt-1 text-[11px] text-text-muted">
          {hint && <span className="font-numeric">{hint}</span>}
          {hint && waitable.length < SLOT_ALERT_WINDOWS.length && ' · '}
          {waitable.length < SLOT_ALERT_WINDOWS.length && 'Crossed out: a time is free then. Pick it above.'}
        </p>
      )}

      {problem && (
        <p role="alert" className="text-[12px] text-warning">
          {problem}
        </p>
      )}

      <ScButton
        variant="secondary"
        disabled={setAlert.isPending}
        onClick={submit}
        className="flex items-center justify-center gap-1.5"
      >
        <IconBell size={16} stroke={1.6} aria-hidden="true" />
        {user ? 'Notify me' : 'Sign in to get notified'}
      </ScButton>
    </ScCard>
  )
}
