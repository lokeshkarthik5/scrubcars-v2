'use client'

import { useId, useState } from 'react'
import { IconTriangleFilled } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScModal } from '@repo/ui/sc/modal'
import { ScSegmented } from '@repo/ui/sc/segmented'
import type { AdminVendor } from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  DEFAULT_BOARD_SETTINGS,
  useGarageBoardSettings,
  useSetGarageTarget,
} from '@repo/core/api/hooks/use-admin-garage-board'
import {
  TARGET_MAX,
  type GarageTarget,
  type TargetCounts,
} from '@repo/core/garage-target'
import { cn } from '@repo/core/utils'
import { istToday } from '@/lib/garage-colours'
import {
  addedByWeek,
  liveByArea,
  notLiveFigures,
  targetFigures,
  targetLine,
  weekCompareText,
} from '@/lib/garage-target'

const CARD =
  'flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-border bg-surface px-4 py-3'
const CARD_LABEL = 'text-[12px] text-text-secondary'
const BIG =
  'font-numeric text-[28px] font-semibold leading-none tracking-tight text-text-primary'

const COUNT_OPTIONS: Array<{ value: TargetCounts; label: string }> = [
  { value: 'live', label: 'Live garages' },
  { value: 'onboarded', label: 'All onboarded' },
]

/**
 * The counter above the Garages table (owner, 28 Oct 2026; mockup
 * garages-list A1–A2): live garages against the team's target (the amber
 * part of the bar is almost ready), added this week against last week, not
 * live yet, and live garages by area. The target is the team's, set here
 * for everyone ("Target 50 · edit").
 */
export function TargetCounter({
  vendors,
  now,
}: {
  vendors: AdminVendor[]
  now: number
}) {
  const { data } = useGarageBoardSettings()
  const settings = data ?? { ...DEFAULT_BOARD_SETTINGS, available: false }
  const target = settings.target
  const [editing, setEditing] = useState(false)

  const figures = targetFigures(vendors, target)
  const weeks = addedByWeek(vendors, now)
  const notLive = notLiveFigures(vendors)
  const areas = liveByArea(vendors)
  const areaMax = Math.max(1, ...areas.map((area) => area.count))
  const countLabel =
    target.counts === 'live' ? 'Live garages' : 'Garages onboarded'

  return (
    <section
      aria-label="Onboarding target"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1.4fr]"
    >
      <div className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <span className={CARD_LABEL}>{countLabel}</span>
          {settings.available && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Target ${target.target}, edit`}
              className="min-h-9 text-[12px] text-text-secondary underline underline-offset-4 hover:text-text-primary"
            >
              Target {target.target} · edit
            </button>
          )}
        </div>
        <p>
          <span className={BIG}>{figures.count}</span>
          <span className="font-numeric text-[17px] text-text-secondary">
            {' '}
            / {figures.target}
          </span>
        </p>
        <div
          role="progressbar"
          aria-label={`${countLabel} against the target`}
          aria-valuemin={0}
          aria-valuemax={figures.target}
          aria-valuenow={Math.min(figures.count, figures.target)}
          className="flex h-1.5 overflow-hidden rounded-full bg-white/10"
        >
          <span
            className="h-full bg-tone-done-dot"
            style={{ width: `${figures.doneWidth}%` }}
          />
          <span
            className="h-full bg-tone-attention-dot"
            style={{ width: `${figures.almostWidth}%` }}
          />
        </div>
        <p className="text-[12px] text-text-secondary">
          {targetLine(figures, target.endsOn, now)}
        </p>
      </div>

      <div className={CARD}>
        <span className={CARD_LABEL}>Added this week</span>
        <p className={BIG}>+{weeks.thisWeek}</p>
        <p className="flex items-center gap-1 text-[12px] text-text-secondary">
          {weeks.thisWeek !== weeks.lastWeek && (
            <IconTriangleFilled
              size={9}
              aria-hidden
              className={cn(
                weeks.thisWeek > weeks.lastWeek
                  ? 'text-tone-done-dot'
                  : 'rotate-180 text-tone-late-dot'
              )}
            />
          )}
          {weekCompareText(weeks)}
        </p>
      </div>

      <div className={CARD}>
        <span className={CARD_LABEL}>Not live yet</span>
        <p className={BIG}>{notLive.count}</p>
        <p className="text-[12px] text-text-secondary">
          {notLive.onlyPhotosOrLogo > 0
            ? `${notLive.onlyPhotosOrLogo} only ${notLive.onlyPhotosOrLogo === 1 ? 'needs' : 'need'} photos or a logo`
            : 'None only waiting on photos or a logo'}
        </p>
      </div>

      <div className={CARD}>
        <span className={CARD_LABEL}>Live by area</span>
        {areas.length === 0 ? (
          <p className="text-[12px] text-text-muted">No live garages yet</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {areas.map((area) => (
              <li
                key={area.area}
                className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-[12.5px]"
              >
                <span className="truncate text-text-primary">{area.area}</span>
                <span
                  className="h-1.5 overflow-hidden rounded-full bg-white/10"
                  aria-hidden
                >
                  <span
                    className="block h-full rounded-full bg-tone-done-dot"
                    style={{ width: `${(area.count / areaMax) * 100}%` }}
                  />
                </span>
                <span className="font-numeric text-text-secondary">
                  {area.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <EditTargetDialog
          current={target}
          now={now}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  )
}

/** "Onboarding target" (mockup garages-list C): how many, what counts, by when. */
function EditTargetDialog({
  current,
  now,
  onClose,
}: {
  current: GarageTarget
  now: number
  onClose: () => void
}) {
  const id = useId()
  const save = useSetGarageTarget()
  const [target, setTarget] = useState(String(current.target))
  const [counts, setCounts] = useState<TargetCounts>(current.counts)
  const [endsOn, setEndsOn] = useState(current.endsOn ?? '')
  const [error, setError] = useState('')
  const value = Number(target)
  const valid = Number.isInteger(value) && value >= 1 && value <= TARGET_MAX

  const submit = () => {
    if (!valid || save.isPending) return
    setError('')
    save.mutate(
      { target: value, counts, endsOn: endsOn || null },
      {
        onSuccess: () => {
          toast.success('Target saved for the whole team')
          onClose()
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't save the target. Try again.")),
      }
    )
  }

  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!save.isPending}
      aria-label="Onboarding target"
      className="max-w-[420px]"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">
            Onboarding target
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Everyone on the team sees it at the top of Garages.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${id}-target`}
            className="text-[11px] font-medium text-text-secondary"
          >
            Target
          </label>
          <input
            id={`${id}-target`}
            type="number"
            inputMode="numeric"
            min={1}
            max={TARGET_MAX}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-invalid={!valid || undefined}
            className="min-h-11 rounded-[12px] border border-border bg-surface px-3 font-numeric text-[15px] text-text-primary outline-none focus:border-text-secondary"
          />
          {!valid && (
            <p className="text-[12px] text-tone-attention-text">
              A whole number from 1.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-text-secondary">Count</p>
          <ScSegmented
            aria-label="Count"
            value={counts}
            onChange={setCounts}
            options={COUNT_OPTIONS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${id}-by`}
            className="text-[11px] font-medium text-text-secondary"
          >
            By (optional)
          </label>
          <div className="flex gap-2">
            <input
              id={`${id}-by`}
              type="date"
              min={istToday(now)}
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-[12px] border border-border bg-surface px-3 font-numeric text-[14px] text-text-primary outline-none focus:border-text-secondary"
            />
            {endsOn && (
              <button
                type="button"
                onClick={() => setEndsOn('')}
                className="min-h-11 shrink-0 px-2 text-[12px] font-medium text-text-secondary underline underline-offset-4"
              >
                No end date
              </button>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="text-[12px] text-tone-attention-text">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <ScButton
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={save.isPending}
            className="min-h-11"
          >
            Cancel
          </ScButton>
          <ScButton
            type="submit"
            variant="main"
            disabled={!valid || save.isPending}
            className="min-h-11"
          >
            {save.isPending ? 'Saving…' : 'Save target'}
          </ScButton>
        </div>
      </form>
    </ScModal>
  )
}
