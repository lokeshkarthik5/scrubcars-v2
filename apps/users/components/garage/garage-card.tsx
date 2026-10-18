import type { CSSProperties } from 'react'
import { IconBolt, IconDroplet, IconGauge } from '@tabler/icons-react'
import type { GarageAlbumCar, GarageOwnedCar } from '@repo/core/api/garage'
import { cardNumber, copiesLabel, RARITY_LOOKS, type GarageRarity } from '@repo/core/garage'
import { cn } from '@repo/core/utils'
import { carArtSrc, frameGradient, silhouetteSrc, TONE_LOOKS } from '@/lib/garage-card'

/** Figures in the numeric face: "0–100: 2.7 s". */
function Figures({ text }: { text: string }) {
  return text.split(/(\d[\d.,–]*)/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="font-numeric">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

const STAT_ICONS = [IconBolt, IconGauge, IconDroplet] as const

function frameStyle(rarity: GarageRarity): CSSProperties {
  return { background: frameGradient(rarity), '--gc-glow': RARITY_LOOKS[rarity].glow, '--gc-glow-floor': rarity === 'common' ? 'transparent' : RARITY_LOOKS[rarity].glow } as CSSProperties
}

function faceStyle(car: Pick<GarageOwnedCar, 'tone'>): CSSProperties {
  const t = TONE_LOOKS[car.tone]
  return {
    '--gc-ink': t.ink,
    '--gc-sub': t.sub,
    '--gc-muted': t.muted,
    '--gc-chip-bg': t.chipBg,
    '--gc-chip-edge': t.chipEdge,
    '--gc-chip-text': t.chipText,
    background: [
      `radial-gradient(70cqw 34cqw at 50cqw 38cqw, ${t.light}, transparent 72%)`,
      `linear-gradient(180deg, ${t.ground[0]} 0%, ${t.ground[1]} 48%, ${t.ground[2]} 100%)`,
    ].join(', '),
  } as CSSProperties
}

/**
 * A Detlio Garage card, the whole card: the rarity's metal frame (Common
 * silver, Rare blue, Epic purple, Legendary gold), the fictional car on a
 * studio floor, its number, rarity, name, three stat chips and its line.
 * Sized by its width alone (container units), so it is the same card at
 * 390 px, in a sheet and as the shared image. A Legendary's gold sheen
 * crosses now and then; under reduced motion it is still (globals.css). A
 * picture of the card, hidden from screen readers: the page says the same
 * in text.
 */
export function GarageCard({ car, className, shine = true }: { car: GarageOwnedCar; className?: string; shine?: boolean }) {
  const look = RARITY_LOOKS[car.rarity]
  const copies = copiesLabel(car.count)
  return (
    <div aria-hidden="true" className={cn('garage-card', `garage-card--${car.rarity}`, className)}>
      <div className="garage-card__frame" style={frameStyle(car.rarity)}>
        <div className={cn('garage-card__face', `garage-card__face--${car.tone}`)} style={faceStyle(car)}>
          <span className="garage-card__floor" />
          <div className="garage-card__top">
            <span className="garage-card__mark">
              Detlio<span className="text-brand-red">.</span> <span className="garage-card__mark-sub">Garage</span>
            </span>
            <span className="garage-card__number font-numeric">{cardNumber(car.number, car.total)}</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- a drawn SVG or an R2 picture, sized by the card */}
          <img src={carArtSrc(car)} alt="" draggable={false} className={cn('garage-card__art', car.art.url && 'garage-card__art--photo')} />
          <div className="garage-card__pill-row">
            <span className="garage-card__pill" style={{ background: look.pill, color: look.ink }}>
              {car.rarityLabel}
            </span>
            {copies && <span className="garage-card__copies font-numeric">{copies}</span>}
          </div>
          <p className="garage-card__name">{car.name}</p>
          <div className="garage-card__chips">
            {car.stats.map((stat, i) => {
              const Icon = STAT_ICONS[i] ?? IconBolt
              return (
                <span key={stat} className="garage-card__chip">
                  <Icon className="garage-card__chip-icon" stroke={2} />
                  <span className="garage-card__chip-text">
                    <Figures text={stat} />
                  </span>
                </span>
              )
            })}
          </div>
          <p className="garage-card__lore">{car.lore}</p>
          <p className="garage-card__foot">
            Series {car.series} · Detlio Garage
          </p>
          {shine && <span className="garage-card__sheen" />}
        </div>
      </div>
    </div>
  )
}

/**
 * An album tile: an owned card's car, number and name in its rarity's
 * frame, or a card not collected yet as a dark silhouette with its number
 * (and its frame's colour, dimmed: you can see a Legendary is missing).
 */
export function GarageTile({ car, className }: { car: GarageAlbumCar; className?: string }) {
  if (!car.owned) {
    return (
      <div aria-hidden="true" className={cn('garage-tile garage-tile--missing', `garage-tile--${car.rarity}`, className)}>
        <div className="garage-tile__frame" style={frameStyle(car.rarity)}>
          <div className="garage-tile__face garage-tile__face--missing">
            <span className="garage-tile__number font-numeric">{String(car.number).padStart(2, '0')}</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- a drawn SVG or an R2 picture, sized by the card */}
            <img src={silhouetteSrc(car)} alt="" draggable={false} className="garage-tile__art" />
            <span className="garage-tile__q">?</span>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div aria-hidden="true" className={cn('garage-tile', `garage-tile--${car.rarity}`, className)}>
      <div className="garage-tile__frame" style={frameStyle(car.rarity)}>
        <div className={cn('garage-tile__face', `garage-card__face--${car.tone}`)} style={faceStyle(car)}>
          <span className="garage-tile__number font-numeric">{String(car.number).padStart(2, '0')}</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- a drawn SVG or an R2 picture, sized by the card */}
          <img src={carArtSrc(car)} alt="" draggable={false} className={cn('garage-tile__art', car.art.url && 'garage-card__art--photo')} />
          <span className="garage-tile__name">{car.name}</span>
          {car.count > 1 && <span className="garage-tile__copies font-numeric">×{car.count}</span>}
        </div>
      </div>
    </div>
  )
}

/** The back of a card: the same for every rarity, so the flip gives nothing away. */
export function GarageCardBack({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('garage-card', className)}>
      <div className="garage-card__frame garage-card__frame--back">
        <div className="garage-card__face garage-card__back">
          <span className="garage-card__back-pattern" />
          <span className="garage-card__back-ring" />
          <span className="garage-card__back-mark">
            Detlio<span className="text-brand-red">.</span>
          </span>
          <span className="garage-card__back-sub">Garage</span>
        </div>
      </div>
    </div>
  )
}
