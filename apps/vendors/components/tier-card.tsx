'use client'

import Link from 'next/link'
import { IconChevronRight, IconCircleCheck, IconCircleDashed } from '@tabler/icons-react'
import { fill, useT } from '@repo/core/i18n'
import { ScCard } from '@repo/ui/sc/card'
import { TierMedalIcon } from '@repo/ui/features/tier-medal'
import { useGarageTier } from '@repo/core/api/hooks/use-tiers'
import type { TierStep } from '@repo/core/api/tiers'
import { dateKeyLabel } from '@repo/core/certification'
import { TIER_GARAGE_LINES, TIER_LABELS, TIER_STEP_LINKS } from '@repo/core/tiers'
import { cn } from '@repo/core/utils'

/** One list of steps, each with where to act when it is not met. */
function StepList({ steps, label }: { steps: TierStep[]; label: string }) {
  const t = useT()
  return (
    <section aria-label={label} className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-muted">{label}</p>
      <ul className="flex flex-col divide-y divide-line">
        {steps.map((step) => {
          const link = !step.met && step.action ? TIER_STEP_LINKS[step.action] : null
          return (
            <li key={step.key} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
              {step.met ? (
                <IconCircleCheck size={18} aria-label={t('Done')} className="mt-px shrink-0 text-success" />
              ) : (
                <IconCircleDashed size={18} aria-label={t('To do')} className="mt-px shrink-0 text-text-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-text-primary">{step.label}</p>
                <p className="text-[12px] text-text-secondary">
                  {step.value}
                  {!step.met && (
                    <span className="text-text-muted">
                      {' · '}
                      {t('Needs: {target}', { target: step.target })}
                    </span>
                  )}
                </p>
              </div>
              {link && (
                <Link
                  href={link.href}
                  className="tap-target flex shrink-0 items-center gap-0.5 self-center text-[12px] font-medium text-text-primary underline underline-offset-2"
                >
                  {t(link.label)}
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
  const t = useT()
  const { data } = useGarageTier(vendorId)
  if (!data) return null

  const next = data.next
  const keep = data.keep ?? []
  const percent = next && next.total > 0 ? Math.round((next.done / next.total) * 100) : 100

  return (
    <ScCard className="flex flex-col gap-3" role="region" aria-label={t('Your tier')}>
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-muted">
            {t('Your tier')}
          </p>
          <h2 className="text-[16px] font-semibold text-text-primary">
            {data.tier
              ? t("You're {tier}", { tier: t(TIER_LABELS[data.tier]) })
              : t('No tier yet')}
          </h2>
          <p className="text-[12px] text-text-secondary">
            {next
              ? fill(t('Next: {tier}, {done} of {total} done'), {
                  tier: t(TIER_LABELS[next.tier]),
                  done: <span className="font-numeric">{next.done}</span>,
                  total: <span className="font-numeric">{next.total}</span>,
                })
              : t('That’s the top tier. Keep meeting the standards to keep it.')}
          </p>
        </div>
      </div>

      {next && (
        <div
          role="progressbar"
          aria-label={t('Progress to {tier}', { tier: t(TIER_LABELS[next.tier]) })}
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
          {fill(
            t('You don’t meet every {tier} standard right now. Put it right by {date} to keep {tier}.'),
            {
              tier: t(TIER_LABELS[data.atRisk.tier]),
              date: (
                <span className="font-numeric">{dateKeyLabel(data.atRisk.keepsUntil)}</span>
              ),
            }
          )}
        </p>
      )}

      {/* What the tier held now asks for and is not met: put right first. */}
      {keep.length > 0 && data.tier && (
        <StepList
          steps={keep}
          label={t('To keep {tier}', { tier: t(TIER_LABELS[data.tier]) })}
        />
      )}

      {next && (
        <StepList
          steps={next.steps}
          label={t('Steps to {tier}', { tier: t(TIER_LABELS[next.tier]) })}
        />
      )}

      {next?.tier === 'gold' && (
        <p className="text-[12px] text-text-muted">
          {t('When every step is done, Detlio visits in person and awards Gold.')}
        </p>
      )}
      {data.tier && (
        <p className="text-[12px] text-text-muted">{t(TIER_GARAGE_LINES[data.tier])}</p>
      )}
    </ScCard>
  )
}
