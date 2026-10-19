'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  IconArrowUpRight,
  IconCheck,
  IconChevronDown,
  IconHistory,
  IconPlus,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import type { HomeCar } from '@repo/core/api/home'
import {
  CAR_DEFAULT_PICTURE,
  carImageFor,
  type CarPicture as Picture,
} from '@repo/core/car-images'
import { cn } from '@repo/core/utils'
import { rewardRupees } from '@repo/core/rewards'
import { ScSheet } from '@repo/ui/sc/modal'
import { Figures } from '@repo/ui/sc/figures'

interface CarHeroProps {
  cars: HomeCar[]
  selected: number
  onSelect: (index: number) => void
  /** A must-act card sits above: 20pt shorter, so Book a wash stays above the fold. */
  short: boolean
  /** A must-act card carries the screen's red: Book a wash is outlined. */
  quiet: boolean
  onBookWash: (car: HomeCar) => void
  onAddCar: () => void
  /** Detlio Rewards (0050): the Shine Card under the car; null while rewards are off. */
  shine?: {
    onCard: number
    goal: number
    toGo: number
    rewardAmount: string | number
  } | null
}

const TYPE_LABEL: Record<HomeCar['vehicleType'], string> = {
  hatchback: 'Hatchback',
  sedan: 'Sedan',
  suv: 'SUV',
}

/** "TN 09 BX 4821 · White SUV". */
export function carLine(
  car: Pick<HomeCar, 'licensePlate' | 'color' | 'vehicleType'>
): string {
  const kind = [car.color, TYPE_LABEL[car.vehicleType]]
    .filter(Boolean)
    .join(' ')
  return [car.licensePlate, kind].filter(Boolean).join(' · ')
}

/** "2 more washes = ₹349 off", or "₹349 off ready" once the card is full. */
export function shineLine(toGo: number, rewardAmount: string | number): string {
  const reward = `${rewardRupees(rewardAmount)} off`
  return toGo <= 0
    ? `${reward} ready`
    : `${toGo} more ${toGo === 1 ? 'wash' : 'washes'} = ${reward}`
}

/**
 * The customer's car and the screen's main action, Book a wash.
 *
 * One car on the stage at a time. With more than one, the car's name is a
 * button that opens the list of cars (F2: the offers row is Home's only swipe
 * row); the tiles below follow the car chosen. With none, it asks for one:
 * garages price by car type, and the wash bar needs a car to count for.
 */
export function CarHero({
  cars,
  selected,
  onSelect,
  short,
  quiet,
  onBookWash,
  onAddCar,
  shine = null,
}: CarHeroProps) {
  const [choosing, setChoosing] = useState(false)

  if (cars.length === 0) {
    return (
      <section
        aria-label="Your car"
        className={cn(
          'hub-card car-hero car-hero--empty',
          short && 'car-hero--short'
        )}
      >
        <div className="car-hero__head">
          <div>
            <p className="text-[13px] text-dim">Get started</p>
            <h2 className="car-hero__title">Add your car</h2>
            <p className="max-w-[268px] text-[15px] leading-[1.42] text-[#A1A1AA]">
              So garages quote the right price, and you&apos;ll see when
              it&apos;s due.
            </p>
          </div>
        </div>
        <CarPicture picture={CAR_DEFAULT_PICTURE} ghost />
        <div className="car-hero__cta">
          {quiet ? (
            <button
              type="button"
              onClick={onAddCar}
              className="car-hero__outline"
            >
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
  const name = `${car.make} ${car.model}`

  return (
    <section
      aria-label="Your car"
      className={cn(
        'hub-card car-hero',
        short && 'car-hero--short',
        shine && 'car-hero--shine'
      )}
    >
      <div className="car-hero__head">
        <div className="min-w-0">
          <p className="text-[13px] text-dim">Your car</p>
          <h2 className="car-hero__title">
            {cars.length > 1 ? (
              // The name switches the car: a tap, not a swipe.
              <button
                type="button"
                onClick={() => setChoosing(true)}
                aria-haspopup="dialog"
                aria-label={`${name}, switch car`}
                className="-mx-1 inline-flex max-w-full items-center gap-1.5 rounded-[10px] px-1 text-left"
              >
                <span className="truncate">{name}</span>
                <IconChevronDown
                  size={22}
                  stroke={1.5}
                  aria-hidden
                  className="shrink-0 text-dim"
                />
              </button>
            ) : (
              <span className="block truncate">{name}</span>
            )}
          </h2>
          {carLine(car) && (
            <p className="truncate text-[13px] text-dim">{carLine(car)}</p>
          )}
        </div>
      </div>
      <CarPicture
        key={car.id}
        picture={carImageFor(car.vehicleType)}
        priority
      />
      {/* The car's history: every job, receipts, photos and its next
          coating or detailing reminder (0046). A 40pt disc, 44pt target. */}
      <Link
        href={`/profile/cars/${car.id}`}
        aria-label={`History of your ${name}`}
        className="absolute top-[18px] right-3 z-[2] grid size-11 place-items-center rounded-full text-text-primary"
      >
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-full border border-line"
        >
          <IconHistory size={20} stroke={1.5} />
        </span>
      </Link>
      {/* The Shine Card (0050), named and explained (F2). */}
      {shine && (
        <Link
          href="/profile/rewards"
          aria-label={`Shine Card: ${shine.onCard} of ${shine.goal} stamps. ${shineLine(shine.toGo, shine.rewardAmount)}.`}
          className="car-hero__shine"
        >
          <span className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[13px] text-dim">Shine Card</span>
            <span aria-hidden className="flex gap-1.5">
              {Array.from({ length: shine.goal }, (_, i) => (
                <i
                  key={i}
                  className={cn(
                    'h-1 w-6 rounded-full',
                    i < shine.onCard ? 'bg-text-primary' : 'bg-white/[0.14]'
                  )}
                />
              ))}
            </span>
          </span>
          <span className="max-w-[200px] text-right text-[13px] leading-snug text-text-primary">
            <Figures text={shineLine(shine.toGo, shine.rewardAmount)} />
          </span>
        </Link>
      )}
      <div className="car-hero__cta">
        {quiet ? (
          <button
            type="button"
            onClick={() => onBookWash(car)}
            className="car-hero__outline"
          >
            Book a wash
          </button>
        ) : (
          <ScButton variant="hero" onClick={() => onBookWash(car)}>
            <span>Book a wash</span>
            <IconArrowUpRight size={17} stroke={1.5} aria-hidden />
          </ScButton>
        )}
      </div>

      <ScSheet
        open={choosing}
        onClose={() => setChoosing(false)}
        aria-label="Choose a car"
        className="px-4"
      >
        <h2 className="text-[20px] font-normal tracking-[-0.015em] text-text-primary">
          Your cars
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          {cars.map((each, i) => (
            <button
              key={each.id}
              type="button"
              aria-pressed={i === selected}
              onClick={() => {
                onSelect(i)
                setChoosing(false)
              }}
              className={cn(
                'press flex min-h-[60px] items-center justify-between gap-3 rounded-[18px] border px-4 text-left',
                i === selected
                  ? 'border-text-primary bg-white/[0.04]'
                  : 'border-line'
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] text-text-primary">
                  {each.make} {each.model}
                </span>
                <span className="block truncate text-[13px] text-dim">
                  {carLine(each)}
                </span>
              </span>
              {i === selected && (
                <IconCheck
                  size={18}
                  stroke={1.8}
                  aria-hidden
                  className="shrink-0"
                />
              )}
            </button>
          ))}
          <Link
            href="/profile#vehicles"
            className="flex min-h-11 items-center justify-center text-[15px] text-text-primary"
          >
            Add or edit cars
          </Link>
        </div>
      </ScSheet>
    </section>
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
  const shown =
    failed === null
      ? picture
      : failed === CAR_DEFAULT_PICTURE.src
        ? null
        : CAR_DEFAULT_PICTURE
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
