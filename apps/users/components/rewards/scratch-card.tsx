'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ScButton } from '@repo/ui/sc/button'
import { Figures } from '@repo/ui/sc/figures'
import type { ScratchCardView, ScratchResult } from '@repo/core/api/rewards'
import { useScratchCard } from '@repo/core/api/hooks/use-rewards'
import { rewardDay } from '@repo/core/rewards'
import { cn } from '@repo/core/utils'

/** The share of the foil scratched off before the rest falls away. */
const CLEAR_AT = 0.45
const BRUSH = 22

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Silver foil with a fine diagonal grain and the hint, drawn once. */
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
  ctx.fillStyle = '#2A2B31'
  ctx.font = '600 15px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Scratch here', width / 2, height / 2)
}

/**
 * A scratch card. The prize was drawn by the server when the card was made;
 * the first touch asks for it (POST …/scratch), and scratching uncovers
 * whatever came back. Past 45% the foil falls away. "Reveal" does it in one
 * tap, for a keyboard, a screen reader or anyone who would rather not
 * scratch (and is the only way under reduced motion).
 */
export function ScratchCardPanel({ card, compact = false }: { card: ScratchCardView; compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const asked = useRef(false)
  const scratch = useScratchCard()
  const [result, setResult] = useState<ScratchResult | null>(null)
  const [cleared, setCleared] = useState(card.state === 'scratched')
  const reduced = prefersReducedMotion()

  const prize = result ? { label: result.label, outcome: result.outcome } : card.prize

  useEffect(() => {
    if (cleared || !canvasRef.current || reduced) return
    paintFoil(canvasRef.current)
  }, [cleared, reduced])

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

  const waiting = scratch.isPending && !result
  const failed = scratch.isError && !result
  const showPrize = cleared && prize

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('scratch-card', compact ? 'h-[112px]' : 'h-[140px]')}>
        <div className="absolute inset-0 grid place-items-center px-4 text-center" aria-live="polite">
          {prize ? (
            <div className={cn('flex flex-col items-center gap-1', showPrize && 'scratch-card__prize--in')}>
              <p className="text-[12px] text-text-secondary">You won</p>
              <p className="text-[22px] font-semibold leading-tight text-text-primary">
                <Figures text={prize.label} />
              </p>
              {result?.fellBack || card.prize?.fellBack ? (
                <p className="text-[11px] text-text-muted">This month&apos;s prize budget is used up, so it&apos;s a bonus stamp.</p>
              ) : null}
            </div>
          ) : (
            <p className="text-[13px] text-text-secondary">{waiting ? 'Revealing…' : 'A prize is waiting'}</p>
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
      ) : result?.voucher ? (
        <p className="text-[12px] text-text-secondary">
          Applied to your rewards: use it at checkout by{' '}
          <span className="font-numeric">{rewardDay(result.voucher.lastDay)}</span>.
        </p>
      ) : result?.shineVoucher ? (
        <p className="text-[12px] text-text-secondary">
          That stamp filled your Shine Card: <Figures text={`₹${Math.round(Number(result.shineVoucher.amount))} off`} /> is ready.
        </p>
      ) : null}

      {failed && (
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-[12px] text-warning">
            {scratch.error instanceof Error ? scratch.error.message : "Couldn't reveal it. Try again."}
          </p>
          <ScButton variant="secondary" className="h-8 w-auto px-3 text-[12px]" onClick={revealAll}>
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
