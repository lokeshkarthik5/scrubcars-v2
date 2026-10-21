import { IconStarFilled } from '@tabler/icons-react'
import type { WrappedCardKey } from '@repo/core/wrapped'
import { cn } from '@repo/core/utils'
import { CarSilhouette } from '@/components/car-silhouette'
import { levelMetal } from '@/lib/wrapped-image'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Four-point sparkles around the car, fixed so every card looks the same. */
function Sparkles({ points }: { points: Array<[number, number, number]> }) {
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 h-full w-full" aria-hidden>
      {points.map(([x, y, r], i) => (
        <path
          key={i}
          className="wrapped-visual__spark"
          style={{ animationDelay: `${300 + i * 140}ms` }}
          d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`}
          fill="#FFFFFF"
          opacity="0.85"
        />
      ))}
    </svg>
  )
}

/** Water beads falling on the car: the wash itself. */
function Droplets() {
  const drops: Array<[number, number, number]> = [
    [24, 10, 1], [38, 4, 0.8], [52, 14, 1.15], [66, 6, 0.9], [78, 16, 1], [31, 22, 0.7], [70, 26, 0.75],
  ]
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 h-full w-full" aria-hidden>
      {drops.map(([x, y, s], i) => (
        <path
          key={i}
          className="wrapped-visual__drop"
          style={{ animationDelay: `${i * 120}ms` }}
          transform={`translate(${x} ${y}) scale(${s})`}
          d="M0 -4C1.6 -1.6 2.6 0 2.6 1.4C2.6 3 1.4 4.2 0 4.2C-1.4 4.2 -2.6 3 -2.6 1.4C-2.6 0 -1.6 -1.6 0 -4Z"
          fill="rgba(186, 220, 255, 0.85)"
        />
      ))}
    </svg>
  )
}

function Coins() {
  return (
    <svg viewBox="0 0 200 120" className="mx-auto h-full max-h-[150px] w-auto" aria-hidden>
      <defs>
        <linearGradient id="wv-coin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBE7A6" />
          <stop offset="0.5" stopColor="#E3B652" />
          <stop offset="1" stopColor="#9C6E22" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} className="wrapped-visual__coin" style={{ animationDelay: `${200 + i * 110}ms` }}>
          <ellipse cx="78" cy={104 - i * 13} rx="48" ry="12" fill="#7A541A" />
          <ellipse cx="78" cy={100 - i * 13} rx="48" ry="12" fill="url(#wv-coin)" />
        </g>
      ))}
      <g className="wrapped-visual__coin" style={{ animationDelay: '800ms' }}>
        <circle cx="150" cy="58" r="34" fill="#7A541A" />
        <circle cx="148" cy="55" r="34" fill="url(#wv-coin)" />
        <circle cx="148" cy="55" r="26" fill="none" stroke="#FFF3C4" strokeOpacity="0.6" strokeWidth="2" />
        <text x="148" y="67" textAnchor="middle" fontSize="34" fontWeight="700" fill="#5A3C0C" style={{ fontFamily: 'var(--font-numeric)' }}>
          ₹
        </text>
      </g>
    </svg>
  )
}

/**
 * Each Wrapped story card's picture (0054): the coupé in a different light
 * per card — wet for washes, in front of its garage, sparkling for shine
 * days, lights on for the close — coins for money saved, the year's months
 * for the busiest one, and the level's medal. Decorative; the words say it.
 */
export function WrappedVisual({ cardKey, monthIndex, level }: { cardKey: WrappedCardKey; monthIndex?: number | null; level: { key: string; label: string } }) {
  if (cardKey === 'saved') {
    return (
      <div className="wrapped-visual relative flex h-full items-end justify-center pb-2">
        <Coins />
      </div>
    )
  }
  if (cardKey === 'month') {
    return (
      <div className="wrapped-visual flex h-full items-end justify-between gap-1 px-1 pb-3" aria-hidden>
        {MONTHS.map((m, i) => {
          const busiest = i === monthIndex
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={cn('wrapped-visual__bar w-full rounded-full', busiest ? 'bg-white shadow-[0_0_16px_rgba(255,255,255,0.6)]' : 'bg-white/15')}
                style={{ height: busiest ? 96 : 18, animationDelay: `${i * 50}ms` }}
              />
              <span className={cn('font-numeric text-[10px]', busiest ? 'font-semibold text-white' : 'text-white/45')}>{m}</span>
            </div>
          )
        })}
      </div>
    )
  }
  if (cardKey === 'level') {
    const metal = levelMetal(level.key)
    return (
      <div className="wrapped-visual flex h-full items-center justify-center" aria-hidden>
        <span
          className="wrapped-visual__medal grid size-[132px] place-items-center rounded-full"
          style={{
            background: `radial-gradient(circle at 32% 26%, ${metal.light}, ${metal.base} 55%, ${metal.dark} 100%)`,
            boxShadow: `inset 0 0 0 3px rgba(255,255,255,0.35), inset 0 0 0 12px rgba(0,0,0,0.12), 0 0 60px ${metal.glow}`,
          }}
        >
          <span className="flex flex-col items-center" style={{ color: metal.ink }}>
            <IconStarFilled size={44} />
            <span className="mt-1 text-[13px] font-semibold uppercase tracking-[0.16em]">{level.label}</span>
          </span>
        </span>
      </div>
    )
  }
  return (
    <div className={cn('wrapped-visual relative flex h-full items-end justify-end', `wrapped-visual--${cardKey}`)}>
      {cardKey === 'washes' && <Droplets />}
      {cardKey === 'shine' && (
        <Sparkles
          points={[
            [18, 18, 3.2],
            [34, 8, 2],
            [62, 12, 3.6],
            [82, 22, 2.4],
            [48, 28, 1.6],
            [90, 8, 1.8],
          ]}
        />
      )}
      {cardKey === 'garage' && (
        <svg viewBox="0 0 100 60" className="absolute inset-x-[8%] bottom-[10%] top-0 h-[90%] w-[84%]" aria-hidden>
          <path d="M6 58V24L50 4L94 24V58" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" strokeLinejoin="round" />
          {[30, 36, 42, 48, 54].map((y) => (
            <path key={y} d={`M20 ${y}H80`} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          ))}
          <path d="M20 58V26H80V58" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        </svg>
      )}
      {cardKey === 'closing' && <span className="wrapped-visual__beam" aria-hidden />}
      <CarSilhouette className="wrapped-visual__car relative -mr-[34%] w-[134%] max-w-none shrink-0" />
    </div>
  )
}
