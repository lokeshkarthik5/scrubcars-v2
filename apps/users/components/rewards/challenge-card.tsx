import { IconCheck, IconTrophy } from '@tabler/icons-react'
import { Figures } from '@repo/ui/sc/figures'
import type { CustomerChallenge } from '@repo/core/api/reward-extras'
import { challengeWinsLine } from '@repo/core/rewards'
import { cn } from '@repo/core/utils'
import { useT } from '@repo/core/i18n'

/** The challenge's bar: silver, never red; full once won. */
export function ChallengeBar({ count, goal, won, className }: { count: number; goal: number; won: boolean; className?: string }) {
  const t = useT()
  const percent = won ? 100 : Math.round((Math.min(count, goal) / Math.max(1, goal)) * 100)
  return (
    <div
      className={cn('h-[4px] w-full overflow-hidden rounded-full bg-surface-elevated', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(count, goal)}
      aria-label={t('{min} of {goal}', { min: Math.min(count, goal), goal })}
    >
      <div className="challenge-bar__fill h-full rounded-full bg-[#DCE1EC]" style={{ width: `${Math.max(won ? 100 : 4, percent)}%` }} />
    </div>
  )
}

/**
 * A seasonal challenge on the Rewards page (0054): what to do, what it
 * wins, and how far along ("1 of 3 — 4 days left"). Won ones say so.
 */
export function ChallengeCard({ challenge, highlight = false }: { challenge: CustomerChallenge; highlight?: boolean }) {
  const t = useT()
  return (
    <article
      id={`challenge-${challenge.id}`}
      className={cn(
        'flex flex-col gap-2.5 rounded-[14px] border bg-surface px-3.5 py-3.5',
        highlight ? 'border-[#DCE1EC]/50' : 'border-border',
        challenge.daysLeft === 0 && !challenge.won && 'opacity-70'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-t3 font-semibold leading-tight text-text-primary">{challenge.title}</h3>
          <p className="mt-0.5 text-t5 text-text-secondary">
            <Figures text={challengeWinsLine(challenge)} />
          </p>
        </div>
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full border',
            challenge.won ? 'border-[#DCE1EC] bg-[#DCE1EC] text-brand-black' : 'border-stroke text-text-secondary'
          )}
          aria-hidden
        >
          {challenge.won ? <IconCheck size={16} stroke={2.5} /> : <IconTrophy size={16} stroke={1.6} />}
        </span>
      </div>
      {challenge.description && <p className="text-t5 text-text-muted">{challenge.description}</p>}
      <ChallengeBar count={challenge.count} goal={challenge.goal} won={challenge.won} />
      <p className={cn('text-t5', challenge.won ? 'text-text-primary' : 'text-text-secondary')}>
        <Figures text={challenge.won ? t('You won: {reward}', { reward: challenge.reward }) : challenge.line} />
      </p>
    </article>
  )
}
