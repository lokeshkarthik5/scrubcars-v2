'use client'

import { IconHome, IconMapPin, IconNavigation } from '@tabler/icons-react'
import { ContactButtons } from '@repo/ui/sc/contact-buttons'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { directionsHref, telHref, whatsAppHref } from '@repo/core/contact-links'
import type { Booking } from '@repo/core/types'

/** A job the garage may still have to reach the customer about, or travel to. */
const OPEN_STATUSES: ReadonlySet<Booking['status']> = new Set([
  'pending',
  'confirmed',
  'in_progress',
])

/**
 * Where a job happens and how to reach its customer, on a job card.
 *
 * The API always sent the customer's phone and a doorstep job's address and
 * pin; the cards just never showed them, so a doorstep customer waited at home
 * for a garage that did not know where to go. The type is shown on every job;
 * the address and the Call / WhatsApp buttons only while the job is still
 * open — once it is done or cancelled, the garage has no need to hold onto a
 * customer's number on screen.
 */
export function JobContact({ booking }: { booking: Booking }) {
  const doorstep = booking.bookingType === 'doorstep'
  const open = OPEN_STATUSES.has(booking.status)
  const who = booking.customerName || 'the customer'
  const firstName = booking.customerName?.trim().split(/\s+/)[0]
  const location = doorstep && open ? booking.jobLocation : undefined
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
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
        {doorstep ? <IconHome size={14} aria-hidden /> : <IconMapPin size={14} aria-hidden />}
        {BOOKING_TYPE_LABELS[booking.bookingType]}
      </span>

      {location && (
        <div className="flex flex-col gap-2 rounded-[10px] bg-surface-elevated px-3 py-2.5">
          <div>
            <p className="text-[12px] text-text-primary">{location.address}</p>
            {/* An address saved before pins were required has none: the text
                still gets Maps close, but the exact gate is worth a call. */}
            {(location.lat === null || location.lng === null) && (
              <p className="mt-0.5 text-[11px] text-text-secondary">
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
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-medium text-text-primary transition-colors hover:border-text-secondary"
            >
              <IconNavigation size={16} aria-hidden />
              Open in Maps
            </a>
          )}
        </div>
      )}

      {open && (
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
    </div>
  )
}
