'use client'

import { useRef, useState } from 'react'
import { IconSend } from '@tabler/icons-react'
import type { AdminVendor } from '@repo/core/api/admin'
import { cn } from '@repo/core/utils'
import { SendToTeamSheet } from './send-to-team-sheet'

/**
 * The Garages bulk bar's main action (mockup 07): the red gradient "Send to
 * team", which opens the sheet for the ticked garages. Ask on WhatsApp is
 * the outline button beside it.
 */
export function SendToTeamButton({
  vendors,
  onSent,
  className,
}: {
  vendors: AdminVendor[]
  /** After the lists are made and the sheet closed (the bulk bar may clear its selection). */
  onSent?: () => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  // A fresh sheet each time, so it starts from the suggestions, with the
  // garages ticked when it opened: the selection is cleared only once it
  // closes, so the WhatsApp step after sending stays on screen.
  const [opening, setOpening] = useState(0)
  const [picked, setPicked] = useState<AdminVendor[]>([])
  const sent = useRef(false)
  return (
    <>
      <button
        type="button"
        disabled={vendors.length === 0}
        onClick={() => {
          setOpening((n) => n + 1)
          setPicked(vendors)
          sent.current = false
          setOpen(true)
        }}
        className={cn(
          'press inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-(image:--gradient-cta) px-3.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_22px_-12px_rgba(228,0,43,0.6)] transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:bg-none disabled:bg-surface-elevated disabled:text-text-secondary disabled:shadow-none',
          className
        )}
      >
        <IconSend size={15} aria-hidden="true" />
        Send to team
      </button>
      {opening > 0 && (
        <SendToTeamSheet
          key={opening}
          open={open}
          onClose={() => {
            setOpen(false)
            if (sent.current) onSent?.()
            sent.current = false
          }}
          vendors={picked}
          onSent={() => {
            sent.current = true
          }}
        />
      )}
    </>
  )
}
