import type { ReactNode } from 'react'
import type { StatusTone } from '@repo/core/status-tone'
import { cn } from '@repo/core/utils'

// Written out in full so Tailwind finds every class (--color-tone-* in
// globals.css, where their contrast is listed).
const toneStyles: Record<StatusTone, { chip: string; dot: string }> = {
  new: { chip: 'bg-tone-new-tint text-tone-new-text', dot: 'bg-tone-new-dot' },
  progress: {
    chip: 'bg-tone-progress-tint text-tone-progress-text',
    dot: 'bg-tone-progress-dot',
  },
  done: {
    chip: 'bg-tone-done-tint text-tone-done-text',
    dot: 'bg-tone-done-dot',
  },
  attention: {
    chip: 'bg-tone-attention-tint text-tone-attention-text',
    dot: 'bg-tone-attention-dot',
  },
  late: {
    chip: 'bg-tone-late-tint text-tone-late-text',
    dot: 'bg-tone-late-dot',
  },
  closed: {
    chip: 'bg-tone-closed-tint text-tone-closed-text',
    dot: 'bg-tone-closed-dot',
  },
}

const sizes = {
  sm: { chip: 'h-6 gap-1.5 px-2 text-[12px]', dot: 'size-1.5' },
  md: { chip: 'h-8 gap-2 px-3 text-[13px]', dot: 'size-2' },
}

interface StatusChipProps {
  tone: StatusTone
  /** The words. Always shown: no state is told by colour alone. */
  children: ReactNode
  /** The solid dot before the label. On by default. */
  dot?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * A status in one of the six tones ("New", "In progress", "Done"), the same
 * colour for the same meaning on every screen. See STATUS_TONE_MEANING in
 * @repo/core/status-tone, and bookingStatusTone for a booking's status.
 */
export function StatusChip({
  tone,
  children,
  dot = true,
  size = 'sm',
  className,
}: StatusChipProps) {
  const styles = toneStyles[tone]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-medium',
        sizes[size].chip,
        styles.chip,
        className
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('shrink-0 rounded-full', sizes[size].dot, styles.dot)}
        />
      )}
      {children}
    </span>
  )
}
