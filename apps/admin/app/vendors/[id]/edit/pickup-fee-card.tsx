'use client'

import { useEffect, useId, useState } from 'react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScSwitch } from '@repo/ui/sc/switch'
import { ApiError } from '@repo/core/api/client'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminGaragePickupFee,
  useDecidePickupFee,
  useSetAdminGaragePickupFee,
  useSetAdminGaragePickupFeeLock,
} from '@repo/core/api/hooks/use-pickup-fee'
import type { AdminGaragePickupFee } from '@repo/core/api/pickup-fee'
import {
  PICKUP_FEE_PREVIEW_KM,
  feeAtRoadKm,
  garagePlan,
  pickupFeeProblems,
  type GaragePickupFee,
  type PickupFeeMode,
} from '@repo/core/pickup-fee-maths'
import { cn } from '@repo/core/utils'
import { AutoGrowTextarea } from '@/components/auto-grow-textarea'
import { FeeInput, parseBox, rupeesCell } from '@/components/pickup-fee/fee-box'
import { formatWhen } from '@/lib/bookings'
import { changeLine, withFormula } from '@/lib/pickup-fees'

const MODES: Array<{ value: PickupFeeMode; label: string }> = [
  { value: 'free', label: 'Free' },
  { value: 'fixed', label: 'Fixed fee' },
  { value: 'distance', label: 'By distance' },
]

type Boxes = { fixed: string; freeKm: string; perKm: string; minCharge: string; maxCharge: string }

function boxesOf(data: AdminGaragePickupFee): Boxes {
  const plan = garagePlan({ ...data.fee, mode: 'distance' }, withFormula(data.suggested))
  return {
    fixed: data.fee.fixed === null ? '' : String(data.fee.fixed),
    freeKm: String(plan.freeKm),
    perKm: String(plan.perKm),
    minCharge: String(plan.minCharge),
    maxCharge: String(plan.maxCharge),
  }
}

function feeOf(mode: PickupFeeMode, b: Boxes): GaragePickupFee {
  return {
    mode,
    fixed: mode === 'fixed' ? parseBox(b.fixed) : null,
    freeKm: mode === 'distance' ? parseBox(b.freeKm) : null,
    perKm: mode === 'distance' ? parseBox(b.perKm) : null,
    minCharge: mode === 'distance' ? parseBox(b.minCharge) : null,
    maxCharge: mode === 'distance' ? parseBox(b.maxCharge) : null,
  }
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`
const IST_MS = (5 * 60 + 30) * 60_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const istDay = (iso: string) => {
  const at = new Date(new Date(iso).getTime() + IST_MS)
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`
}

/** "Approve ₹20 per km", or "Approve" when more than the per-km figure changed. */
function approveLabel(data: AdminGaragePickupFee): string {
  const fee = data.fee
  if (fee.mode === 'fixed' && fee.fixed !== null) return `Approve ${rupees(fee.fixed)}`
  if (fee.mode === 'distance' && fee.perKm !== null && fee.freeKm === null && fee.minCharge === null && fee.maxCharge === null) {
    return `Approve ${rupees(fee.perKm)} per km`
  }
  return 'Approve'
}

/**
 * The garage's pickup fee inside "How customers book" (0079, admin mockup
 * 3): its choice, Detlio's override (edit the numbers: saved as Detlio's
 * change, no check), Approve or Keep Detlio's fee for one waiting, "Lock to
 * Detlio's fee", and every change with who and when.
 */
export function PickupFeeCard({ vendorId, onAuthError }: { vendorId: string; onAuthError: () => void }) {
  const titleId = useId()
  const { data, error } = useAdminGaragePickupFee(vendorId)
  const setFee = useSetAdminGaragePickupFee(vendorId)
  const setLock = useSetAdminGaragePickupFeeLock(vendorId)
  const decide = useDecidePickupFee()
  const [mode, setMode] = useState<PickupFeeMode>('free')
  const [boxes, setBoxes] = useState<Boxes | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [keeping, setKeeping] = useState(false)
  const [reason, setReason] = useState('')

  // The draft follows the garage's fee whenever a save or a decision lands.
  useEffect(() => {
    if (!data) return
    setMode(data.fee.mode)
    setBoxes(boxesOf(data))
  }, [data])
  useEffect(() => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) onAuthError()
  }, [error, onAuthError])

  if (!data || !boxes) {
    return error ? (
      <p role="alert" className="mt-3 text-[13px] text-error">
        {errorMessage(error, 'Couldn’t load the pickup fee.')}
      </p>
    ) : null
  }

  const settings = withFormula(data.suggested)
  const settingsWithLimits = { ...settings, limits: data.limits }
  const busy = setFee.isPending || setLock.isPending || decide.isPending
  const fail = (err: unknown) => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return onAuthError()
    setProblem(errorMessage(err, 'Couldn’t save that. Check the connection and try again.'))
  }
  const save = (next: GaragePickupFee) => {
    const problems = pickupFeeProblems(next, settingsWithLimits)
    if (problems.length > 0) {
      setProblem('That fee is outside Detlio’s limits shown under each box.')
      return
    }
    const current = JSON.stringify(data.fee)
    const plan = (f: GaragePickupFee) => JSON.stringify(garagePlan(f, settings))
    if (next.mode === data.fee.mode && (JSON.stringify(next) === current || plan(next) === plan(data.fee)) && !data.waiting) return
    setProblem(null)
    setFee.mutate(next, { onSuccess: () => toast.success('Saved as Detlio’s change'), onError: fail })
  }
  const pick = (next: PickupFeeMode) => {
    setMode(next)
    // Free saves on tap; the other two save once their numbers are in.
    if (next === 'free') save(feeOf('free', boxes))
    if (next === 'distance') save(feeOf('distance', boxes))
  }
  const commit = () => save(feeOf(mode, boxes))
  const set = (key: keyof Boxes) => (value: string) => setBoxes((b) => (b ? { ...b, [key]: value } : b))

  const garage = garagePlan(feeOf(mode, boxes), settings)
  const detlio = data.detlioPlan
  const answer = (decision: 'approved' | 'kept') => {
    if (!data.waitingChangeId) return
    if (decision === 'kept' && !reason.trim()) {
      setKeeping(true)
      setProblem('Write the reason the garage will see, then Keep Detlio’s fee.')
      return
    }
    setProblem(null)
    decide.mutate(
      { changeId: data.waitingChangeId, decision, reason: decision === 'kept' ? reason.trim() : undefined },
      {
        onSuccess: () => {
          setKeeping(false)
          setReason('')
          toast.success(decision === 'approved' ? 'Approved' : 'Kept Detlio’s fee')
        },
        onError: fail,
      }
    )
  }
  const lim = data.limits
  const row = (label: string, hint: string, key: keyof Boxes, opts: { prefix?: string; suffix?: string }) => (
    <div className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
      <div className="min-w-0">
        <p className="text-[14px] text-text-primary">{label}</p>
        <p className="mt-0.5 font-numeric text-[12.5px] text-text-muted">{hint}</p>
      </div>
      <FeeInput value={boxes[key]} onChange={set(key)} onCommit={commit} label={label} disabled={busy} {...opts} />
    </div>
  )

  return (
    <section aria-labelledby={titleId} className="-mx-4 mt-4 border-t border-border px-4 pt-4" data-testid="pickup-fee-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="text-[14px] font-medium text-text-primary">
            Pickup fee
          </h3>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            {data.waiting
              ? 'The garage keeps the whole fee. Customers see Detlio’s fee until the garage’s new fee is approved.'
              : 'The garage keeps the whole fee. Detlio takes no commission on it.'}
          </p>
        </div>
        {data.waiting ? (
          <ScBadge variant="pending">Waiting for check</ScBadge>
        ) : data.locked ? (
          <ScBadge variant="muted">Set by Detlio</ScBadge>
        ) : null}
      </div>

      <ScSegmented
        value={mode}
        onChange={pick}
        options={MODES.map((m) => ({ ...m, disabled: busy }))}
        aria-label="Pickup fee"
        className="mt-3 max-w-[480px]"
      />

      {mode === 'fixed' && (
        <div className="mt-3 max-w-[480px]">
          {row('Fee for any pickup', `Up to ${rupees(lim.fixedMax)}`, 'fixed', { prefix: '₹' })}
        </div>
      )}

      {mode !== 'free' && (
        <div className={cn('mt-3 grid gap-3', mode === 'distance' && '@xl:grid-cols-2')}>
          {mode === 'distance' && (
            <div>
              {row('Free up to', `Limit ${lim.freeKm.min}–${lim.freeKm.max} km`, 'freeKm', { suffix: 'km' })}
              {row('Then per km', `Limit ${rupees(lim.perKm.min)}–${rupees(lim.perKm.max)} · Detlio: ${rupees(data.suggested.perKm)}`, 'perKm', { prefix: '₹' })}
              {row('Lowest charge', `Limit ${rupees(lim.minCharge.min)}–${rupees(lim.minCharge.max)}`, 'minCharge', { prefix: '₹' })}
              {row('Highest charge', `Up to ${rupees(lim.maxCharge)}`, 'maxCharge', { prefix: '₹' })}
            </div>
          )}
          <div className="rounded-[12px] bg-white/[0.03] px-3.5 py-2">
            <table className="w-full text-[13px]">
              <caption className="sr-only">The garage’s fee next to Detlio’s</caption>
              <thead>
                <tr className="text-[12px] text-text-muted">
                  <th scope="col" className="py-1.5 text-left font-normal">Road km</th>
                  <th scope="col" className="py-1.5 text-right font-normal">Detlio</th>
                  <th scope="col" className="py-1.5 text-right font-normal">Garage</th>
                </tr>
              </thead>
              <tbody>
                {PICKUP_FEE_PREVIEW_KM.map((km) => {
                  const d = feeAtRoadKm(detlio, km)
                  const g = feeAtRoadKm(garage, km)
                  return (
                    <tr key={km} className="border-t border-border">
                      <td className="py-2 text-text-secondary">
                        <span className="font-numeric">{km}</span> km by road
                      </td>
                      <td className="py-2 text-right font-numeric text-text-secondary">{rupeesCell(d)}</td>
                      <td className={cn('py-2 text-right font-numeric font-semibold', g > d ? 'text-tone-attention-text' : 'text-text-primary')}>
                        {rupeesCell(g)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="-mx-4 mt-4 flex items-center justify-between gap-3 border-t border-border px-4 pt-4">
        <div className="min-w-0">
          <p className="text-[14px] text-text-primary">Lock to Detlio’s fee</p>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            The garage can’t change it; its screen says “Set by Detlio”.
            {data.locked && data.lockedBy ? ` Locked by ${data.lockedBy}.` : ''}
          </p>
        </div>
        <ScSwitch
          label="Lock to Detlio’s fee"
          checked={data.locked}
          disabled={busy}
          onChange={(on) => setLock.mutate(on, { onError: fail })}
        />
      </div>

      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
        {data.waitingChangeId && (
          <div className="flex gap-2">
            <ScButton variant="secondary" fullWidth={false} disabled={busy} onClick={() => answer('approved')} className="min-h-11 px-4 text-[13px]">
              {approveLabel(data)}
            </ScButton>
            <ScButton variant="secondary" fullWidth={false} disabled={busy} onClick={() => answer('kept')} className="min-h-11 px-4 text-[13px]">
              Keep Detlio’s fee
            </ScButton>
          </div>
        )}
        <p className="text-[12.5px] text-text-muted">Editing the numbers here saves as Detlio’s change, with no check needed.</p>
      </div>
      {keeping && data.waitingChangeId && (
        <AutoGrowTextarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          aria-label="Reason, sent to the garage"
          placeholder="Reason, sent to the garage (needed for Keep Detlio’s fee)"
          className="mt-2 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-[14px] text-text-primary outline-none placeholder:text-text-muted focus:border-text-secondary"
        />
      )}
      {problem && (
        <p role="alert" className="mt-2 text-[12.5px] text-error">
          {problem}
        </p>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[13px] font-medium text-text-primary">Changes</h4>
          <p className="text-[12px] text-text-muted">
            {data.nextChangeAt ? `Garage’s next change: from ${istDay(data.nextChangeAt)}` : 'The garage can change its fee now'}
          </p>
        </div>
        {data.changes.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-text-muted">No changes yet: Free, as every garage starts.</p>
        ) : (
          <ul className="mt-1.5">
            {data.changes.map((change) => (
              <li
                key={change.id}
                className="grid gap-x-4 gap-y-0.5 border-t border-border py-2 text-[12.5px] md:grid-cols-[150px_200px_1fr_auto]"
              >
                <span className="font-numeric text-text-secondary">{formatWhen(change.createdAt)}</span>
                <span className="text-text-secondary">{change.byName}</span>
                <span className="text-text-primary">
                  {changeLine(change, data.suggested)}
                  {change.status === 'kept' && change.reason ? ` · Kept Detlio’s fee: “${change.reason}”` : ''}
                </span>
                {change.status === 'waiting' ? (
                  <ScBadge variant="pending">Waiting for check</ScBadge>
                ) : change.status === 'approved' ? (
                  <ScBadge variant="success">Approved</ScBadge>
                ) : change.status === 'kept' ? (
                  <ScBadge variant="muted">Kept Detlio’s fee</ScBadge>
                ) : change.status === 'replaced' ? (
                  <ScBadge variant="muted">Replaced</ScBadge>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
