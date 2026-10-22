import { IconShieldCheckFilled } from '@tabler/icons-react'
import { DOCUMENTS_VERIFIED_LABEL, DOCUMENTS_VERIFIED_NOTE } from '@repo/core/vendor-documents'
import { cn } from '@repo/core/utils'

/**
 * The "Documents verified" sign: Detlio has checked the garage's ID, bank
 * proof, shop photo and signed agreement (garage documents, 0043). It says
 * nothing about which documents or what they show.
 *
 * Calm, like the Outside Chennai chip: a small shield in the success green,
 * never brand red (that is the one main action on a screen).
 */

/**
 * On a garage card: the shield alone, right after the name, so it adds no
 * row and no width a 360px card does not have. Named for screen readers
 * and with a tooltip for a pointer.
 */
export function DocumentsVerifiedMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={DOCUMENTS_VERIFIED_LABEL}
      title={DOCUMENTS_VERIFIED_LABEL}
      className={cn('inline-flex shrink-0 text-success', className)}
    >
      <IconShieldCheckFilled size={15} aria-hidden="true" />
    </span>
  )
}

/** On the garage page: the shield with its words, and what it means under them. */
export function DocumentsVerifiedBadge({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="inline-flex items-center gap-1 self-start rounded-md bg-success-muted px-2 py-0.5 text-[12px] font-medium text-success">
        <IconShieldCheckFilled size={13} aria-hidden="true" className="shrink-0" />
        {DOCUMENTS_VERIFIED_LABEL}
      </span>
      <p className="text-[11px] text-text-muted">{DOCUMENTS_VERIFIED_NOTE}</p>
    </div>
  )
}
