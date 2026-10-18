'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import Link from 'next/link'
import { IconArrowRight, IconCards } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { Figures } from '@repo/ui/sc/figures'
import type { GaragePull } from '@repo/core/api/garage'
import { RARITY_LOOKS, cardNumber } from '@repo/core/garage'
import { rewardRupees } from '@repo/core/rewards'
import { cn } from '@repo/core/utils'
import { burstConfetti } from '@/lib/confetti'
import { GarageCard, GarageCardBack } from './garage-card'
import { GarageShare } from './garage-share'

export type RevealStage = 'back' | 'shaking' | 'turning' | 'front'

const REDUCED = '(prefers-reduced-motion: reduce)'

/** prefers-reduced-motion, read without a render of the wrong kind (false on the server). */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia?.(REDUCED)
      query?.addEventListener('change', onChange)
      return () => query?.removeEventListener('change', onChange)
    },
    () => window.matchMedia?.(REDUCED).matches === true,
    () => false
  )
}

/** Gold, cream and amber: a Legendary's sparks (never red: red is the page's button). */
const GOLD_SPARKS = ['#FFE08A', '#F7D06B', '#FFF4C2', '#D9A62E', '#FFFFFF']

/** What the pull finished, in words: a row, the series, or a duplicate's stamp progress. */
export function pullNews(pull: GaragePull): string | null {
  if (pull.seriesCompleted) return 'Series complete! Every car is in your Garage, and the Garage Legend badge is yours.'
  if (pull.rowCompleted) {
    const r = pull.rowCompleted
    return r.voucherAmount !== null
      ? `Row ${r.row} complete — ${rewardRupees(r.voucherAmount)} off your next booking.`
      : `Row ${r.row} complete — ${r.stamps === 1 ? 'a bonus stamp' : `${r.stamps} bonus stamps`} on your Shine Card.`
  }
  if (pull.duplicate) return 'A duplicate. Every 3 duplicates make a bonus Shine Card stamp.'
  return null
}

/**
 * The pull reveal (0057): the card face down, then on a tap it turns over
 * with a burst in its rarity's colour. A Legendary shakes first and gets a
 * gold burst and sparks. Under prefers-reduced-motion the card simply
 * fades in, face up. Then what it finished (a row, the series), "See your
 * Garage" and Share. The car's name and rarity are said in text too.
 *
 * `stage` pins a stage (design review only); `onRevealed` fires once.
 */
export function PullReveal({
  pull,
  stage: pinned,
  onRevealed,
  firstName = null,
  compact = false,
}: {
  pull: GaragePull
  stage?: RevealStage
  onRevealed?: () => void
  firstName?: string | null
  compact?: boolean
}) {
  const [stage, setStage] = useState<RevealStage>(pinned ?? (pull.seen ? 'front' : 'back'))
  const still = useReducedMotion()
  const told = useRef(false)
  const confettiRef = useRef<HTMLCanvasElement>(null)
  const legendary = pull.car.rarity === 'legendary'
  const look = RARITY_LOOKS[pull.car.rarity]
  const current = pinned ?? stage

  const reveal = () => {
    if (current !== 'back') return
    if (still) {
      setStage('front')
    } else if (legendary) {
      setStage('shaking')
      window.setTimeout(() => setStage('turning'), 520)
      window.setTimeout(() => setStage('front'), 520 + 1300)
    } else {
      setStage('turning')
      window.setTimeout(() => setStage('front'), 900)
    }
    navigator.vibrate?.(legendary ? [30, 60, 30, 60, 80] : 25)
  }

  useEffect(() => {
    if (current !== 'front' || told.current || pinned) return
    told.current = true
    onRevealed?.()
    if (!still && legendary && confettiRef.current) burstConfetti(confettiRef.current, { colors: GOLD_SPARKS })
  }, [current, pinned, onRevealed, still, legendary])

  const turned = current === 'turning' || current === 'front'
  const news = pullNews(pull)

  return (
    <div className={cn('flex flex-col items-center gap-4', compact ? 'py-1' : 'py-2')}>
      <div
        className={cn('garage-reveal w-full', legendary && 'garage-reveal--legendary', compact ? 'max-w-[240px]' : 'max-w-[272px]')}
        style={{ '--gr-glow': look.glow } as CSSProperties}
      >
        <span className={cn('garage-reveal__burst', turned && 'garage-reveal__burst--on')} />
        <canvas ref={confettiRef} aria-hidden className="pointer-events-none absolute -inset-1/2 z-10 h-[200%] w-[200%]" />
        {still ? (
          current === 'front' ? (
            <div className="garage-reveal__fade-in">
              <GarageCard car={pull.car} />
            </div>
          ) : (
            <button type="button" onClick={reveal} className="block w-full" aria-label="Reveal your new card">
              <GarageCardBack />
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={reveal}
            disabled={current !== 'back'}
            aria-label={current === 'back' ? 'Reveal your new card' : undefined}
            className={cn('block w-full text-left', current === 'shaking' && 'garage-reveal__shake')}
          >
            <div className={cn('garage-reveal__flipper', turned && 'garage-reveal__flipper--turned')}>
              <div className="garage-reveal__side">
                <GarageCardBack />
              </div>
              <div className="garage-reveal__side garage-reveal__front">
                <GarageCard car={pull.car} shine={current === 'front'} />
              </div>
            </div>
          </button>
        )}
      </div>

      <div aria-live="polite" className="flex w-full flex-col items-center gap-2 text-center">
        {current === 'front' ? (
          <>
            <p className="text-[12px] uppercase tracking-[0.14em]" style={{ color: look.pill }}>
              {pull.car.rarityLabel} · <span className="font-numeric">{cardNumber(pull.car.number, pull.car.total)}</span>
            </p>
            <h3 className="text-[22px] font-semibold leading-tight text-text-primary">{pull.car.name}</h3>
            {news && (
              <p
                className={cn(
                  'rounded-[12px] border px-3 py-2 text-[13px]',
                  pull.rowCompleted || pull.seriesCompleted ? 'border-[#F7D06B]/40 bg-[#F7D06B]/10 text-text-primary' : 'border-line text-text-secondary'
                )}
              >
                <Figures text={news} />
              </p>
            )}
            <div className="mt-1 grid w-full max-w-[320px] grid-cols-1 gap-2">
              <Link
                href="/profile/rewards/garage"
                className="flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-line text-[14px] font-medium text-text-primary"
              >
                <IconCards size={18} aria-hidden="true" />
                See your Garage
                <IconArrowRight size={16} aria-hidden="true" />
              </Link>
              <GarageShare car={pull.car} firstName={firstName} />
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] text-text-secondary">{pull.sourceLabel === 'Booking completed' ? 'Your booking earned a card for your Garage.' : `${pull.sourceLabel}: a card for your Garage.`}</p>
            <ScButton variant="secondary" onClick={reveal} disabled={current !== 'back'} className="min-h-11 px-6">
              {current === 'back' ? 'Reveal' : 'Revealing…'}
            </ScButton>
          </>
        )}
      </div>
    </div>
  )
}
