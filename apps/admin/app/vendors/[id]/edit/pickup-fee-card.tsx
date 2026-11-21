'use client'

import { useEffect, useId, useState } from 'react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ApiError } from '@repo/core/api/client'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminGaragePickupFee,
  useDecidePickupFee,
  useSetAdminGaragePickupFee,
  useSetAdminGaragePickupFeeLimits,
  useSetAdminGaragePickupFeeLock,
} from '@repo/core/api/hooks/use-pickup-fee'
import type { AdminGaragePickupFee } from '@repo/core/api/pickup-fee'
import {
  HARD_CAP_LIMITS,
  NO_LIMIT_OVERRIDES,
  PICKUP_FEE_PREVIEW_KM,
  feeAtRoadKm,
  garagePlan,
  hasLimitOverrides,
  limitOverridesProblems,
  pickupFeeProblems,
  type GaragePickupFee,
  type PickupFeeLimitOverrides,
  type PickupFeeMode,
} from '@repo/core/pickup-fee-maths'
import { cn } from '@repo/core/utils'
import { AutoGrowTextarea } from '@/components/auto-grow-textarea'
import { FeeInput, parseBox, rupeesCell } from '@/components/pickup-fee/fee-box'
import { formatWhen } from '@/lib/bookings'
import {
  EMPTY_LIMITS_DRAFT,
  changeLine,
  defaultLimitHint,
  limitsDraftOf,
  overridesOfDraft,
  planSummaryLine,
  withFormula,
  type LimitsDraft,
} from '@/lib/pickup-fees'

const MODES: Array<{ value: PickupFeeMode; label: string }> = [
  { value: 'free', label: 'Free' },
  { value: 'fixed', label: 'Fixed fee' },
  { value: 'distance', label: 'By distance' },
]

type Setter = 'garage' | 'detlio'

const SETTERS: Array<{ value: Setter; label: string }> = [
  { value: 'garage', label: 'Garage' },
  { value: 'detlio', label: 'Detlio' },
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
const cap = HARD_CAP_LIMITS

/** "Approve ₹20 per km", or "Approve" when more than the per-km figure changed. */
function approveLabel(data: AdminGaragePickupFee): string {
  const fee = data.fee
  if (fee.mode === 'fixed' && fee.fixed !== null) return `Approve ${rupees(fee.fixed)}`
  if (fee.mode === 'distance' && fee.perKm !== null && fee.freeKm === null && fee.minCharge === null && fee.maxCharge === null) {
    return `Approve ${rupees(fee.perKm)} per km`
  }
  return 'Approve'
}

/** Who set the stored fee, for "Fee that applies now": the latest fee change's name when known. */
function setByLine(data: AdminGaragePickupFee): string {
  if (data.waiting) return 'Detlio’s suggestion while the garage’s new fee waits for a check'
  const latest = data.changes.find((change) => change.kind === 'fee' && change.status !== 'replaced')
  if (data.setBy === 'detlio') return latest?.byKind === 'detlio' ? `Set by ${latest.byName}` : 'Set by Detlio'
  if (latest?.byKind === 'garage') return `Set by ${latest.byName}`
  return data.fee.mode === 'free' ? 'Free, as every garage starts' : 'Set by the garage'
}

/**
 * The garage's pickup fee inside "How customers book" (0079, admin mockup
 * 3, and the owner's 15 Nov ask: "grey it out for each garage, whatever we
 * want, as it might be different for each"):
 *
 *   - the fee that applies now, who set it and whether Detlio sets it;
 *   - "Who sets this garage's fee": Garage, or Detlio (the garage's controls
 *     are greyed out: "Set by Detlio. Ask Detlio to change it.");
 *   - Detlio's own fee for the garage: any mode, any numbers inside the hard
 *     caps, live at once with no check, the garage's 7 days untouched;
 *   - Approve or Keep Detlio's fee for one waiting;
 *   - this garage's own limits (empty: Detlio's default), with Reset;
 *   - every change with who and when.
 */
export function PickupFeeCard({ vendorId, onAuthError }: { vendorId: string; onAuthError: () => void }) {
  const { data, error } = useAdminGaragePickupFee(vendorId)
  useEffect(() => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) onAuthError()
  }, [error, onAuthError])

  if (!data) {
    return error ? (
      <p role="alert" className="mt-3 text-[13px] text-error">
        {errorMessage(error, 'Couldn’t load the pickup fee.')}
      </p>
    ) : null
  }
  // A fresh draft whenever a save or a decision changes the garage's fee or limits.
  return (
    <PickupFeeCardBody
      key={`${JSON.stringify(data.fee)}:${data.waiting ? 'waiting' : 'live'}:${JSON.stringify(data.overrides ?? null)}`}
      vendorId={vendorId}
      data={data}
      onAuthError={onAuthError}
    />
  )
}

function PickupFeeCardBody({
  vendorId,
  data,
  onAuthError,
}: {
  vendorId: string
  data: AdminGaragePickupFee
  onAuthError: () => void
}) {
  const titleId = useId()
  const setFee = useSetAdminGaragePickupFee(vendorId)
  const setLock = useSetAdminGaragePickupFeeLock(vendorId)
  const setLimits = useSetAdminGaragePickupFeeLimits(vendorId)
  const decide = useDecidePickupFee()
  const [mode, setMode] = useState<PickupFeeMode>(data.fee.mode)
  const [boxes, setBoxes] = useState<Boxes>(() => boxesOf(data))
  const [problem, setProblem] = useState<string | null>(null)
  const [keeping, setKeeping] = useState(false)
  const [reason, setReason] = useState('')

  const settings = withFormula(data.suggested)
  const busy = setFee.isPending || setLock.isPending || setLimits.isPending || decide.isPending
  const fail = (err: unknown) => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return onAuthError()
    setProblem(errorMessage(err, 'Couldn’t save that. Check the connection and try again.'))
  }
  // Detlio's own fee for the garage: inside the hard caps, not the garage limits.
  const save = (next: GaragePickupFee) => {
    const problems = pickupFeeProblems(next, { ...settings, limits: HARD_CAP_LIMITS })
    if (problems.length > 0) {
      setProblem('That fee is outside the hard caps shown under each box.')
      return
    }
    const current = JSON.stringify(data.fee)
    const plan = (f: GaragePickupFee) => JSON.stringify(garagePlan(f, settings))
    if (next.mode === data.fee.mode && (JSON.stringify(next) === current || plan(next) === plan(data.fee)) && !data.waiting) return
    setProblem(null)
    setFee.mutate(next, { onSuccess: () => toast.success('Saved as Detlio’s change. Live now.'), onError: fail })
  }
  const pick = (next: PickupFeeMode) => {
    setMode(next)
    // Free saves on tap; the other two save once their numbers are in.
    if (next === 'free') save(feeOf('free', boxes))
    if (next === 'distance') save(feeOf('distance', boxes))
  }
  const commit = () => save(feeOf(mode, boxes))
  const set = (key: keyof Boxes) => (value: string) => setBoxes((b) => ({ ...b, [key]: value }))

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
  const setter: Setter = data.locked ? 'detlio' : 'garage'
  const chooseSetter = (next: Setter) => {
    if (next === setter) return
    setProblem(null)
    setLock.mutate(next === 'detlio', {
      onSuccess: () => toast.success(next === 'detlio' ? 'Detlio sets this garage’s fee now' : 'The garage sets its own fee now'),
      onError: fail,
    })
  }
  const row = (label: string, hint: string, key: keyof Boxes, opts: { prefix?: string; suffix?: string }) => (
    <div className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
      <div className="min-w-0">
        <p className="text-[14px] text-text-primary">{label}</p>
        <p className="mt-0.5 font-numeric text-[12.5px] text-text-muted">{hint}</p>
      </div>
      <FeeInput value={boxes[key]} onChange={set(key)} onCommit={commit} label={label} disabled={busy} {...opts} />
    </div>
  )
  const lim = data.limits

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

      {/* The fee that applies now, who set it, and who sets it. */}
      <div className="mt-3 rounded-[12px] bg-white/[0.03] px-3.5 py-2.5" data-testid="pickup-fee-now">
        <p className="text-[12px] text-text-muted">Fee that applies now</p>
        <p className="mt-0.5 text-[14px] font-medium text-text-primary">{planSummaryLine(data.livePlan)}</p>
        <p className="mt-0.5 text-[12.5px] text-text-secondary">
          {setByLine(data)}
          {' · '}
          {data.locked
            ? `Locked: the garage can’t change it${data.lockedBy ? ` (${data.lockedBy})` : ''}`
            : 'The garage can change it within its limits'}
        </p>
      </div>

      <div className="-mx-4 mt-4 flex flex-col gap-2 border-t border-border px-4 pt-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[14px] text-text-primary">Who sets this garage’s fee</p>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            {data.locked
              ? 'Detlio: the garage’s fee controls are greyed out with “Set by Detlio. Ask Detlio to change it.” The fee below stays as Detlio sets it.'
              : 'The garage, within its limits below. Detlio can still set its fee here at any time.'}
          </p>
        </div>
        <ScSegmented
          value={setter}
          onChange={chooseSetter}
          options={SETTERS.map((s) => ({ ...s, disabled: busy }))}
          aria-label="Who sets this garage’s fee"
          className="w-full shrink-0 md:w-[220px]"
        />
      </div>

      <div className="-mx-4 mt-4 border-t border-border px-4 pt-4">
        <p className="text-[14px] text-text-primary">Detlio’s fee for this garage</p>
        <p className="mt-0.5 text-[12.5px] text-text-muted">
          Any mode, any numbers inside the hard caps. Saves on tap as Detlio’s change: live at once, no check, and the
          garage’s 7 days are untouched. Free here keeps pickup on with a ₹0 fee.
        </p>
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
          {row('Fee for any pickup', `Hard cap ${rupees(cap.fixedMax)} · garage limit ${rupees(lim.fixedMax)}`, 'fixed', { prefix: '₹' })}
        </div>
      )}

      {mode !== 'free' && (
        <div className={cn('mt-3 grid gap-3', mode === 'distance' && '@xl:grid-cols-2')}>
          {mode === 'distance' && (
            <div>
              {row('Free up to', `Hard cap ${cap.freeKm.min}–${cap.freeKm.max} km`, 'freeKm', { suffix: 'km' })}
              {row('Then per km', `Hard cap ${rupees(cap.perKm.min)}–${rupees(cap.perKm.max)} · Detlio: ${rupees(data.suggested.perKm)}`, 'perKm', { prefix: '₹' })}
              {row('Lowest charge', `Hard cap ${rupees(cap.minCharge.min)}–${rupees(cap.minCharge.max)}`, 'minCharge', { prefix: '₹' })}
              {row('Highest charge', `Hard cap ${rupees(cap.maxCharge)}`, 'maxCharge', { prefix: '₹' })}
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

      {data.waitingChangeId && (
        <div className="mt-3 flex gap-2">
          <ScButton variant="secondary" fullWidth={false} disabled={busy} onClick={() => answer('approved')} className="min-h-11 px-4 text-[13px]">
            {approveLabel(data)}
          </ScButton>
          <ScButton variant="secondary" fullWidth={false} disabled={busy} onClick={() => answer('kept')} className="min-h-11 px-4 text-[13px]">
            Keep Detlio’s fee
          </ScButton>
        </div>
      )}
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

      <GarageLimits data={data} busy={busy} onSave={(overrides, done) => setLimits.mutate(overrides, { onSuccess: done, onError: fail })} />

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[13px] font-medium text-text-primary">Changes</h4>
          <p className="text-[12px] text-text-muted">
            {data.locked
              ? 'Set by Detlio: the garage can’t change its fee'
              : data.nextChangeAt
                ? `Garage’s next change: from ${istDay(data.nextChangeAt)}`
                : 'The garage can change its fee now'}
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

/**
 * This garage's own limits: optional overrides of Detlio's defaults
 * (Settings → Pickup fee) for this one garage. An empty box is Detlio's
 * default; the server checks each against the hard caps. The garage's boxes
 * then say its own limits ("Up to ₹…"), and its prices are held to them.
 */
function GarageLimits({
  data,
  busy,
  onSave,
}: {
  data: AdminGaragePickupFee
  busy: boolean
  onSave: (overrides: PickupFeeLimitOverrides, done: () => void) => void
}) {
  const titleId = useId()
  const overrides = data.overrides ?? NO_LIMIT_OVERRIDES
  const defaults = data.defaultLimits ?? data.limits
  const [draft, setDraft] = useState<LimitsDraft>(() => limitsDraftOf(overrides))
  const [problem, setProblem] = useState<string | null>(null)
  const saved = JSON.stringify(draft) === JSON.stringify(limitsDraftOf(overrides))
  const set = (key: keyof LimitsDraft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }))

  const submit = (next: LimitsDraft) => {
    const read = overridesOfDraft(next)
    if (!read.ok) return setProblem(read.problem)
    const problems = limitOverridesProblems(read.overrides, defaults)
    if (problems.length > 0) return setProblem(problems[0]!)
    setProblem(null)
    onSave(read.overrides, () => toast.success('Saved this garage’s limits'))
  }
  const reset = () => {
    setDraft(EMPTY_LIMITS_DRAFT)
    submit(EMPTY_LIMITS_DRAFT)
  }

  const box = (key: keyof LimitsDraft, label: string, opts: { prefix?: string; suffix?: string }) => (
    <FeeInput
      value={draft[key]}
      onChange={set(key)}
      label={label}
      placeholder="Detlio’s default"
      disabled={busy}
      className="w-[132px]"
      {...opts}
    />
  )
  const line = (label: string, hint: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-2 border-t border-border py-2.5 first:border-t-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="text-[14px] text-text-primary">{label}</p>
        <p className="mt-0.5 font-numeric text-[12.5px] text-text-muted">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )

  return (
    <section aria-labelledby={titleId} className="-mx-4 mt-4 border-t border-border px-4 pt-4" data-testid="pickup-fee-limits">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 id={titleId} className="text-[14px] font-medium text-text-primary">
            This garage’s limits
          </h4>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            Optional, for this garage only, inside the hard caps. Empty is Detlio’s default from Settings → Pickup fee. A
            fee outside new limits is held to them when customers are charged.
          </p>
        </div>
        {hasLimitOverrides(overrides) && <ScBadge variant="muted">Own limits</ScBadge>}
      </div>
      <div className="mt-2 max-w-[640px]">
        {line('Free up to', defaultLimitHint('freeKm', defaults), (
          <>
            {box('freeKmMin', 'Free up to, lowest km', { suffix: 'km' })}
            <span className="text-text-muted">–</span>
            {box('freeKmMax', 'Free up to, highest km', { suffix: 'km' })}
          </>
        ))}
        {line('Per km', defaultLimitHint('perKm', defaults), (
          <>
            {box('perKmMin', 'Per km, lowest rupees', { prefix: '₹' })}
            <span className="text-text-muted">–</span>
            {box('perKmMax', 'Per km, highest rupees', { prefix: '₹' })}
          </>
        ))}
        {line('Lowest charge', defaultLimitHint('minCharge', defaults), (
          <>
            {box('minChargeMin', 'Lowest charge, lowest rupees', { prefix: '₹' })}
            <span className="text-text-muted">–</span>
            {box('minChargeMax', 'Lowest charge, highest rupees', { prefix: '₹' })}
          </>
        ))}
        {line('Highest charge', defaultLimitHint('maxCharge', defaults), box('maxCharge', 'Highest charge limit, rupees', { prefix: '₹' }))}
        {line('Fixed fee, at most', defaultLimitHint('fixedMax', defaults), box('fixedMax', 'Fixed fee limit for this garage, rupees', { prefix: '₹' }))}
        {line('Ask for pickup, raise up to', defaultLimitHint('askRaisePct', defaults), box('askRaisePct', 'Ask for pickup raise, percent', { suffix: '%' }))}
        {line('Days between the garage’s changes', defaultLimitHint('changeEveryDays', defaults), box('changeEveryDays', 'Days between changes', { suffix: 'days' }))}
        {line('A fee above Detlio’s suggestion', 'Default: waits for Detlio’s check', (
          <ScSegmented
            value={draft.needsApproval === '' ? 'default' : draft.needsApproval}
            onChange={(value: 'default' | 'yes' | 'no') => setDraft((d) => ({ ...d, needsApproval: value === 'default' ? '' : value }))}
            options={[
              { value: 'default', label: 'Default', disabled: busy },
              { value: 'yes', label: 'Check it', disabled: busy },
              { value: 'no', label: 'Live at once', disabled: busy },
            ]}
            aria-label="A fee above Detlio’s suggestion"
            className="w-full md:w-[300px]"
          />
        ))}
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-[12.5px] text-error">
          {problem}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <ScButton
          variant="secondary"
          fullWidth={false}
          disabled={busy || saved}
          onClick={() => submit(draft)}
          className="min-h-11 px-4 text-[13px]"
        >
          Save limits
        </ScButton>
        <ScButton
          variant="secondary"
          fullWidth={false}
          disabled={busy || (!hasLimitOverrides(overrides) && saved)}
          onClick={reset}
          className="min-h-11 px-4 text-[13px]"
        >
          Reset to Detlio’s defaults
        </ScButton>
      </div>
    </section>
  )
}
