'use client'

import Link from 'next/link'
import { IconChevronRight } from '@tabler/icons-react'
import type { RewardsSummary } from '@repo/core/api/rewards'
import { rewardRupees, stampsToGoLine } from '@repo/core/rewards'
import { Figures } from '@repo/ui/sc/figures'
import { LevelBadge } from './level-badge'

/**
 * Home's one line under the car (Detlio Rewards, 0050): how far the Shine
 * Card is from its reward, the level, and a scratch card or voucher waiting.
 * Not a card above the car: Home's two-card rule is untouched.
 */
export function RewardsStrip({ summary }: { summary: RewardsSummary }) {
  const { card, level } = summary
  const extra =
    summary.scratchWaiting > 0
      ? `${summary.scratchWaiting} scratch ${summary.scratchWaiting === 1 ? 'card' : 'cards'} waiting`
      : summary.vouchersAvailable > 0
        ? `${rewardRupees(summary.vouchers[0]?.amount)} off ready to use`
        : null
  return (
    <Link
      href="/profile/rewards"
      className="flex min-h-[52px] items-center justify-between gap-3 rounded-[22px] border border-line px-4 py-2.5 transition-colors hover:bg-surface"
    >
      {/* The Shine Card's count is on the car now (F2); this line is what
          else is waiting, written in full (F9). */}
      <span className="min-w-0 text-[13px] leading-snug text-text-primary">
        <Figures text={extra ?? `${stampsToGoLine(card.toGo)}`} />
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <LevelBadge level={level.level} label={level.label} />
        <IconChevronRight size={16} className="text-text-muted" aria-hidden />
      </span>
    </Link>
  )
}
