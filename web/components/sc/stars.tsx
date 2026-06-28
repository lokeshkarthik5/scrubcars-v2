'use client'

import { IconStar, IconStarFilled } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

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
            disabled={!interactive}
            onClick={() => interactive && onChange?.(i + 1)}
            className={cn(interactive && 'cursor-pointer')}
          >
            <Icon
              size={size}
              className={cn(
                filled ? 'text-brand-red' : 'text-text-muted',
                interactive && 'hover:text-brand-red'
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
