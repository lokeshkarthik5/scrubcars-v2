'use client'

import { IconBrandWhatsapp, IconPhone } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

const LINK =
  'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-medium text-text-primary transition-colors'

interface ContactButtonsProps {
  /** A tel: link, or null when there is no number to call. */
  callHref: string | null
  /** A wa.me link, or null when there is no number to message. */
  whatsAppHref: string | null
  /** Whose number it is — "Call Arjun", for screen readers and tests. */
  who: string
  className?: string
}

/**
 * Call and WhatsApp, side by side. Either half is left out when there is no
 * number for it, and nothing renders when neither is: a button that opens an
 * error is worse than no button. Plain links, not buttons — they hand off to
 * the phone's own dialler and WhatsApp — in the same quiet outline as the rest
 * of the secondary actions, since red stays for the screen's one main action.
 */
export function ContactButtons({ callHref, whatsAppHref, who, className }: ContactButtonsProps) {
  if (!callHref && !whatsAppHref) return null

  return (
    <div className={cn('flex gap-2', className)}>
      {callHref && (
        <a
          href={callHref}
          aria-label={`Call ${who}`}
          className={cn(LINK, 'hover:border-text-secondary')}
        >
          <IconPhone size={16} aria-hidden />
          Call
        </a>
      )}
      {whatsAppHref && (
        <a
          href={whatsAppHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp ${who}`}
          className={cn(LINK, 'hover:border-[#25D366]')}
        >
          <IconBrandWhatsapp size={16} className="text-[#25D366]" aria-hidden />
          WhatsApp
        </a>
      )}
    </div>
  )
}
