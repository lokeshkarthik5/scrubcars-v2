'use client'

import { useState } from 'react'
import { IconCheck, IconDroplet } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScSheet } from '@repo/ui/sc/modal'
import { useUpdateWashInterval } from '@repo/core/api/hooks/use-home'
import type { HomeCar } from '@repo/core/api/home'
import type { WashIntervalDays } from '@repo/core/api/users'
import {
  WASH_INTERVAL_CHOICES,
  WASH_INTERVAL_DEFAULT_NOTE,
  washLine,
  washMeter,
} from '@repo/core/home-display'
import { cn } from '@repo/core/utils'
import { TileIcon } from './tile'

/**
 * Last wash: days since the car was washed through Detlio, a bar with a
 * step per day of its interval (per two or three days past a fortnight, so
 * it stays a bar), and whether it is due, overdue or booked —
 * all the server's reckoning (lib/wash-status.ts), in IST. A tap picks how
 * often this car should be washed.
 */
export function WashStatusTile({ car, now }: { car: HomeCar; now: Date }) {
  const [open, setOpen] = useState(false)
  const { wash } = car
  const meter = washMeter(wash)
  const line = washLine(wash, now)
  const days = wash.daysSinceWash

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hub-card press flex min-h-[164px] min-w-0 flex-col pt-3.5 pr-3.5 pb-[18px] pl-5 text-left"
      >
        <span className="flex items-center justify-between">
          <span className="text-[13px] text-dim">Last wash</span>
          <TileIcon icon={IconDroplet} />
        </span>
        <span className="flex flex-1 items-end pr-1.5 pb-3">
          <span className="wash-meter" data-over={meter.over} aria-hidden>
            {Array.from({ length: meter.steps }, (_, i) => (
              <i key={i} data-on={i < meter.lit} />
            ))}
          </span>
        </span>
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          {days === null ? (
            <span className="font-numeric text-[40px] leading-[0.9] font-medium tracking-[-0.045em] text-text-primary">
              –
            </span>
          ) : days === 0 ? (
            <span className="text-[22px] leading-none tracking-[-0.022em] text-text-primary">Today</span>
          ) : (
            <>
              <span className="font-numeric text-[40px] leading-[0.9] font-medium tracking-[-0.045em] text-text-primary">
                {days}
              </span>
              <span className="text-[13px] text-dim">{days === 1 ? 'day ago' : 'days ago'}</span>
            </>
          )}
        </span>
        <span className="mt-[9px] flex items-center gap-1.5 truncate text-[13px] text-dim">
          {wash.state === 'booked' && <IconCheck size={14} stroke={1.6} aria-hidden className="-ml-px text-text-primary" />}
          <span className="truncate">
            {line.lead && (
              <b className={cn('font-medium', wash.state === 'overdue' ? 'text-warning' : 'text-text-primary')}>
                {line.lead}
              </b>
            )}
            {line.rest}
          </span>
        </span>
        <span className="sr-only">. Change how often to wash this car.</span>
      </button>

      <WashIntervalSheet car={car} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** 7, 10, 14, 21 or 30 days, or the default. Saved as soon as one is tapped. */
function WashIntervalSheet({ car, open, onClose }: { car: HomeCar; open: boolean; onClose: () => void }) {
  const save = useUpdateWashInterval()
  const current: WashIntervalDays | null = car.wash.isDefaultInterval
    ? null
    : (car.wash.intervalDays as WashIntervalDays)

  const pick = (days: WashIntervalDays | null) => {
    if (save.isPending) return
    if (days === current) {
      onClose()
      return
    }
    save.mutate(
      { vehicleId: car.id, days },
      {
        onSuccess: onClose,
        onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save that. Try again."),
      }
    )
  }

  const option = (days: WashIntervalDays | null, label: string) => {
    const chosen = days === current
    return (
      <button
        key={label}
        type="button"
        aria-pressed={chosen}
        disabled={save.isPending}
        onClick={() => pick(days)}
        className={cn(
          'flex min-h-12 w-full items-center justify-between rounded-[14px] border px-4 text-left text-[15px] transition-colors',
          chosen ? 'border-text-primary text-text-primary' : 'border-line text-text-secondary'
        )}
      >
        {label}
        {chosen && <IconCheck size={18} stroke={1.8} aria-hidden />}
      </button>
    )
  }

  return (
    <ScSheet open={open} onClose={onClose} dismissible={!save.isPending} aria-label="How often to wash" className="px-4">
      <h2 className="text-[19px] font-medium text-text-primary">How often to wash</h2>
      <p className="mt-1 text-[13px] text-text-secondary">
        {car.make} {car.model}. {WASH_INTERVAL_DEFAULT_NOTE}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {WASH_INTERVAL_CHOICES.map((days) => option(days, `Every ${days} days`))}
        {option(null, 'Default')}
      </div>
    </ScSheet>
  )
}
