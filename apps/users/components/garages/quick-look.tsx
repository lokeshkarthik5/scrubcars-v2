'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useGarage } from '@repo/core/api/hooks/use-vendors'
import { bookingTypeParam } from '@repo/core/booking-types'
import { distanceLabel, driveTimeLabel } from '@repo/core/drive-time'
import { servicePriceText } from '@/lib/price'
import { formatDuration } from '@repo/core/utils'
import type { BookingType, Vendor } from '@repo/core/types'
import { GarageCover } from '@repo/ui/features/garage-cover'
import { ScModal } from '@repo/ui/sc/modal'
import { Skeleton } from '@repo/ui/sc/skeleton'

/**
 * Press and hold a garage card (§3): a glass quick look over the list, with
 * the photo, area, distance and drive, the garage's first three services
 * with their time and price (from the garage page's own query, which the
 * press already started), "Open garage" and the solid red "Book".
 *
 * A bonus for whoever finds it: a tap still opens the garage as before.
 */
export function QuickLook({
  vendor,
  mode,
  onClose,
}: {
  vendor: Vendor | null
  mode: BookingType
  onClose: () => void
}) {
  return (
    <ScModal
      open={vendor !== null}
      onClose={onClose}
      aria-label={vendor ? `Quick look: ${vendor.name}` : 'Quick look'}
      className="fx-glass max-w-[354px] overflow-hidden rounded-[26px] border-white/18 bg-[rgb(18_18_22/0.82)] p-0"
    >
      {vendor && <QuickLookBody vendor={vendor} mode={mode} onClose={onClose} />}
    </ScModal>
  )
}

function QuickLookBody({ vendor, mode, onClose }: { vendor: Vendor; mode: BookingType; onClose: () => void }) {
  const garage = useGarage(vendor.id)
  const services = garage.isPlaceholderData ? null : (garage.data?.services.slice(0, 3) ?? [])
  const modeParam = bookingTypeParam(mode)
  const query = modeParam ? `?mode=${modeParam}` : ''
  const photo = vendor.photos[0] ?? null
  const where = [
    vendor.area,
    vendor.distanceKm !== null ? distanceLabel(vendor.distanceKm) : null,
    vendor.distanceKm !== null ? driveTimeLabel(vendor.distanceKm) : null,
  ].filter(Boolean)

  return (
    <div>
      <div className="relative h-[150px] overflow-hidden">
        {photo ? (
          <Image src={photo} alt="" fill sizes="354px" className="object-cover" />
        ) : (
          <GarageCover vendor={vendor} showMeta={false} />
        )}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-[rgb(18_18_22/0.9)]" />
      </div>
      <div className="px-[18px] pb-[18px] pt-1">
        <h2 className="text-t2 font-semibold text-text-primary">{vendor.name}</h2>
        <p className="mt-0.5 font-numeric text-t4 font-medium text-[#8E8E98]">{where.join(' · ')}</p>
        <ul className="mt-3 flex flex-col">
          {services === null
            ? [0, 1, 2].map((i) => (
                <li key={i} className="border-t border-white/7 py-3">
                  <Skeleton className="h-4 w-2/3" />
                </li>
              ))
            : services.map((service, i) => (
                <li
                  key={service.id}
                  style={{ '--fx-i': i, '--fx-delay': '120ms' } as React.CSSProperties}
                  className="fx-rise flex items-center justify-between gap-2.5 border-t border-white/7 py-[11px]"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-t3 font-medium text-text-primary">{service.name}</span>
                    {service.durationMins ? (
                      <span className="text-t5 font-medium text-[#9A9AA3]">{formatDuration(service.durationMins)}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-numeric text-t3 font-semibold text-white">
                    {servicePriceText(service)}
                  </span>
                </li>
              ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <Link
            href={`/garage/${vendor.id}${query}`}
            onClick={onClose}
            className="fx-press flex h-12 flex-1 items-center justify-center rounded-[14px] border border-white/16 bg-white/5 text-t3 font-semibold text-white"
          >
            Open garage
          </Link>
          <Link
            href={`/book/${vendor.id}${query}`}
            onClick={onClose}
            className="fx-red-button fx-press flex h-12 flex-1 items-center justify-center rounded-[14px] text-t3 font-semibold"
          >
            Book
          </Link>
        </div>
      </div>
    </div>
  )
}
