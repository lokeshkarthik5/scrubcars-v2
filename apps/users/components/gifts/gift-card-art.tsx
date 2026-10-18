import { useId } from 'react'
import type { GiftDesign } from '@repo/core/api/gifts'
import { cn } from '@repo/core/utils'
import { CarSilhouette } from '@/components/car-silhouette'
import { giftRupees, type GiftArt } from '@/lib/gifts'

/** The small line top right: what kind of gift it is. */
const KIND: Record<GiftArt, string> = {
  shine: 'Gift card',
  midnight: 'Gift card',
  pearl: 'Gift card',
  birthday: 'Happy birthday',
  diwali: 'Happy Diwali',
  thankyou: 'Thank you',
}

/** Birthday: confetti in soft gold, pink, silver and teal (never red: red is the page's button). */
const CONFETTI: Array<{ x: number; y: number; w: number; h: number; r: number; c: string }> = [
  { x: 40, y: 22, w: 6, h: 2.4, r: 24, c: '#F5C76B' },
  { x: 47, y: 31, w: 2.6, h: 2.6, r: 0, c: '#F49AC1' },
  { x: 55, y: 17, w: 6.5, h: 2.4, r: -32, c: '#DCE1EC' },
  { x: 62, y: 28, w: 5, h: 2, r: 58, c: '#5EEAD4' },
  { x: 69, y: 15, w: 3, h: 3, r: 0, c: '#F5C76B' },
  { x: 74, y: 30, w: 6, h: 2.4, r: -14, c: '#F49AC1' },
  { x: 52, y: 9, w: 4.5, h: 2, r: 40, c: '#5EEAD4' },
  { x: 33, y: 13, w: 2.4, h: 2.4, r: 0, c: '#DCE1EC' },
  { x: 84, y: 26, w: 2.6, h: 2.6, r: 0, c: '#F5C76B' },
  { x: 36, y: 33, w: 5, h: 2, r: -48, c: '#DCE1EC' },
  { x: 88, y: 33, w: 5, h: 2, r: 30, c: '#5EEAD4' },
  { x: 60, y: 37, w: 2.2, h: 2.2, r: 0, c: '#F49AC1' },
]

function BirthdayMotif() {
  return (
    <svg viewBox="0 0 100 62.5" preserveAspectRatio="xMidYMid slice" className="gift-card__motif" aria-hidden>
      {CONFETTI.map((p, i) =>
        p.w === p.h ? (
          <circle key={i} cx={p.x} cy={p.y} r={p.w / 2} fill={p.c} opacity="0.9" />
        ) : (
          <rect key={i} x={p.x - p.w / 2} y={p.y - p.h / 2} width={p.w} height={p.h} rx="0.8" fill={p.c} opacity="0.9" transform={`rotate(${p.r} ${p.x} ${p.y})`} />
        )
      )}
    </svg>
  )
}

/** Diwali: three lit diyas in warm gold, with a few sparks. */
function DiwaliMotif() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const diya = (x: number, y: number, s: number, key: number) => (
    <g key={key} transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="-9" r="9" fill={`url(#${id}-glow)`} />
      <path d="M0 -3C-2.6 -6.2 -1.8 -10 0 -13.5C1.8 -10 2.6 -6.2 0 -3Z" fill="#FFE29A" />
      <path d="M0 -4.4C-1.1 -6.1 -0.8 -8.2 0 -9.8C0.8 -8.2 1.1 -6.1 0 -4.4Z" fill="#FFF7E0" />
      <path d="M-10 -2.5H10C9 3 5 6 0 6C-5 6 -9 3 -10 -2.5Z" fill={`url(#${id}-bowl)`} />
      <path d="M-10 -2.5H10" stroke="#FFE7AE" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M-5.5 1.5H5.5" stroke="#7A3E12" strokeWidth="0.7" strokeLinecap="round" strokeDasharray="1.2 1.4" />
    </g>
  )
  return (
    <svg viewBox="0 0 100 62.5" className="gift-card__motif" aria-hidden>
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="#FFD27A" stopOpacity="0.75" />
          <stop offset="1" stopColor="#FFD27A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-bowl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2B65A" />
          <stop offset="1" stopColor="#A35A1C" />
        </linearGradient>
      </defs>
      {diya(53, 29, 0.6, 1)}
      {diya(67, 25, 0.76, 2)}
      {diya(81, 29, 0.6, 3)}
      {[
        [42, 18],
        [58, 13],
        [92, 24],
        [88, 36],
        [45, 34],
        [74, 33],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 1.6}L${x + 0.45} ${y - 0.45}L${x + 1.6} ${y}L${x + 0.45} ${y + 0.45}L${x} ${y + 1.6}L${x - 0.45} ${y + 0.45}L${x - 1.6} ${y}L${x - 0.45} ${y - 0.45}Z`} fill="#FFE29A" opacity={0.55 + (i % 3) * 0.15} />
      ))}
    </svg>
  )
}

/** Thank you: a satin ribbon round the card, tied in a bow. */
function ThankYouMotif() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <svg viewBox="0 0 100 62.5" preserveAspectRatio="xMaxYMid slice" className="gift-card__motif" aria-hidden>
      <defs>
        <linearGradient id={`${id}-v`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9FB3AE" />
          <stop offset="0.5" stopColor="#EAF6F2" />
          <stop offset="1" stopColor="#8EA39E" />
        </linearGradient>
        <linearGradient id={`${id}-h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9FB3AE" />
          <stop offset="0.5" stopColor="#EAF6F2" />
          <stop offset="1" stopColor="#8EA39E" />
        </linearGradient>
      </defs>
      <rect x="77.25" y="0" width="4.5" height="62.5" fill={`url(#${id}-v)`} opacity="0.9" />
      <rect x="0" y="23" width="100" height="4.5" fill={`url(#${id}-h)`} opacity="0.9" />
      <path d="M79.5 25.25C74 17 66.5 17.5 67.5 22.25C68.5 26.5 75 26.25 79.5 25.25Z" fill={`url(#${id}-v)`} />
      <path d="M79.5 25.25C85 17 92.5 17.5 91.5 22.25C90.5 26.5 84 26.25 79.5 25.25Z" fill={`url(#${id}-v)`} />
      <path d="M79.5 25.25L75 34L77.2 33.6L78.4 35.6Z" fill="#B9CBC6" />
      <path d="M79.5 25.25L84 34L81.8 33.6L80.6 35.6Z" fill="#A9BCB7" />
      <circle cx="79.5" cy="25.25" r="2" fill="#F4FBF9" />
    </svg>
  )
}

/**
 * A Detlio gift card: the design's ground and fine texture (carbon or
 * brushed metal), the coupé, any occasion motif, the wordmark with its red
 * dot, the amount in Space Grotesk and who it is for. On first view a sheen
 * sweeps across once (red on Shine, silver on Midnight and Pearl, warm on
 * the occasions); under reduced motion it rests, still.
 *
 * `swatch` is the small tile of the picker: the artwork only. A picture of
 * the card either way, so its words are hidden from screen readers; the
 * page around it says the same in text.
 */
export function GiftCardArt({
  design,
  amount = null,
  recipientName,
  className,
  variant = 'card',
}: {
  /** An artwork, or a stored design (`fresh` draws Pearl). */
  design: GiftArt | GiftDesign
  amount?: string | number | null
  recipientName?: string
  className?: string
  variant?: 'card' | 'swatch'
}) {
  const art: GiftArt = design === 'fresh' ? 'pearl' : design
  const swatch = variant === 'swatch'
  return (
    <div
      aria-hidden="true"
      className={cn('gift-card', `gift-card--${art}`, swatch ? 'gift-card--swatch aspect-[1.6]' : 'aspect-[1.7] w-full', className)}
    >
      <span className="gift-card__texture" />
      {art === 'birthday' && <BirthdayMotif />}
      {art === 'diwali' && <DiwaliMotif />}
      {art === 'thankyou' && <ThankYouMotif />}
      <CarSilhouette className="gift-card__car" />
      {!swatch && <span className="gift-card__sheen" />}

      {swatch ? (
        <span className="gift-card__mark absolute left-2 top-1.5 text-[10px] font-semibold tracking-[-0.01em]">
          Detlio<span className="text-brand-red">.</span>
        </span>
      ) : (
        <div className="relative z-[4] flex h-full flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[18px] font-semibold leading-none tracking-[-0.02em]">
              Detlio<span className="text-brand-red">.</span>
            </span>
            <span className="gift-card__muted pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em]">{KIND[art]}</span>
          </div>
          <div className="min-w-0 max-w-[58%]">
            <p className="font-numeric text-[34px] font-bold leading-none tracking-[-0.02em]">
              {amount === null || amount === '' ? '₹—' : giftRupees(amount)}
            </p>
            <p className="gift-card__muted mt-1.5 truncate text-[13px] font-medium">
              {recipientName?.trim() ? `For ${recipientName.trim()}` : 'For a car wash on Detlio'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
