'use client'

import { useState } from 'react'
import { IconCircleCheck, IconLock } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useT } from '@repo/core/i18n'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput } from '@repo/ui/sc/input'
import { Notice } from '@repo/ui/sc/notice'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { useGaragePickupFee, useSetGaragePickupFee } from '@repo/core/api/hooks/use-pickup-fee'
import type { GaragePickupFeeView } from '@repo/core/api/pickup-fee'
import {
  ABOVE_SUGGESTION_BODY,
  ABOVE_SUGGESTION_TITLE,
  DETLIO_NUMBERS_LINE,
  DISTANCE_MODE_LINE,
  FIXED_MODE_LINE,
  FREE_MODE_LINE,
  GARAGE_KEEPS_FEE_LINE,
  PICKUP_FEE_INTRO,
  PICKUP_FEE_MODE_LABELS,
  PICKUP_FEE_MODES,
  changeRuleLine,
  feeCell,
  feePreviewRows,
  isAboveSuggestion,
  limitHint,
  nextChangeLine,
  sentLine,
  type PickupFeeMode,
  type PickupFeePlan,
} from '@repo/core/pickup-fee'
import {
  draftIsSaved,
  draftOf,
  draftPlan,
  draftProblems,
  feeBoxText,
  feeOfDraft,
  feeSettingsOf,
  isDetliosDraft,
  keptLine,
  lockedFeeState,
  roadKmFootnote,
  showsAboveNotice,
  type FeeBox,
  type FeeDraft,
  type LockedFeeState,
} from '@repo/core/pickup-fee-garage'
import { cn } from '@repo/core/utils'

/**
 * Settings → Hours → Pickup & drop → Pickup fee (0079): what the customer
 * pays for pickup & drop, on top of the services. Free (as before), one
 * fixed fee, or By distance on Detlio's numbers within Detlio's limits.
 * Free saves on tap like the switches above; a fixed fee or By distance
 * saves with "Save pickup fee". A fee above Detlio's suggestion waits for
 * Detlio (customers see Detlio's meanwhile) unless admin lets this garage
 * skip the check. When Detlio sets the garage's fee (admin's "Who sets this
 * garage's fee"), every control stays on screen greyed out, holding the fee
 * that applies, with "Set by Detlio. Ask Detlio to change it." The limits
 * under the boxes are the garage's own (admin may set them per garage); the
 * garage changes its fee once every 7 days (or its own number). The garage
 * app's twin is apps/vendors-app/components/settings/pickup-fee-part.tsx.
 */
export function PickupFeePart({ vendorId }: { vendorId: string }) {
  const t = useT()
  const query = useGaragePickupFee(vendorId)
  if (!query.data) {
    return query.isError ? null : (
      <div className="h-24 animate-pulse rounded-[12px] bg-surface-elevated" aria-hidden="true" />
    )
  }
  return <FeeEditor key={JSON.stringify(query.data.fee)} vendorId={vendorId} view={query.data} t={t} />
}

function FeeEditor({
  vendorId,
  view,
  t,
}: {
  vendorId: string
  view: GaragePickupFeeView
  t: ReturnType<typeof useT>
}) {
  const settings = feeSettingsOf(view)
  const save = useSetGaragePickupFee(vendorId)
  const [draft, setDraft] = useState<FeeDraft>(() => draftOf(view.fee, view.suggested))
  const problems = draftProblems(draft, settings)
  const saved = draftIsSaved(draft, view.fee, settings)
  const blocked = view.nextChangeAt !== null
  const detlio = view.detlioPlan

  const submit = async (next: FeeDraft) => {
    try {
      await save.mutateAsync(feeOfDraft(next))
      toast.success(t('Saved successfully'))
    } catch (err) {
      // Within 7 days, locked or outside the limits: the server says which.
      toast.error(err instanceof Error ? err.message : t('Something went wrong'))
    }
  }

  const onMode = (mode: PickupFeeMode) => {
    const next = { ...draft, mode }
    setDraft(next)
    // Free saves on tap, like the switches above.
    if (mode === 'free' && view.fee.mode !== 'free') {
      if (blocked && view.nextChangeAt) {
        toast.error(nextChangeLine(view.nextChangeAt))
        return
      }
      void submit(next)
    }
  }

  const setBox = (box: FeeBox, text: string) =>
    setDraft((current) => ({ ...current, [box]: feeBoxText(text, box === 'freeKm') }))

  const locked = lockedFeeState(view)
  if (locked) return <LockedFee locked={locked} view={view} t={t} />

  const mine = draftPlan(draft, settings)
  const canPreview = Object.keys(problems).length === 0
  const above = canPreview && draft.mode !== 'free' && isAboveSuggestion(feeOfDraft(draft), settings)
  // The notice: the saved fee waits for Detlio, or the boxes ask more than Detlio suggests (and Detlio checks it).
  const showAbove = saved ? view.waiting !== null : showsAboveNotice(above, view)

  return (
    <FeeShell t={t}>
      <ModeChoice value={draft.mode} onChange={onMode} disabled={save.isPending} t={t} />

      {view.decision?.status === 'kept' && saved && (
        <Notice tone="neutral" title={t('Detlio’s fee')}>
          {keptLine(view.decision.reason)}
        </Notice>
      )}

      {draft.mode === 'free' && <p className="text-[12px] text-text-secondary">{t(FREE_MODE_LINE)}</p>}

      {draft.mode === 'fixed' && (
        <>
          <FeeBoxField
            id="pickup-fee-fixed"
            label={t('Fee for any pickup (₹)')}
            value={draft.fixed}
            onChange={(text) => setBox('fixed', text)}
            hint={limitHint('fixed', view.limits)}
            problem={problems.fixed}
          />
          <p className="text-[12px] text-text-secondary">{t(FIXED_MODE_LINE)}</p>
        </>
      )}

      {draft.mode === 'distance' && (
        <>
          <p className="text-[12px] text-text-secondary">{t(DISTANCE_MODE_LINE)}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <FeeBoxField
              id="pickup-fee-free-km"
              label={t('Free up to (km)')}
              decimal
              value={draft.freeKm}
              onChange={(text) => setBox('freeKm', text)}
              hint={limitHint('freeKm', view.limits)}
              problem={problems.freeKm}
            />
            <FeeBoxField
              id="pickup-fee-per-km"
              label={t('Then per km (₹)')}
              value={draft.perKm}
              onChange={(text) => setBox('perKm', text)}
              hint={limitHint('perKm', view.limits)}
              problem={problems.perKm}
            />
            <FeeBoxField
              id="pickup-fee-min"
              label={t('Lowest charge (₹)')}
              value={draft.minCharge}
              onChange={(text) => setBox('minCharge', text)}
              hint={limitHint('minCharge', view.limits)}
              problem={problems.minCharge}
            />
            <FeeBoxField
              id="pickup-fee-max"
              label={t('Highest charge (₹)')}
              value={draft.maxCharge}
              onChange={(text) => setBox('maxCharge', text)}
              hint={limitHint('maxCharge', view.limits)}
              problem={problems.maxCharge}
            />
          </div>
          {isDetliosDraft(draft, view.suggested) && (
            <p className="text-[11px] text-text-muted">{t(DETLIO_NUMBERS_LINE)}</p>
          )}
        </>
      )}

      {showAbove && (
        <Notice title={t(ABOVE_SUGGESTION_TITLE)} role="status">
          {t(ABOVE_SUGGESTION_BODY)}
        </Notice>
      )}

      {draft.mode === 'distance' && canPreview && (
        <FeeTable mine={mine} detlio={detlio} compare={showAbove} t={t} />
      )}

      {draft.mode === 'distance' && <p className="text-[11px] text-text-muted">{roadKmFootnote(view.suggested)}</p>}

      {draft.mode !== 'free' && <KeepLine t={t} />}

      {saved && view.waiting ? (
        <p className="text-[11px] text-text-muted">
          {sentLine(view.waiting.sentAt, view.nextChangeAt)}
        </p>
      ) : blocked && view.nextChangeAt ? (
        <p className="text-[11px] text-text-muted">
          {changeRuleLine(view.limits.changeEveryDays)} {nextChangeLine(view.nextChangeAt)}
        </p>
      ) : (
        draft.mode === 'distance' && (
          <p className="text-[11px] text-text-muted">{changeRuleLine(view.limits.changeEveryDays)}</p>
        )
      )}

      {draft.mode !== 'free' && !saved && (
        <ScButton
          variant="outline"
          size="md"
          disabled={!canPreview || blocked || save.isPending}
          onClick={() => void submit(draft)}
        >
          {save.isPending ? t('Saving...') : t('Save pickup fee')}
        </ScButton>
      )}
    </FeeShell>
  )
}

/**
 * Detlio sets this garage's fee: the same controls, greyed out (disabled,
 * not hidden), holding the fee that applies, and the note under them.
 */
function LockedFee({
  locked,
  view,
  t,
}: {
  locked: LockedFeeState
  view: GaragePickupFeeView
  t: ReturnType<typeof useT>
}) {
  const { draft, plan } = locked
  const noop = () => {}
  return (
    <FeeShell t={t}>
      <div className="flex flex-col gap-3 opacity-60" aria-disabled="true" data-pickup-fee-locked="">
        <ModeChoice value={draft.mode} onChange={noop} disabled t={t} />
        {draft.mode === 'free' && <p className="text-[12px] text-text-secondary">{t(FREE_MODE_LINE)}</p>}
        {draft.mode === 'fixed' && (
          <FeeBoxField
            id="pickup-fee-fixed"
            label={t('Fee for any pickup (₹)')}
            value={draft.fixed}
            onChange={noop}
            hint={limitHint('fixed', view.limits)}
            disabled
          />
        )}
        {draft.mode === 'distance' && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <FeeBoxField
              id="pickup-fee-free-km"
              label={t('Free up to (km)')}
              value={draft.freeKm}
              onChange={noop}
              hint={limitHint('freeKm', view.limits)}
              disabled
            />
            <FeeBoxField
              id="pickup-fee-per-km"
              label={t('Then per km (₹)')}
              value={draft.perKm}
              onChange={noop}
              hint={limitHint('perKm', view.limits)}
              disabled
            />
            <FeeBoxField
              id="pickup-fee-min"
              label={t('Lowest charge (₹)')}
              value={draft.minCharge}
              onChange={noop}
              hint={limitHint('minCharge', view.limits)}
              disabled
            />
            <FeeBoxField
              id="pickup-fee-max"
              label={t('Highest charge (₹)')}
              value={draft.maxCharge}
              onChange={noop}
              hint={limitHint('maxCharge', view.limits)}
              disabled
            />
          </div>
        )}
      </div>
      <p className="flex items-start gap-2 text-[12px] text-text-secondary" role="note">
        <IconLock size={16} aria-hidden="true" className="mt-px shrink-0 text-text-secondary" />
        <span>{locked.note}</span>
      </p>
      {draft.mode === 'distance' && <FeeTable mine={plan} detlio={plan} compare={false} t={t} />}
      {draft.mode !== 'free' && <KeepLine t={t} />}
    </FeeShell>
  )
}

function FeeShell({ t, children }: { t: ReturnType<typeof useT>; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-3 border-t border-border pt-3"
      role="group"
      aria-labelledby="pickup-fee-title"
      data-pickup-fee=""
    >
      <div>
        <p id="pickup-fee-title" className="text-[13px] font-medium text-text-primary">
          {t('Pickup fee')}
        </p>
        <p className="text-[11px] text-text-secondary">{t(PICKUP_FEE_INTRO)}</p>
      </div>
      {children}
    </div>
  )
}

function ModeChoice({
  value,
  onChange,
  disabled,
  t,
}: {
  value: PickupFeeMode
  onChange: (mode: PickupFeeMode) => void
  disabled?: boolean
  t: ReturnType<typeof useT>
}) {
  return (
    <ScSegmented<PickupFeeMode>
      aria-label={t('Pickup fee')}
      value={value}
      onChange={onChange}
      options={PICKUP_FEE_MODES.map((mode) => ({ value: mode, label: t(PICKUP_FEE_MODE_LABELS[mode]), disabled }))}
      className="border border-border bg-brand-black p-[3px] [&>button]:min-h-11 [&>button]:text-[13px]"
    />
  )
}

function FeeBoxField({
  id,
  label,
  value,
  onChange,
  hint,
  problem,
  decimal,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (text: string) => void
  hint: string
  problem?: string
  decimal?: boolean
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <ScInput
        id={id}
        label={label}
        inputMode={decimal ? 'decimal' : 'numeric'}
        className={cn('font-numeric', problem && 'border-warning')}
        value={value}
        disabled={disabled}
        aria-invalid={problem ? true : undefined}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.value)}
      />
      {problem ? (
        <p id={`${id}-hint`} role="alert" className="text-[11px] text-warning">
          {problem}
        </p>
      ) : (
        <p id={`${id}-hint`} className="font-numeric text-[11px] text-text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

/** "What customers pay": the plan at sample road km, or Detlio's next to the garage's. */
function FeeTable({
  mine,
  detlio,
  compare,
  t,
}: {
  mine: PickupFeePlan
  detlio: PickupFeePlan
  compare: boolean
  t: ReturnType<typeof useT>
}) {
  const rows = feePreviewRows(mine, detlio)
  return (
    <div className="rounded-[12px] border border-border bg-surface px-3 py-2" data-fee-table="">
      <table className="w-full text-[12px]">
        <caption className="sr-only">{compare ? t('What customers would pay') : t('What customers pay')}</caption>
        <thead>
          <tr className="text-[11px] text-text-muted">
            <th scope="col" className="pb-1 text-left font-normal">
              {compare ? t('What customers would pay') : t('What customers pay')}
            </th>
            {compare && (
              <th scope="col" className="pb-1 text-right font-normal">
                {t('Detlio')}
              </th>
            )}
            {compare && (
              <th scope="col" className="pb-1 pl-3 text-right font-normal">
                {t('Yours')}
              </th>
            )}
            {!compare && <th scope="col" className="sr-only">{t('Fee')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.km} className="border-t border-border/60">
              <th scope="row" className="py-1.5 text-left font-normal text-text-secondary">
                {row.label}
              </th>
              {compare ? (
                <>
                  <td className="py-1.5 text-right font-numeric text-text-secondary">{feeCell(row.detlio)}</td>
                  <td
                    className={cn(
                      'py-1.5 pl-3 text-right font-numeric font-medium',
                      row.garage > row.detlio ? 'text-warning' : 'text-text-primary'
                    )}
                  >
                    {feeCell(row.garage)}
                  </td>
                </>
              ) : (
                <td className="py-1.5 text-right font-numeric font-medium text-text-primary">
                  {feeCell(row.garage, mine, true)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KeepLine({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <p className="flex items-start gap-1.5 text-[12px] text-text-primary">
      <IconCircleCheck size={16} aria-hidden="true" className="mt-px shrink-0 text-success" />
      <span>{t(GARAGE_KEEPS_FEE_LINE)}</span>
    </p>
  )
}
