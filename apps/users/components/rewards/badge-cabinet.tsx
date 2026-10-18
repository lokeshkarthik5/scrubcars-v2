'use client'

import { useMemo, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { ScSheet } from '@repo/ui/sc/modal'
import { Figures } from '@repo/ui/sc/figures'
import type { CabinetBadge, RewardExtras } from '@repo/core/api/reward-extras'
import { badgeProgressLine, bonusStampsLine } from '@repo/core/achievements'
import { rewardDate } from '@repo/core/rewards'
import { cn } from '@repo/core/utils'
import { featuredBadges } from '@/lib/featured-badges'
import { BadgeMedal } from './badge-medal'

type Selected = { kind: 'badge'; badge: CabinetBadge } | { kind: 'challenge'; label: string; at: string }
/** What the one sheet shows: the whole cabinet, or one badge (from the row or from the cabinet). */
type SheetView = { kind: 'all' } | { kind: 'one'; selected: Selected; fromAll: boolean }

function BadgeButton({
  label,
  badgeKey,
  earned,
  progress,
  onOpen,
  size,
  compact = false,
}: {
  label: string
  badgeKey: CabinetBadge['key'] | 'challenge'
  earned: boolean
  progress?: CabinetBadge['progress']
  onOpen: () => void
  size: number
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col items-center gap-1.5 rounded-[12px] px-0.5 py-1 text-center focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label={`${label}: ${earned ? 'earned' : `locked, ${progress ? badgeProgressLine(progress) : ''}`}`}
    >
      <BadgeMedal badgeKey={badgeKey} earned={earned} size={size} />
      <span className={cn('line-clamp-2 leading-tight', compact ? 'text-[10px]' : 'text-[11px]', earned ? 'text-text-primary' : 'text-text-muted')}>{label}</span>
    </button>
  )
}

/**
 * Badges on the Rewards page (0054): a short row, the newest earned first
 * (then the locked ones closest to being earned), and "See all N" for the
 * whole cabinet. Earned ones in colour, locked ones grey with how far
 * along; a tap opens what it is and how to earn it. Challenge badges sit at
 * the end of the cabinet.
 */
export function BadgeCabinet({ extras }: { extras: RewardExtras }) {
  const [view, setView] = useState<SheetView | null>(null)
  const total = extras.badges.length + extras.challengeBadges.length
  const featured = useMemo(() => featuredBadges(extras, 6), [extras])
  const open = (selected: Selected, fromAll: boolean) => setView({ kind: 'one', selected, fromAll })

  return (
    <section aria-labelledby="badges" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="badges" className="text-sm font-semibold text-text-primary">
          Badges <span className="font-numeric text-[12px] font-normal text-text-secondary">· {extras.earnedCount} of {total}</span>
        </h2>
        <button
          type="button"
          onClick={() => setView({ kind: 'all' })}
          className="flex min-h-9 items-center gap-1 text-[12px] font-medium text-text-primary"
        >
          See all{' '}<span className="font-numeric">{total}</span>
          <IconChevronRight size={14} aria-hidden />
        </button>
      </div>
      <ul className="grid grid-cols-6 gap-x-1 rounded-[14px] border border-border bg-surface px-1.5 py-3">
        {featured.map((item) => (
          <li key={item.kind === 'badge' ? item.badge.key : item.id}>
            {item.kind === 'badge' ? (
              <BadgeButton
                label={item.badge.label}
                badgeKey={item.badge.key}
                earned={!!item.badge.earned}
                progress={item.badge.progress}
                onOpen={() => open({ kind: 'badge', badge: item.badge }, false)}
                size={44}
                compact
              />
            ) : (
              <BadgeButton label={item.label} badgeKey="challenge" earned onOpen={() => open({ kind: 'challenge', label: item.label, at: item.at }, false)} size={44} compact />
            )}
          </li>
        ))}
      </ul>

      <ScSheet open={view !== null} onClose={() => setView(null)} aria-label={view?.kind === 'all' ? 'All badges' : 'Badge'}>
        {view?.kind === 'all' && (
          <div className="flex flex-col gap-3 px-4 pt-1">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h3 className="text-[17px] font-semibold text-text-primary">All badges</h3>
              <span className="font-numeric text-[12px] text-text-secondary">
                {extras.earnedCount} of {total} earned
              </span>
            </div>
            <ul className="grid grid-cols-4 gap-x-1 gap-y-3">
              {extras.badges.map((badge) => (
                <li key={badge.key}>
                  <BadgeButton
                    label={badge.label}
                    badgeKey={badge.key}
                    earned={!!badge.earned}
                    progress={badge.progress}
                    onOpen={() => open({ kind: 'badge', badge }, true)}
                    size={52}
                  />
                </li>
              ))}
              {extras.challengeBadges.map((badge) => (
                <li key={badge.id}>
                  <BadgeButton label={badge.label} badgeKey="challenge" earned onOpen={() => open({ kind: 'challenge', label: badge.label, at: badge.at }, true)} size={52} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {view?.kind === 'one' && (
          <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-2 text-center">
            {view.fromAll && (
              <button
                type="button"
                onClick={() => setView({ kind: 'all' })}
                className="flex min-h-9 items-center gap-0.5 self-start text-[12px] font-medium text-text-secondary"
              >
                <IconChevronLeft size={14} aria-hidden />
                All badges
              </button>
            )}
            {view.selected.kind === 'badge' ? (
              <BadgeDetail badge={view.selected.badge} />
            ) : (
              <>
                <BadgeMedal badgeKey="challenge" earned size={88} />
                <h3 className="text-[18px] font-semibold text-text-primary">{view.selected.label}</h3>
                <p className="text-[13px] text-text-secondary">Won in a Detlio challenge.</p>
                <p className="text-[12px] text-text-muted">
                  Earned <span className="font-numeric">{rewardDate(view.selected.at)}</span>
                </p>
              </>
            )}
          </div>
        )}
      </ScSheet>
    </section>
  )
}

function BadgeDetail({ badge }: { badge: CabinetBadge }) {
  return (
    <>
      <BadgeMedal badgeKey={badge.key} earned={!!badge.earned} size={88} />
      <h3 className="text-[18px] font-semibold text-text-primary">{badge.label}</h3>
      <p className="text-[13px] text-text-secondary">{badge.howTo}</p>
      {badge.earned ? (
        <p className="text-[12px] text-text-muted">
          Earned <span className="font-numeric">{rewardDate(badge.earned.at)}</span>
        </p>
      ) : (
        <div className="flex w-full max-w-[240px] flex-col gap-1.5">
          <div className="h-[4px] w-full overflow-hidden rounded-full bg-surface-elevated" aria-hidden>
            <div
              className="h-full rounded-full bg-[#DCE1EC]"
              style={{ width: `${Math.max(4, Math.round((badge.progress.current / badge.progress.goal) * 100))}%` }}
            />
          </div>
          <p className="font-numeric text-[12px] text-text-secondary">{badgeProgressLine(badge.progress)}</p>
        </div>
      )}
      {bonusStampsLine(badge.bonusStamps) && (
        <p className="text-[12px] text-text-secondary">
          <Figures text={`${bonusStampsLine(badge.bonusStamps)} on your Shine Card${badge.earned ? '' : ' when you earn it'}.`} />
        </p>
      )}
    </>
  )
}
