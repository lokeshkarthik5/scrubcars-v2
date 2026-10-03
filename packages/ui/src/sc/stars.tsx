'use client'

import { IconStar, IconStarFilled } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

interface StarsProps {
  rating: number
  max?: number
  size?: number
  interactive?: boolean
  value?: number
  onChange?: (rating: number) => void
}

export function Stars({
  rating,
  max = 5,
  size = 14,
  interactive = false,
  value,
  onChange,
}: StarsProps) {
  const display = interactive ? (value ?? 0) : rating

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < Math.floor(display)
        const Icon = filled ? IconStarFilled : IconStar
        return (
          <button
            key={i}
            type="button"
            // Without a name these are five unlabelled buttons, so rating by
            // keyboard or screen reader is guesswork. When they are not
            // interactive they are decoration next to a visible number, and
            // announcing five buttons would be noise — hence aria-hidden.
            aria-label={interactive ? `Rate ${i + 1} star${i === 0 ? '' : 's'}` : undefined}
            aria-pressed={interactive ? i < display : undefined}
            aria-hidden={interactive ? undefined : true}
            tabIndex={interactive ? undefined : -1}
            disabled={!interactive}
            onClick={() => interactive && onChange?.(i + 1)}
            className={cn(interactive && 'cursor-pointer')}
          >
            {/* The same amber as the star beside every rating in the app;
                these were the only red ones. */}
            <Icon
              size={size}
              className={cn(
                filled ? 'text-warning' : 'text-text-muted',
                interactive && 'hover:text-warning'
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

export function StarRating({
  rating,
  reviewCount,
}: {
  rating: number
  reviewCount?: number
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Stars rating={rating} size={12} />
      <span className="text-[12px] font-medium text-text-primary">{rating}</span>
      {reviewCount !== undefined && (
        <span className="text-[11px] text-text-secondary">({reviewCount})</span>
      )}
    </div>
  )
}
