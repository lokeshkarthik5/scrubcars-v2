import Link from 'next/link'
import { IconTrophy } from '@tabler/icons-react'
import { Figures } from '@repo/ui/sc/figures'
import type { CustomerChallenge } from '@repo/core/api/reward-extras'
import { ChallengeBar } from './challenge-card'

/**
 * Home's challenge line (0054), under the rewards line: a live challenge,
 * its reward and a thin bar. A line, not a card: Home's two-card rule holds.
 */
export function ChallengeLine({ challenge }: { challenge: CustomerChallenge }) {
  return (
    <Link
      href={`/profile/rewards?challenge=${challenge.id}`}
      className="flex flex-col gap-1.5 rounded-[14px] border border-line px-3.5 py-2.5 transition-colors hover:bg-surface"
    >
      <span className="flex items-center justify-between gap-3 text-[13px]">
        <span className="flex min-w-0 items-center gap-1.5 text-text-primary">
          <IconTrophy size={14} stroke={1.6} className="shrink-0 text-text-secondary" aria-hidden />
          <span className="truncate">{challenge.title}</span>
        </span>
        <span className="shrink-0 text-[12px] text-text-secondary">
          <Figures text={challenge.reward} />
        </span>
      </span>
      <ChallengeBar count={challenge.count} goal={challenge.goal} won={challenge.won} />
      <span className="text-[11px] text-text-muted">
        <Figures text={challenge.line} />
      </span>
    </Link>
  )
}
