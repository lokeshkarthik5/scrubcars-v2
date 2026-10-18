'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { IconBrandWhatsapp, IconCopy, IconPrinter, IconShare } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { Notice } from '@repo/ui/sc/notice'
import type { GiftLink, SentGift } from '@repo/core/api/gifts'
import { GiftCardArt } from '@/components/gifts/gift-card-art'
import {
  formatGiftCode,
  formatGiftDate,
  giftArtFor,
  giftPathWithArt,
  giftRupees,
  giftShareText,
  whatsAppShareUrl,
  type GiftArt,
} from '@/lib/gifts'

/**
 * While printing, only the printable card: the rest of the screen (the
 * share buttons, the nav) stays off the paper, on white, in black.
 */
const PRINT_CSS = `
@media print {
  @page { margin: 16mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .gift-print, .gift-print * { visibility: visible !important; color: #000 !important; border-color: #d4d4d4 !important; }
  .gift-print { position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; }
}
`

type ShareGift = Pick<SentGift, 'number' | 'amount' | 'recipientName' | 'message' | 'design' | 'expiresAt'>

/**
 * The share screen, shown once a link is made: after a purchase, or after
 * "Get a new link". The code is in the link and nowhere else the buyer can
 * see again, so this says so. Sharing is the buyer's own: the share sheet,
 * a copied link, WhatsApp, or a printed card with the code. Detlio sends no
 * SMS or email of its own.
 *
 * `art` is the artwork picked when buying: an occasion (Birthday, Diwali,
 * Thank you) rides in the link's fragment so the recipient sees it too.
 */
export function GiftShare({ gift, link, art }: { gift: ShareGift; link: GiftLink; art?: GiftArt }) {
  const [showPrint, setShowPrint] = useState(false)
  const look = art ?? giftArtFor(gift.design)
  const path = giftPathWithArt(link.path, look)
  const url = typeof window === 'undefined' ? path : `${window.location.origin}${path}`
  const text = giftShareText({ amount: gift.amount, recipientName: gift.recipientName, url })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.info("Couldn't copy the link. Press and hold it to copy it instead.")
    }
  }

  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'A Detlio gift', text, url })
        return
      } catch (error) {
        // Closing the share sheet is a choice, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copy()
  }

  return (
    <div className="flex flex-col gap-4">
      <style>{PRINT_CSS}</style>

      <GiftCardArt design={look} amount={gift.amount} recipientName={gift.recipientName} />

      <div>
        <h2 className="text-[17px] font-semibold text-text-primary">
          Your <span className="font-numeric">{giftRupees(gift.amount)}</span> gift for {gift.recipientName} is ready
        </h2>
        <p className="mt-1 text-[13px] text-text-secondary">
          Send them this link. Whoever opens it can add the gift to their Detlio credit, so send it only to{' '}
          {gift.recipientName}.
        </p>
      </div>

      <ScCard className="flex flex-col gap-1">
        <p className="text-[11px] font-medium text-text-secondary">Gift link</p>
        {/* Selectable, so it can still be copied by hand where the clipboard is blocked. */}
        <p className="select-all break-all font-numeric text-[13px] text-text-primary">{url}</p>
      </ScCard>

      <div className="flex flex-col gap-2">
        {/* The screen's one red button. */}
        <ScButton onClick={() => void share()} className="flex min-h-11 items-center justify-center gap-2">
          <IconShare size={18} aria-hidden="true" />
          Share
        </ScButton>
        <div className="grid grid-cols-2 gap-2">
          <ScButton variant="secondary" onClick={() => void copy()} className="flex min-h-11 items-center justify-center gap-2">
            <IconCopy size={16} aria-hidden="true" />
            Copy link
          </ScButton>
          <a
            href={whatsAppShareUrl(text)}
            target="_blank"
            rel="noopener noreferrer"
            className="press flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-border text-sm font-semibold text-brand-white transition-colors hover:bg-surface"
          >
            <IconBrandWhatsapp size={16} aria-hidden="true" />
            WhatsApp
          </a>
        </div>
        <ScButton
          variant="secondary"
          aria-expanded={showPrint}
          onClick={() => setShowPrint((on) => !on)}
          className="flex min-h-11 items-center justify-center gap-2"
        >
          <IconPrinter size={16} aria-hidden="true" />
          {showPrint ? 'Hide the printable card' : 'Print a card instead'}
        </ScButton>
      </div>

      {showPrint && (
        <div className="flex flex-col gap-3">
          {/* White paper on screen too, so what is seen is what prints. */}
          <section
            aria-label="Printable gift card"
            className="gift-print flex flex-col gap-3 rounded-[12px] border border-neutral-200 bg-white p-5 text-neutral-900"
          >
            <p className="text-[17px] font-semibold">
              Detlio<span className="text-brand-red">.</span> gift
            </p>
            <p className="text-[15px]">
              <span className="font-numeric text-[28px] font-bold">{giftRupees(gift.amount)}</span>
              <span className="block">for {gift.recipientName}</span>
            </p>
            {gift.message && <p className="whitespace-pre-wrap break-words text-[13px] italic">“{gift.message}”</p>}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-600">Gift code</p>
              <p className="font-numeric text-[22px] font-bold tracking-[0.06em]">{formatGiftCode(link.code)}</p>
            </div>
            <p className="text-[12px] text-neutral-700">
              To use it, open <span className="break-all font-numeric">{url}</span>, or sign in to Detlio and type the
              code under Profile, Detlio credit.
              {gift.expiresAt ? ` Use by ${formatGiftDate(gift.expiresAt)}.` : ''}
            </p>
            <p className="text-[11px] text-neutral-600">
              <span className="font-numeric">{gift.number}</span>
            </p>
          </section>
          <ScButton variant="secondary" onClick={() => window.print()} className="flex min-h-11 items-center justify-center gap-2">
            <IconPrinter size={16} aria-hidden="true" />
            Print
          </ScButton>
        </div>
      )}

      {/* The one thing to act on before leaving: amber, as the design system marks a caution. */}
      <Notice title="This link is shown only now">
        If it is lost, use Get a new link in Gifts you sent: the new link replaces this one, and this one stops
        working.
        {gift.expiresAt ? (
          <>
            {' '}
            The gift can be used until <span className="font-numeric">{formatGiftDate(gift.expiresAt)}</span>.
          </>
        ) : null}
      </Notice>
    </div>
  )
}
