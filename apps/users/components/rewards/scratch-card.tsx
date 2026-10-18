'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowUpRight, IconCircleCheckFilled, IconStarFilled } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { Figures } from '@repo/ui/sc/figures'
import type { ScratchCardView, ScratchResult } from '@repo/core/api/rewards'
import { useScratchCard } from '@repo/core/api/hooks/use-rewards'
import { rewardDay, rewardRupees, type ScratchOutcome } from '@repo/core/rewards'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { livePendingCheckout, usePendingCheckoutStore } from '@repo/core/stores/pending-checkout-store'
import { cn } from '@repo/core/utils'
import { CarSilhouette } from '@/components/car-silhouette'
import { burstConfetti } from '@/lib/confetti'
import { isMoneyPrize, prizeLines, prizeTier, voucherEndsAt } from '@/lib/scratch-prize'

/** The share of the foil scratched off before the rest falls away. */
const CLEAR_AT = 0.45
const BRUSH = 22

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Silver foil with a fine diagonal grain, a scatter of stars and the hint, drawn once. */
function paintFoil(canvas: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1
  const { width, height } = canvas.getBoundingClientRect()
  canvas.width = Math.max(1, Math.round(width * ratio))
  canvas.height = Math.max(1, Math.round(height * ratio))
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(ratio, ratio)
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#B9BDC7')
  gradient.addColorStop(0.45, '#E4E6EC')
  gradient.addColorStop(0.55, '#CDD0D8')
  gradient.addColorStop(1, '#9EA3AE')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  for (let x = -height; x < width; x += 6) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + height, height)
    ctx.stroke()
  }
  // A few embossed stars, fixed so every card looks the same.
  const stars: Array<[number, number, number]> = [
    [0.1, 0.25, 7], [0.22, 0.72, 5], [0.84, 0.22, 6], [0.92, 0.68, 8], [0.7, 0.82, 4], [0.32, 0.18, 4],
  ]
  for (const [fx, fy, r] of stars) {
    const cx = fx * width
    const cy = fy * height
    ctx.beginPath()
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rad = i % 2 === 0 ? r : r * 0.45
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fill()
  }
  ctx.fillStyle = '#2A2B31'
  ctx.font = '600 15px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Scratch here', width / 2, height / 2 - 8)
  ctx.fillStyle = 'rgba(42,43,49,0.7)'
  ctx.font = '500 11px Inter, system-ui, sans-serif'
  ctx.fillText('A Detlio reward is under the foil', width / 2, height / 2 + 12)
}

/** The prize under the foil: its tier's colours, the big figure and its emblem. */
function PrizeFace({ outcome, amount, fellBack, revealed }: { outcome: ScratchOutcome; amount: string | null; fellBack: boolean; revealed: boolean }) {
  const tier = prizeTier(outcome)
  const lines = prizeLines({ outcome, amount })
  return (
    <div className={cn('scratch-prize absolute inset-0 flex items-center gap-3 px-5', `scratch-prize--${tier}`)}>
      <div className={cn('relative z-[2] flex min-w-0 flex-1 flex-col', revealed && 'scratch-card__prize--in')}>
        <p className="scratch-prize__eyebrow text-[11px] font-semibold uppercase tracking-[0.14em]">{lines.eyebrow}</p>
        <p className={cn('scratch-prize__big mt-1 font-semibold leading-none tracking-[-0.02em]', tier === 'silver' || tier === 'gold' ? 'font-numeric text-[44px]' : 'text-[28px]')}>
          {lines.big}
        </p>
        <p className="scratch-prize__small mt-1.5 text-[12px] font-medium">
          <Figures text={lines.small} />
        </p>
        {fellBack && (
          <p className="scratch-prize__small mt-1 text-[11px]">This month&apos;s prize budget is used up, so it&apos;s a bonus stamp.</p>
        )}
      </div>
      {tier === 'stamp' ? (
        <span className="scratch-prize__star relative z-[2] grid size-[72px] shrink-0 place-items-center rounded-full" aria-hidden>
          <IconStarFilled size={34} />
        </span>
      ) : tier === 'jackpot' ? (
        <CarSilhouette className="scratch-prize__car relative z-[2] w-[54%] shrink-0" />
      ) : (
        <span className="scratch-prize__coin relative z-[2] grid size-[68px] shrink-0 place-items-center rounded-full font-numeric text-[30px] font-bold" aria-hidden>
          ₹
        </span>
      )}
      {revealed && <span className="scratch-prize__sheen" aria-hidden />}
    </div>
  )
}

/**
 * A scratch card. The prize was drawn by the server when the card was made;
 * the first touch asks for it (POST …/scratch), and scratching uncovers
 * whatever came back. Past 45% the foil falls away. "Reveal" does it in one
 * tap, for a keyboard, a screen reader or anyone who would rather not
 * scratch (and is the only way under reduced motion).
 *
 * Each prize reveals in its own look (lib/scratch-prize.ts): silver for the
 * small money prizes, gold for the big one, a red glow and a star for a
 * bonus stamp, and gold with a burst of confetti for a free wash (none under
 * reduced motion). A short buzz where the phone supports it. A money prize
 * offers "Use at checkout" (the voucher goes with the customer to the next
 * checkout, applied like Home's offers); a stamp says it is on the card.
 */
export function ScratchCardPanel({ card, compact = false }: { card: ScratchCardView; compact?: boolean }) {
  const router = useRouter()
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const rememberOffer = usePendingCheckoutStore((s) => s.rememberOffer)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const confettiRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const asked = useRef(false)
  const celebrated = useRef(false)
  const scratch = useScratchCard()
  const [result, setResult] = useState<ScratchResult | null>(null)
  const [cleared, setCleared] = useState(card.state === 'scratched')
  const reduced = prefersReducedMotion()

  const prize = result
    ? { outcome: result.outcome, amount: result.amount, fellBack: result.fellBack }
    : card.prize
      ? { outcome: card.prize.outcome, amount: card.prize.amount, fellBack: card.prize.fellBack }
      : null
  // The voucher's last day, whether the card was just scratched (the
  // answer) or scratched before and loaded now (the card, while usable).
  const voucherLastDay = result
    ? (result.voucher?.lastDay ?? null)
    : card.prize?.voucher?.state === 'available'
      ? card.prize.voucher.lastDay
      : null
  const voucherCode = result?.voucher?.code ?? null
  const justRevealed = cleared && result !== null

  useEffect(() => {
    if (cleared || !canvasRef.current || reduced) return
    paintFoil(canvasRef.current)
  }, [cleared, reduced])

  // The moment of winning, once: a buzz, and confetti for a free wash.
  useEffect(() => {
    if (!justRevealed || celebrated.current || !result) return
    celebrated.current = true
    try {
      navigator.vibrate?.(30)
    } catch {
      // Not every browser lets a page buzz; the reveal is the same without it.
    }
    if (prizeTier(result.outcome) !== 'jackpot' || reduced || !confettiRef.current) return
    return burstConfetti(confettiRef.current, { originY: 0.5, durationMs: 1500 })
  }, [justRevealed, result, reduced])

  const ask = useCallback(() => {
    if (asked.current) return
    asked.current = true
    scratch.mutate(card.id, {
      onSuccess: (data) => setResult(data),
      onError: () => {
        asked.current = false
      },
    })
  }, [card.id, scratch])

  const revealAll = () => {
    ask()
    setCleared(true)
  }

  const scratchAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(event.clientX - rect.left, event.clientY - rect.top, BRUSH, 0, Math.PI * 2)
    ctx.fill()
  }

  const measure = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || cleared) return
    // Every 8th pixel's alpha is plenty to judge the share cleared.
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let clear = 0
    let total = 0
    for (let i = 3; i < data.length; i += 32) {
      total += 1
      if (data[i] === 0) clear += 1
    }
    if (total > 0 && clear / total >= CLEAR_AT) setCleared(true)
  }

  /** The voucher rides to the next checkout like a tapped offer, then the garages. */
  const goToCheckout = () => {
    if (voucherCode && userId && voucherLastDay) {
      const pending = livePendingCheckout(usePendingCheckoutStore.getState().pending, { userId, now: Date.now() })
      rememberOffer({ userId, code: voucherCode, vendorId: null, vehicleId: pending?.vehicleId ?? null, endsAt: voucherEndsAt(voucherLastDay) })
    }
    router.push('/garages')
  }

  const waiting = scratch.isPending && !result
  const failed = scratch.isError && !result
  const showPrize = cleared && prize !== null

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <div className={cn('scratch-card', compact ? 'h-[132px]' : 'h-[152px]')}>
          <div className="absolute inset-0" aria-live="polite">
            {prize ? (
              <PrizeFace outcome={prize.outcome} amount={prize.amount} fellBack={prize.fellBack} revealed={showPrize} />
            ) : (
              <p className="grid h-full place-items-center px-4 text-center text-[13px] text-text-secondary">
                {waiting ? 'Revealing…' : 'A prize is waiting'}
              </p>
            )}
          </div>
          {!cleared && !reduced && (
            <canvas
              ref={canvasRef}
              aria-hidden
              className="scratch-card__foil"
              onPointerDown={(event) => {
                drawing.current = true
                event.currentTarget.setPointerCapture(event.pointerId)
                ask()
                scratchAt(event)
              }}
              onPointerMove={(event) => {
                if (drawing.current) scratchAt(event)
              }}
              onPointerUp={() => {
                drawing.current = false
                measure()
              }}
              onPointerCancel={() => {
                drawing.current = false
              }}
            />
          )}
          {!cleared && reduced && <div aria-hidden className="absolute inset-0 bg-[#C9CCD4]" />}
        </div>
        {/* The free wash's confetti spills past the card's edges. */}
        <canvas ref={confettiRef} aria-hidden className="pointer-events-none absolute -left-3 -top-20 z-10 h-[calc(100%+6.5rem)] w-[calc(100%+1.5rem)]" />
      </div>

      {!cleared ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-text-muted">
            Scratch by <span className="font-numeric">{rewardDay(card.lastDay)}</span>
            {card.vendorName ? ` · ${card.vendorName}` : ''}
          </p>
          <button type="button" onClick={revealAll} className="text-[12px] font-medium text-text-primary underline underline-offset-4">
            Reveal
          </button>
        </div>
      ) : prize && isMoneyPrize(prize.outcome) && voucherLastDay ? (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-[12px] text-text-secondary">
            In your rewards. Use by <span className="font-numeric">{rewardDay(voucherLastDay)}</span>
          </p>
          {/* The moment's one red action. */}
          <ScButton variant="hero" fullWidth={false} onClick={goToCheckout} className="h-10 shrink-0 gap-1.5 px-4 text-[13px]">
            <span>Use at checkout</span>
            <IconArrowUpRight size={16} aria-hidden />
          </ScButton>
        </div>
      ) : prize?.outcome === 'bonus_stamp' ? (
        <p className="flex items-center gap-1.5 text-[12px] text-text-primary">
          <IconCircleCheckFilled size={16} className="shrink-0 text-[#DCE1EC]" aria-hidden />
          {result?.shineVoucher ? (
            <span>
              Added to your Shine Card, and it&apos;s full: <Figures text={`${rewardRupees(result.shineVoucher.amount)} off`} /> is ready.
            </span>
          ) : (
            'Added to your Shine Card'
          )}
        </p>
      ) : null}

      {failed && (
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-[12px] text-warning">
            {scratch.error instanceof Error ? scratch.error.message : "Couldn't reveal it. Try again."}
          </p>
          <ScButton variant="secondary" className="flex h-8 w-auto shrink-0 items-center justify-center px-3 py-0 text-[12px]" onClick={revealAll}>
            Try again
          </ScButton>
        </div>
      )}
      {compact && cleared && (
        <Link href="/profile/rewards" className="text-[12px] text-text-secondary underline underline-offset-4">
          See your rewards
        </Link>
      )}
    </div>
  )
}
