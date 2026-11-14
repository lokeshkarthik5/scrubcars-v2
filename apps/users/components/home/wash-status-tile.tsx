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
import { WashGauge } from '@repo/ui/finish/wash-gauge'
import { TileIcon } from './tile'
import { useT } from '@repo/core/i18n'

/**
 * Last wash: days since the car was washed through Detlio, on a gauge from
 * just washed to its wash interval (the server's wash-status rule: 14 days
 * unless the customer picked another, 10 in Oct–Dec), and whether it is
 * due, overdue or booked — all the server's reckoning (lib/wash-status.ts),
 * in IST. A tap picks how often this car should be washed.
 *
 * The dashboard start-up (moment 7): as Home opens, the needle sweeps all
 * the way once and settles on the reading, like a car's dials when the
 * engine starts. Overdue pins it at the end stop in amber. Drawn, not read:
 * the figure and the line under it say the same in words.
 */
export function WashStatusTile({ car, now }: { car: HomeCar; now: Date }) {
  const t = useT()
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
          <span className="text-t4 text-dim">{t('Last wash')}</span>
          <TileIcon icon={IconDroplet} />
        </span>
        <span className="flex flex-1 items-end pr-1.5 pb-2.5">
          <WashGauge daysSinceWash={days} intervalDays={wash.intervalDays} over={meter.over} />
        </span>
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          {days === null ? (
            <span className="font-numeric text-[40px] leading-[0.9] font-medium tracking-[-0.045em] text-text-primary">
              –
            </span>
          ) : days === 0 ? (
            <span className="text-[22px] leading-none tracking-[-0.022em] text-text-primary">
              {t('Today')}
            </span>
          ) : (
            <>
              <span className="font-numeric text-[40px] leading-[0.9] font-medium tracking-[-0.045em] text-text-primary">
                {days}
              </span>
              <span className="text-t4 text-dim">
                {days === 1 ? t('day ago') : t('days ago')}
              </span>
            </>
          )}
        </span>
        <span className="mt-[9px] flex items-start gap-1.5 text-t4 leading-snug text-dim">
          {wash.state === 'booked' && (
            <IconCheck
              size={14}
              stroke={1.6}
              aria-hidden
              className="-ml-px mt-0.5 shrink-0 text-text-primary"
            />
          )}
          <span className="line-clamp-2">
            {line.lead && (
              <b
                className={cn(
                  'font-medium',
                  wash.state === 'overdue'
                    ? 'text-warning'
                    : 'text-text-primary'
                )}
              >
                {line.lead}
              </b>
            )}
            {line.rest}
          </span>
        </span>
        <span className="sr-only">{`. ${t('Change how often to wash this car.')}`}</span>
      </button>

      <WashIntervalSheet car={car} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** 7, 10, 14, 21 or 30 days, or the default. Saved as soon as one is tapped. */
function WashIntervalSheet({
  car,
  open,
  onClose,
}: {
  car: HomeCar
  open: boolean
  onClose: () => void
}) {
  const t = useT()
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
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : t("Couldn't save that. Try again.")
          ),
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
          'flex min-h-12 w-full items-center justify-between rounded-[14px] border px-4 text-left text-t3 transition-colors',
          chosen
            ? 'border-text-primary text-text-primary'
            : 'border-line text-text-secondary'
        )}
      >
        {label}
        {chosen && <IconCheck size={18} stroke={1.8} aria-hidden />}
      </button>
    )
  }

  return (
    <ScSheet
      open={open}
      onClose={onClose}
      dismissible={!save.isPending}
      aria-label={t('How often to wash')}
      className="px-4"
    >
      <h2 className="text-t2 font-medium text-text-primary">
        {t('How often to wash')}
      </h2>
      <p className="mt-1 text-t4 text-text-secondary">
        {car.make} {car.model}. {t(WASH_INTERVAL_DEFAULT_NOTE)}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {WASH_INTERVAL_CHOICES.map((days) =>
          option(days, t('Every {days} days', { days }))
        )}
        {option(null, t('Default'))}
      </div>
    </ScSheet>
  )
}
