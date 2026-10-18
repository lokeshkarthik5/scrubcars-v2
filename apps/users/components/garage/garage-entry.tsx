'use client'

import Link from 'next/link'
import { IconChevronRight } from '@tabler/icons-react'
import { useGarageAlbum } from '@repo/core/api/hooks/use-garage'
import { collectedLine } from '@repo/core/garage'
import { GarageTile } from './garage-card'

/**
 * The Rewards page's way into the Garage (0057): the progress and the three
 * newest cars, a tap to the album. Nothing while the Garage is off (the
 * caller checks the config) or the album has not loaded.
 */
export function GarageEntry() {
  const album = useGarageAlbum(true)
  const data = album.data
  if (!data) return null
  const owned = data.cars.filter((c) => c.owned)
  const newest = [...owned].sort((a, b) => (b.firstPulledAt ?? '').localeCompare(a.firstPulledAt ?? '')).slice(0, 3)
  const shown = newest.length > 0 ? newest : data.cars.slice(0, 3)
  const percent = Math.round((data.collected / Math.max(1, data.series.total)) * 100)
  return (
    <Link href="/profile/rewards/garage" className="garage-entry flex flex-col gap-3 rounded-card border border-border px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] text-text-secondary">Detlio Garage · {data.series.name}</p>
          <h2 className="mt-0.5 text-[18px] font-semibold leading-tight text-text-primary">
            <span className="font-numeric">{collectedLine(data.collected, data.series.total)}</span> cars collected
          </h2>
        </div>
        <IconChevronRight size={18} className="text-text-secondary" aria-hidden="true" />
      </div>
      <div className="h-[6px] w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="garage-progress h-full rounded-full" style={{ width: `${Math.max(3, percent)}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {shown.map((car) => (
          <GarageTile key={car.number} car={car} />
        ))}
      </div>
      <p className="text-[12px] text-text-secondary">Every booking earns a card. Finish a row of five for {`₹${data.rowReward}`} off.</p>
    </Link>
  )
}
