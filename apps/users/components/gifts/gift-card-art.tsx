import type { GiftDesign } from '@repo/core/api/gifts'
import { cn } from '@repo/core/utils'
import { giftRupees } from '@/lib/gifts'

/**
 * The three card designs. Flat colour with a hairline edge, no shadow and no
 * motion, like every other card. Red stays a dot in the wordmark: on a page
 * whose one red thing is its main button, a red card would compete with it.
 */
const DESIGNS: Record<GiftDesign, { card: string; muted: string; dot: string }> = {
  // Graphite, as the app's own cards, with a soft light from one corner.
  shine: {
    card: 'border-white/10 bg-[radial-gradient(120%_90%_at_100%_0%,#3A3A46_0%,#1E1E25_55%,#141416_100%)] text-brand-white',
    muted: 'text-white/70',
    dot: 'text-brand-red',
  },
  // Near black with a cold blue night under it.
  midnight: {
    card: 'border-white/10 bg-[linear-gradient(160deg,#0B0F1A_0%,#121A2E_60%,#0A0A0B_100%)] text-brand-white',
    muted: 'text-white/70',
    dot: 'text-brand-red',
  },
  // Light paper: the one design that reads as white in a dark app.
  fresh: {
    card: 'border-black/10 bg-[linear-gradient(160deg,#FFFFFF_0%,#EEF1F4_100%)] text-brand-black',
    muted: 'text-black/60',
    dot: 'text-brand-red',
  },
}

/**
 * A gift card as the buyer chooses it and the recipient opens it: the
 * wordmark, the amount (Space Grotesk) and who it is for. A picture of the
 * card, so its words are hidden from screen readers; the page around it says
 * the same in text.
 */
export function GiftCardArt({
  design,
  amount,
  recipientName,
  className,
}: {
  design: GiftDesign
  amount: string | number | null
  recipientName?: string
  className?: string
}) {
  const look = DESIGNS[design] ?? DESIGNS.shine
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex aspect-[1.6] w-full flex-col justify-between rounded-[14px] border p-4',
        look.card,
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[17px] font-semibold tracking-[-0.01em]">
          Detlio<span className={look.dot}>.</span>
        </span>
        <span className={cn('text-[11px] font-medium uppercase tracking-wide', look.muted)}>Gift</span>
      </div>
      <div className="min-w-0">
        <p className="font-numeric text-[32px] font-bold leading-none tracking-tight">
          {amount === null || amount === '' ? '₹—' : giftRupees(amount)}
        </p>
        <p className={cn('mt-1.5 truncate text-[13px]', look.muted)}>
          {recipientName?.trim() ? `For ${recipientName.trim()}` : 'For a car wash on Detlio'}
        </p>
      </div>
    </div>
  )
}
