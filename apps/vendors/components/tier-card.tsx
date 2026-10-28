'use client'

import Link from 'next/link'
import { IconChevronRight, IconCircleCheck, IconCircleDashed } from '@tabler/icons-react'
import { ScCard } from '@repo/ui/sc/card'
import { TierMedalIcon } from '@repo/ui/features/tier-medal'
import { useGarageTier } from '@repo/core/api/hooks/use-tiers'
import type { TierStep } from '@repo/core/api/tiers'
import { dateKeyLabel } from '@repo/core/certification'
import { TIER_GARAGE_LINES, TIER_LABELS, TIER_STEP_LINKS } from '@repo/core/tiers'
import { cn } from '@repo/core/utils'

/** One list of steps, each with where to act when it is not met. */
function StepList({ steps, label }: { steps: TierStep[]; label: string }) {
  return (
    <section aria-label={label} className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-muted">{label}</p>
      <ul className="flex flex-col divide-y divide-line">
        {steps.map((step) => {
          const link = !step.met && step.action ? TIER_STEP_LINKS[step.action] : null
          return (
            <li key={step.key} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
              {step.met ? (
                <IconCircleCheck size={18} aria-label="Done" className="mt-px shrink-0 text-success" />
              ) : (
                <IconCircleDashed size={18} aria-label="To do" className="mt-px shrink-0 text-text-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-text-primary">{step.label}</p>
                <p className="text-[12px] text-text-secondary">
                  {step.value}
                  {!step.met && <span className="text-text-muted"> · Needs: {step.target}</span>}
                </p>
              </div>
              {link && (
                <Link
                  href={link.href}
                  className="tap-target flex shrink-0 items-center gap-0.5 self-center text-[12px] font-medium text-text-primary underline underline-offset-2"
                >
                  {link.label}
                  <IconChevronRight size={14} aria-hidden="true" />
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * "Your tier" on the portal's Home (0063), for the owner seat: the tier the
 * garage holds (Bronze, Silver or Gold) and what the next one takes, step by
 * step, each missing step with a link where the garage can act (the
 * agreement, its documents). Garages always see their own tier, whatever
 * Detlio shows customers. Never a checker's name or a check's notes; the
 * server never sends them.
 *
 * Shows nothing until loaded, and nothing if the read fails (an API from
 * before tiers): it is information, and Home's jobs come first.
 */
export function TierCard({ vendorId }: { vendorId: string | undefined }) {
  const { data } = useGarageTier(vendorId)
  if (!data) return null

  const next = data.next
  const keep = data.keep ?? []
  const percent = next && next.total > 0 ? Math.round((next.done / next.total) * 100) : 100

  return (
    <ScCard className="flex flex-col gap-3" role="region" aria-label="Your tier">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-border bg-surface-elevated',
            !data.tier && 'opacity-60'
          )}
        >
          <TierMedalIcon tier={data.tier ?? 'bronze'} size={26} className={cn(!data.tier && 'grayscale')} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-muted">Your tier</p>
          <h2 className="text-[16px] font-semibold text-text-primary">
            {data.tier ? `You're ${TIER_LABELS[data.tier]}` : 'No tier yet'}
          </h2>
          <p className="text-[12px] text-text-secondary">
            {next ? (
              <>
                Next: {TIER_LABELS[next.tier]}, <span className="font-numeric">{next.done}</span> of{' '}
                <span className="font-numeric">{next.total}</span> done
              </>
            ) : (
              'That’s the top tier. Keep meeting the standards to keep it.'
            )}
          </p>
        </div>
      </div>

      {next && (
        <div
          role="progressbar"
          aria-label={`Progress to ${TIER_LABELS[next.tier]}`}
          aria-valuemin={0}
          aria-valuemax={next.total}
          aria-valuenow={next.done}
          className="h-1.5 overflow-hidden rounded-full bg-surface-elevated"
        >
          <div className="h-full rounded-full bg-text-primary" style={{ width: `${percent}%` }} />
        </div>
      )}

      {data.atRisk && (
        <p role="status" className="rounded-[10px] bg-warning-muted px-3 py-2 text-[12px] text-warning">
          You don’t meet every {TIER_LABELS[data.atRisk.tier]} standard right now. Put it right by{' '}
          <span className="font-numeric">{dateKeyLabel(data.atRisk.keepsUntil)}</span> to keep{' '}
          {TIER_LABELS[data.atRisk.tier]}.
        </p>
      )}

      {/* What the tier held now asks for and is not met: put right first. */}
      {keep.length > 0 && data.tier && (
        <StepList steps={keep} label={`To keep ${TIER_LABELS[data.tier]}`} />
      )}

      {next && <StepList steps={next.steps} label={`Steps to ${TIER_LABELS[next.tier]}`} />}

      {next?.tier === 'gold' && (
        <p className="text-[12px] text-text-muted">
          When every step is done, Detlio visits in person and awards Gold.
        </p>
      )}
      {data.tier && <p className="text-[12px] text-text-muted">{TIER_GARAGE_LINES[data.tier]}</p>}
    </ScCard>
  )
}
