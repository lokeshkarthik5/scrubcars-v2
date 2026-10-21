'use client'

import {
  IconBrandWhatsapp,
  IconCar,
  IconHome,
  IconMapPin,
  IconNavigation,
  IconPhoneOff,
} from '@tabler/icons-react'
import { ContactButtons } from '@repo/ui/sc/contact-buttons'
import { BOOKING_TYPE_LABELS, bookingReference } from '@repo/core/booking-types'
import { directionsHref, telHref, whatsAppHref } from '@repo/core/contact-links'
import {
  contactWindowState,
  customerNumberHiddenLine,
  garageSupportMessage,
} from '@repo/core/contact-window'
import { supportWhatsAppHref } from '@repo/core/support'
import type { Booking } from '@repo/core/types'

/** A job the garage may still travel to: its address stays on the card. */
const OPEN_STATUSES: ReadonlySet<Booking['status']> = new Set([
  'pending',
  'confirmed',
  'in_progress',
])

/** A job with no one left to reach: refused, cancelled or moved. */
const ENDED_STATUSES: ReadonlySet<Booking['status']> = new Set([
  'cancelled',
  'rescheduled',
])

/**
 * Where a job happens and how to reach its customer, on a job card.
 *
 * The type is shown on every job; a doorstep or pickup address, with
 * Directions, while the job is still open (the garage plans its route from
 * it, whenever it likes).
 *
 * The customer's Call / WhatsApp follow the contact window (owner decision,
 * 18 Oct 2026; apps/server/src/lib/contact-window.ts): the server sends the
 * number only from 2 hours before the job until an hour after it is done,
 * so garage and customer can't swap numbers and book around Detlio. Outside
 * it the card says when the number shows and offers Detlio support, with
 * the booking named. A cancelled job shows neither.
 *
 * A pickup & drop job shows the same: the address is where the car is
 * collected from and brought back to, with Directions.
 */
export function JobContact({
  booking,
  now,
  callButtons = true,
}: {
  booking: Booking
  now: number
  /** Off where the page's header has its own Call and WhatsApp (the job page). */
  callButtons?: boolean
}) {
  const doorstep = booking.bookingType === 'doorstep'
  const pickup = booking.bookingType === 'pickup'
  const open = OPEN_STATUSES.has(booking.status)
  const windowState = contactWindowState(booking.contactWindow, now)
  const ended = ENDED_STATUSES.has(booking.status)
  const who = booking.customerName || 'the customer'
  const firstName = booking.customerName?.trim().split(/\s+/)[0]
  const location =
    (doorstep || pickup) && open ? booking.jobLocation : undefined
  // An unpinned address goes to Maps as text, which searches better with the
  // city on the end; the garage's own city is the customer's too.
  const city = booking.garage?.city
  const mapsHref = location
    ? directionsHref({
        ...location,
        address:
          city && !location.address.toLowerCase().includes(city.toLowerCase())
            ? `${location.address}, ${city}`
            : location.address,
      })
    : null

  return (
    <div className="flex flex-col gap-2">
      {pickup ? (
        // Its own badge: a pickup job has steps the others don't, and the
        // car is the garage's responsibility from the moment it is collected.
        <span className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-[15px] font-medium text-text-primary">
          <IconCar size={16} aria-hidden />
          {BOOKING_TYPE_LABELS.pickup}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-[15px] font-medium text-text-primary">
          {doorstep ? (
            <IconHome size={16} aria-hidden />
          ) : (
            <IconMapPin size={16} aria-hidden />
          )}
          {BOOKING_TYPE_LABELS[booking.bookingType]}
        </span>
      )}

      {location && (
        <div className="flex flex-col gap-2 rounded-[10px] bg-surface-elevated px-3 py-2.5">
          <div>
            {pickup && (
              <p className="text-[13px] text-text-secondary">
                Collect from and return to
              </p>
            )}
            <p className="text-[15px] text-text-primary">{location.address}</p>
            {/* An address saved before pins were required has none: the text
                still gets Maps close, but the exact gate is worth a call. */}
            {(location.lat === null || location.lng === null) && (
              <p className="mt-0.5 text-[13px] text-text-secondary">
                No map pin on this address. Call to confirm the spot.
              </p>
            )}
          </div>
          {mapsHref && (
            // A full-height target: it is the one control a crew on the road
            // reaches for. The name starts with what the button says.
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open in Maps for ${who}`}
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 text-[15px] font-medium text-text-primary transition-colors hover:border-text-secondary"
            >
              <IconNavigation size={16} aria-hidden />
              Open in Maps
            </a>
          )}
        </div>
      )}

      {!ended && windowState === 'open' && callButtons && (
        <ContactButtons
          who={who}
          callHref={telHref(booking.customerPhone)}
          whatsAppHref={whatsAppHref(
            booking.customerPhone,
            // Says who is writing: the customer has never seen this number.
            `Hi${firstName ? ` ${firstName}` : ''}, this is ${booking.vendorName || 'your garage'} about your Detlio booking for ${booking.scheduledAt}.`
          )}
        />
      )}

      {!ended && windowState !== 'open' && (
        <div className="flex flex-col rounded-[10px] bg-surface-elevated px-3 pt-2.5">
          <p className="flex items-center gap-1.5 text-[15px] text-text-secondary">
            <IconPhoneOff size={16} className="shrink-0" aria-hidden />
            {customerNumberHiddenLine(windowState)}
          </p>
          {/* WhatsApp, so the message arrives with the booking named. */}
          <a
            href={supportWhatsAppHref(
              garageSupportMessage(
                booking.vendorName,
                `#${bookingReference(booking.id)}`
              )
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center gap-1.5 text-[15px] text-text-secondary transition-colors hover:text-text-primary"
          >
            <IconBrandWhatsapp
              size={16}
              className="shrink-0 text-[#25D366]"
              aria-hidden
            />
            <span>
              Need to reach the customer?{' '}
              <span className="font-medium text-text-primary underline underline-offset-2">
                Contact Detlio support
              </span>
            </span>
          </a>
        </div>
      )}
    </div>
  )
}
