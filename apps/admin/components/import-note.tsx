import { IconAlertTriangle } from '@tabler/icons-react'
import type { ImportMark } from '@/lib/garage-import'

/**
 * The line under a field the import is unsure of: amber "Check this" or
 * "Not found — fill in", then why, in grey. Amber, as everything to act
 * on is: red on the review screen is Create garage.
 */
export function ImportNote({ id, mark }: { id?: string; mark: ImportMark }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-[12px] leading-[17px] text-text-secondary">
      <IconAlertTriangle size={14} stroke={1.8} aria-hidden="true" className="mt-[1.5px] shrink-0 text-warning" />
      <span>
        <span className="font-medium text-warning">{mark.kind === 'check' ? 'Check this' : 'Not found — fill in'}</span>
        {mark.reason && <> · {mark.reason}</>}
      </span>
    </p>
  )
}

/** The amber edge a field with a note carries. */
export const MARKED_FIELD = 'border-warning/60'
