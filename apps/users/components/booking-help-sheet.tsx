'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconChevronRight, IconCircleX, IconFlag, IconMessageReport, IconPhoneOff } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ContactButtons } from '@repo/ui/sc/contact-buttons'
import { ScSheet } from '@repo/ui/sc/modal'
import { bookingReference } from '@repo/core/booking-types'
import { telHref, whatsAppHref } from '@repo/core/contact-links'
import { SUPPORT_TEL_HREF, supportWhatsAppHref } from '@repo/core/support'
import { COMPLAINT_ACKNOWLEDGE_HOURS } from '@repo/core/complaints'
import { contactWindowState, garageNumberHiddenLine } from '@repo/core/contact-window'
import { useNow } from '@repo/core/hooks/use-now'
import type { Booking } from '@repo/core/types'
import { useBypassStatus } from '@repo/core/api/hooks/use-bypass-reports'
import { BYPASS_QUESTION } from '@repo/core/bypass-reports'
import { mayBeReportable } from '@/components/bypass/bypass-report-line'
import { ReportBypassSheet } from '@/components/bypass/report-bypass-sheet'
import { RaiseComplaintSheet } from '@/components/complaints/raise-complaint-sheet'

interface BookingHelpSheetProps {
  open: boolean
  onClose: () => void
  booking: Booking
}

/**
 * A cancelled or moved booking has no job left to talk to the garage about;
 * Detlio handles those, so the garage's part of the sheet is left out.
 */
const ENDED: ReadonlySet<Booking['status']> = new Set(['cancelled', 'rescheduled'])

/**
 * Who to talk to about this booking, one tap away: the garage for the job
 * itself, the Detlio team for money or when something has gone wrong. Every
 * message starts with the booking number, so nobody has to ask which booking.
 *
 * Below them, "Raise a complaint": a written complaint about this booking,
 * with a number and the 24-hour clock. It replaces this sheet with its own
 * (two sheets stacked would be two backdrops and two scroll locks); closing
 * it closes Help too. While the booking can be reported, "Did the garage ask
 * you to book directly?" (0052) works the same way.
 */
export function BookingHelpSheet({ open, onClose, booking }: BookingHelpSheetProps) {
  const [raising, setRaising] = useState(false)
  // "Did the garage ask you to book directly?" (0052): the booking page's
  // own read, shared (one request, one cache).
  const [reporting, setReporting] = useState(false)
  const bypass = useBypassStatus(booking.id, open && mayBeReportable(booking)).data
  const now = useNow(30_000)
  const reference = `#${bookingReference(booking.id)}`
  const garage = booking.garage
  // The contact window (owner decision, 18 Oct 2026): the server sends the
  // garage's phone and WhatsApp only from 2 hours before the booking until
  // an hour after it is done. Outside it the sheet says when they show, and
  // the Detlio team below is the way through.
  const windowState = contactWindowState(booking.contactWindow, now)
  const showGarage = !ENDED.has(booking.status) && !!garage && windowState === 'open'
  const garageHidden = !ENDED.has(booking.status) && windowState !== 'open' ? windowState : null
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
        open={open && !raising && !reporting}
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
                    : booking.bookingType === 'pickup'
                      ? 'For the pickup and return times, where your car is, or questions about the work.'
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

          {garageHidden && (
            <section className="flex flex-col gap-1">
              <h3 className="text-[13px] font-semibold text-text-primary">{booking.vendorName}</h3>
              <p className="flex items-start gap-1.5 text-[12px] text-text-secondary">
                <IconPhoneOff size={14} className="mt-px shrink-0" aria-hidden />
                <span>
                  {garageNumberHiddenLine(garageHidden)}{' '}
                  {garageHidden === 'before'
                    ? 'Until then, the Detlio team can pass a message on.'
                    : 'The Detlio team can reach them for you.'}
                </span>
              </p>
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

          {bypass?.canReport && (
            <section className="flex flex-col gap-2">
              <div>
                <h3 className="text-[13px] font-semibold text-text-primary">{BYPASS_QUESTION}</h3>
                <p className="text-[12px] text-text-secondary">
                  Tell us in confidence. The garage is never told who reported it.
                </p>
              </div>
              <ScButton variant="secondary" onClick={() => setReporting(true)} className="min-h-11">
                <span className="flex items-center justify-center gap-2">
                  <IconFlag size={18} aria-hidden />
                  Tell us what happened
                </span>
              </ScButton>
            </section>
          )}

          {/* Answers to the usual questions (cancelling, refunds, pickup
              codes), for when there is no one to call about it. */}
          <Link
            href="/help"
            onClick={onClose}
            className="-mx-1 flex min-h-11 items-center justify-between gap-3 rounded-[10px] px-1 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
          >
            <span>
              Common questions: <span className="font-medium text-text-primary">Help centre</span>
            </span>
            <IconChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
          </Link>
        </div>
      </ScSheet>

      {bypass?.canReport && (
        <ReportBypassSheet
          open={open && reporting}
          onClose={() => {
            setReporting(false)
            onClose()
          }}
          booking={{ id: booking.id, reference, vendorName: booking.vendorName }}
          rewardOffered={bypass.rewardOffered}
          rewardAmount={bypass.rewardAmount}
        />
      )}

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
