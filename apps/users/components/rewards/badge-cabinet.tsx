'use client'

import { useState } from 'react'
import { ScSheet } from '@repo/ui/sc/modal'
import { Figures } from '@repo/ui/sc/figures'
import type { CabinetBadge, RewardExtras } from '@repo/core/api/reward-extras'
import { badgeProgressLine, bonusStampsLine } from '@repo/core/achievements'
import { rewardDate } from '@repo/core/rewards'
import { cn } from '@repo/core/utils'
import { BadgeMedal } from './badge-medal'

type Selected = { kind: 'badge'; badge: CabinetBadge } | { kind: 'challenge'; label: string; at: string }

/**
 * The badge cabinet (0054): every badge on, earned ones in colour first in
 * their order, locked ones grey with how far along. A tap opens what it is
 * and how to earn it. Challenge badges sit at the end.
 */
export function BadgeCabinet({ extras }: { extras: RewardExtras }) {
  const [selected, setSelected] = useState<Selected | null>(null)
  const total = extras.badges.length + extras.challengeBadges.length

  return (
    <section aria-labelledby="badges" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="badges" className="text-sm font-semibold text-text-primary">
          Badges
        </h2>
        <span className="font-numeric text-[12px] text-text-secondary">
          {extras.earnedCount} of {total}
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-x-2 gap-y-4 rounded-[14px] border border-border bg-surface px-2 py-4 min-[400px]:grid-cols-4">
        {extras.badges.map((badge) => (
          <li key={badge.key}>
            <button
              type="button"
              onClick={() => setSelected({ kind: 'badge', badge })}
              className="flex w-full flex-col items-center gap-1.5 rounded-[12px] px-1 py-1 text-center focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={`${badge.label}: ${badge.earned ? 'earned' : `locked, ${badgeProgressLine(badge.progress)}`}`}
            >
              <BadgeMedal badgeKey={badge.key} earned={!!badge.earned} />
              <span className={cn('text-[11px] leading-tight', badge.earned ? 'text-text-primary' : 'text-text-muted')}>{badge.label}</span>
              {!badge.earned && badge.progress.goal > 1 && (
                <span className="font-numeric text-[10px] text-text-muted">{badgeProgressLine(badge.progress)}</span>
              )}
            </button>
          </li>
        ))}
        {extras.challengeBadges.map((badge) => (
          <li key={badge.id}>
            <button
              type="button"
              onClick={() => setSelected({ kind: 'challenge', label: badge.label, at: badge.at })}
              className="flex w-full flex-col items-center gap-1.5 rounded-[12px] px-1 py-1 text-center"
              aria-label={`${badge.label}: challenge badge, earned`}
            >
              <BadgeMedal badgeKey="challenge" earned />
              <span className="text-[11px] leading-tight text-text-primary">{badge.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <ScSheet open={selected !== null} onClose={() => setSelected(null)} aria-label="Badge">
        {selected && (
          <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-2 text-center">
            {selected.kind === 'badge' ? (
              <>
                <BadgeMedal badgeKey={selected.badge.key} earned={!!selected.badge.earned} size={88} />
                <h3 className="text-[18px] font-semibold text-text-primary">{selected.badge.label}</h3>
                <p className="text-[13px] text-text-secondary">{selected.badge.howTo}</p>
                {selected.badge.earned ? (
                  <p className="text-[12px] text-text-muted">
                    Earned <span className="font-numeric">{rewardDate(selected.badge.earned.at)}</span>
                  </p>
                ) : (
                  <div className="flex w-full max-w-[240px] flex-col gap-1.5">
                    <div className="h-[4px] w-full overflow-hidden rounded-full bg-surface-elevated" aria-hidden>
                      <div
                        className="h-full rounded-full bg-[#DCE1EC]"
                        style={{ width: `${Math.max(4, Math.round((selected.badge.progress.current / selected.badge.progress.goal) * 100))}%` }}
                      />
                    </div>
                    <p className="font-numeric text-[12px] text-text-secondary">{badgeProgressLine(selected.badge.progress)}</p>
                  </div>
                )}
                {bonusStampsLine(selected.badge.bonusStamps) && (
                  <p className="text-[12px] text-text-secondary">
                    <Figures text={`${bonusStampsLine(selected.badge.bonusStamps)} on your Shine Card${selected.badge.earned ? '' : ' when you earn it'}.`} />
                  </p>
                )}
              </>
            ) : (
              <>
                <BadgeMedal badgeKey="challenge" earned size={88} />
                <h3 className="text-[18px] font-semibold text-text-primary">{selected.label}</h3>
                <p className="text-[13px] text-text-secondary">Won in a Detlio challenge.</p>
                <p className="text-[12px] text-text-muted">
                  Earned <span className="font-numeric">{rewardDate(selected.at)}</span>
                </p>
              </>
            )}
          </div>
        )}
      </ScSheet>
    </section>
  )
}
