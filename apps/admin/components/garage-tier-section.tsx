'use client'

import { toast } from 'react-toastify'
import { IconCircleCheckFilled, IconCircleDashed } from '@tabler/icons-react'
import { ScSection } from '@repo/ui/sc/section'
import { ScSwitch } from '@repo/ui/sc/switch'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { TierMedalIcon } from '@repo/ui/features/tier-medal'
import type { AdminTier, TierStep } from '@repo/core/api/tiers'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminTier, useSetTierHidden } from '@repo/core/api/hooks/use-tiers'
import { dateKeyLabel } from '@repo/core/certification'
import { istDateTimeLabel } from '@repo/core/ist-input'
import { TIERS, TIER_LABELS, type Tier } from '@repo/core/tiers'
import { cn } from '@repo/core/utils'
import { SignedAs } from '@/components/signed-as'

/** Why customers see no medal (or a lower one) on this garage, in a few words. */
function shownLine(data: AdminTier): string {
  if (!data.tier) return 'Customers see no medal: it holds no tier yet.'
  if (data.hidden) return 'Customers see no medal: you hid it.'
  if (!data.shown) return `Customers see no medal: ${TIER_LABELS[data.tier]} is switched off in Settings → Tiers.`
  if (data.shown !== data.tier) {
    return `Customers see ${TIER_LABELS[data.shown]}: ${TIER_LABELS[data.tier]} is switched off in Settings → Tiers.`
  }
  return `Customers see the ${TIER_LABELS[data.shown]} medal.`
}

const PAUSED: Record<NonNullable<AdminTier['runPaused']>, string> = {
  documents_off:
    'The nightly tier check is not running: garage documents are off (R2_DOCS_BUCKET), so nobody can reach Silver or Gold.',
  no_agreement:
    'The nightly tier check waits for the first garage agreement: publish it in Settings → Garage agreement. Until then no tier is given or taken.',
}

function StepList({ steps }: { steps: TierStep[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {steps.map((step) => (
        <li key={step.key} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
          {step.met ? (
            <IconCircleCheckFilled size={17} aria-label="Met" className="mt-px shrink-0 text-success" />
          ) : (
            <IconCircleDashed size={17} aria-label="Not met" className="mt-px shrink-0 text-text-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text-primary">{step.label}</p>
            <p className="text-[12px] text-text-secondary">
              <span className={cn('font-numeric', step.met ? 'text-success' : 'text-text-primary')}>{step.value}</span>
              <span className="text-text-muted"> · needs: {step.target}</span>
              {!step.measured && step.met && <span className="text-text-muted"> (nothing to measure yet, passes)</span>}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * The garage's tier on its edit page's Tier tab (0063): what it holds and
 * what customers see (and why not), the progress to the next tier, every
 * tier's steps, its garage agreement acceptances, and "Hide this garage's
 * medal" (during a complaint, say), which saves at once. Gold's own checks,
 * Award Gold and Revoke are the section under it. In the Bin it shows and
 * nothing changes.
 */
export function GarageTierSection({ vendorId, readOnly }: { vendorId: string; readOnly: boolean }) {
  const { data, isLoading, error } = useAdminTier(vendorId)
  const setHidden = useSetTierHidden(vendorId)

  if (isLoading) {
    return (
      <ScSection title="Tier">
        <SkeletonList count={2} itemClassName="h-16 rounded-[10px]" />
      </ScSection>
    )
  }
  if (error || !data) {
    return (
      <ScSection title="Tier">
        <p role="alert" className="text-[12px] text-error">
          {errorMessage(error, "Couldn't load the tier.")}
        </p>
      </ScSection>
    )
  }

  const toggleHidden = (hidden: boolean) =>
    setHidden.mutate(hidden, {
      onSuccess: () => toast.success(hidden ? 'Medal hidden from customers' : 'Medal shown to customers again'),
      onError: (err) => toast.error(errorMessage(err, "Couldn't change the medal")),
    })

  return (
    <div className="flex flex-col gap-3">
      <ScSection
        title="Tier"
        action={
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
            {data.tier && <TierMedalIcon tier={data.tier} size={16} />}
            {data.tier ? TIER_LABELS[data.tier] : 'No tier yet'}
          </span>
        }
      >
        <p className="text-[13px] font-medium text-text-primary">{data.line}</p>
        <p className="text-[12px] text-text-secondary">{shownLine(data)}</p>
        {data.atRisk && (
          <p role="status" className="text-[12px] text-warning">
            Falling short of {TIER_LABELS[data.atRisk.tier]}: it keeps it until{' '}
            <span className="font-numeric">{dateKeyLabel(data.atRisk.keepsUntil)}</span>, then loses it unless it is
            put right.
          </p>
        )}
        {data.runPaused && <p className="text-[12px] text-warning">{PAUSED[data.runPaused]}</p>}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="flex flex-col">
            <span className="text-[13.5px] text-text-primary">Hide this garage&apos;s medal</span>
            <span className="text-[12px] text-text-muted">
              Customers see no medal on it while this is on (during a complaint, say). The garage still sees its tier.
              Saved at once.
            </span>
          </span>
          <ScSwitch
            label="Hide this garage's medal"
            checked={data.hidden}
            disabled={readOnly || data.garage.inBin || setHidden.isPending}
            onChange={toggleHidden}
          />
        </div>
        {!readOnly && <SignedAs />}
      </ScSection>

      <ScSection title="What each tier takes">
        {TIERS.map((tier: Tier) => (
          <section key={tier} aria-label={`${TIER_LABELS[tier]} steps`} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
              <TierMedalIcon tier={tier} size={13} />
              {TIER_LABELS[tier]}
              {tier === 'silver' && data.silver.since && (
                <span className="font-normal normal-case tracking-normal text-text-muted">
                  · held since {istDateTimeLabel(data.silver.since)}
                </span>
              )}
            </h3>
            <StepList steps={data.steps[tier]} />
            {tier === 'gold' && (
              <p className="text-[12px] text-text-muted">
                Plus every Silver step, and Award Gold below once all are met.
              </p>
            )}
          </section>
        ))}
      </ScSection>

      <ScSection title="Garage agreement">
        {data.acceptances.length === 0 ? (
          <p className="text-[12px] text-text-secondary">
            {data.agreement.latestVersion === null
              ? 'No agreement published yet (Settings → Garage agreement).'
              : `Not accepted yet. The garage's owner accepts v${data.agreement.latestVersion} in the garage app.`}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-[12px] text-text-secondary">
            {data.acceptances.map((row) => (
              <li key={row.version}>
                <span className="font-medium text-text-primary">v{row.version}</span> accepted{' '}
                {istDateTimeLabel(row.acceptedAt)} by {row.acceptedBy}
              </li>
            ))}
          </ul>
        )}
        {data.agreement.status === 'grace' && data.agreement.acceptBy && (
          <p className="text-[12px] text-warning">
            v{data.agreement.latestVersion} is new: it keeps Bronze until {dateKeyLabel(data.agreement.acceptBy)} unless
            accepted.
          </p>
        )}
        <p className="text-[12px] text-text-muted">
          A signed paper agreement from before, if any, is under Documents.
        </p>
      </ScSection>
    </div>
  )
}
