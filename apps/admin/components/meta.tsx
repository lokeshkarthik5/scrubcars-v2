import { cn } from '@repo/core/utils'

/**
 * A labelled value in a card's grid — "Owner", "City", "Payment". The label
 * is the customer app's small-caps style (its booking page heads "Services"
 * the same way); the value is 12px, or 13px on a page about one thing.
 *
 * Every list in the panel had its own copy of this.
 */
export function Meta({
  label,
  children,
  size = 'sm',
  truncate = false,
  className,
}: {
  label: string
  children: React.ReactNode
  /** 'md' on a page about one booking, where each value is read, not scanned. */
  size?: 'sm' | 'md'
  /** Cuts a long value to one line, for the denser lists. */
  truncate?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[12px] font-medium text-text-secondary">{label}</p>
      <div
        className={cn(
          size === 'md'
            ? 'text-[13px] text-text-primary'
            : 'text-[12px] text-text-secondary',
          truncate && 'truncate'
        )}
      >
        {children}
      </div>
    </div>
  )
}
