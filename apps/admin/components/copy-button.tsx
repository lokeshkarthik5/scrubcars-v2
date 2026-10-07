'use client'

import { IconCopy } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { cn } from '@repo/core/utils'

/**
 * Copies a value ops pastes somewhere else — chiefly a Razorpay payment id
 * into the Razorpay dashboard to issue a refund, where retyping
 * "pay_Nx8…" by hand is how the wrong customer gets refunded.
 *
 * `relative z-10` lifts it above a card's stretched link, so tapping it
 * copies instead of opening the booking.
 */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string
  /** The accessible name, e.g. "Copy Razorpay payment id pay_123". */
  label: string
  className?: string
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Copied')
    } catch {
      // Clipboard access can be refused (an insecure origin, a denied
      // permission). Say so rather than pretend it worked.
      toast.error("Couldn't copy. Select the text and copy it instead.")
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      title="Copy"
      className={cn(
        'relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary',
        className
      )}
    >
      <IconCopy size={16} aria-hidden />
    </button>
  )
}
