'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { IconBrandInstagram, IconLoader2 } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import type { GarageOwnedCar } from '@repo/core/api/garage'
import { SHARE_FORMATS, type ShareFormat } from '@/lib/premium-card'

/**
 * "Share to Instagram" for a Garage card (0057): the card as a Story or a
 * Post, drawn on the phone (lib/garage-card-image.ts) with "Collected on
 * Detlio" and "Book on detlio.com", like the premium cards' share. The
 * first name goes on only when ticked; nothing else about the customer.
 */
export function GarageShare({ car, firstName = null }: { car: GarageOwnedCar; firstName?: string | null }) {
  const [open, setOpen] = useState(false)
  const [showName, setShowName] = useState(false)
  const [busy, setBusy] = useState<ShareFormat | null>(null)

  const share = async (format: ShareFormat) => {
    if (busy) return
    setBusy(format)
    try {
      const { shareGarageCard } = await import('@/lib/garage-card-image')
      const outcome = await shareGarageCard(car, format, showName ? firstName : null)
      if (outcome === 'downloaded') toast.success('Picture saved. Share it from your photos.')
    } catch {
      toast.error("Couldn't make the picture. Try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ScButton variant="secondary" aria-expanded={open} onClick={() => setOpen((on) => !on)} className="flex min-h-11 items-center justify-center gap-2">
        <IconBrandInstagram size={18} aria-hidden="true" />
        Share
      </ScButton>
      {open && (
        <div className="flex flex-col gap-2.5 rounded-[12px] border border-border bg-surface p-3 text-left">
          <p className="text-[12px] text-text-secondary">Your card as a picture for your story or feed, with “Collected on Detlio”.</p>
          {firstName && (
            <label className="flex min-h-9 items-center gap-2.5 text-[13px] text-text-primary">
              <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="size-4 accent-[#FAFAFA]" />
              Show “{firstName}’s Garage” on the picture
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(SHARE_FORMATS) as ShareFormat[]).map((format) => (
              <ScButton
                key={format}
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void share(format)}
                className="flex min-h-11 flex-col items-center justify-center gap-0 py-1.5 leading-tight"
              >
                <span className="flex items-center gap-1.5">
                  {busy === format && <IconLoader2 size={14} className="animate-spin" aria-hidden="true" />}
                  {SHARE_FORMATS[format].label}
                </span>
                <span className="font-numeric text-[11px] font-normal text-text-secondary">{format === 'story' ? '9:16' : '4:5'}</span>
              </ScButton>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
