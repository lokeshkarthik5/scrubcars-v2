import { type HTMLAttributes } from 'react'
import { cn } from '@repo/core/utils'

/**
 * The customer app's card: one surface on every screen (the consistency
 * system's "cards and corners"): graphite with an edge that catches the
 * light (`fx-edge`, the finish) and 22pt corners, instead of the flat grey
 * 14pt card. A drop-in for @repo/ui's ScCard, which the garage and admin
 * apps keep.
 *
 * A card that brings its own background (an amber notice) keeps it: the
 * gradient would sit on top of a background colour and hide it.
 */
export function ScCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const ownBackground = /(^|\s)(bg-|shine-card)/.test(className ?? '')
  return (
    <div
      className={cn(
        'rounded-[22px] px-4 py-4',
        // The finish's lit edge (customer UI round, §1): bright on top,
        // fading down, rather than a flat grey outline.
        ownBackground ? 'border border-line' : 'fx-edge',
        className
      )}
      {...props}
    />
  )
}
