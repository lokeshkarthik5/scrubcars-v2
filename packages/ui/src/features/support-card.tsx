'use client'

import { IconBrandWhatsapp, IconPhone } from '@tabler/icons-react'
import { ScCard } from '@repo/ui/sc/card'
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
      <div className="flex gap-2">
        <a
          href={SUPPORT_TEL_HREF}
          className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-border bg-surface py-2.5 text-[13px] font-medium text-text-primary transition-colors hover:border-brand-red"
        >
          <IconPhone size={16} /> Call
        </a>
        <a
          href={SUPPORT_WHATSAPP_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-border bg-surface py-2.5 text-[13px] font-medium text-text-primary transition-colors hover:border-[#25D366]"
        >
          <IconBrandWhatsapp size={16} className="text-[#25D366]" /> WhatsApp
        </a>
      </div>
    </ScCard>
  )
}
