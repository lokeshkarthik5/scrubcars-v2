'use client'

import { useMemo, useState } from 'react'
import { IconCircleCheckFilled, IconInfoCircle } from '@tabler/icons-react'
import { FilterChip } from '@repo/ui/sc/chip'
import { Figures } from '@repo/ui/sc/figures'
import { ScSheet } from '@repo/ui/sc/modal'
import type {
  GarageAlbum,
  GarageAlbumCar,
  GarageOwnedCar,
} from '@repo/core/api/garage'
import {
  cardNumber,
  collectedLine,
  duplicatesLine,
  GARAGE_RARITIES,
  RARITY_LABELS,
  RARITY_LOOKS,
  type GarageRarity,
} from '@repo/core/garage'
import { rewardDate, rewardRupees } from '@repo/core/rewards'
import { cn } from '@repo/core/utils'
import { GarageCard, GarageTile, IllustrationLine } from './garage-card'
import { GarageShare } from './garage-share'
import { fill, useT } from '@repo/core/i18n'

type Filter = 'all' | GarageRarity

/** The first name the share picture may carry (only when ticked). */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first ? first : null
}

/**
 * The album (0057): progress, the rarity filter, 8 rows of 5 (collected
 * cards in full art, missing ones as numbered silhouettes), how it works,
 * and a card's sheet. `openNumber` opens one card's sheet (design review).
 */
export function GarageAlbumView({
  album,
  firstName,
  openNumber = null,
}: {
  album: GarageAlbum
  firstName: string | null
  openNumber?: number | null
}) {
  const t = useT()
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<GarageAlbumCar | null>(
    () => album.cars.find((c) => c.number === openNumber) ?? null
  )
  const total = album.series.total
  const percent = Math.round((album.collected / Math.max(1, total)) * 100)
  const rowsDone = album.rows.filter((r) => r.complete).length
  const counts = useMemo(
    () =>
      Object.fromEntries(
        GARAGE_RARITIES.map((r) => [
          r,
          {
            owned: album.cars.filter((c) => c.rarity === r && c.owned).length,
            all: album.cars.filter((c) => c.rarity === r).length,
          },
        ])
      ) as Record<GarageRarity, { owned: number; all: number }>,
    [album]
  )
  const byNumber = new Map(album.cars.map((c) => [c.number, c]))

  const tile = (car: GarageAlbumCar) => (
    <button
      key={car.number}
      type="button"
      onClick={() => setOpen(car)}
      aria-label={
        car.owned
          ? car.count > 1
            ? t('{name}, {rarity}, number {number}, {count} copies', { name: car.name, rarity: car.rarityLabel, number: car.number, count: car.count })
            : t('{name}, {rarity}, number {number}', { name: car.name, rarity: car.rarityLabel, number: car.number })
          : t('Number {number}, {rarity}, not collected yet', { number: car.number, rarity: car.rarityLabel })
      }
      className="block rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <GarageTile car={car} />
    </button>
  )

  return (
    <>
      <section
        aria-labelledby="garage-progress"
        className="garage-hero mo-metal flex flex-col gap-3 rounded-card px-4 py-4"
      >
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-t5 text-text-secondary">
              {t('{name} · supercar cards', { name: album.series.name })}
            </p>
            <h2
              id="garage-progress"
              className="mt-1 text-[30px] font-semibold leading-none tracking-[-0.03em] text-text-primary"
            >
              <span className="font-numeric">
                {collectedLine(album.collected, total)}
              </span>
            </h2>
            <p className="mt-1 text-t4 text-text-secondary">
              {t('cars collected')}
            </p>
          </div>
          <div className="text-right">
            <p className="font-numeric text-[20px] font-semibold leading-none text-text-primary">
              {rowsDone}/{album.rows.length}
            </p>
            <p className="mt-1 text-t5 text-text-secondary">
              {t('rows complete')}
            </p>
          </div>
        </div>
        <div
          className="h-[8px] w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={album.collected}
          aria-label={t('Cars collected')}
        >
          {/* Fills to the count once, from the left (moment 9). */}
          <div
            className="garage-progress mo-fill-once h-full rounded-full"
            style={{ width: `${Math.max(2, percent)}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-t5 text-text-secondary">
          <span>
            <Figures
              text={t('Each row of 5: {rewardRupees} off', { rewardRupees: rewardRupees(album.rowReward) })}
            />
          </span>
          <span>
            <Figures
              text={duplicatesLine(
                album.duplicates.waiting,
                album.duplicates.perStar
              )}
            />
          </span>
        </div>
        {album.completedAt && (
          <p className="flex items-center gap-2 rounded-[12px] border border-[#F7D06B]/40 bg-[#F7D06B]/10 px-3 py-2 text-t4 text-text-primary">
            <IconCircleCheckFilled
              size={16}
              className="text-[#F7D06B]"
              aria-hidden="true"
            />
            {t('Series complete on {rewardDate}. You are a Garage Legend.', { rewardDate: rewardDate(album.completedAt) })}
          </p>
        )}
      </section>

      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5"
        role="group"
        aria-label={t('Filter by rarity')}
      >
        <FilterChip
          label={t('All')}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          count={album.collected}
        />
        {GARAGE_RARITIES.map((r) => (
          <FilterChip
            key={r}
            label={RARITY_LABELS[r]}
            active={filter === r}
            onClick={() => setFilter(r)}
            count={counts[r].owned}
          />
        ))}
      </div>

      {filter === 'all' ? (
        <div className="flex flex-col gap-4">
          {album.rows.map((row) => (
            <section
              key={row.row}
              aria-labelledby={`row-${row.row}`}
              className="flex flex-col gap-2"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3
                  id={`row-${row.row}`}
                  className="text-t4 font-semibold text-text-primary"
                >
                  {fill(t('Row {row} {part}'), { part: <span className="font-numeric font-normal text-text-secondary">
                    {t('· {collected} of {total}', { collected: row.collected, total: row.total })}
                  </span>, row: row.row })}
                </h3>
                <span
                  className={cn(
                    'text-t5',
                    row.complete ? 'text-[#F7D06B]' : 'text-text-muted'
                  )}
                >
                  {row.complete
                    ? row.reward?.voucher
                      ? t('Done · {rewardRupees} off given', { rewardRupees: rewardRupees(album.rowReward) })
                      : t('Done · bonus stamps given')
                    : t('{rewardRupees} off when complete', { rewardRupees: rewardRupees(album.rowReward) })}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {row.numbers.map((n) => tile(byNumber.get(n)!))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section
          aria-label={t('{rarity} cards', { rarity: RARITY_LABELS[filter] })}
          className="flex flex-col gap-2"
        >
          <p className="text-t5 text-text-secondary">
            <Figures
              text={t('{owned} of {all} {rarity} cards', { owned: counts[filter].owned, all: counts[filter].all, rarity: RARITY_LABELS[filter] })}
            />
          </p>
          <div className="grid grid-cols-4 gap-2">
            {album.cars.filter((c) => c.rarity === filter).map(tile)}
          </div>
        </section>
      )}

      <details className="group rounded-[14px] border border-border px-4 py-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-t4 font-medium text-text-primary">
          <IconInfoCircle size={16} aria-hidden="true" />
          {t('How the Garage works')}
        </summary>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-t5 text-text-secondary">
          <li>
            {t('Every booking that earns a Shine Card stamp also earns one Garage card. Some scratch cards, challenges and badges give cards too.')}
          </li>
          <li>
            <Figures
              text={t('Odds for each card: Common {common}%, Rare {rare}%, Epic {epic}%, Legendary {legendary}%. A Rare or better is certain within {rarePity} cards, a Legendary within {legendaryPity}.', { common: album.odds.common, rare: album.odds.rare, epic: album.odds.epic, legendary: album.odds.legendary, rarePity: album.pity.rare, legendaryPity: album.pity.legendary })}
            />
          </li>
          <li>
            <Figures
              text={t('Every {perStar} duplicates make a bonus Shine Card stamp. Finish a row of 5 for {rewardRupees} off your next booking.', { perStar: album.duplicates.perStar, rewardRupees: rewardRupees(album.rowReward) })}
            />
          </li>
          <li>
            {t("Cars shown for illustration only. Not affiliated with any car maker. Card names are Detlio's own.")}
          </li>
        </ul>
      </details>

      <CardSheet
        car={open}
        onClose={() => setOpen(null)}
        firstName={firstName}
      />
    </>
  )
}

function CardSheet({
  car,
  onClose,
  firstName,
}: {
  car: GarageAlbumCar | null
  onClose: () => void
  firstName: string | null
}) {
  const t = useT()
  return (
    <ScSheet
      open={car !== null}
      onClose={onClose}
      aria-label={car?.owned ? car.name : t('A card not collected yet')}
    >
      {car &&
        (car.owned ? (
          <OwnedDetail car={car} firstName={firstName} />
        ) : (
          <MissingDetail car={car} />
        ))}
    </ScSheet>
  )
}

function OwnedDetail({
  car,
  firstName,
}: {
  car: GarageOwnedCar
  firstName: string | null
}) {
  const t = useT()
  const look = RARITY_LOOKS[car.rarity]
  return (
    <div className="flex flex-col items-center gap-3 px-5 pb-3 pt-1">
      <div className="w-full max-w-[290px]">
        <GarageCard car={car} />
      </div>
      <div className="flex w-full flex-col items-center gap-1 text-center">
        <p
          className="text-t5 uppercase tracking-[0.14em]"
          style={{ color: look.pill }}
        >
          {car.rarityLabel} ·{' '}
          <span className="font-numeric">
            {cardNumber(car.number, car.total)}
          </span>
        </p>
        <h2 className="text-[20px] font-semibold text-text-primary">
          {car.name}
        </h2>
        <IllustrationLine className="max-w-[300px]" />
        <p className="text-t5 text-text-secondary">
          <Figures
            text={
              car.count > 1
                ? t('You have {count} of these', { count: car.count })
                : t('You have 1 of these')
            }
          />
          {car.firstPulledAt && (
            <> {t('· first on {rewardDate}', { rewardDate: rewardDate(car.firstPulledAt) })}</>
          )}
        </p>
        <p className="sr-only">
          {car.colour}. {car.setting}. {car.lore}
        </p>
      </div>
      <div className="w-full max-w-[320px]">
        <GarageShare car={car} firstName={firstName} />
      </div>
    </div>
  )
}

function MissingDetail({
  car,
}: {
  car: Exclude<GarageAlbumCar, GarageOwnedCar>
}) {
  const t = useT()
  return (
    <div className="flex flex-col items-center gap-3 px-6 pb-4 pt-2 text-center">
      <div className="w-[150px]">
        <GarageTile car={car} />
      </div>
      <p
        className="text-t5 uppercase tracking-[0.14em]"
        style={{ color: RARITY_LOOKS[car.rarity].pill }}
      >
        {car.rarityLabel} ·{' '}
        <span className="font-numeric">
          {cardNumber(car.number, car.total)}
        </span>
      </p>
      <h2 className="text-t2 font-semibold text-text-primary">
        {t('Not in your Garage yet')}
      </h2>
      <p className="text-t4 text-text-secondary">
        {t('Every booking paid through Detlio earns a card. This one could be next.')}
      </p>
    </div>
  )
}
