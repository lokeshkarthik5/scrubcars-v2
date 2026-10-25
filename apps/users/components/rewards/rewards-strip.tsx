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
      className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-3.5 py-2.5 transition-colors hover:bg-surface"
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] text-text-primary">
          <Figures text={stampsToGoLine(card.toGo)} />
          {card.toGo > 0 && (
            <span className="text-text-secondary">
              {' · '}
              <Figures text={`${rewardRupees(card.rewardAmount)} off`} />
            </span>
          )}
        </span>
        {extra && (
          <span className="block truncate text-[12px] text-text-secondary">
            <Figures text={extra} />
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <LevelBadge level={level.level} label={level.label} />
        <IconChevronRight size={16} className="text-text-muted" aria-hidden />
      </span>
    </Link>
  )
}
