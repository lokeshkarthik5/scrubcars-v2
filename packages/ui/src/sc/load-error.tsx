import { IconAlertCircle } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'
import { ScButton } from './button'

interface LoadErrorProps {
  /** What failed, as it finishes the sentence: "today's jobs" → "Couldn't load today's jobs." */
  what?: string
  onRetry: () => void
  /** True while the retry runs. */
  retrying?: boolean
  className?: string
}

/**
 * A load that failed, said as one. The rule (all three audits): a failed
 * load is never drawn as an empty list, a 0 or ₹0, which an owner reads as
 * "no bookings" or "no money" and acts on.
 */
export function LoadError({
  what,
  onRetry,
  retrying = false,
  className,
}: LoadErrorProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-6 text-center',
        className
      )}
    >
      <IconAlertCircle
        size={24}
        aria-hidden="true"
        className="text-text-secondary"
      />
      <p className="text-[14px] text-text-primary">
        {what ? `Couldn't load ${what}.` : "Couldn't load."}
      </p>
      <ScButton
        type="button"
        variant="outline"
        fullWidth={false}
        onClick={onRetry}
        disabled={retrying}
        aria-busy={retrying || undefined}
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </ScButton>
    </div>
  )
}
