import { Fragment, useId, type CSSProperties } from 'react'
import { cardCarSrc, cardCarSrcSet } from '@repo/core/card-cars'
import { cn } from '@repo/core/utils'
import {
  CARD,
  CHIP_ICON_PATHS,
  CONFETTI,
  FIGURES,
  INKS,
  LOOKS,
  PHOTO,
  RIBBON,
  SPARKS,
  TIP_LABEL,
  sparkPath,
  titleSize,
  type CardChip,
  type ChipIcon,
  type PremiumCardSpec,
} from '@/lib/premium-card'

/** Figures in the numeric face, words in Inter. */
function Mixed({ text }: { text: string }) {
  return text.split(FIGURES).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="font-numeric">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  )
}

export function ChipGlyph({ icon, className }: { icon: ChipIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {CHIP_ICON_PATHS[icon].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

function Chip({ chip }: { chip: CardChip }) {
  return (
    <span className={cn('premium-card__chip', chip.fluid && 'premium-card__chip--fluid')}>
      <ChipGlyph icon={chip.icon} className="premium-card__chip-icon" />
      <span className="premium-card__chip-text">
        <Mixed text={chip.text} />
      </span>
    </span>
  )
}

/** Birthday confetti and the sparks, over the photo, in card units over the whole card. */
function Scatter({ accent }: { accent: 'confetti' | 'sparks' }) {
  return (
    <svg viewBox={`0 0 100 ${CARD.height}`} className="premium-card__accent" aria-hidden>
      {accent === 'confetti'
        ? CONFETTI.map((p, i) =>
            p.w === p.h ? (
              <circle key={i} cx={p.x} cy={p.y} r={p.w / 2} fill={p.c} />
            ) : (
              <rect key={i} x={p.x - p.w / 2} y={p.y - p.h / 2} width={p.w} height={p.h} rx={0.4} fill={p.c} transform={`rotate(${p.r} ${p.x} ${p.y})`} />
            )
          )
        : SPARKS.map((s, i) => <path key={i} d={sparkPath(s.x, s.y, s.s)} fill="var(--pc-spark)" opacity={s.o} />)}
    </svg>
  )
}

/** Thank you's satin ribbon and bow, over the car. */
function Ribbon({ id }: { id: string }) {
  const stops = RIBBON.stops.map(([at, c]) => <stop key={at} offset={at} stopColor={c} />)
  return (
    <svg viewBox={`0 0 100 ${CARD.height}`} className="premium-card__accent" aria-hidden>
      <defs>
        <linearGradient id={`${id}-sash`} gradientUnits="userSpaceOnUse" x1={RIBBON.across.from[0]} y1={RIBBON.across.from[1]} x2={RIBBON.across.to[0]} y2={RIBBON.across.to[1]}>
          {stops}
        </linearGradient>
        <linearGradient id={`${id}-bow`} gradientUnits="userSpaceOnUse" x1={RIBBON.bowLight.from[0]} y1={RIBBON.bowLight.from[1]} x2={RIBBON.bowLight.to[0]} y2={RIBBON.bowLight.to[1]}>
          {stops}
        </linearGradient>
      </defs>
      {/* A soft shadow under the satin, then the sash, the bow and its knot. */}
      <g transform="translate(0.5 0.9)" fill="rgba(20,24,30,0.16)">
        <path d={RIBBON.band} />
        {RIBBON.bow.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path d={RIBBON.band} fill={`url(#${id}-sash)`} />
      {RIBBON.bow.map((d) => (
        <path key={d} d={d} fill={`url(#${id}-bow)`} />
      ))}
      <circle cx={RIBBON.knot.x} cy={RIBBON.knot.y} r={RIBBON.knot.r} fill="#E9EDF1" stroke="#9AA4AE" strokeWidth={0.3} />
    </svg>
  )
}

/** The photo's fade into the card's ground, as a CSS mask. */
const PHOTO_MASK = `linear-gradient(180deg, ${PHOTO.fade.map(([at, a]) => `rgba(0,0,0,${a}) ${at * 100}%`).join(', ')})`

/** The photo's width on screen: the card is at most the page's column wide. */
const PHOTO_SIZES: Record<'card' | 'mini' | 'thumb', string> = {
  card: '(max-width: 520px) 92vw, 480px',
  mini: '120px',
  thumb: '64px',
}

/**
 * A premium card: Detlio's gift cards and revealed scratch prizes, drawn as
 * a collectible car card (lib/premium-card.ts has every number; the shared
 * image, lib/premium-card-image.ts, draws the same card from them). A
 * licensed car photo across the top, fading into the card; the chips; the
 * two-line title; a car care tip; the wordmark. Sized by its width alone (CSS container units), so the same
 * card works at 390 px, as the buyer's 110 px swatch and as the image.
 *
 * `size`: `card` the whole card; `mini` the stage and the title (the
 * picker's swatches); `thumb` the photo alone (a 64 px list tile). On
 * first view the photo settles in and a sheen crosses once; under reduced
 * motion it is still. A picture of the card, so it is hidden from screen
 * readers: the page around it says the same in text.
 */
export function PremiumCard({
  spec,
  size = 'card',
  className,
  animate = true,
}: {
  spec: PremiumCardSpec
  size?: 'card' | 'mini' | 'thumb'
  className?: string
  animate?: boolean
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const look = LOOKS[spec.look]
  const ink = INKS[look.tone]
  const car = spec.car
  const moving = animate && size === 'card'
  const vars = {
    '--pc-title': ink.title,
    '--pc-sub': ink.sub,
    '--pc-tip': ink.tip,
    '--pc-label': ink.label,
    '--pc-chip-bg': ink.chipBg,
    '--pc-chip-edge': ink.chipEdge,
    '--pc-chip-text': ink.chipText,
    '--pc-chip-icon': ink.chipIcon,
    '--pc-mark': ink.mark,
    '--pc-spark': look.spark ?? (look.tone === 'night' ? '#DCE1EC' : '#D9A441'),
    background: [
      look.glow ? `radial-gradient(55cqw 45cqw at ${look.glow.x}cqw ${look.glow.y}cqw, ${look.glow.color}, transparent 70%)` : null,
      `radial-gradient(80cqw 50cqw at 50cqw 40cqw, ${look.light}, transparent 72%)`,
      `linear-gradient(180deg, ${look.ground[0]} 0%, ${look.ground[1]} 52%, ${look.ground[2]} 100%)`,
    ]
      .filter(Boolean)
      .join(', '),
  } as CSSProperties

  return (
    <div aria-hidden="true" className={cn('premium-card', `premium-card--${size}`, className)}>
      <div className={cn('premium-card__face', `premium-card__face--${look.tone}`, moving && 'premium-card__face--enter')} style={vars}>
        {/* The photo, fading into the card's ground, lit by the look's tint. */}
        <span
          className="premium-card__photo"
          style={{ height: `${PHOTO.height}cqw`, WebkitMaskImage: PHOTO_MASK, maskImage: PHOTO_MASK }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- prepared WebP with its own srcset; the canvas loads the same file */}
          <img
            src={cardCarSrc(car, 800)}
            srcSet={cardCarSrcSet(car)}
            sizes={PHOTO_SIZES[size]}
            alt={car.alt}
            draggable={false}
            decoding="async"
            className="premium-card__photo-img"
            style={{ objectPosition: car.position }}
          />
          {look.tint && <span className="premium-card__tint" style={{ background: look.tint }} />}
        </span>
        <span
          className="premium-card__wash"
          style={{
            background: `radial-gradient(${PHOTO.wash.rx}cqw ${PHOTO.wash.ry}cqw at ${PHOTO.wash.x}cqw ${PHOTO.wash.y}cqw, ${look.wash}, transparent)`,
          }}
        />
        {(look.accent === 'confetti' || look.accent === 'sparks') && <Scatter accent={look.accent} />}
        {look.accent === 'ribbon' && <Ribbon id={id} />}

        {size !== 'thumb' && (
          <span className="premium-card__mark">
            Detlio<span className="text-brand-red">.</span>
          </span>
        )}
        {size === 'card' && (
          <div className="premium-card__chips">
            {spec.chips.map((chip) => (
              <Chip key={`${chip.icon}-${chip.text}`} chip={chip} />
            ))}
          </div>
        )}
        {size !== 'thumb' && (
          <div className="premium-card__title">
            <p style={{ fontSize: `${titleSize(spec.title[0])}cqw` }}>
              <Mixed text={spec.title[0]} />
            </p>
            <p className="premium-card__title-sub" style={{ fontSize: `${titleSize(spec.title[1])}cqw` }}>
              <Mixed text={spec.title[1]} />
            </p>
          </div>
        )}
        {size === 'card' && (
          <p className="premium-card__tip">
            <span className="premium-card__tip-label">{TIP_LABEL}</span> {spec.tip}
          </p>
        )}
        {moving && <span className="premium-card__sheen" />}
      </div>
    </div>
  )
}
