import type { RewardLevel } from '@repo/core/rewards'
import { cn } from '@repo/core/utils'

/** A level's name as a quiet pill; Diamond and Detlio Icon get a silver edge. */
export function LevelBadge({ level, label, className }: { level: RewardLevel; label: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-stroke px-2 py-0.5 text-[11px] font-medium text-text-primary',
        `level-badge--${level}`,
        className
      )}
    >
      {label}
    </span>
  )
}
