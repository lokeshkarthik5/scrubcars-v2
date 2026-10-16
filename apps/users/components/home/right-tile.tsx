import {
  IconBuildingStore,
  IconCalendarEvent,
  IconSpeakerphone,
  IconPhoto,
  IconRepeat,
} from '@tabler/icons-react'
import type { HomeRightTile } from '@repo/core/api/home'
import { bookAgainPathFor, withdrawnPathFor } from '@repo/core/book-again'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { bookingDayLabel, istClockParts } from '@repo/core/home-display'
import { formatRupees } from '@repo/core/job-records'
import { Tile } from './tile'

const NEXT_LABELS: Record<string, string> = {
  pending: 'Requested',
  confirmed: 'Next booking',
  in_progress: 'Being washed now',
}

/** "Hub Promo · ₹450", "· Inspection fee ₹299", or "· Price at checkout". */
function bookAgainPrice(tile: Extract<HomeRightTile, { kind: 'book_again' }>): string {
  if (tile.price === null) return 'Price at checkout'
  const amount = formatRupees(Number(tile.price))
  // Only the inspection fee is known ahead; the work is priced at the garage.
  return tile.pricedOnInspection ? `Inspection fee ${amount}` : amount
}

/**
 * The tile beside the wash bar: what is next for this car. A booking coming
 * up (with a team notice about it as one short line, never a card above the
 * car), the before & after photos of the last job, the same job again, or
 * nothing booked. The server decides which; this draws it.
 *
 * `onBook` runs as a tile that starts a new booking is tapped. Home uses it to
 * note the car on screen, as Book a wash does: none of these links names a
 * car, and checkout would otherwise open on whichever car was tapped last,
 * pricing a second car's Book again against the first.
 */
export function RightTile({ tile, onBook }: { tile: HomeRightTile; onBook?: () => void }) {
  switch (tile.kind) {
    case 'next_booking': {
      const { time, meridiem } = istClockParts(new Date(tile.scheduledAt))
      // A pay-later booking holds no slot until it is paid: say so plainly.
      const unpaid = tile.paymentStatus === 'unpaid'
      return (
        <Tile href={`/bookings/${tile.bookingId}`} label={NEXT_LABELS[tile.status] ?? 'Next booking'} icon={IconCalendarEvent}>
          <span className="flex min-h-0 flex-1 items-end pb-3">
            {tile.notice && (
              <span className="-mr-1.5 flex min-w-0 items-center gap-[5px] text-[12px] text-[#E4E4E7]">
                <IconSpeakerphone size={14} stroke={1.5} aria-hidden className="shrink-0 text-text-muted" />
                <span className="truncate">{tile.notice.title}</span>
              </span>
            )}
          </span>
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="font-numeric text-[40px] leading-[0.9] font-medium tracking-[-0.045em] text-text-primary">
              {time}
            </span>
            <span className="text-[13px] text-dim">{meridiem}</span>
          </span>
          <span className="mt-[9px] truncate text-[13px] text-dim">
            {unpaid ? (
              <b className="font-medium text-text-primary">Pay to hold your slot</b>
            ) : (
              <>
                <b className="font-medium text-text-primary">{bookingDayLabel(tile.scheduledAt)}</b> ·{' '}
                {BOOKING_TYPE_LABELS[tile.bookingType]}
              </>
            )}
          </span>
        </Tile>
      )
    }

    case 'photos': {
      const total = tile.before + tile.after
      return (
        <Tile href={`/bookings/${tile.bookingId}`} label="Before & after" icon={IconPhoto}>
          <span className="flex-1" />
          <span className="text-[22px] leading-[1.12] tracking-[-0.022em] text-text-primary">
            <span className="font-numeric">{total}</span> {total === 1 ? 'photo' : 'photos'}
          </span>
          <span className="mt-2 truncate text-[13px] text-dim">
            {tile.vendorName} · {bookingDayLabel(tile.at)}
          </span>
        </Tile>
      )
    }

    case 'book_again':
      if (!tile.available) {
        // The garage sells none of the last job's services any more. Not
        // "Book again": there is nothing to repeat. The garage page says why
        // (`withdrawn`), as checkout's own redirect does.
        return (
          <Tile href={withdrawnPathFor(tile)} label="Book again" icon={IconRepeat} onClick={onBook}>
            <span className="flex-1" />
            <span className="text-[22px] leading-[1.12] tracking-[-0.022em] text-text-primary">Pick a service</span>
            <span className="mt-2 truncate text-[13px] text-dim">{tile.vendorName} changed its services</span>
          </Tile>
        )
      }
      return (
        <Tile href={bookAgainPathFor(tile)} label="Book again" icon={IconRepeat} onClick={onBook}>
          <span className="flex-1" />
          <span className="line-clamp-2 pr-1.5 text-[22px] leading-[1.12] tracking-[-0.022em] text-text-primary">
            {tile.serviceLabel}
          </span>
          <span className="mt-2 truncate text-[13px] text-dim">
            {tile.vendorName} · <span className="font-numeric">{bookAgainPrice(tile)}</span>
          </span>
        </Tile>
      )

    case 'garage_unavailable':
      return (
        <Tile href="/garages" label="Book again" icon={IconBuildingStore} onClick={onBook}>
          <span className="flex-1" />
          <span className="line-clamp-3 text-[15px] leading-[1.3] text-text-primary">
            {tile.vendorName} isn&apos;t taking bookings right now
          </span>
          <span className="mt-2 truncate text-[13px] font-medium text-text-primary">See other garages</span>
        </Tile>
      )

    case 'nothing_booked':
      return (
        <Tile href="/garages" label="Next booking" icon={IconCalendarEvent} onClick={onBook}>
          <span className="flex-1" />
          <span className="text-[22px] leading-[1.12] tracking-[-0.022em] text-text-primary">Nothing booked</span>
          <span className="mt-2 truncate text-[13px] text-dim">Pick a garage</span>
        </Tile>
      )
  }
}
