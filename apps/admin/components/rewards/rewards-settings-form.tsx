'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput } from '@repo/ui/sc/input'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { ScSwitch } from '@repo/ui/sc/switch'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminRewardsSettings,
  useSaveAdminRewardsSettings,
} from '@repo/core/api/hooks/use-admin-rewards'
import type { AdminRewardsSettings } from '@repo/core/api/rewards'
import {
  SCRATCH_OUTCOMES,
  type RewardsSettings,
  type ScratchOutcome,
  type ScratchWeights,
} from '@repo/core/rewards'
import { rememberName, rememberedName } from '@/lib/actor-name'
import { settingsFormProblems, weightTotal } from '@/lib/rewards'

const OUTCOME_LABELS: Record<ScratchOutcome, string> = {
  small_off: 'Small (₹ off)',
  medium_off: 'Medium (₹ off)',
  big_off: 'Big (₹ off)',
  bonus_stamp: 'Bonus stamp',
  free_wash: 'Free wash (up to ₹)',
  // 0057: drawn with the Garage's own chance (Rewards → Garage), not in this table.
  garage_card: 'Garage card',
}

function NumberField({
  label,
  value,
  onChange,
  hint,
  optional = false,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  hint?: string
  optional?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <ScInput
        label={label}
        inputMode="numeric"
        value={value === null ? '' : String(value)}
        placeholder={optional ? 'None' : undefined}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '')
          onChange(digits === '' ? (optional ? null : 0) : Number(digits))
        }}
        className="min-h-10 font-numeric"
      />
      {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
    </div>
  )
}

function WeightsEditor({
  weights,
  onChange,
  label,
}: {
  weights: ScratchWeights
  onChange: (w: ScratchWeights) => void
  label: string
}) {
  const total = weightTotal(weights)
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SCRATCH_OUTCOMES.map((outcome) => (
          <NumberField
            key={outcome}
            label={`${label}: ${OUTCOME_LABELS[outcome].replace(/ \(.*\)/, '')} %`}
            value={weights[outcome]}
            onChange={(v) => onChange({ ...weights, [outcome]: v ?? 0 })}
          />
        ))}
      </div>
      <p
        className={
          total === 100
            ? 'text-[11px] text-text-muted'
            : 'text-[11px] text-error'
        }
      >
        Adds up to <span className="font-numeric">{total}</span>% (must be 100).
      </p>
    </div>
  )
}

function Group({
  title,
  children,
  note,
}: {
  title: string
  children: React.ReactNode
  note?: string
}) {
  return (
    <ScCard className="flex flex-col gap-3 px-4 py-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {note && (
          <p className="mt-0.5 text-[12px] text-text-secondary">{note}</p>
        )}
      </div>
      {children}
    </ScCard>
  )
}

/**
 * Admin → Rewards → Settings: every number of the programme, saved as a new
 * version with the typed name (audit log: before → after). Applies going
 * forward only: vouchers, cards and stamps already issued keep their values.
 * The API checks it all again and refuses a save on top of a newer version.
 */
export function RewardsSettingsForm() {
  const current = useAdminRewardsSettings(true)
  if (current.isPending) return <SkeletonList />
  if (current.isError || !current.data) {
    return (
      <ErrorState
        message={errorMessage(current.error, "Couldn't load the settings")}
        onRetry={() => void current.refetch()}
      />
    )
  }
  // A fresh form for each saved version.
  return <SettingsEditor key={current.data.version} current={current.data} />
}

function SettingsEditor({ current }: { current: AdminRewardsSettings }) {
  const save = useSaveAdminRewardsSettings()
  const [draft, setDraft] = useState<RewardsSettings>(() =>
    structuredClone(current.settings)
  )
  const [name, setName] = useState(rememberedName)

  const s = draft
  const set = (patch: Partial<RewardsSettings>) => setDraft({ ...s, ...patch })
  const setLevel = (
    i: number,
    patch: Partial<RewardsSettings['levels'][number]>
  ) =>
    set({
      levels: s.levels.map((level, j) =>
        j === i ? { ...level, ...patch } : level
      ),
    })
  const problems = settingsFormProblems(s)
  const dirty = JSON.stringify(s) !== JSON.stringify(current.settings)

  const submit = () => {
    if (!dirty || problems.length > 0 || name.trim().length < 2) return
    rememberName(name.trim())
    save.mutate(
      { version: current.version, settings: s, actorName: name.trim() },
      {
        onSuccess: (saved) => {
          toast.success(`Saved as version ${saved.version}`)
        },
        onError: (err) =>
          toast.error(errorMessage(err, "Couldn't save the settings")),
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ScCard className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-[13px] text-text-primary">
            Version <span className="font-numeric">{current.version}</span>,
            saved by {current.savedBy}
          </p>
          <p className="text-[12px] text-text-secondary">
            {current.masterSwitch
              ? 'REWARDS_ENABLED is on: the switch below turns the programme on and off for customers.'
              : 'REWARDS_ENABLED is off on the server: nothing is live, whatever the switch below says.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScBadge variant={current.live ? 'success' : 'pending'}>
            {current.live ? 'Live' : 'Not live'}
          </ScBadge>
          <ScSwitch
            label="Rewards on for customers"
            checked={s.enabled}
            onChange={(enabled) => set({ enabled })}
          />
        </div>
      </ScCard>

      <Group
        title="Shine Card"
        note="A stamp for every completed booking paid through Detlio at or above the minimum (before Detlio promos), one per car per day."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <NumberField
            label="Stamps per card"
            value={s.stampsPerCard}
            onChange={(v) => set({ stampsPerCard: v ?? 0 })}
          />
          <NumberField
            label="Minimum booking (₹)"
            value={s.minPaidAmount}
            onChange={(v) => set({ minPaidAmount: v ?? 0 })}
          />
          <NumberField
            label="Stamp expiry (months)"
            value={s.stampValidMonths}
            onChange={(v) => set({ stampValidMonths: v ?? 0 })}
          />
          <NumberField
            label="Voucher expiry (days)"
            value={s.voucherValidDays}
            onChange={(v) => set({ voucherValidDays: v ?? 0 })}
          />
        </div>
        <p className="text-[11px] text-text-muted">
          The card&apos;s reward is set per level below.
        </p>
      </Group>

      <Group
        title="Scratch cards"
        note="One per stamp-earning booking. The server draws the prize when the card is made."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <NumberField
            label="Expiry (days)"
            value={s.scratchCardValidDays}
            onChange={(v) => set({ scratchCardValidDays: v ?? 0 })}
          />
          {(['small_off', 'medium_off', 'big_off', 'free_wash'] as const).map(
            (outcome) => (
              <NumberField
                key={outcome}
                label={OUTCOME_LABELS[outcome]}
                value={s.scratchAmounts[outcome]}
                onChange={(v) =>
                  set({
                    scratchAmounts: { ...s.scratchAmounts, [outcome]: v ?? 0 },
                  })
                }
              />
            )
          )}
        </div>
        <WeightsEditor
          label="Odds"
          weights={s.scratchWeights}
          onChange={(scratchWeights) => set({ scratchWeights })}
        />
      </Group>

      <Group title="Monthly streak">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Months in a row"
            value={s.streakMonths}
            onChange={(v) => set({ streakMonths: v ?? 0 })}
          />
          <NumberField
            label="Bonus stamps"
            value={s.streakBonusStamps}
            onChange={(v) => set({ streakBonusStamps: v ?? 0 })}
          />
        </div>
      </Group>

      <Group
        title="Levels"
        note="On stamp-earning bookings in the rolling window. A customer no-show takes one level off for the penalty months."
      >
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Window (months)"
            value={s.levelWindowMonths}
            onChange={(v) => set({ levelWindowMonths: v ?? 0 })}
          />
          <NumberField
            label="No-show penalty (months)"
            value={s.noShowDropMonths}
            onChange={(v) => set({ noShowDropMonths: v ?? 0 })}
          />
        </div>
        {s.levels.map((level, i) => (
          <div
            key={level.key}
            className="flex flex-col gap-2 border-t border-border pt-3"
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <ScInput
                label="Name"
                value={level.label}
                maxLength={20}
                onChange={(e) => setLevel(i, { label: e.target.value })}
                className="min-h-10"
              />
              <NumberField
                label="Bookings to reach"
                value={level.minBookings}
                onChange={(v) =>
                  setLevel(i, { minBookings: i === 0 ? 0 : (v ?? 0) })
                }
                hint={i === 0 ? 'Everyone starts here' : undefined}
              />
              <NumberField
                label="Card reward (₹)"
                value={level.cardReward}
                onChange={(v) => setLevel(i, { cardReward: v ?? 0 })}
              />
              <NumberField
                label="Birthday voucher (₹)"
                optional
                value={level.birthdayVoucher}
                onChange={(v) => setLevel(i, { birthdayVoucher: v })}
              />
              <NumberField
                label="Annual detailing (₹)"
                optional
                value={level.annualDetailingVoucher}
                onChange={(v) => setLevel(i, { annualDetailingVoucher: v })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[12px] text-text-primary">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={level.garageBadge}
                  onChange={(e) =>
                    setLevel(i, { garageBadge: e.target.checked })
                  }
                />
                Garages see the badge
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={level.scratchWeights !== null}
                  onChange={(e) =>
                    setLevel(i, {
                      scratchWeights: e.target.checked
                        ? { ...s.scratchWeights }
                        : null,
                    })
                  }
                />
                Own scratch odds
              </label>
            </div>
            {level.scratchWeights && (
              <WeightsEditor
                label={level.label}
                weights={level.scratchWeights}
                onChange={(scratchWeights) => setLevel(i, { scratchWeights })}
              />
            )}
          </div>
        ))}
      </Group>

      <Group
        title="Invite a friend"
        note="Both sides get the voucher when the new customer's first stamp-earning booking completes."
      >
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Voucher each (₹)"
            value={s.referralAmount}
            onChange={(v) => set({ referralAmount: v ?? 0 })}
          />
          <NumberField
            label="Rewarded invites a year"
            value={s.referralMaxPerYear}
            onChange={(v) => set({ referralMaxPerYear: v ?? 0 })}
          />
        </div>
      </Group>

      <Group title="Budget and nudges">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumberField
            label="Monthly budget (₹)"
            value={s.monthlyCap}
            onChange={(v) => set({ monthlyCap: v ?? 0 })}
            hint="Past it, scratch cards give a bonus stamp"
          />
          <NumberField
            label="Days between nudges"
            value={s.nudgeGapDays}
            onChange={(v) => set({ nudgeGapDays: v ?? 0 })}
          />
          <NumberField
            label="Warn before expiry (days)"
            value={s.expiryWarningDays}
            onChange={(v) => set({ expiryWarningDays: v ?? 0 })}
          />
        </div>
      </Group>

      <ScCard className="flex flex-col gap-3 px-4 py-4">
        {problems.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-[12px] text-error">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <ScInput
          label="Your name"
          autoComplete="name"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-[11px] text-text-muted">
          Saved as a new version with your name; every change is in the audit
          log. It applies from now on: vouchers, scratch cards and stamps
          already issued keep their values.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <ScButton
            variant="secondary"
            className="min-h-11"
            onClick={() => setDraft(structuredClone(current.defaults))}
          >
            Fill in the defaults
          </ScButton>
          <ScButton
            variant="secondary"
            className="min-h-11"
            disabled={!dirty}
            onClick={() => setDraft(structuredClone(current.settings))}
          >
            Undo changes
          </ScButton>
          <ScButton
            className="min-h-11"
            disabled={
              !dirty ||
              problems.length > 0 ||
              name.trim().length < 2 ||
              save.isPending
            }
            onClick={submit}
          >
            {save.isPending ? 'Saving…' : 'Save settings'}
          </ScButton>
        </div>
        {current.versions.length > 1 && (
          <p className="text-[11px] text-text-muted">
            Earlier:{' '}
            {current.versions
              .slice(1, 6)
              .map((v) => `v${v.version} by ${v.actorName}`)
              .join(' · ')}
          </p>
        )}
      </ScCard>
    </div>
  )
}
