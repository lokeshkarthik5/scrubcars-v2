import { cn } from '@repo/core/utils'

/**
 * A placeholder in the shape of what is coming, on the same shimmer the
 * customer app's slot picker uses (globals.css). The garage portal and the
 * admin panel used to say "Loading…" in a line of text, which reads as a page
 * that has stopped, and then jumps when the real content pushes it away.
 *
 * Decorative on its own; SkeletonList is what tells a screen reader that
 * something is loading.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('rounded-[14px] shimmer', className)} />
}

interface SkeletonListProps {
  /** How many placeholders. Three fills a phone screen without overpromising. */
  count?: number
  /** Each placeholder's size — its height especially, to match the real rows. */
  itemClassName?: string
  className?: string
}

/**
 * A stack of placeholders standing in for a list. Announced once as
 * "Loading" — without an ellipsis, so it never reads as the old text it
 * replaces.
 */
export function SkeletonList({ count = 3, itemClassName, className }: SkeletonListProps) {
  return (
    <div role="status" aria-busy="true" className={cn('flex flex-col gap-2', className)}>
      <span className="sr-only">Loading</span>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={cn('h-24 w-full', itemClassName)} />
      ))}
    </div>
  )
}
