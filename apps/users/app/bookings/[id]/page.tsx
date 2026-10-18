'use client'

import { use, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  IconCarGarage,
  IconCreditCard,
  IconHelpCircle,
  IconHome,
  IconLoader2,
  IconMapPin,
  IconNavigation,
  IconReceipt,
  IconRepeat,
} from '@tabler/icons-react'
import { CustomerShell } from '@/components/customer-shell'
import { ScBadge, customerBookingStatusBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput } from '@repo/ui/sc/input'
import { SlotPicker } from '@repo/ui/sc/slot-picker'
import { ScSheet } from '@repo/ui/sc/modal'
import { SuccessBurst } from '@repo/ui/sc/success-burst'
import { StatusStepper } from '@repo/ui/sc/status-stepper'
import { Stars } from '@repo/ui/sc/stars'
import { TopBar } from '@repo/ui/sc/top-bar'
import { getBooking } from '@repo/core/api/bookings'
import { createPaymentOrder, verifyPayment } from '@repo/core/api/payments'
import { submitReview } from '@repo/core/api/reviews'
import { track } from '@repo/core/analytics'
import { toast } from 'react-toastify'
import { openRazorpayCheckout, RazorpayReportedError } from '@repo/core/razorpay'
import {
  confirmPayment,
  FALLBACK_REFUND_MESSAGE,
  realClock,
} from '@repo/core/payment-confirmation'
import { bookAgainPath, canBookAgain, matchSavedAddress } from '@repo/core/book-again'
import { carWithGarage } from '@repo/core/pickup'
import { googleMapsLink } from '@repo/core/contact-links'
import { finalBillMayChange, formatStepTime } from '@repo/core/job-records'
import { customerRefundLine, withoutRefundPromise } from '@repo/core/refunds'
import {
  customerWaitingLine,
  customerWaitingNote,
  notAcceptedRefundLine,
  notAcceptedTitle,
} from '@repo/core/response-deadline'
import { formatBookingAmount } from '@repo/core/pricing'
import {
  BOOKING_TYPE_LABELS,
  CONFIRMED_CHANGE_CUTOFF_MINS,
  bookingReference,
} from '@repo/core/booking-types'
import { ApiError } from '@repo/core/api/client'
import { slotKeys } from '@repo/core/api/hooks/use-slots'
import { invalidateHome } from '@repo/core/api/hooks/use-home'
import { useNow } from '@repo/core/hooks/use-now'
import { useQueryClient } from '@tanstack/react-query'
import { useTravelTime } from '@repo/core/api/hooks/use-travel-time'
import { coarse, isStale, useLocationStore } from '@repo/core/stores/location-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useUserStore } from '@repo/core/stores/user-store'
import type { Booking, Review } from '@repo/core/types'
import { BookingDirectionsSheet, describeDrive } from '@/components/booking-directions-sheet'
import { FinalBillCard, type BillPayment } from '@/components/final-bill-card'
import { ExtraWorkCard } from '@/components/extra-work-card'
import { TimeProposalCard } from '@/components/time-proposal-card'
import { OtherGaragesCard } from '@/components/other-garages-card'
import { JobPhotosCard } from '@/components/job-photos-card'
import { CarConditionCard } from '@/components/car-condition-card'
import { PaymentReceivedPanel, paymentReceivedText } from '@/components/payment-received-panel'
import { PickupCodeCard, PickupTimeline } from '@/components/pickup-progress'

// Sheets closed on arrival are loaded after the page, not with it: they are
// out of the first load's JavaScript, and on the page well before anyone can
// tap what opens them. Client-only, since closed they render nothing anyway.
const BookingHelpSheet = dynamic(
  () => import('@/components/booking-help-sheet').then((m) => m.BookingHelpSheet),
  { ssr: false }
)

/** A booking the customer still has to get to, or is at. */
const OPEN_STATUSES: ReadonlySet<Booking['status']> = new Set(['pending', 'confirmed', 'in_progress'])

/**
 * What the customer is told about a cancelled booking: who cancelled it and,
 * when money is coming back, that it is and when it went.
 *
 * A no-show is the one case where the money is the message. A customer
 * no-show keeps the payment (the published policy), so it says so plainly and
 * points at Help rather than leaving them to find out from their bank; the
 * server never reports a refund owed on one. A garage no-show is always
 * refunded, by the Detlio team. Every other cancellation of a paid booking is
 * refunded too, and the refund line (customerRefundLine) says so: "will
 * refund … within 5–7 working days" until the team records it, "Refund of
 * ₹X started on <date>" while one sent through Razorpay from the app is on
 * its way, then "Refunded ₹X on <date>".
 */
function cancelledPanel(booking: Booking): { title: string; lines: string[] } {
  if (booking.noShow === 'customer') {
    return {
      title: 'Marked as a no-show',
      lines: [
        "The garage held your slot, so this payment isn't refunded. If this is wrong, use Help with this booking.",
      ],
    }
  }

  const refund = customerRefundLine(booking.refund)

  if (booking.noShow === 'garage') {
    return {
      title: "The garage couldn't serve this booking",
      lines: [
        refund ??
          // A server older than refunds sends no refund, only the payment.
          (booking.paymentStatus === 'refunded'
            ? 'Your payment has been refunded.'
            : booking.paymentStatus === 'paid'
              ? 'Our team will refund your payment.'
              : 'Nothing was charged online for it.'),
      ],
    }
  }

  // The garage let its time to answer run out, so the booking was cancelled
  // for it (0042): said as what happened, with the money; other garages
  // follow below the panel.
  if (booking.notAcceptedInTime) {
    const line = notAcceptedRefundLine(booking.refund)
    return { title: notAcceptedTitle(booking.vendorName), lines: line ? [line] : [] }
  }

  const withRefund = (lines: Array<string | null | undefined>) =>
    [...lines, refund].filter((line): line is string => Boolean(line))

  // The refund line is the one place the money is spoken about. A late
  // payment the garage could no longer take was cancelled with "Your payment
  // will be refunded." in its reason; next to the refund line that says it
  // twice, and once the refund is recorded the two contradict each other.
  const reason = refund ? withoutRefundPromise(booking.cancellationReason) : booking.cancellationReason

  if (booking.cancelledBy === 'admin') {
    const onBehalf =
      booking.cancelledOnBehalfOf === 'garage'
        ? "Cancelled at the garage's request."
        : booking.cancelledOnBehalfOf === 'customer'
          ? 'Cancelled at your request.'
          : null
    return {
      title: 'Cancelled by Detlio',
      lines: withRefund([onBehalf, reason]),
    }
  }

  // None of the garage's suggested times was picked (0041): said as what
  // happened. The reason names it; the refund line follows.
  if (booking.cancelledBy === 'vendor' && booking.timeProposal) {
    if (booking.timeProposal.status === 'declined') {
      return {
        title: "None of the garage's times worked",
        lines: withRefund(['You cancelled this booking instead of picking another time.']),
      }
    }
    if (booking.timeProposal.status === 'expired') {
      return {
        title: 'No time was picked in time',
        lines: withRefund([
          `${booking.vendorName} couldn't do your time and suggested others, so this booking was cancelled.`,
        ]),
      }
    }
  }

  if (booking.cancelledBy === 'vendor') {
    return {
      title: 'Rejected by vendor',
      lines: withRefund([reason ?? 'The vendor could not take this booking.']),
    }
  }

  return {
    title: booking.cancelledBy === 'user' ? 'Cancelled by you' : 'Booking cancelled',
    lines: withRefund([reason ?? 'This booking was cancelled.']),
  }
}

export default function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = use(params)
  // The query this page was opened with. Read from Next's searchParams, not
  // window.location: on a client-side navigation (a Link from Home) the new
  // page renders before the browser's URL changes, so window.location still
  // shows the page the customer came from.
  const query = use(searchParams)
  const queryValue = (key: string) => {
    const value = query[key]
    return Array.isArray(value) ? value[0] : value
  }
  const router = useRouter()
  const profile = useUserStore((s) => s.profile)
  const fetchProfile = useUserStore((s) => s.fetchProfile)
  // For Book again on a doorstep or pickup & drop booking: the saved address
  // it went to, when the customer still has it.
  const addresses = useUserStore((s) => s.addresses)
  const fetchAddresses = useUserStore((s) => s.fetchAddresses)
  const cancelBooking = useBookingsStore((s) => s.cancelBooking)
  const queryClient = useQueryClient()
  // For the 2-hour cutoff on an accepted booking, which a page left open can
  // cross while the customer looks at it.
  const now = useNow(30_000)
  const rescheduleBooking = useBookingsStore((s) => s.rescheduleBooking)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loadError, setLoadError] = useState(false)
  // Where Home sent the customer, read once like ?celebrate below: ?then=pay
  // (a final bill), times (the garage suggested other times), extra (extra
  // work to approve), reschedule (the garage is shut that day) or help, and
  // ?rate=N (a star tapped on "Rate your wash", so the form opens with it
  // chosen; the review is only sent from here, with Submit).
  const [arrival] = useState(() => {
    const then = queryValue('then')
    const rate = Number(queryValue('rate'))
    return {
      then:
        then === 'pay' || then === 'reschedule' || then === 'help' || then === 'times' || then === 'extra'
          ? then
          : null,
      rate: Number.isInteger(rate) && rate >= 1 && rate <= 5 ? rate : 0,
    }
  })
  const arrivalHandled = useRef(false)
  const [rating, setRating] = useState(arrival.rate)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [paying, setPaying] = useState(false)
  // Set once Razorpay reports this booking paid, and never cleared: the Pay
  // button is gone from then on, whatever the confirm call does. See
  // @repo/core/payment-confirmation for why a second tap is the real risk.
  const paidRef = useRef(false)
  const [paid, setPaid] = useState<{
    paymentId: string
    phase: 'confirming' | 'booked' | 'unconfirmed' | 'failed'
    refundMessage?: string
  } | null>(null)
  // Where paying each final bill stands, by the bill's id. Here rather than in
  // the bill's card: a bill replaced mid-payment takes its card with it, and
  // the old payment's "will be refunded" must stay on the page.
  const [billPayments, setBillPayments] = useState<Record<string, BillPayment>>({})
  const recordBillPayment = (chargeId: string, payment: BillPayment) =>
    setBillPayments((current) => ({ ...current, [chargeId]: payment }))
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  // Opened on arrival when Home's "Change time" sent the customer here; the
  // sheet itself only shows while the booking can still be moved (below), so
  // a stale link opens nothing.
  const [showReschedule, setShowReschedule] = useState(arrival.then === 'reschedule')
  const [rescheduleSlot, setRescheduleSlot] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [submittedReview, setSubmittedReview] = useState<Review | null>(null)
  const [showDirections, setShowDirections] = useState(false)
  // Home's "Get help" opens the help sheet straight away.
  const [showHelp, setShowHelp] = useState(arrival.then === 'help')
  // A drive time on the Getting there card only when the customer has just
  // shared their GPS: the page never asks for location by being opened, and a
  // fix from last week at home is not "from you" today.
  const storedLocation = useLocationStore((s) => s.location)
  const gpsHere =
    storedLocation?.source === 'gps' && !isStale(storedLocation) ? coarse(storedLocation) : null
  // The booking flow lands here with ?celebrate=1 straight after payment.
  // Read once into state rather than watching the URL, so the burst plays a
  // single time and a refresh doesn't replay it (the param is stripped below).
  const [celebrating, setCelebrating] = useState(() => queryValue('celebrate') === '1')

  // Only for Book again's address, so a failure just leaves it to checkout.
  const needsAddresses =
    !!booking && booking.bookingType !== 'dropin' && canBookAgain(booking) && addresses.length === 0
  useEffect(() => {
    if (needsAddresses) void fetchAddresses().catch(() => undefined)
  }, [needsAddresses, fetchAddresses])

  useEffect(() => {
    getBooking(id).then((b) => {
      if (b) {
        setBooking(b)
        // Seed from the booking that came back, not just from a submission
        // made in this session. Without this, revisiting a job you have
        // already reviewed shows the empty rating form again and invites a
        // second review that reviews.booking_id (unique) will refuse.
        if (b.review) {
          setSubmittedReview(b.review)
        }
      } else {
        setLoadError(true)
      }
    })
  }, [id])

  // Once the booking is here, scroll to what Home asked for — only if it
  // still applies (a bill still due, a finished job), so a stale link does
  // nothing.
  useEffect(() => {
    if (!booking || arrivalHandled.current) return
    arrivalHandled.current = true
    const scrollTo = (elementId: string) =>
      requestAnimationFrame(() =>
        document.getElementById(elementId)?.scrollIntoView({ block: 'start' })
      )
    if (arrival.then === 'pay' && booking.finalBill?.status === 'due') scrollTo('final-bill')
    if (arrival.then === 'times' && booking.timeProposal?.status === 'open') scrollTo('time-proposal')
    if (arrival.then === 'extra' && booking.extraWork.some((work) => work.state === 'awaiting')) {
      scrollTo('extra-work')
    }
    if (arrival.rate > 0 && booking.status === 'completed') scrollTo('rate')
    // Then off the URL, as ?celebrate is: handled once, so Back or a reload
    // does not open the reschedule or help sheet again unasked, nor put back
    // a rating the customer has since changed.
    const url = new URL(window.location.href)
    if (url.searchParams.has('then') || url.searchParams.has('rate')) {
      url.searchParams.delete('then')
      url.searchParams.delete('rate')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [booking, arrival])

  // Poll for live status updates (e.g. vendor accepts/rejects) every 5s.
  // Stop once the booking reaches a terminal state — except a completed
  // inspection job, whose final bill can still arrive (up to three days after
  // completion) or be settled by the webhook. That is watched more slowly,
  // and only while the bill can still change (finalBillMayChange).
  const bookingStatus = booking?.status
  const watchingBill = booking ? finalBillMayChange(booking, now) : false
  useEffect(() => {
    if (!bookingStatus) return
    const terminal =
      bookingStatus === 'completed' ||
      bookingStatus === 'cancelled' ||
      bookingStatus === 'rescheduled'
    if (terminal && !watchingBill) return

    const interval = setInterval(
      async () => {
        const fresh = await getBooking(id)
        if (fresh) setBooking(fresh)
      },
      terminal ? 15_000 : 5000
    )

    return () => clearInterval(interval)
  }, [id, bookingStatus, watchingBill])

  // The webhook can settle the payment after we stopped watching. The 5-second
  // poll above then shows the booking as paid, and a panel still saying
  // "we're confirming" under it would contradict the card it sits below — so
  // once the booking reads paid, the panel is gone, whatever `paid` says.
  const bookingPaid = booking?.paymentStatus === 'paid'
  const paymentSettled =
    paid?.phase === 'booked' || (paid !== null && paid.phase !== 'confirming' && bookingPaid)
  const showPaymentPanel =
    !paymentSettled && (paid?.phase === 'unconfirmed' || paid?.phase === 'failed')

  const handlePayNow = async () => {
    if (!booking || paying || paidRef.current) return
    setPaying(true)
    try {
      if (!profile) await fetchProfile()
      const order = await createPaymentOrder(booking.id)
      await openRazorpayCheckout({
        order,
        description: `${booking.serviceSummary} at ${booking.vendorName}`,
        customer: {
          name: profile?.name,
          phone: profile?.phone,
        },
        onSuccess: async (response) => {
          const paymentId = response.razorpay_payment_id
          paidRef.current = true
          setPaid({ paymentId, phase: 'confirming' })

          // The booking already exists here, so "confirmed" means its payment
          // reads paid — which the webhook also does on its own.
          const outcome = await confirmPayment({
            verify: async () => {
              await verifyPayment({
                bookingId: booking.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: paymentId,
                razorpaySignature: response.razorpay_signature,
              })
              return { bookingId: booking.id }
            },
            poll: async () => {
              const fresh = await getBooking(booking.id)
              if (fresh?.paymentStatus !== 'paid') return { kind: 'pending' }
              // Paid but cancelled: the garage could no longer take this time
              // when the money landed, and the booking carries the words
              // saying it will be refunded.
              return fresh.status === 'cancelled'
                ? {
                    kind: 'failed',
                    message: fresh.cancellationReason ?? FALLBACK_REFUND_MESSAGE,
                  }
                : { kind: 'booked', bookingId: booking.id }
            },
            ...realClock,
          })

          if (outcome.kind === 'booked') {
            const updated = await getBooking(booking.id)
            if (updated) setBooking(updated)
            setPaid({ paymentId, phase: 'booked' })
            void invalidateHome(queryClient)
            toast.success('Payment successful')
          } else {
            setPaid({
              paymentId,
              phase: outcome.kind,
              refundMessage: outcome.kind === 'failed' ? outcome.message : undefined,
            })
          }
        },
        onDismiss: () => {
          toast.info('Payment cancelled. You can pay anytime from booking details.')
        },
        onFailure: (message) => {
          toast.error(message)
        },
      })
    } catch (error) {
      if (!(error instanceof RazorpayReportedError) && error instanceof Error) {
        toast.error(error.message)
      }
    } finally {
      setPaying(false)
    }
  }

  const handleCancelBooking = async () => {
    if (!booking || cancelling) return
    setCancelling(true)
    try {
      const updated = await cancelBooking(booking.id, cancelReason.trim() || undefined)
      setBooking(updated)
      setShowCancelConfirm(false)
      setCancelReason('')
      void invalidateHome(queryClient)
      toast.success('Booking cancelled')
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CAR_WITH_GARAGE') {
        // The garage collected the car while this page was open: show it,
        // and the Help path, instead of a Cancel that can no longer work.
        setShowCancelConfirm(false)
        const fresh = await getBooking(id).catch(() => null)
        if (fresh) setBooking(fresh)
        toast.error(
          'The garage has already collected your car, so this booking can’t be cancelled here. Use Help with this booking.'
        )
      } else {
        toast.error(error instanceof Error ? error.message : 'Failed to cancel booking')
      }
    } finally {
      setCancelling(false)
    }
  }

  const handleReschedule = async () => {
    if (!booking || rescheduling || !rescheduleSlot) return
    setRescheduling(true)
    try {
      // Reschedule creates a NEW booking; navigate to it.
      const created = await rescheduleBooking(booking.id, rescheduleSlot)
      setShowReschedule(false)
      setRescheduleSlot(null)
      void invalidateHome(queryClient)
      // A move goes back to the garage: say so, rather than "rescheduled",
      // which reads as done.
      toast.success(`New time sent to ${booking.vendorName}. Waiting for them to accept.`)
      router.push(`/bookings/${created.id}`)
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined
      if (
        code === 'SLOT_TOO_SOON' ||
        code === 'INVALID_SCHEDULED_AT' ||
        code === 'SLOT_FULL' ||
        code === 'GARAGE_CLOSED_THAT_DAY'
      ) {
        // The chosen time ran out of notice, filled up or became a holiday:
        // keep the sheet open on fresh times.
        setRescheduleSlot(null)
        void queryClient.invalidateQueries({ queryKey: slotKeys.all })
      } else if (
        code === 'RESCHEDULE_WINDOW_PASSED' ||
        code === 'RESCHEDULE_LIMIT_REACHED' ||
        code === 'BOOKING_STATE_CHANGED' ||
        code === 'INVALID_BOOKING_STATUS' ||
        // Pickup & drop: the garage collected the car meanwhile.
        code === 'CAR_WITH_GARAGE'
      ) {
        // Nothing to pick any more — the booking itself has moved on.
        setShowReschedule(false)
        const fresh = await getBooking(id).catch(() => null)
        if (fresh) setBooking(fresh)
      }
      toast.error(error instanceof Error ? error.message : 'Failed to reschedule booking')
    } finally {
      setRescheduling(false)
    }
  }

  const handleSubmitReview = async () => {
    if (!rating) return
    setSubmitting(true)
    try {
      const review = await submitReview({ bookingId: id, rating, comment })
      setSubmittedReview(review)
      // That a review went in, for which garage; never its stars or words.
      track('review_submit', { vendorId: booking?.vendorId })
      // Home's "Rate your wash" is answered.
      void invalidateHome(queryClient)
      toast.success('Review submitted. Thanks!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  // Above the early returns with the other hooks. Disabled until both ends
  // are known, so it costs nothing for a doorstep job or an unpinned garage.
  // Only with somewhere real to send them: a pin or a street address. A
  // server older than this page sends neither, and directions to "Chennai"
  // would be worse than no card.
  const garage = booking?.garage
  const findable =
    !!garage &&
    ((garage.lat !== null && garage.lng !== null) || !!garage.address || !!googleMapsLink(garage.mapsUrl))
  const gettingThere =
    booking?.bookingType === 'dropin' && OPEN_STATUSES.has(booking.status) && findable
      ? garage
      : undefined
  const travel = useTravelTime(
    gettingThere ? gpsHere : null,
    gettingThere ? { lat: gettingThere.lat, lng: gettingThere.lng } : null
  )

  if (loadError) {
    return (
      <CustomerShell showNav className="py-4">
        <TopBar showBack title="Booking" />
        <p className="px-4 pt-4 text-[13px] text-text-secondary">
          Could not load this booking. It may have been removed or you may not have access.
        </p>
      </CustomerShell>
    )
  }

  if (!booking) {
    return (
      <CustomerShell showNav className="py-4">
        <TopBar showBack title="Loading..." />
      </CustomerShell>
    )
  }

  const statusBadge = customerBookingStatusBadge(booking.status)
  const cancelled = booking.status === 'cancelled' ? cancelledPanel(booking) : null
  // An accepted booking can't be cancelled or moved under 2 hours out (the
  // server's CANCELLATION_CUTOFF_MS); a pending one can, any time.
  const lockedIn =
    booking.status === 'confirmed' &&
    new Date(booking.scheduledAtIso).getTime() - now < CONFIRMED_CHANGE_CUTOFF_MINS * 60_000
  // Paying sends a request; only the garage's accept confirms it. Celebrating
  // a "confirmed" booking that the garage then declines teaches customers not
  // to believe this screen, so the moment says exactly what happened.
  const awaitingGarage = booking.status === 'pending'
  // Still pending at its start time: the garage can no longer accept it (the
  // server refuses), so the page stops promising that it might.
  // A choice of other times from the garage (0041) is that answer instead.
  const timeProposal = booking.timeProposal?.status === 'open' ? booking.timeProposal : null
  const missedByGarage =
    booking.status === 'pending' && new Date(booking.scheduledAtIso).getTime() <= now && !timeProposal
  // A final bill with a balance makes paying it the page's one main action,
  // so nothing else on the page is red while it is due.
  // So is extra work waiting for approval, and a choice of times from the
  // garage (0041): each is the thing to do here.
  const billDue =
    (booking.finalBill?.status === 'due' && booking.status !== 'cancelled') ||
    (['confirmed', 'in_progress'].includes(booking.status) &&
      booking.extraWork.some((work) => work.state === 'awaiting')) ||
    timeProposal !== null
  // When each step happened, under the step. An older booking has none.
  const stepTime = (iso: string | undefined) => (iso ? formatStepTime(iso, now) : undefined)
  const isPickup = booking.bookingType === 'pickup'
  // Pickup & drop, from Picked up on: the car is with the garage, and the
  // customer can no longer cancel or move the booking in the app (the
  // server's 409 CAR_WITH_GARAGE). Help is the way to reach anyone.
  const carAway = carWithGarage(booking)
  // While the garage's suggested times wait for an answer, that card is the
  // way to move or cancel: it carries both, and the refund that goes with them.
  const canChange = ['pending', 'confirmed'].includes(booking.status) && !carAway && !timeProposal

  return (
    <CustomerShell showNav className="gap-4 py-4">
      {celebrating && (
        <SuccessBurst
          title={awaitingGarage ? 'Booking requested' : 'Booking confirmed'}
          subtitle={
            awaitingGarage
              ? `Waiting for ${booking.vendorName} to accept your ${booking.scheduledAt} slot.`
              : `${booking.serviceSummary} at ${booking.vendorName} · ${booking.scheduledAt}`
          }
          onDone={() => {
            setCelebrating(false)
            // Drop the flag so a refresh or back-navigation doesn't replay it.
            window.history.replaceState(null, '', `/bookings/${booking.id}`)
          }}
        />
      )}

      <TopBar showBack center title="Booking Status" />

      <div className="flex items-center justify-between gap-3">
        {/* Short, human-quotable reference derived from the booking UUID. */}
        <span className="text-[13px] text-text-secondary">
          Booking #{bookingReference(booking.id)}
        </span>
        <ScBadge variant={statusBadge.variant} className="uppercase tracking-wide">
          {statusBadge.label}
        </ScBadge>
      </div>

      <ScCard className="px-4 py-4">
        <h2 className="text-[20px] font-bold tracking-tight text-text-primary">
          {booking.vendorName}
        </h2>
        <p className="mt-1 font-numeric text-[13px] font-medium text-text-secondary">
          {booking.scheduledAt}
        </p>

        <div className="mt-3 flex items-center gap-2 text-[13px]">
          {booking.bookingType === 'doorstep' ? (
            <IconHome size={15} className="text-text-primary" />
          ) : isPickup ? (
            <IconCarGarage size={15} className="text-text-primary" />
          ) : (
            <IconMapPin size={15} className="text-text-primary" />
          )}
          {/* The same name the customer chose it by on home and at checkout. */}
          <span className="font-medium text-text-primary">
            {BOOKING_TYPE_LABELS[booking.bookingType]}
          </span>
        </div>
        {/* Where the garage comes to (or collects the car from and brings it
            back to), so a wrong address is caught before anyone sets off.
            For pickup & drop this is the address that matters, not the
            garage's. */}
        {booking.jobLocation && (
          <p className="mt-1 pl-[23px] text-[12px] text-text-secondary">
            {isPickup && (
              <span className="block text-[11px] text-text-muted">Collected from and returned to</span>
            )}
            {booking.jobLocation.address}
          </p>
        )}

        {/* A booking that is cancelled (including one cancelled by a
            reschedule) has no progress to show, and the stepper reads a
            status it doesn't know as an open request. The panel below
            explains the state instead. */}
        {booking.status !== 'rescheduled' && booking.status !== 'cancelled' && !missedByGarage && (
          <>
            <div className="my-4 h-px bg-border" />
            {/* Pickup & drop has its handover steps around the work. */}
            {isPickup ? (
              <PickupTimeline booking={booking} now={now} />
            ) : (
              <StatusStepper
                status={booking.status}
                times={{
                  requested: stepTime(booking.requestedAtIso),
                  confirmed: stepTime(booking.acceptedAtIso),
                  in_progress: stepTime(booking.startedAtIso),
                  completed: stepTime(booking.completedAtIso),
                }}
              />
            )}
          </>
        )}

        <div className="my-4 h-px bg-border" />
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          Services
        </p>
        {/* One chip per service, each with the price it was sold at. The
            chips sum to the subtotal below — the discount applies to the
            order, not to any one line. */}
        <div className="mt-2 flex flex-wrap gap-2">
          {booking.items.map((item) => (
            <span
              key={item.id}
              className="rounded-lg bg-surface-elevated px-2.5 py-1.5 text-[12px] text-text-primary"
            >
              {item.name}{' '}
              <span className="font-numeric font-medium">
                ({formatBookingAmount(item.amount)})
              </span>
            </span>
          ))}
        </div>

        {/* Only a discounted booking gets a breakdown; everything else keeps
            the single total it has always shown. */}
        {booking.discountAmount > 0 && (
          <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-[12px]">
            <div className="flex items-center justify-between text-text-secondary">
              <span>Subtotal</span>
              <span className="font-numeric font-medium">
                {formatBookingAmount(booking.subtotalPrice)}
              </span>
            </div>
            <div className="flex items-center justify-between text-success">
              <span>
                Discount{booking.discountCode ? ` (${booking.discountCode})` : ''}
              </span>
              <span className="font-numeric font-medium">
                −{formatBookingAmount(booking.discountAmount)}
              </span>
            </div>
          </div>
        )}

        <div className="my-4 h-px bg-border" />
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            <IconCreditCard size={14} />
            {booking.paymentStatus === 'paid'
              ? 'Paid online'
              : booking.paymentMethod === 'online'
                ? `Online · ${booking.paymentStatus}`
                : `Cash · ${booking.paymentStatus}`}
          </span>
          <span className="font-numeric text-[15px] font-bold text-text-primary">
            {formatBookingAmount(booking.servicePrice)}
          </span>
        </div>
      </ScCard>

      {/* Paid and waiting for the garage (0042): until when, and — only
          while the server enforces it — what happens if nobody answers. */}
      {awaitingGarage &&
        booking.paymentStatus === 'paid' &&
        booking.responseDeadline &&
        !timeProposal &&
        !missedByGarage && (
          <ScCard>
            <h2 className="text-sm font-semibold text-text-primary">
              {customerWaitingLine(booking.vendorName, booking.responseDeadline, now)}
            </h2>
            {customerWaitingNote(booking.responseDeadline, now) && (
              <p className="mt-1 text-[13px] text-text-secondary">
                {customerWaitingNote(booking.responseDeadline, now)}
              </p>
            )}
          </ScCard>
        )}

      {/* The garage can't do the booked time and suggested others: the
          first thing to answer, right under the booking. */}
      {timeProposal && (
        <TimeProposalCard
          key={timeProposal.id}
          booking={booking}
          proposal={timeProposal}
          onMoved={(moved) => {
            setBooking(moved)
            void invalidateHome(queryClient)
            router.replace(`/bookings/${moved.id}`)
          }}
          onDeclined={(cancelledBooking) => {
            setBooking(cancelledBooking)
            void invalidateHome(queryClient)
          }}
          onStale={() => {
            void getBooking(booking.id).then((fresh) => fresh && setBooking(fresh))
          }}
        />
      )}

      {/* The handover code, right under the booking: it is what the customer
          needs at the door. */}
      {isPickup && !missedByGarage && <PickupCodeCard booking={booking} />}

      {/* A payment for a bill that no longer stands — the garage replaced
          it, or the booking was cancelled, while the customer paid. Its card
          has gone; what happened to the money has not. */}
      {Object.entries(billPayments)
        .filter(([chargeId, payment]) => chargeId !== booking.finalBill?.id && payment.phase !== 'paid')
        .map(([chargeId, payment]) => (
          <ScCard key={chargeId} className="flex flex-col gap-3 px-4 py-4">
            <h2 className="text-sm font-semibold text-text-primary">Your earlier bill payment</h2>
            {payment.phase === 'confirming' ? (
              <p role="status" className="flex items-center gap-2 text-[13px] text-text-primary">
                <IconLoader2 size={16} className="shrink-0 animate-spin" aria-hidden="true" />
                Payment received — confirming…
              </p>
            ) : (
              <PaymentReceivedPanel
                paymentId={payment.paymentId}
                refundMessage={payment.phase === 'failed' ? payment.refundMessage : undefined}
                waitingOn="bill_not_marked_paid"
              />
            )}
          </ScCard>
        ))}

      {/* Keyed by the bill: a replaced bill is a new one to read and pay,
          not the old card with new numbers in it. On a cancelled booking only
          a bill already paid stays: there is nothing left to pay there, but
          the customer paid it and should still see it. */}
      {booking.finalBill &&
        (booking.status !== 'cancelled' || booking.finalBill.status === 'paid') && (
          <FinalBillCard
            key={booking.finalBill.id}
            booking={booking}
            bill={booking.finalBill}
            payment={billPayments[booking.finalBill.id]}
            onPayment={recordBillPayment}
            onUpdated={(updated) => {
              setBooking(updated)
              // The bill card on Home, and Book a wash back to red.
              void invalidateHome(queryClient)
            }}
            customer={{ name: profile?.name, phone: profile?.phone }}
          />
        )}

      {/* Extra work the garage asked for: to approve and pay, or decline,
          while the job is on; answered ones stay as the record. */}
      {booking.extraWork.length > 0 && (
        <ExtraWorkCard
          booking={booking}
          onUpdated={(updated) => {
            setBooking(updated)
            void invalidateHome(queryClient)
          }}
          customer={{ name: profile?.name, phone: profile?.phone }}
        />
      )}

      <JobPhotosCard photos={booking.jobPhotos} completed={booking.status === 'completed'} />

      {/* The customer's own photos of their car (0045): before the work,
          and for a day after it. */}
      <CarConditionCard
        booking={booking}
        onChanged={async () => {
          const fresh = await getBooking(booking.id).catch(() => null)
          if (fresh) setBooking(fresh)
        }}
      />

      {missedByGarage && (
        <ScCard>
          <h2 className="mb-1 text-sm font-semibold text-text-primary">
            {booking.vendorName} didn&apos;t accept in time
          </h2>
          <p className="text-[13px] text-text-secondary">
            Your booking time has passed without the garage accepting, so this booking won&apos;t go
            ahead. Cancel it or pick a new time below, or use Help with this booking about your
            payment.
          </p>
        </ScCard>
      )}

      {gettingThere && !missedByGarage && (
        <ScCard className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-primary">Getting there</h2>
            {gettingThere.address && (
              <p className="mt-0.5 text-[12px] text-text-secondary">
                {[gettingThere.address, gettingThere.city].filter(Boolean).join(', ')}
              </p>
            )}
            {travel.data && (
              <p className="mt-1 text-[12px] text-text-secondary">
                {describeDrive(travel.data).atGarage ? (
                  "You're at the garage."
                ) : (
                  <>
                    <span className="font-numeric font-bold text-text-primary">
                      {describeDrive(travel.data).time}
                    </span>{' '}
                    drive from you
                  </>
                )}
              </p>
            )}
          </div>
          <ScButton
            variant="secondary"
            fullWidth={false}
            onClick={() => setShowDirections(true)}
            className="flex shrink-0 items-center gap-1.5 px-4"
          >
            <IconNavigation size={16} aria-hidden />
            Directions
          </ScButton>
        </ScCard>
      )}

      {/* Once a payment has gone through (refunded since or not). The server
          decides: a booking moved to a new time has its receipt there. A
          link, not the red button: the receipt is a record, not a next step. */}
      {booking.receiptAvailable && (
        <ScButtonLink
          href={`/bookings/${booking.id}/receipt`}
          variant="secondary"
          fullWidth
          className="gap-2"
        >
          <IconReceipt size={18} aria-hidden />
          View receipt
        </ScButtonLink>
      )}

      <ScButton
        variant="secondary"
        onClick={() => {
          setShowHelp(true)
          track('help_view', { step: 'booking' })
        }}
        className="flex items-center justify-center gap-2"
      >
        <IconHelpCircle size={18} aria-hidden />
        Help with this booking
      </ScButton>

      {booking.status === 'rescheduled' && (
        <ScCard>
          <h2 className="mb-1 text-sm font-semibold text-text-primary">Rescheduled</h2>
          <p className="text-[13px] text-text-secondary">
            This booking was moved to a new time. Open your bookings to see the new one and whether
            the garage has accepted it.
          </p>
        </ScCard>
      )}

      {/* Money coming back on a booking that is still on: a payment that
          landed on a final bill the garage replaced. It names that bill, so
          "your payment" isn't read as the booking's own. A cancelled booking
          says it in the panel below instead. */}
      {!cancelled && customerRefundLine(booking.refund, 'earlier_bill') && (
        <ScCard>
          <h2 className="mb-1 text-sm font-semibold text-text-primary">Refund</h2>
          <p className="text-[13px] text-text-secondary">
            {customerRefundLine(booking.refund, 'earlier_bill')}
          </p>
        </ScCard>
      )}

      {cancelled && (
        <ScCard>
          <h2 className="mb-1 text-sm font-semibold text-text-primary">{cancelled.title}</h2>
          {cancelled.lines.map((line) => (
            <p key={line} className="text-[13px] text-text-secondary">
              {line}
            </p>
          ))}
        </ScCard>
      )}

      {/* Not accepted in time (0042): somewhere else to book, same type. */}
      {booking.status === 'cancelled' && booking.notAcceptedInTime && <OtherGaragesCard booking={booking} />}

      {/* Totals live on the status card above; this is just the outstanding-payment CTA. */}
      {/* Says each step after payment out loud. On the page from the start
          and only its text changes: a live region that mounts with its words
          already in it is usually not announced, and the Pay Now button
          that had focus is gone by the time any of this happens. */}
      <p role="status" className="sr-only">
        {paid?.phase === 'confirming'
          ? 'Payment received. Confirming your booking.'
          : paymentSettled
            ? 'Payment confirmed.'
            : paid
              ? paymentReceivedText(
                  paid.paymentId,
                  paid.phase === 'failed' ? paid.refundMessage : undefined
                )
              : ''}
      </p>

      {paid?.phase === 'confirming' && (
        // Graphite with a spinner, not the red pill: red means "this pays",
        // and a full-strength red button that does nothing gets tapped again
        // and again on a phone, where nothing shows it is disabled.
        <ScButton
          disabled
          className="flex items-center justify-center gap-2 rounded-full bg-surface-elevated py-4 text-[15px] text-text-primary ring-1 ring-inset ring-border hover:bg-surface-elevated disabled:cursor-wait disabled:opacity-100"
        >
          <IconLoader2 size={16} className="shrink-0 animate-spin" aria-hidden="true" />
          Payment received — confirming your booking…
        </ScButton>
      )}

      {showPaymentPanel && paid && (
        <ScCard>
          <PaymentReceivedPanel
            paymentId={paid.paymentId}
            refundMessage={paid.phase === 'failed' ? paid.refundMessage : undefined}
            waitingOn="not_marked_paid"
          />
        </ScCard>
      )}

      {/* Never again once Razorpay has reported this booking paid, even while
          the booking itself still reads pending. */}
      {!paid &&
        booking.paymentMethod === 'online' &&
        booking.paymentStatus === 'pending' &&
        booking.status !== 'cancelled' && (
          <ScButton disabled={paying} onClick={handlePayNow} className="rounded-full py-4 text-[15px]">
            {paying ? (
              'Opening payment...'
            ) : (
              <>
                Pay Now (
                <span className="font-numeric font-bold">
                  {formatBookingAmount(booking.servicePrice)}
                </span>
                )
              </>
            )}
          </ScButton>
        )}

      {/* Pickup & drop once collected: no Reschedule or Cancel to tap, and
          why, with the way to reach the garage or Detlio. */}
      {carAway && OPEN_STATUSES.has(booking.status) && (
        <ScCard>
          <h2 className="mb-1 text-sm font-semibold text-text-primary">Your car is with the garage</h2>
          <p className="mb-3 text-[13px] text-text-secondary">
            {booking.vendorName} has collected your car, so this booking can&apos;t be cancelled or
            moved in the app. To change anything, or if something isn&apos;t right, use Help with
            this booking to reach the garage or our team, or raise a complaint there.
          </p>
          <ScButton variant="secondary" onClick={() => setShowHelp(true)}>
            Get help
          </ScButton>
        </ScCard>
      )}

      {canChange && (
        <ScCard>
          <h2 className="mb-1 text-sm font-semibold text-text-primary">Reschedule booking</h2>
          <p className="mb-3 text-[12px] text-text-secondary">
            {lockedIn
              ? `Your slot is less than 2 hours away, so it can't be moved here. Use Help with this booking to reach ${booking.vendorName} or our team.`
              : booking.status === 'confirmed'
                ? `You can reschedule twice in all · ${booking.remainingReschedules} of 2 left. Your booking goes back to Requested until ${booking.vendorName} accepts the new time.`
                : `You can reschedule twice in all · ${booking.remainingReschedules} of 2 left. ${booking.vendorName} will need to accept the new time.`}
            {isPickup && !lockedIn && ' You can move it until the garage collects your car.'}
          </p>
          <ScButton
            variant="secondary"
            disabled={booking.remainingReschedules <= 0 || lockedIn}
            onClick={() => {
              setRescheduleSlot(null)
              setShowReschedule(true)
            }}
          >
            {booking.remainingReschedules <= 0
              ? 'No reschedules left'
              : lockedIn
                ? 'Too close to your slot to move'
                : 'Reschedule'}
          </ScButton>
        </ScCard>
      )}

      {canChange && (
        <ScCard>
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Cancel booking</h2>
          {lockedIn ? (
            // Shown instead of a control the server would refuse: the garage
            // has accepted and the slot is under 2 hours away.
            <p className="text-[13px] text-text-secondary">
              Your slot is less than 2 hours away and {booking.vendorName} has accepted it, so it
              can&apos;t be cancelled here. Use Help with this booking to reach the garage or our
              team.
            </p>
          ) : showCancelConfirm ? (
            <div className="rise-in flex flex-col gap-3">
              <p className="text-[13px] text-text-secondary">
                {booking.status === 'pending'
                  ? `${booking.vendorName} hasn't accepted yet, so you can cancel any time. This cannot be undone.`
                  : 'Cancel this booking? This cannot be undone.'}
              </p>
              <ScInput
                placeholder="Reason (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              {booking.paymentMethod === 'online' && booking.paymentStatus === 'paid' && (
                <p className="text-[12px] text-text-muted">
                  Our team will refund your payment to your original payment method within 5–7
                  working days.
                </p>
              )}
              <div className="flex gap-2">
                <ScButton
                  variant="secondary"
                  disabled={cancelling}
                  onClick={() => setShowCancelConfirm(false)}
                >
                  Keep booking
                </ScButton>
                <ScButton
                  disabled={cancelling}
                  onClick={handleCancelBooking}
                >
                  {cancelling ? 'Cancelling...' : 'Confirm cancel'}
                </ScButton>
              </div>
            </div>
          ) : (
            // A plain underlined link: cancelling is not what this screen
            // wants pressed, and red is the colour that says "press me".
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="min-h-11 w-full text-center text-[14px] font-semibold text-text-primary underline"
            >
              Cancel Booking
            </button>
          )}
        </ScCard>
      )}

      {booking.status === 'completed' && (
        // #rate: Home's "Rate your wash" stars land here, the rating chosen.
        <ScCard id="rate" className="scroll-mt-4">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Rate your experience</h2>
          {submittedReview ? (
            <div className="flex flex-col gap-2">
              <Stars rating={submittedReview.rating} size={18} />
              <p className="text-[13px] text-text-secondary">
                Thanks for your review.
              </p>
              {submittedReview.comment && (
                <p className="text-[13px] text-text-primary">{submittedReview.comment}</p>
              )}
            </div>
          ) : (
            <>
              <Stars rating={rating} interactive value={rating} onChange={setRating} size={24} />
              <div className="mt-3">
                <ScInput
                  aria-label="Tell us about your experience"
                  placeholder="Tell us about your experience"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
              <ScButton
                className="mt-3"
                // Quieter while a final bill is due: paying it is the page's
                // main action.
                variant={billDue ? 'secondary' : 'primary'}
                disabled={!rating || submitting}
                onClick={handleSubmitReview}
              >
                {submitting ? 'Submitting...' : 'Submit review'}
              </ScButton>
            </>
          )}
        </ScCard>
      )}

      {/* Once the booking is over: checkout at the same garage with the same
          services and mode, for a new time. Secondary, never red — on a
          finished job the page's own action (a review, a bill) comes first,
          and Help is always beside it. Checkout leaves out anything the
          garage has stopped offering and says so. */}
      {canBookAgain(booking) && (
        <ScButtonLink
          href={bookAgainPath(booking, matchSavedAddress(booking, addresses))}
          variant="secondary"
          fullWidth
          className="gap-2"
        >
          <IconRepeat size={18} aria-hidden />
          Book again
        </ScButtonLink>
      )}

      {gettingThere && (
        <BookingDirectionsSheet
          open={showDirections}
          onClose={() => setShowDirections(false)}
          booking={booking}
        />
      )}
      <BookingHelpSheet open={showHelp} onClose={() => setShowHelp(false)} booking={booking} />

      {/* dismissible=false while the reschedule is in flight, so a stray tap on
          the backdrop can't close the sheet mid-request. */}
      <ScSheet
        // Only while the booking can be moved: the same rules as the
        // Reschedule button, so a stale ?then=reschedule opens nothing.
        open={
          showReschedule &&
          canChange &&
          booking.remainingReschedules > 0 &&
          !lockedIn
        }
        onClose={() => setShowReschedule(false)}
        dismissible={!rescheduling}
        aria-label="Reschedule booking"
        className="px-4 pt-1"
      >
          <div>
            <h2 className="text-base font-semibold text-text-primary">Reschedule booking</h2>
            <p className="mb-4 mt-1 text-[12px] text-text-secondary">
              You can reschedule only twice · {booking.remainingReschedules} of 2 left. Pick a new
              time; {booking.vendorName} will be asked to accept it.
            </p>
            <SlotPicker
              vendorId={booking.vendorId}
              // Every service on the booking: a move has to fit the whole job,
              // not just its first line.
              serviceIds={booking.items.map((item) => item.serviceId)}
              value={rescheduleSlot}
              onChange={setRescheduleSlot}
              onLapse={() => toast.info('That time is now too soon to book. Pick another time.')}
              bookingType={booking.bookingType}
              // Its own time does not count against the garage: moving a job
              // 30 minutes at a one-bay garage would otherwise look full.
              rescheduleOf={booking.id}
            />
            <div className="mt-5 flex gap-2">
              <ScButton
                variant="secondary"
                disabled={rescheduling}
                onClick={() => setShowReschedule(false)}
              >
                Cancel
              </ScButton>
              <ScButton
                disabled={!rescheduleSlot || rescheduling}
                onClick={handleReschedule}
              >
                {rescheduling ? 'Rescheduling...' : 'Confirm reschedule'}
              </ScButton>
            </div>
          </div>
      </ScSheet>
    </CustomerShell>
  )
}
