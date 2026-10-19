import type { StatusTone } from '@repo/core/status-tone'
import { StatusChip } from '@repo/ui/sc/status-chip'
import type { DeadlineText, Urgency } from '@/lib/format'

/** The admin's clock scale on the shared tones: coral late, amber today, grey otherwise. */
const TONE: Record<Urgency, StatusTone> = {
  late: 'late',
  attention: 'attention',
  neutral: 'closed',
}

/**
 * A clock on one colour scale everywhere (quick win 1): "Cancels in 10 min"
 * and "Late · 26 h" in coral, "Decide by 4:00 pm" in amber when it is due
 * today, grey otherwise. The shared StatusChip draws it, words always shown.
 */
export function UrgencyChip({
  label,
  className,
}: {
  label: DeadlineText
  className?: string
}) {
  if (!label.text) return null
  return (
    <StatusChip tone={TONE[label.urgency]} className={className}>
      {label.text}
    </StatusChip>
  )
}
