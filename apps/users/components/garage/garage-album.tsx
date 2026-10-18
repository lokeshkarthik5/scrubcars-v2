'use client'

import { useMemo, useState } from 'react'
import { IconCircleCheckFilled, IconInfoCircle } from '@tabler/icons-react'
import { FilterChip } from '@repo/ui/sc/chip'
import { Figures } from '@repo/ui/sc/figures'
import { ScSheet } from '@repo/ui/sc/modal'
import type { GarageAlbum, GarageAlbumCar, GarageOwnedCar } from '@repo/core/api/garage'
import { cardNumber, collectedLine, duplicatesLine, GARAGE_RARITIES, RARITY_LABELS, RARITY_LOOKS, type GarageRarity } from '@repo/core/garage'
import { rewardDate, rewardRupees } from '@repo/core/rewards'
import { cn } from '@repo/core/utils'
import { GarageCard, GarageTile } from './garage-card'
import { GarageShare } from './garage-share'

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
export function GarageAlbumView({ album, firstName, openNumber = null }: { album: GarageAlbum; firstName: string | null; openNumber?: number | null }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<GarageAlbumCar | null>(() => album.cars.find((c) => c.number === openNumber) ?? null)
  const total = album.series.total
  const percent = Math.round((album.collected / Math.max(1, total)) * 100)
  const rowsDone = album.rows.filter((r) => r.complete).length
  const counts = useMemo(
    () =>
      Object.fromEntries(
        GARAGE_RARITIES.map((r) => [r, { owned: album.cars.filter((c) => c.rarity === r && c.owned).length, all: album.cars.filter((c) => c.rarity === r).length }])
      ) as Record<GarageRarity, { owned: number; all: number }>,
    [album]
  )
  const byNumber = new Map(album.cars.map((c) => [c.number, c]))

  const tile = (car: GarageAlbumCar) => (
    <button
      key={car.number}
      type="button"
      onClick={() => setOpen(car)}
      aria-label={car.owned ? `${car.name}, ${car.rarityLabel}, number ${car.number}${car.count > 1 ? `, ${car.count} copies` : ''}` : `Number ${car.number}, ${car.rarityLabel}, not collected yet`}
      className="block rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <GarageTile car={car} />
    </button>
  )

  return (
    <>
      <section aria-labelledby="garage-progress" className="garage-hero flex flex-col gap-3 rounded-card px-4 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[12px] text-text-secondary">{album.series.name} · fictional hypercars</p>
            <h2 id="garage-progress" className="mt-1 text-[30px] font-semibold leading-none tracking-[-0.03em] text-text-primary">
              <span className="font-numeric">{collectedLine(album.collected, total)}</span>
            </h2>
            <p className="mt-1 text-[13px] text-text-secondary">cars collected</p>
          </div>
          <div className="text-right">
            <p className="font-numeric text-[20px] font-semibold leading-none text-text-primary">
              {rowsDone}/{album.rows.length}
            </p>
            <p className="mt-1 text-[11px] text-text-secondary">rows complete</p>
          </div>
        </div>
        <div className="h-[8px] w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={album.collected} aria-label="Cars collected">
          <div className="garage-progress h-full rounded-full" style={{ width: `${Math.max(2, percent)}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-secondary">
          <span>
            <Figures text={`Each row of 5: ${rewardRupees(album.rowReward)} off`} />
          </span>
          <span>
            <Figures text={duplicatesLine(album.duplicates.waiting, album.duplicates.perStar)} />
          </span>
        </div>
        {album.completedAt && (
          <p className="flex items-center gap-2 rounded-[12px] border border-[#F7D06B]/40 bg-[#F7D06B]/10 px-3 py-2 text-[13px] text-text-primary">
            <IconCircleCheckFilled size={16} className="text-[#F7D06B]" aria-hidden="true" />
            Series complete on {rewardDate(album.completedAt)}. You are a Garage Legend.
          </p>
        )}
      </section>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter by rarity">
        <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} count={album.collected} />
        {GARAGE_RARITIES.map((r) => (
          <FilterChip key={r} label={RARITY_LABELS[r]} active={filter === r} onClick={() => setFilter(r)} count={counts[r].owned} />
        ))}
      </div>

      {filter === 'all' ? (
        <div className="flex flex-col gap-4">
          {album.rows.map((row) => (
            <section key={row.row} aria-labelledby={`row-${row.row}`} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id={`row-${row.row}`} className="text-[13px] font-semibold text-text-primary">
                  Row {row.row} <span className="font-numeric font-normal text-text-secondary">· {row.collected} of {row.total}</span>
                </h3>
                <span className={cn('text-[11px]', row.complete ? 'text-[#F7D06B]' : 'text-text-muted')}>
                  {row.complete ? (row.reward?.voucher ? `Done · ${rewardRupees(album.rowReward)} off given` : 'Done · bonus stamps given') : `${rewardRupees(album.rowReward)} off when complete`}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">{row.numbers.map((n) => tile(byNumber.get(n)!))}</div>
            </section>
          ))}
        </div>
      ) : (
        <section aria-label={`${RARITY_LABELS[filter]} cards`} className="flex flex-col gap-2">
          <p className="text-[12px] text-text-secondary">
            <Figures text={`${counts[filter].owned} of ${counts[filter].all} ${RARITY_LABELS[filter]} cards`} />
          </p>
          <div className="grid grid-cols-4 gap-2">{album.cars.filter((c) => c.rarity === filter).map(tile)}</div>
        </section>
      )}

      <details className="group rounded-[14px] border border-border px-4 py-3">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-text-primary">
          <IconInfoCircle size={16} aria-hidden="true" />
          How the Garage works
        </summary>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[12px] text-text-secondary">
          <li>Every booking that earns a Shine Card stamp also earns one Garage card. Some scratch cards, challenges and badges give cards too.</li>
          <li>
            <Figures text={`Odds for each card: Common ${album.odds.common}%, Rare ${album.odds.rare}%, Epic ${album.odds.epic}%, Legendary ${album.odds.legendary}%. A Rare or better is certain within ${album.pity.rare} cards, a Legendary within ${album.pity.legendary}.`} />
          </li>
          <li>
            <Figures text={`Every ${album.duplicates.perStar} duplicates make a bonus Shine Card stamp. Finish a row of 5 for ${rewardRupees(album.rowReward)} off your next booking.`} />
          </li>
          <li>The cars are invented for Detlio. They are not real makes or models.</li>
        </ul>
      </details>

      <CardSheet car={open} onClose={() => setOpen(null)} firstName={firstName} />
    </>
  )
}

function CardSheet({ car, onClose, firstName }: { car: GarageAlbumCar | null; onClose: () => void; firstName: string | null }) {
  return (
    <ScSheet open={car !== null} onClose={onClose} aria-label={car?.owned ? car.name : 'A card not collected yet'}>
      {car && (car.owned ? <OwnedDetail car={car} firstName={firstName} /> : <MissingDetail car={car} />)}
    </ScSheet>
  )
}

function OwnedDetail({ car, firstName }: { car: GarageOwnedCar; firstName: string | null }) {
  const look = RARITY_LOOKS[car.rarity]
  return (
    <div className="flex flex-col items-center gap-3 px-5 pb-3 pt-1">
      <div className="w-full max-w-[290px]">
        <GarageCard car={car} />
      </div>
      <div className="flex w-full flex-col items-center gap-1 text-center">
        <p className="text-[12px] uppercase tracking-[0.14em]" style={{ color: look.pill }}>
          {car.rarityLabel} · <span className="font-numeric">{cardNumber(car.number, car.total)}</span>
        </p>
        <h2 className="text-[20px] font-semibold text-text-primary">{car.name}</h2>
        <p className="text-[12px] text-text-secondary">
          <Figures text={car.count > 1 ? `You have ${car.count} of these` : 'You have 1 of these'} />
          {car.firstPulledAt && <> · first on {rewardDate(car.firstPulledAt)}</>}
        </p>
        <p className="sr-only">
          {car.stats.join('. ')}. {car.lore}
        </p>
      </div>
      <div className="w-full max-w-[320px]">
        <GarageShare car={car} firstName={firstName} />
      </div>
    </div>
  )
}

function MissingDetail({ car }: { car: Exclude<GarageAlbumCar, GarageOwnedCar> }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 pb-4 pt-2 text-center">
      <div className="w-[150px]">
        <GarageTile car={car} />
      </div>
      <p className="text-[12px] uppercase tracking-[0.14em]" style={{ color: RARITY_LOOKS[car.rarity].pill }}>
        {car.rarityLabel} · <span className="font-numeric">{cardNumber(car.number, car.total)}</span>
      </p>
      <h2 className="text-[18px] font-semibold text-text-primary">Not in your Garage yet</h2>
      <p className="text-[13px] text-text-secondary">Every booking paid through Detlio earns a card. This one could be next.</p>
    </div>
  )
}
