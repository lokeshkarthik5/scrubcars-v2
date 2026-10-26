'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { IconBrandInstagram, IconLoader2 } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { cn } from '@repo/core/utils'
import { SHARE_FORMATS, type PremiumCardSpec, type ShareFormat } from '@/lib/premium-card'

/**
 * "Share to Instagram": the card as a picture, drawn on the phone
 * (lib/premium-card-image.ts, no server) as a Story (1080×1920) or a Post
 * (1080×1350), handed to the share sheet, or downloaded where the browser
 * can't share files. Only what is on the card goes in the picture: never a
 * gift code, a link or a voucher code. A gift's first name stays off unless
 * the sharer turns it on.
 *
 * `spec(showName)` builds the card to draw; `firstName` offers the name
 * toggle. `compact` is the small text button under a scratch prize.
 */
export function ShareCardImage({
  spec,
  firstName = null,
  fileName,
  compact = false,
  className,
}: {
  spec: (showName: boolean) => PremiumCardSpec
  firstName?: string | null
  fileName: string
  compact?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [showName, setShowName] = useState(false)
  const [busy, setBusy] = useState<ShareFormat | null>(null)

  const share = async (format: ShareFormat) => {
    if (busy) return
    setBusy(format)
    try {
      // Loaded on tap: the drawing code is only needed by those who share.
      const { sharePremiumCard } = await import('@/lib/premium-card-image')
      const outcome = await sharePremiumCard(spec(showName), format, fileName)
      if (outcome === 'downloaded') toast.success('Picture saved. Share it from your photos.')
    } catch {
      toast.error("Couldn't make the picture. Try again.")
    } finally {
      setBusy(null)
    }
  }

  const toggle = compact ? (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((on) => !on)}
      className="flex min-h-10 items-center gap-1.5 text-[12px] font-medium text-text-primary underline underline-offset-4"
    >
      <IconBrandInstagram size={16} aria-hidden="true" />
      Share
    </button>
  ) : (
    <ScButton variant="secondary" aria-expanded={open} onClick={() => setOpen((on) => !on)} className="flex min-h-11 items-center justify-center gap-2">
      <IconBrandInstagram size={18} aria-hidden="true" />
      Share to Instagram
    </ScButton>
  )

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {toggle}
      {open && (
        <div className="flex flex-col gap-2.5 rounded-[12px] border border-border bg-surface p-3">
          <p className="text-[12px] text-text-secondary">The card as a picture, for your story or feed. No codes or links go in it.</p>
          {firstName && (
            <label className="flex min-h-9 items-center gap-2.5 text-[13px] text-text-primary">
              <input
                type="checkbox"
                checked={showName}
                onChange={(e) => setShowName(e.target.checked)}
                className="size-4 accent-[#FAFAFA]"
              />
              Show “{firstName}” on the picture
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
                <span className="font-numeric text-[11px] font-normal text-text-secondary">
                  {format === 'story' ? '9:16' : '4:5'}
                </span>
              </ScButton>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
