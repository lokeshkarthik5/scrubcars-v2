'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { IconArrowUpRight, IconMapPin, IconPencil, IconPlus } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import type { HomeCar } from '@repo/core/api/home'
import { CAR_DEFAULT_PICTURE, carImageFor, type CarPicture as Picture } from '@repo/core/car-images'
import { cn } from '@repo/core/utils'

interface CarHeroProps {
  cars: HomeCar[]
  selected: number
  onSelect: (index: number) => void
  /** The customer's area, from their default address, when they have one. */
  place: string | null
  /** A must-act card sits above the offers: 20pt shorter, so Book a wash stays above the fold. */
  short: boolean
  /** A bill is due: Pay is the screen's red action and Book a wash is outlined. */
  quiet: boolean
  onBookWash: (car: HomeCar) => void
  onAddCar: () => void
}

/**
 * The customer's car and the screen's main action, Book a wash.
 *
 * With more than one car, the car swipes (dots underneath) and the tiles
 * below follow the one on screen. With none, it asks for one: garages price
 * by car type, and the wash bar needs a car to count for.
 */
export function CarHero({
  cars,
  selected,
  onSelect,
  place,
  short,
  quiet,
  onBookWash,
  onAddCar,
}: CarHeroProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const onScroll = useCallback(() => {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    const index = Math.min(cars.length - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth)))
    if (index !== selected) onSelect(index)
  }, [cars.length, selected, onSelect])

  if (cars.length === 0) {
    return (
      <section aria-label="Your car" className={cn('hub-card car-hero car-hero--empty', short && 'car-hero--short')}>
        <div className="car-hero__head">
          <div>
            <p className="text-[13px] text-dim">Get started</p>
            <h2 className="car-hero__title">Add your car</h2>
            <p className="max-w-[268px] text-[15px] leading-[1.42] text-[#A1A1AA]">
              So garages quote the right price, and you&apos;ll see when it&apos;s due.
            </p>
          </div>
        </div>
        <CarPicture picture={CAR_DEFAULT_PICTURE} ghost />
        <div className="car-hero__cta">
          {quiet ? (
            <button type="button" onClick={onAddCar} className="car-hero__outline">
              Add car
            </button>
          ) : (
            <ScButton variant="hero" onClick={onAddCar}>
              <span>Add car</span>
              <IconPlus size={17} stroke={1.5} aria-hidden />
            </ScButton>
          )}
        </div>
      </section>
    )
  }

  const car = cars[Math.min(selected, cars.length - 1)]

  return (
    <div>
      <section aria-label="Your car" className={cn('hub-card car-hero', short && 'car-hero--short')}>
        <div
          ref={trackRef}
          onScroll={cars.length > 1 ? onScroll : undefined}
          // Scrollable by keyboard too, when there is more than one car.
          tabIndex={cars.length > 1 ? 0 : undefined}
          // aria-roledescription needs a role to describe.
          role={cars.length > 1 ? 'region' : undefined}
          aria-roledescription={cars.length > 1 ? 'carousel' : undefined}
          aria-label={cars.length > 1 ? 'Your cars' : undefined}
          className="car-hero__track"
        >
          {cars.map((each, i) => (
            <div
              key={each.id}
              role={cars.length > 1 ? 'group' : undefined}
              aria-roledescription={cars.length > 1 ? 'slide' : undefined}
              aria-label={cars.length > 1 ? `Car ${i + 1} of ${cars.length}` : undefined}
              className="car-hero__slide"
            >
              <div className="car-hero__head">
                <div className="min-w-0">
                  <p className="text-[13px] text-dim">Your car</p>
                  <h2 className="car-hero__title truncate">
                    {each.make} {each.model}
                  </h2>
                  {place && (
                    <p className="flex items-center gap-1.5 text-[13px] text-dim">
                      <IconMapPin size={15} stroke={1.4} aria-hidden />
                      {place}
                    </p>
                  )}
                </div>
              </div>
              <CarPicture picture={carImageFor(each.vehicleType)} priority={i === 0} />
            </div>
          ))}
        </div>
        {/* A 40pt disc, as drawn, in a 44pt target. */}
        <Link
          href="/profile#vehicles"
          aria-label="Edit your cars"
          className="absolute top-[18px] right-3 z-[2] grid size-11 place-items-center rounded-full text-text-primary"
        >
          <span aria-hidden className="grid size-10 place-items-center rounded-full border border-line">
            <IconPencil size={20} stroke={1.5} />
          </span>
        </Link>
        <div className="car-hero__cta">
          {quiet ? (
            <button type="button" onClick={() => onBookWash(car)} className="car-hero__outline">
              Book a wash
            </button>
          ) : (
            <ScButton variant="hero" onClick={() => onBookWash(car)}>
              <span>Book a wash</span>
              <IconArrowUpRight size={17} stroke={1.5} aria-hidden />
            </ScButton>
          )}
        </div>
      </section>
      {cars.length > 1 && (
        <div aria-hidden className="offer-carousel__dots">
          {cars.map((each, i) => (
            <i key={each.id} data-on={i === selected} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The cut-out on the hero's dark stage, with its soft contact shadow.
 *
 * A body-type picture is a plain <img> with its own two widths (srcSet):
 * next/image cannot take a srcSet, and these are already encoded at the
 * sizes a phone needs. The owner's picture keeps next/image, exactly as Home
 * launched. Both carry their width and height, so the space is held before
 * the file arrives and nothing moves when it does. If a body-type picture
 * fails to load, the owner's picture takes its place; if that fails too, the
 * stage is left empty rather than showing a broken image.
 */
function CarPicture({
  picture,
  ghost = false,
  priority = false,
}: {
  picture: Picture
  ghost?: boolean
  priority?: boolean
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const shown = failed === null ? picture : failed === CAR_DEFAULT_PICTURE.src ? null : CAR_DEFAULT_PICTURE
  const onError = () => setFailed(shown?.src ?? null)

  return (
    <>
      <div aria-hidden className="car-hero__shadow" />
      {shown?.kind === 'body-type' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shown.src}
          srcSet={shown.srcSet ?? undefined}
          sizes={shown.sizes}
          alt=""
          width={shown.width}
          height={shown.height}
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          onError={onError}
          className="car-hero__car car-hero__car--body-type"
        />
      )}
      {shown?.kind === 'default' && (
        <Image
          src={shown.src}
          alt=""
          width={shown.width}
          height={shown.height}
          sizes={shown.sizes}
          priority={priority}
          fetchPriority={priority ? 'high' : undefined}
          onError={onError}
          className={cn('car-hero__car', ghost && 'car-hero__car--ghost')}
        />
      )}
    </>
  )
}
