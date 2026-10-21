import { IconCheck, IconTrophy } from '@tabler/icons-react'
import { Figures } from '@repo/ui/sc/figures'
import type { CustomerChallenge } from '@repo/core/api/reward-extras'
import { cn } from '@repo/core/utils'

/** The challenge's bar: silver, never red; full once won. */
export function ChallengeBar({ count, goal, won, className }: { count: number; goal: number; won: boolean; className?: string }) {
  const percent = won ? 100 : Math.round((Math.min(count, goal) / Math.max(1, goal)) * 100)
  return (
    <div
      className={cn('h-[4px] w-full overflow-hidden rounded-full bg-surface-elevated', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(count, goal)}
      aria-label={`${Math.min(count, goal)} of ${goal}`}
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
          <h3 className="text-[15px] font-semibold leading-tight text-text-primary">{challenge.title}</h3>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            <Figures text={`${challenge.counts.charAt(0).toUpperCase()}${challenge.counts.slice(1)} wins ${challenge.reward}`} />
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
      {challenge.description && <p className="text-[12px] text-text-muted">{challenge.description}</p>}
      <ChallengeBar count={challenge.count} goal={challenge.goal} won={challenge.won} />
      <p className={cn('text-[12px]', challenge.won ? 'text-text-primary' : 'text-text-secondary')}>
        <Figures text={challenge.won ? `You won: ${challenge.reward}` : challenge.line} />
      </p>
    </article>
  )
}
