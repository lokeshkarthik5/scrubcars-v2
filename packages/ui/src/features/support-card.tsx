'use client'

import { ScCard } from '@repo/ui/sc/card'
import { ContactButtons } from '@repo/ui/sc/contact-buttons'
import {
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_TEL_HREF,
  SUPPORT_WHATSAPP_HREF,
} from '@repo/core/support'

export function SupportCard() {
  return (
    <ScCard className="flex flex-col gap-3">
      <div>
        <p className="text-[13px] font-semibold text-text-primary">Need help?</p>
        <p className="text-[11px] text-text-secondary">
          Reach our team at {SUPPORT_PHONE_DISPLAY}
        </p>
      </div>
      <ContactButtons
        who="Detlio support"
        callHref={SUPPORT_TEL_HREF}
        whatsAppHref={SUPPORT_WHATSAPP_HREF}
      />
    </ScCard>
  )
}
