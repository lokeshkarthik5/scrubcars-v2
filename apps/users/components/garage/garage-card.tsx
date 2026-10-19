import type { CSSProperties } from 'react'
import { IconDroplet, IconMapPin } from '@tabler/icons-react'
import type { GarageAlbumCar, GarageOwnedCar } from '@repo/core/api/garage'
import { cardCarSrc } from '@repo/core/card-cars'
import { cardNumber, copiesLabel, ILLUSTRATION_LINE, RARITY_LOOKS, type GarageRarity } from '@repo/core/garage'
import { cn } from '@repo/core/utils'
import { carArtSrc, cardPhoto, frameGradient, TONE_LOOKS } from '@/lib/garage-card'

function frameStyle(rarity: GarageRarity): CSSProperties {
  return { background: frameGradient(rarity), '--gc-glow': RARITY_LOOKS[rarity].glow } as CSSProperties
}

function faceStyle(photoId: string): CSSProperties {
  const t = TONE_LOOKS[cardPhoto(photoId).tone]
  return {
    '--gc-ink': t.ink,
    '--gc-sub': t.sub,
    '--gc-muted': t.muted,
    '--gc-chip-bg': t.chipBg,
    '--gc-chip-edge': t.chipEdge,
    '--gc-chip-text': t.chipText,
    '--gc-ground': t.ground[1],
    background: `linear-gradient(180deg, ${t.ground[0]} 0%, ${t.ground[1]} 55%, ${t.ground[2]} 100%)`,
  } as CSSProperties
}

/**
 * A Detlio Garage card, the whole card: the rarity's metal frame (Common
 * silver, Rare blue, Epic purple, Legendary gold), the card's licensed
 * photo across the top fading into the card, its number, rarity, name, the
 * photo's colour and setting, and its line. Sized by its width alone
 * (container units), so it is the same card at 390 px, in a sheet and as
 * the shared image. Epic and Legendary glow and a sheen crosses now and
 * then; under reduced motion it is still. A picture of the card, hidden
 * from screen readers: the page says the same in text.
 */
export function GarageCard({ car, className, shine = true }: { car: GarageOwnedCar; className?: string; shine?: boolean }) {
  const look = RARITY_LOOKS[car.rarity]
  const photo = cardPhoto(car.photoId)
  const copies = copiesLabel(car.count)
  return (
    <div aria-hidden="true" className={cn('garage-card', `garage-card--${car.rarity}`, className)}>
      <div className="garage-card__frame" style={frameStyle(car.rarity)}>
        <div className={cn('garage-card__face', `garage-card__face--${photo.tone}`)} style={faceStyle(car.photoId)}>
          <span className="garage-card__photo">
            {/* eslint-disable-next-line @next/next/no-img-element -- a licensed card photo, sized by the card */}
            <img src={carArtSrc(car, 1600)} alt="" draggable={false} className="garage-card__photo-img" style={{ objectPosition: photo.position }} />
          </span>
          <span className="garage-card__wash" />
          <div className="garage-card__top">
            <span className="garage-card__mark">
              Detlio<span className="text-brand-red">.</span> <span className="garage-card__mark-sub">Garage</span>
            </span>
            <span className="garage-card__number font-numeric">{cardNumber(car.number, car.total)}</span>
          </div>
          <div className="garage-card__pill-row">
            <span className="garage-card__pill" style={{ background: look.pill, color: look.ink }}>
              {car.rarityLabel}
            </span>
            {copies && <span className="garage-card__copies font-numeric">{copies}</span>}
          </div>
          <p className="garage-card__name">{car.name}</p>
          <div className="garage-card__chips">
            <span className="garage-card__chip">
              <IconDroplet className="garage-card__chip-icon" stroke={2} />
              <span className="garage-card__chip-text">{car.colour}</span>
            </span>
            <span className="garage-card__chip">
              <IconMapPin className="garage-card__chip-icon" stroke={2} />
              <span className="garage-card__chip-text">{car.setting}</span>
            </span>
          </div>
          <p className="garage-card__lore">{car.lore}</p>
          <p className="garage-card__foot">Series {car.series} · Detlio Garage</p>
          {shine && <span className="garage-card__sheen" />}
        </div>
      </div>
    </div>
  )
}

/** The illustration line, under a card wherever one is shown (detail, reveal; the shared image draws it too). */
export function IllustrationLine({ className }: { className?: string }) {
  return <p className={cn('text-center text-[11px] leading-snug text-text-muted', className)}>{ILLUSTRATION_LINE}</p>
}

/**
 * An album tile: an owned card's photo (800 px) in its rarity's frame, the
 * number on top and the name on a gradient, so a light photo still reads; or
 * a card not collected yet as its photo blurred and darkened, with its
 * number (and its frame's colour, dimmed: you can see a Legendary is
 * missing), never its name.
 */
export function GarageTile({ car, className }: { car: GarageAlbumCar; className?: string }) {
  const photo = cardPhoto(car.photoId)
  const src = car.owned ? carArtSrc(car, 800) : cardCarSrc(photo, 800)
  return (
    <div aria-hidden="true" className={cn('garage-tile', `garage-tile--${car.rarity}`, !car.owned && 'garage-tile--missing', className)}>
      <div className="garage-tile__frame" style={frameStyle(car.rarity)}>
        <div className="garage-tile__face">
          {/* eslint-disable-next-line @next/next/no-img-element -- a licensed card photo, sized by the tile */}
          <img src={src} alt="" draggable={false} className="garage-tile__photo" style={{ objectPosition: photo.position }} />
          <span className="garage-tile__shade" />
          <span className="garage-tile__number font-numeric">{String(car.number).padStart(2, '0')}</span>
          {car.owned ? (
            <>
              <span className="garage-tile__name">{car.name}</span>
              {car.count > 1 && <span className="garage-tile__copies font-numeric">×{car.count}</span>}
            </>
          ) : (
            <span className="garage-tile__q">?</span>
          )}
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
