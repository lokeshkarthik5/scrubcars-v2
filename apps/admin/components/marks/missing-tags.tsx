import {
  MISSING_LABELS,
  MISSING_TONES,
  type MissingKey,
} from '@repo/core/onboarding-marks'
import { cn } from '@repo/core/utils'

/** A red tag (customers can't book it yet) or an amber one (wanted). */
export const MISSING_TAG_TONES: Record<'red' | 'amber', string> = {
  red: 'bg-tone-late-tint text-tone-late-text',
  amber: 'bg-tone-attention-tint text-tone-attention-text',
}

/**
 * What a garage still owes us, as small tags: red ones first, then amber,
 * at most `max` of them and "+N" for the rest. Nothing when nothing is
 * missing or the API sent no `missing`.
 */
export function MissingTags({
  missing,
  max = 3,
}: {
  missing?: MissingKey[]
  max?: number
}) {
  if (!missing || missing.length === 0) return null
  const ordered = [
    ...missing.filter((key) => MISSING_TONES[key] === 'red'),
    ...missing.filter((key) => MISSING_TONES[key] !== 'red'),
  ]
  const shown = ordered.slice(0, Math.max(0, max))
  const rest = ordered.slice(shown.length)

  return (
    <ul aria-label="Missing" className="flex flex-wrap gap-1">
      {shown.map((key) => (
        <li
          key={key}
          className={cn(
            'rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight',
            MISSING_TAG_TONES[MISSING_TONES[key]]
          )}
        >
          {MISSING_LABELS[key]}
        </li>
      ))}
      {rest.length > 0 && (
        <li
          className="rounded bg-surface-elevated px-1.5 py-0.5 text-[11px] font-medium leading-tight text-text-secondary"
          title={rest.map((key) => MISSING_LABELS[key]).join(', ')}
        >
          <span aria-hidden>+{rest.length}</span>
          <span className="sr-only">
            and {rest.map((key) => MISSING_LABELS[key]).join(', ')}
          </span>
        </li>
      )}
    </ul>
  )
}
