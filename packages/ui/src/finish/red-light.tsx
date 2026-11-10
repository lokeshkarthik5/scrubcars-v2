import { cn } from '@repo/core/utils'

/**
 * The red light (§1, "Red, exactly two ways"): a small glowing bar under the
 * chosen thing. `dim` waits under an Add not yet pressed; `off` is gone.
 * Drawn, never read: the control it sits under says its own state.
 */
export function RedLight({
  state = 'on',
  className,
}: {
  state?: 'on' | 'dim' | 'off'
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      data-dim={state === 'dim' ? '' : undefined}
      data-off={state === 'off' ? '' : undefined}
      className={cn('fx-red-light', className)}
    />
  )
}
