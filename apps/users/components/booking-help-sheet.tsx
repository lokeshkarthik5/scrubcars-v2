'use client'

import { useState } from 'react'
import { IconCircleX, IconMessageReport } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ContactButtons } from '@repo/ui/sc/contact-buttons'
import { ScSheet } from '@repo/ui/sc/modal'
import { bookingReference } from '@repo/core/booking-types'
import { telHref, whatsAppHref } from '@repo/core/contact-links'
import { SUPPORT_TEL_HREF, supportWhatsAppHref } from '@repo/core/support'
import { COMPLAINT_ACKNOWLEDGE_HOURS } from '@repo/core/complaints'
import type { Booking } from '@repo/core/types'
import { RaiseComplaintSheet } from '@/components/complaints/raise-complaint-sheet'

interface BookingHelpSheetProps {
  open: boolean
  onClose: () => void
  booking: Booking
}

/**
 * The garage is reachable for as long as the job is on — including after it is
 * done, when a customer may need to ask about the work. A cancelled or moved
 * booking has no job left to talk to the garage about; Detlio handles those.
 */
const GARAGE_REACHABLE: ReadonlySet<Booking['status']> = new Set([
  'pending',
  'confirmed',
  'in_progress',
  'completed',
])

/**
 * Who to talk to about this booking, one tap away: the garage for the job
 * itself, the Detlio team for money or when something has gone wrong. Every
 * message starts with the booking number, so nobody has to ask which booking.
 *
 * Below them, "Raise a complaint": a written complaint about this booking,
 * with a number and the 24-hour clock. It replaces this sheet with its own
 * (two sheets stacked would be two backdrops and two scroll locks); closing
 * it closes Help too.
 */
export function BookingHelpSheet({ open, onClose, booking }: BookingHelpSheetProps) {
  const [raising, setRaising] = useState(false)
  const reference = `#${bookingReference(booking.id)}`
  const garage = booking.garage
  const showGarage = GARAGE_REACHABLE.has(booking.status) && !!garage
  const garageCall = showGarage ? telHref(garage?.phone) : null
  const garageMessage = `Hi, this is about my Detlio booking ${reference} with you for ${booking.scheduledAt}.`
  // The garage's WhatsApp number when it gave one, else its phone if that is
  // a mobile — a landline gets no WhatsApp button rather than a broken one.
  const garageWhatsApp = showGarage
    ? (whatsAppHref(garage?.whatsapp, garageMessage) ?? whatsAppHref(garage?.phone, garageMessage))
    : null

  return (
    <>
      <ScSheet
        open={open && !raising}
        onClose={onClose}
        aria-label="Help with this booking"
        className="px-4 pt-1"
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-text-primary">Help with this booking</h2>
              <p className="mt-1 text-[12px] text-text-secondary">
                Booking <span className="font-numeric font-medium">{reference}</span> ·{' '}
                {booking.vendorName} · <span className="font-numeric">{booking.scheduledAt}</span>
              </p>
            </div>
            {/* Every button below leaves the app; this one comes back. */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center"
            >
              <IconCircleX size={22} className="text-text-secondary" />
            </button>
          </div>

          {(garageCall || garageWhatsApp) && (
            <section className="flex flex-col gap-2">
              <div>
                <h3 className="text-[13px] font-semibold text-text-primary">{booking.vendorName}</h3>
                <p className="text-[12px] text-text-secondary">
                  {booking.bookingType === 'doorstep'
                    ? 'For timings, finding your place, or questions about the work.'
                    : 'For timings, finding the garage, or questions about the work.'}
                </p>
              </div>
              <ContactButtons
                who={booking.vendorName}
                callHref={garageCall}
                whatsAppHref={garageWhatsApp}
              />
            </section>
          )}

          <section className="flex flex-col gap-2">
            <div>
              <h3 className="text-[13px] font-semibold text-text-primary">Detlio team</h3>
              <p className="text-[12px] text-text-secondary">
                For payments and refunds, or if something isn&apos;t right. We&apos;ll take it
                up with the garage for you.
              </p>
            </div>
            <ContactButtons
              who="Detlio support"
              callHref={SUPPORT_TEL_HREF}
              whatsAppHref={supportWhatsAppHref(
                `Hi Detlio, I need help with booking ${reference} at ${booking.vendorName} (${booking.scheduledAt}).`
              )}
            />
          </section>

          <section className="flex flex-col gap-2">
            <div>
              <h3 className="text-[13px] font-semibold text-text-primary">Make a complaint</h3>
              <p className="text-[12px] text-text-secondary">
                In writing, with a complaint number to quote. We reply within{' '}
                <span className="font-numeric">{COMPLAINT_ACKNOWLEDGE_HOURS}</span> hours.
              </p>
            </div>
            <ScButton variant="secondary" onClick={() => setRaising(true)} className="min-h-11">
              <span className="flex items-center justify-center gap-2">
                <IconMessageReport size={18} aria-hidden />
                Raise a complaint
              </span>
            </ScButton>
          </section>
        </div>
      </ScSheet>

      <RaiseComplaintSheet
        open={open && raising}
        onClose={() => {
          setRaising(false)
          onClose()
        }}
        booking={{ id: booking.id, reference, vendorName: booking.vendorName }}
      />
    </>
  )
}
