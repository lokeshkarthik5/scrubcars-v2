'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { removeAdminVendorClosure } from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { Chip } from '@repo/ui/sc/chip'
import { ScField } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import {
  legacyVehicleTypes,
  VENDOR_VEHICLE_TYPE_OPTIONS,
} from '@repo/core/vehicles'
import { cn } from '@repo/core/utils'
import {
  DAYS,
  SLOT_INTERVALS,
  formatDay,
  type GarageDraft,
  type GarageDraftState,
} from '../use-garage-draft'

const TIME_INPUT =
  'min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-2 font-numeric text-[13px] text-text-primary outline-none transition-colors focus:border-text-secondary disabled:opacity-40'

/**
 * Hours & booking (`?tab=operations`, its name from when it was called
 * Operations): the week, slots, how many cars at once and the car types.
 * How customers book (with Pickup & drop) is on Location and saves on its
 * own; Pause is in the status panel's Go live.
 */
export function HoursBookingTab({
  g,
  draft,
}: {
  g: GarageDraftState
  draft: GarageDraft
}) {
  const { set, patch, updateDay, toggle, closures, setClosures } = g
  const vendorId = g.id
  const legacy = legacyVehicleTypes(draft.vehicleTypes)

  return (
    // Side by side once the column has room (a 1440 laptop has).
    <div className="grid items-start gap-4 @3xl:grid-cols-2">
      <ScSection title="Working hours">
        {/* The garage's own week, day by day: the same rows the owner edits
            in their Settings. Left alone unless changed here. */}
        <div className="flex flex-col gap-2">
          {draft.hours.map((day) => (
            <div key={day.dayOfWeek} className="flex items-center gap-2">
              <span
                className={cn(
                  'w-9 shrink-0 text-[13px] font-medium',
                  day.isClosed ? 'text-text-muted' : 'text-text-primary'
                )}
              >
                {DAYS[day.dayOfWeek]}
              </span>
              <input
                type="time"
                aria-label={`${DAYS[day.dayOfWeek]} opening time`}
                value={day.openTime}
                disabled={day.isClosed}
                onChange={(e) =>
                  updateDay(day.dayOfWeek, { openTime: e.target.value })
                }
                className={TIME_INPUT}
              />
              <input
                type="time"
                aria-label={`${DAYS[day.dayOfWeek]} closing time`}
                value={day.closeTime}
                disabled={day.isClosed}
                onChange={(e) =>
                  updateDay(day.dayOfWeek, { closeTime: e.target.value })
                }
                className={TIME_INPUT}
              />
              {/* The same pressed pill as the garage's own Settings: a closed
                  day is raised onto graphite. */}
              <button
                type="button"
                aria-label={`${DAYS[day.dayOfWeek]} closed all day`}
                aria-pressed={day.isClosed}
                onClick={() =>
                  updateDay(day.dayOfWeek, { isClosed: !day.isClosed })
                }
                className={cn(
                  'min-h-11 w-[68px] shrink-0 rounded-[10px] border text-[12px] font-medium transition-colors',
                  day.isClosed
                    ? 'border-text-secondary bg-surface-elevated text-text-primary'
                    : 'border-border text-text-secondary hover:text-text-primary'
                )}
              >
                {day.isClosed ? 'Closed' : 'Open'}
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-text-secondary">
            Upcoming holidays
          </span>
          {closures.length === 0 ? (
            <p className="text-[12px] text-text-muted">None set.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[12px] text-text-primary">
              {closures.map((closure) => (
                <li key={closure.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-numeric font-medium">
                      {formatDay(closure.date)}
                    </span>
                    {closure.reason && (
                      <span className="text-text-secondary">
                        {' '}
                        · {closure.reason}
                      </span>
                    )}
                  </span>
                  <RemoveHolidayButton
                    vendorId={vendorId}
                    closure={closure}
                    onRemoved={() =>
                      setClosures((all) => all.filter((c) => c.id !== closure.id))
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-text-muted">
            The garage sets these in its own Settings. Remove takes one off at
            once, recorded with your name.
          </p>
        </div>
      </ScSection>

      <div className="flex flex-col gap-4">
        <ScSection title="Slots and capacity">
          <div className="flex flex-col gap-1.5">
            <span
              id="slot-interval-label"
              className="text-[12px] font-medium text-text-secondary"
            >
              Slot interval
            </span>
            <div
              role="group"
              aria-labelledby="slot-interval-label"
              className="flex gap-2"
            >
              {SLOT_INTERVALS.map((mins) => (
                <Chip
                  key={mins}
                  label={`${mins} min`}
                  selected={draft.slotIntervalMins === mins}
                  onClick={() => patch({ slotIntervalMins: mins })}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ScField
              label="Bays (optional)"
              value={draft.form.bays}
              onChange={set('bays')}
              type="number"
              placeholder="e.g. 10"
              className="font-numeric"
            />
            <ScField
              label="Jobs per day (optional)"
              value={draft.form.jobsPerDay}
              onChange={set('jobsPerDay')}
              type="number"
              placeholder="e.g. 15"
              className="font-numeric"
            />
          </div>
          <p className="text-[12px] text-text-muted">
            Bays is how many cars it works on at once; empty counts as one.
          </p>
        </ScSection>

        <ScSection title="Vehicle types">
          <div className="flex flex-wrap gap-2">
            {VENDOR_VEHICLE_TYPE_OPTIONS.map((v) => (
              <Chip
                key={v}
                label={v}
                selected={draft.vehicleTypes.includes(v)}
                onClick={() =>
                  patch({ vehicleTypes: toggle(draft.vehicleTypes, v) })
                }
              />
            ))}
          </div>
          <p className="text-[12px] text-text-muted">
            These are the tiers a service prices against and a customer can book
            for.
          </p>

          {/* Values from an earlier, longer checklist that no service could
              ever price. Shown so they can be cleared, not offered again. */}
          {legacy.length > 0 && (
            <>
              <p className="text-[12px] text-warning">
                No longer offered — tap to remove:
              </p>
              <div className="flex flex-wrap gap-2">
                {legacy.map((v) => (
                  <Chip
                    key={v}
                    label={`${v} ✕`}
                    selected
                    onClick={() =>
                      patch({ vehicleTypes: toggle(draft.vehicleTypes, v) })
                    }
                  />
                ))}
              </div>
            </>
          )}
        </ScSection>
      </div>
    </div>
  )
}

/**
 * Remove a holiday the garage set (0065), as its own Settings does: saved on
 * its own at once, never part of Save changes. Audited with the signed name.
 */
function RemoveHolidayButton({
  vendorId,
  closure,
  onRemoved,
}: {
  vendorId: string
  closure: { id: string; date: string }
  onRemoved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    setBusy(true)
    try {
      await removeAdminVendorClosure(vendorId, closure.id)
      onRemoved()
      toast.success(`Holiday on ${formatDay(closure.date)} removed`)
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove the holiday"))
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void remove()}
      aria-label={`Remove the holiday on ${formatDay(closure.date)}`}
      className="min-h-11 shrink-0 px-2 text-[12px] font-medium text-text-secondary underline-offset-2 hover:underline disabled:opacity-40"
    >
      {busy ? 'Removing…' : 'Remove'}
    </button>
  )
}
