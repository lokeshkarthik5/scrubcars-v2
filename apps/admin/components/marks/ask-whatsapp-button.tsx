'use client'

import { useState } from 'react'
import { IconBrandWhatsapp } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'
import type { AskVendor } from '@/lib/onboarding-marks'
import { WhatsAppAskSheet } from './whatsapp-ask-sheet'

/**
 * "Ask on WhatsApp": the outline button (Send to team is the main one) that
 * opens one prefilled message per garage. Takes AdminVendor[] (an
 * AdminVendor is an AskVendor); the editor passes one built from the
 * garage's detail.
 */
export function AskWhatsAppButton({
  vendors,
  className,
}: {
  vendors: AskVendor[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        disabled={vendors.length === 0}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        className={cn(
          'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-[13px] font-medium text-text-primary hover:bg-surface',
          'disabled:border-border disabled:text-text-muted',
          className
        )}
      >
        <IconBrandWhatsapp size={15} aria-hidden />
        Ask on WhatsApp
      </button>
      {open && (
        <WhatsAppAskSheet
          open
          vendors={vendors}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
