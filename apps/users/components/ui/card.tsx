import { type HTMLAttributes } from 'react'
import { cn } from '@repo/core/utils'

/**
 * The customer app's card: Home's surface on every screen (the consistency
 * system's "cards and corners"): a soft graphite gradient, a hairline edge
 * and 22pt corners, instead of the flat grey 14pt card. A drop-in for
 * @repo/ui's ScCard, which the garage and admin apps keep.
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
        'rounded-[22px] border border-line px-4 py-4',
        !ownBackground &&
          'bg-gradient-to-b from-card-top to-card-bot shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        className
      )}
      {...props}
    />
  )
}
