'use client'

import { use, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  IconArrowUpRight,
  IconChevronRight,
  IconLoader2,
  IconNavigation,
  IconRepeat,
} from '@tabler/icons-react'
import { CustomerShell } from '@/components/customer-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@/components/ui/card'
import { MainAction } from '@/components/main-action'
import { PageHeader } from '@/components/ui/page-header'
import { WhenPicker } from '@/components/checkout/when-picker'
import { STATUS_STEPS, bookingHeadline } from '@/lib/booking-status'
import { formatWhen } from '@repo/core/format'
import { money } from '@/lib/money'
import { currentMarketingContext, trackPurchase } from '@/lib/meta-pixel'
import { contactWindowState } from '@repo/core/contact-window'
import { telHref, whatsAppHref } from '@repo/core/contact-links'
import { ScInput } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { SuccessBurst } from '@repo/ui/sc/success-burst'
import { StatusStepper } from '@repo/ui/sc/status-stepper'
import { Stars } from '@repo/ui/sc/stars'
import { getBooking } from '@repo/core/api/bookings'
import { createPaymentOrder, verifyPayment } from '@repo/core/api/payments'
import { submitReview } from '@repo/core/api/reviews'
import { amountBucket } from '@repo/core/analytics-events'
import { track } from '@repo/core/analytics'
import { toast } from 'react-toastify'
import {
  openRazorpayCheckout,
  RazorpayReportedError,
} from '@repo/core/razorpay'
import {
  confirmPayment,
  FALLBACK_REFUND_MESSAGE,
  realClock,
} from '@repo/core/payment-confirmation'
import {
  bookAgainPath,
  canBookAgain,
  matchSavedAddress,
} from '@repo/core/book-again'
import { carWithGarage } from '@repo/core/pickup'
import { googleMapsLink } from '@repo/core/contact-links'
import { cn } from '@repo/core/utils'
import {
  finalBillMayChange,
  formatRupees,
  formatStepTime,
} from '@repo/core/job-records'
import {
  BANK_DAYS,
  customerRefundLine,
  withoutRefundPromise,
} from '@repo/core/refunds'
import {
  customerWaitingNote,
  notAcceptedRefundLine,
  notAcceptedTitle,
} from '@repo/core/response-deadline'
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
import {
  invalidateRewards,
  rewardsEnabled,
  useRewardsConfig,
  useRewardsSummary,
} from '@repo/core/api/hooks/use-rewards'
import {
  garageLive,
  useGaragePulls,
  useMarkGaragePullsSeen,
} from '@repo/core/api/hooks/use-garage'
import { PullReveal } from '@/components/garage/pull-reveal'
import { ScratchCardPanel } from '@/components/rewards/scratch-card'
import { useTravelTime } from '@repo/core/api/hooks/use-travel-time'
import {
  coarse,
  isStale,
  useLocationStore,
} from '@repo/core/stores/location-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useUserStore } from '@repo/core/stores/user-store'
import type { Booking, Review } from '@repo/core/types'
import {
  BookingDirectionsSheet,
  describeDrive,
} from '@/components/booking-directions-sheet'
import { FinalBillCard, type BillPayment } from '@/components/final-bill-card'
import { ExtraWorkCard } from '@/components/extra-work-card'
import { TimeProposalCard } from '@/components/time-proposal-card'
import { OtherGaragesCard } from '@/components/other-garages-card'
import { JobPhotosCard } from '@/components/job-photos-card'
import { CarConditionCard } from '@/components/car-condition-card'
import { GuaranteeCard } from '@/components/guarantee/guarantee-card'
import {
  PaymentReceivedPanel,
  paymentReceivedText,
} from '@/components/payment-received-panel'
import { PickupCodeCard, PickupTimeline } from '@/components/pickup-progress'
import { BypassReportLine } from '@/components/bypass/bypass-report-line'

// Sheets closed on arrival are loaded after the page, not with it: they are
// out of the first load's JavaScript, and on the page well before anyone can
// tap what opens them. Client-only, since closed they render nothing anyway.
const BookingHelpSheet = dynamic(
  () =>
    import('@/components/booking-help-sheet').then((m) => m.BookingHelpSheet),
  { ssr: false }
)

/** A booking the customer still has to get to, or is at. */
/**
 * What Cancel says about the money before it is confirmed. The part paid
 * with Detlio credit (0049) goes back to the credit, not the card, and the
 * bank's days are only about the rest; a booking paid wholly with credit
 * promises no bank refund.
 */
function cancelRefundNote(booking: Booking): string {
  const credit = Math.min(booking.creditPaid ?? 0, booking.servicePrice)
  const online = Math.round((booking.servicePrice - credit) * 100) / 100
  if (credit <= 0) {
    return `Our team will refund your payment to your original payment method within ${BANK_DAYS}.`
  }
  const creditLine = `${formatRupees(credit)} goes back to your Detlio credit.`
  if (online <= 0) return creditLine
  return `Our team will refund the ${formatRupees(online)} you paid online to your original payment method within ${BANK_DAYS}. ${creditLine}`
}

const OPEN_STATUSES: ReadonlySet<Booking['status']> = new Set([
  'pending',
  'confirmed',
  'in_progress',
])

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
    return {
      title: notAcceptedTitle(booking.vendorName),
      lines: line ? [line] : [],
    }
  }

  const withRefund = (lines: Array<string | null | undefined>) =>
    [...lines, refund].filter((line): line is string => Boolean(line))

  // The refund line is the one place the money is spoken about. A late
  // payment the garage could no longer take was cancelled with "Your payment
  // will be refunded." in its reason; next to the refund line that says it
  // twice, and once the refund is recorded the two contradict each other.
  const reason = refund
    ? withoutRefundPromise(booking.cancellationReason)
    : booking.cancellationReason

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
        lines: withRefund([
          'You cancelled this booking instead of picking another time.',
        ]),
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
      // The garage, never "vendor": the customer app's word for it (F10).
      title: 'Declined by the garage',
      lines: withRefund([reason ?? 'The garage could not take this booking.']),
    }
  }

  return {
    title:
      booking.cancelledBy === 'user' ? 'Cancelled by you' : 'Booking cancelled',
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
  // Detlio Rewards (0050): a scratch card waiting for this booking's chain.
  const rewardsConfig = useRewardsConfig()
  const rewardsSummary = useRewardsSummary(
    rewardsEnabled(rewardsConfig.data) && booking?.status === 'completed'
  )
  const waitingCard =
    booking && rewardsSummary.data
      ? (rewardsSummary.data.scratchCards.find(
          (card) =>
            card.bookingId === booking.id || card.rootBookingId === booking.id
        ) ?? null)
      : null
  // Kept once shown, so the prize stays on screen after the list refreshes
  // without it (it is no longer waiting): remembered during render.
  const [scratchCard, setScratchCard] = useState<typeof waitingCard>(null)
  if (waitingCard && waitingCard.id !== scratchCard?.id)
    setScratchCard(waitingCard)
  // 0057: this booking's Detlio Garage card, revealed here (face down until tapped).
  const garagePulls = useGaragePulls(
    garageLive(rewardsConfig.data) && booking?.status === 'completed'
  )
  const markPullSeen = useMarkGaragePullsSeen()
  const bookingPull =
    booking && garagePulls.data
      ? (garagePulls.data.pulls.find(
          (p) =>
            p.source === 'booking' &&
            (p.bookingId === booking.id || p.rootBookingId === booking.id)
        ) ?? null)
      : null
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
        then === 'pay' ||
        then === 'reschedule' ||
        then === 'help' ||
        then === 'times' ||
        then === 'extra'
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
  const [billPayments, setBillPayments] = useState<Record<string, BillPayment>>(
    {}
  )
  const recordBillPayment = (chargeId: string, payment: BillPayment) =>
    setBillPayments((current) => ({ ...current, [chargeId]: payment }))
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  // Opened on arrival when Home's "Change time" sent the customer here; the
  // sheet itself only shows while the booking can still be moved (below), so
  // a stale link opens nothing.
  const [showReschedule, setShowReschedule] = useState(
    arrival.then === 'reschedule'
  )
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
    storedLocation?.source === 'gps' && !isStale(storedLocation)
      ? coarse(storedLocation)
      : null
  // The booking flow lands here with ?celebrate=1 straight after payment.
  // Read once into state rather than watching the URL, so the burst plays a
  // single time and a refresh doesn't replay it (the param is stripped below).
  const [celebrating, setCelebrating] = useState(
    () => queryValue('celebrate') === '1'
  )

  // Only for Book again's address, so a failure just leaves it to checkout.
  const needsAddresses =
    !!booking &&
    booking.bookingType !== 'dropin' &&
    canBookAgain(booking) &&
    addresses.length === 0
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
    if (arrival.then === 'pay' && booking.finalBill?.status === 'due')
      scrollTo('final-bill')
    if (arrival.then === 'times' && booking.timeProposal?.status === 'open')
      scrollTo('time-proposal')
    if (
      arrival.then === 'extra' &&
      booking.extraWork.some((work) => work.state === 'awaiting')
    ) {
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
      window.history.replaceState(
        null,
        '',
        `${url.pathname}${url.search}${url.hash}`
      )
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
    paid?.phase === 'booked' ||
    (paid !== null && paid.phase !== 'confirming' && bookingPaid)
  const showPaymentPanel =
    !paymentSettled &&
    (paid?.phase === 'unconfirmed' || paid?.phase === 'failed')

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
              // Only with marketing consent; left out otherwise.
              const marketing = currentMarketingContext()
              await verifyPayment({
                bookingId: booking.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: paymentId,
                razorpaySignature: response.razorpay_signature,
                ...(marketing ? { marketing } : {}),
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
                    message:
                      fresh.cancellationReason ?? FALLBACK_REFUND_MESSAGE,
                  }
                : { kind: 'booked', bookingId: booking.id }
            },
            ...realClock,
          })

          if (outcome.kind === 'booked') {
            track('pay_success', {
              vendorId: booking.vendorId,
              mode: booking.bookingType,
              serviceCount: Math.min(20, Math.max(1, booking.items.length)),
              amountBucket: amountBucket(order.amount / 100),
            })
            // Meta's Purchase (marketing consent only), as at checkout.
            void trackPurchase({
              bookingId: booking.id,
              rupeesPaid: order.amount / 100,
              numItems: booking.items.length,
            })
            const updated = await getBooking(booking.id)
            if (updated) setBooking(updated)
            setPaid({ paymentId, phase: 'booked' })
            void invalidateHome(queryClient)
            toast.success('Payment successful')
          } else {
            if (outcome.kind === 'failed')
              track('pay_failed', {
                vendorId: booking.vendorId,
                mode: booking.bookingType,
              })
            setPaid({
              paymentId,
              phase: outcome.kind,
              refundMessage:
                outcome.kind === 'failed' ? outcome.message : undefined,
            })
          }
        },
        onDismiss: () => {
          toast.info(
            'Payment cancelled. You can pay anytime from booking details.'
          )
        },
        onFailure: (message) => {
          track('pay_failed', {
            vendorId: booking.vendorId,
            mode: booking.bookingType,
          })
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
      const updated = await cancelBooking(
        booking.id,
        cancelReason.trim() || undefined
      )
      setBooking(updated)
      setShowCancelConfirm(false)
      setCancelReason('')
      void invalidateHome(queryClient)
      // A reward voucher spent on it comes back (0050).
      void invalidateRewards(queryClient)
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
        toast.error(
          error instanceof Error ? error.message : 'Failed to cancel booking'
        )
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
      toast.success(
        `New time sent to ${booking.vendorName}. Waiting for them to accept.`
      )
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
      toast.error(
        error instanceof Error ? error.message : 'Failed to reschedule booking'
      )
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
      toast.error(
        error instanceof Error ? error.message : 'Failed to submit review'
      )
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
    ((garage.lat !== null && garage.lng !== null) ||
      !!garage.address ||
      !!googleMapsLink(garage.mapsUrl))
  const gettingThere =
    booking?.bookingType === 'dropin' &&
    OPEN_STATUSES.has(booking.status) &&
    findable
      ? garage
      : undefined
  const travel = useTravelTime(
    gettingThere ? gpsHere : null,
    gettingThere ? { lat: gettingThere.lat, lng: gettingThere.lng } : null
  )

  if (loadError) {
    return (
      <CustomerShell showNav className="py-2">
        <PageHeader title="Booking" />
        <p className="pt-4 text-[15px] text-text-secondary">
          Could not load this booking. It may have been removed or you may not
          have access.
        </p>
      </CustomerShell>
    )
  }

  if (!booking) {
    return (
      <CustomerShell showNav className="gap-4 py-2">
        <PageHeader title="Booking" />
        <div aria-busy="true" className="flex flex-col gap-3">
          <div className="h-[132px] rounded-card shimmer" />
          <div className="h-[220px] rounded-card shimmer" />
        </div>
      </CustomerShell>
    )
  }

  const cancelled =
    booking.status === 'cancelled' ? cancelledPanel(booking) : null
  // An accepted booking can't be cancelled or moved under 2 hours out (the
  // server's CANCELLATION_CUTOFF_MS); a pending one can, any time.
  const lockedIn =
    booking.status === 'confirmed' &&
    new Date(booking.scheduledAtIso).getTime() - now <
      CONFIRMED_CHANGE_CUTOFF_MINS * 60_000
  // Paying sends a request; only the garage's accept confirms it. Celebrating
  // a "confirmed" booking that the garage then declines teaches customers not
  // to believe this screen, so the moment says exactly what happened.
  const awaitingGarage = booking.status === 'pending'
  // A choice of other times from the garage (0041) is the garage's answer.
  const timeProposal =
    booking.timeProposal?.status === 'open' ? booking.timeProposal : null
  // Still pending at its start time: the garage can no longer accept it.
  const missedByGarage =
    booking.status === 'pending' &&
    new Date(booking.scheduledAtIso).getTime() <= now &&
    !timeProposal
  // A final bill with a balance, extra work waiting for approval, or a choice
  // of times: each is the thing to do here, and carries the page's one red
  // button (F8), so nothing else is red while it shows.
  const billDue =
    (booking.finalBill?.status === 'due' && booking.status !== 'cancelled') ||
    (['confirmed', 'in_progress'].includes(booking.status) &&
      booking.extraWork.some((work) => work.state === 'awaiting')) ||
    timeProposal !== null
  const unpaid =
    !paid &&
    booking.paymentMethod === 'online' &&
    booking.paymentStatus === 'pending' &&
    booking.status !== 'cancelled'
  // When each step happened, under the step. An older booking has none.
  const stepTime = (iso: string | undefined) =>
    iso ? formatStepTime(iso, now) : undefined
  const isPickup = booking.bookingType === 'pickup'
  // Pickup & drop, from Picked up on: the car is with the garage, and the
  // customer can no longer cancel or move the booking in the app (409
  // CAR_WITH_GARAGE). Help is the way to reach anyone.
  const carAway = carWithGarage(booking)
  // While the garage's suggested times wait for an answer, that card is the
  // way to move or cancel.
  const canChange =
    ['pending', 'confirmed'].includes(booking.status) &&
    !carAway &&
    !timeProposal
  const headline = bookingHeadline(booking, now)
  const statusTitle = cancelled ? cancelled.title : headline.title
  const showProgress =
    booking.status !== 'rescheduled' &&
    booking.status !== 'cancelled' &&
    !missedByGarage
  // The garage's phone and WhatsApp ride on the booking only inside the
  // contact window (the server decides); then calling is a row on the page,
  // not only inside Help (F8).
  const contactGarage = booking.garage
  const contactOpen =
    !['cancelled', 'rescheduled'].includes(booking.status) &&
    contactWindowState(booking.contactWindow, now) === 'open'
  const garageCall = contactOpen ? telHref(contactGarage?.phone) : null
  const garageMessage = `Hi, this is about my Detlio booking #${bookingReference(booking.id)} with you for ${booking.scheduledAt}.`
  const garageWhatsApp = contactOpen
    ? (whatsAppHref(contactGarage?.whatsapp, garageMessage) ??
      whatsAppHref(contactGarage?.phone, garageMessage))
    : null
  const finished = booking.status === 'completed'

  return (
    <CustomerShell showNav className="gap-4 py-2">
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

      <PageHeader title={`Booking #${bookingReference(booking.id)}`} />

      {/* Status first (F3): where the booking stands in plain words, the
          time that matters, and a thin four-step bar. The full timeline is
          further down for the curious. */}
      <section
        aria-labelledby="booking-status"
        className="flex flex-col gap-1 pb-1"
      >
        {/* Who, how and which car: a small heading, so the garage's name
            is a landmark on the page as it was. */}
        <h2 className="text-[13px] font-normal text-dim">
          {[
            booking.vendorName,
            BOOKING_TYPE_LABELS[booking.bookingType],
            booking.vehicle?.model,
          ]
            .filter(Boolean)
            .join(' · ')}
        </h2>
        <h2
          id="booking-status"
          className="text-[28px] leading-[1.12] font-light tracking-[-0.025em] text-text-primary"
        >
          {statusTitle}
        </h2>
        {cancelled
          ? cancelled.lines.map((line) => (
              <p key={line} className="text-[15px] text-text-secondary">
                {line}
              </p>
            ))
          : headline.detail && (
              <p className="text-[15px] text-text-secondary">
                {headline.detail}
              </p>
            )}
        {awaitingGarage &&
          booking.paymentStatus === 'paid' &&
          !timeProposal &&
          !missedByGarage &&
          customerWaitingNote(booking.responseDeadline, now) && (
            <p className="text-[13px] text-dim">
              {customerWaitingNote(booking.responseDeadline, now)}
            </p>
          )}
        {missedByGarage && (
          <p className="text-[15px] text-text-secondary">
            Your booking time has passed without the garage accepting, so this
            booking won&apos;t go ahead. Cancel it or pick a new time below, or
            use Help with this booking about your payment.
          </p>
        )}
        {booking.status === 'rescheduled' && (
          <p className="text-[15px] text-text-secondary">
            This booking was moved to a new time. Open your bookings to see the
            new one and whether the garage has accepted it.
          </p>
        )}
        {headline.step !== null && showProgress && (
          <div aria-hidden className="mt-3">
            <div className="grid grid-cols-4 gap-1.5">
              {STATUS_STEPS.map((step, i) => (
                <span
                  key={step}
                  className={cn(
                    'h-[3px] rounded-full',
                    i <= headline.step! ? 'bg-text-primary' : 'bg-white/[0.12]'
                  )}
                />
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5 text-[12px]">
              {STATUS_STEPS.map((step, i) => (
                <span
                  key={step}
                  className={cn(
                    i === 3 && 'text-right',
                    i === headline.step ? 'text-text-primary' : 'text-dim'
                  )}
                >
                  {step}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ─── What needs the customer, right under the status ─────────────── */}

      {/* The garage can't do the booked time and suggested others. */}
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
            void getBooking(booking.id).then(
              (fresh) => fresh && setBooking(fresh)
            )
          }}
        />
      )}

      {/* The handover code: what the customer needs at the door. */}
      {isPickup && !missedByGarage && <PickupCodeCard booking={booking} />}

      {/* A payment for a bill that no longer stands. Its card has gone; what
          happened to the money has not. */}
      {Object.entries(billPayments)
        .filter(
          ([chargeId, payment]) =>
            chargeId !== booking.finalBill?.id && payment.phase !== 'paid'
        )
        .map(([chargeId, payment]) => (
          <ScCard key={chargeId} className="flex flex-col gap-3">
            <h2 className="text-[17px] font-medium text-text-primary">
              Your earlier bill payment
            </h2>
            {payment.phase === 'confirming' ? (
              <p
                role="status"
                className="flex items-center gap-2 text-[15px] text-text-primary"
              >
                <IconLoader2
                  size={16}
                  className="shrink-0 animate-spin"
                  aria-hidden="true"
                />
                Payment received — confirming…
              </p>
            ) : (
              <PaymentReceivedPanel
                paymentId={payment.paymentId}
                refundMessage={
                  payment.phase === 'failed' ? payment.refundMessage : undefined
                }
                waitingOn="bill_not_marked_paid"
              />
            )}
          </ScCard>
        ))}

      {/* Keyed by the bill: a replaced bill is a new one to read and pay. On
          a cancelled booking only a bill already paid stays. */}
      {booking.finalBill &&
        (booking.status !== 'cancelled' ||
          booking.finalBill.status === 'paid') && (
          <FinalBillCard
            key={booking.finalBill.id}
            booking={booking}
            bill={booking.finalBill}
            payment={billPayments[booking.finalBill.id]}
            onPayment={recordBillPayment}
            onUpdated={(updated) => {
              setBooking(updated)
              void invalidateHome(queryClient)
            }}
            customer={{ name: profile?.name, phone: profile?.phone }}
          />
        )}

      {/* Extra work the garage asked for: approve and pay, or say no. */}
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

      {/* An unpaid booking (pay later): paying is the page's one action. */}
      {unpaid && (
        <MainAction
          disabled={paying}
          onClick={handlePayNow}
          className="h-[52px] rounded-full py-0 text-[15px] font-medium"
          heroIcon={
            !paying && <IconArrowUpRight size={17} stroke={1.5} aria-hidden />
          }
        >
          {paying ? (
            'Opening payment...'
          ) : (
            <>
              Pay{' '}
              <span className="font-numeric">
                {money(booking.servicePrice)}
              </span>
            </>
          )}
        </MainAction>
      )}

      {paid?.phase === 'confirming' && (
        // Graphite with a spinner, not the red pill: red means "this pays".
        <ScButton
          disabled
          className="flex h-[52px] items-center justify-center gap-2 rounded-full bg-surface-elevated py-0 text-[15px] font-medium text-text-primary ring-1 ring-inset ring-border hover:bg-surface-elevated disabled:cursor-wait disabled:opacity-100"
        >
          <IconLoader2
            size={16}
            className="shrink-0 animate-spin"
            aria-hidden="true"
          />
          Payment received — confirming your booking…
        </ScButton>
      )}

      {showPaymentPanel && paid && (
        <ScCard>
          <PaymentReceivedPanel
            paymentId={paid.paymentId}
            refundMessage={
              paid.phase === 'failed' ? paid.refundMessage : undefined
            }
            waitingOn="not_marked_paid"
          />
        </ScCard>
      )}

      {/* A finished job: the rating first, one tap on a star to start (F8),
          then Book again as the page's red button. */}
      {finished && (
        // #rate: Home's "Rate your wash" stars land here, the rating chosen.
        <ScCard id="rate" className="scroll-mt-4">
          <h2 className="mb-3 text-[17px] font-medium text-text-primary">
            {submittedReview ? 'Your review' : 'How was it?'}
          </h2>
          {submittedReview ? (
            <div className="flex flex-col gap-2">
              <Stars rating={submittedReview.rating} size={18} />
              <p className="text-[15px] text-text-secondary">
                Thanks for your review.
              </p>
              {submittedReview.comment && (
                <p className="text-[15px] text-text-primary">
                  {submittedReview.comment}
                </p>
              )}
            </div>
          ) : (
            <>
              <Stars
                rating={rating}
                interactive
                value={rating}
                onChange={setRating}
                size={28}
              />
              {rating > 0 && (
                <div className="rise-in mt-3 flex flex-col gap-3">
                  <ScInput
                    aria-label="Tell us about your experience"
                    placeholder="Tell us about your experience"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  {/* Outlined: Book again (or a bill) carries the red. */}
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleSubmitReview}
                    className="press flex h-[52px] w-full items-center justify-center rounded-pill border border-stroke text-[15px] font-medium text-text-primary disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit review'}
                  </button>
                </div>
              )}
            </>
          )}
        </ScCard>
      )}

      {finished && canBookAgain(booking) && !billDue && (
        <ScButtonLink
          href={bookAgainPath(booking, matchSavedAddress(booking, addresses))}
          variant="hero"
          fullWidth
        >
          <span>Book again</span>
          <IconArrowUpRight size={17} stroke={1.5} aria-hidden />
        </ScButtonLink>
      )}

      {/* Detlio Guarantee (0051): "Not happy?" inside its 48 hours. */}
      <GuaranteeCard booking={booking} />

      {/* Detlio Rewards (0050): the scratch card this job earned. */}
      {finished && scratchCard && (
        <section aria-labelledby="scratch-card" className="flex flex-col gap-2">
          <h2
            id="scratch-card"
            className="text-[17px] font-medium text-text-primary"
          >
            You earned a stamp and a scratch card
          </h2>
          <ScratchCardPanel card={scratchCard} compact />
        </section>
      )}

      {/* The Detlio Garage (0057): the card this job earned. */}
      {finished && bookingPull && (
        <section aria-labelledby="garage-card" className="flex flex-col gap-2">
          <h2
            id="garage-card"
            className="text-[17px] font-medium text-text-primary"
          >
            A new car for your Garage
          </h2>
          <PullReveal
            pull={bookingPull}
            onRevealed={() =>
              !bookingPull.seen && markPullSeen.mutate([bookingPull.id])
            }
          />
        </section>
      )}

      <JobPhotosCard photos={booking.jobPhotos} completed={finished} />

      {/* The customer's own photos of their car (0045). */}
      <CarConditionCard
        booking={booking}
        onChanged={async () => {
          const fresh = await getBooking(booking.id).catch(() => null)
          if (fresh) setBooking(fresh)
        }}
      />

      {/* ─── The details, as short rows (F3) ───────────────────────────── */}
      <section
        aria-label="Booking details"
        className="hub-card flex flex-col px-5"
      >
        <Row
          label={
            booking.items.length > 1
              ? 'Services'
              : (booking.items[0]?.name ?? 'Service')
          }
        >
          {booking.items.length > 1 ? (
            <span className="flex flex-col items-end gap-0.5 text-right">
              {booking.items.map((item) => (
                <span key={item.id}>
                  {item.name}{' '}
                  <span className="font-numeric">{money(item.amount)}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="font-numeric">
              {money(booking.items[0]?.amount ?? booking.subtotalPrice)}
            </span>
          )}
        </Row>
        {booking.discountAmount > 0 && (
          <Row
            label={`Discount${booking.discountCode ? ` (${booking.discountCode})` : ''}`}
          >
            <span className="font-numeric text-success">
              −{money(booking.discountAmount)}
            </span>
          </Row>
        )}
        <Row
          label={
            booking.paymentStatus === 'paid'
              ? (booking.creditPaid ?? 0) >= booking.servicePrice
                ? 'Paid'
                : 'Paid online'
              : booking.paymentStatus === 'refunded'
                ? 'Refunded'
                : booking.paymentMethod === 'online'
                  ? 'To be paid online'
                  : 'Cash'
          }
        >
          <span className="font-numeric">{money(booking.servicePrice)}</span>
        </Row>
        {/* Gift a wash (0049): the part Detlio credit paid. */}
        {(booking.creditPaid ?? 0) > 0 && (
          <Row label="Paid with Detlio credit">
            <span className="font-numeric">
              {money(booking.creditPaid ?? 0)}
            </span>
          </Row>
        )}
        <Row label="When">{formatWhen(booking.scheduledAtIso, now)}</Row>
        <Row label={isPickup ? 'Collected from' : 'Where'}>
          {/* Where the garage comes to (or collects from), so a wrong
              address is caught before anyone sets off. */}
          {booking.jobLocation?.address ??
            ([contactGarage?.address, contactGarage?.city]
              .filter(Boolean)
              .join(', ') ||
              BOOKING_TYPE_LABELS[booking.bookingType])}
        </Row>
        {booking.vehicle && (
          <Row label="Car">
            {booking.vehicle.make} {booking.vehicle.model}
          </Row>
        )}
        {/* Once a payment has gone through (refunded since or not). A link,
            not a button: the receipt is a record, not a next step. */}
        <Row label="Receipt" last>
          {booking.receiptAvailable ? (
            <Link
              href={`/bookings/${booking.id}/receipt`}
              className="-my-2 inline-flex min-h-11 items-center gap-0.5 text-text-primary"
            >
              View receipt
              <IconChevronRight size={16} stroke={1.5} aria-hidden />
            </Link>
          ) : (
            <span className="text-dim">After payment</span>
          )}
        </Row>
      </section>

      {/* Getting to the garage, for a job at the garage that is still on. */}
      {gettingThere && !missedByGarage && (
        <ScCard className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium text-text-primary">
              Getting there
            </h2>
            {gettingThere.address && (
              <p className="mt-0.5 text-[13px] text-text-secondary">
                {[gettingThere.address, gettingThere.city]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
            {travel.data && (
              <p className="mt-1 text-[13px] text-text-secondary">
                {describeDrive(travel.data).atGarage ? (
                  "You're at the garage."
                ) : (
                  <>
                    <span className="font-numeric text-text-primary">
                      {describeDrive(travel.data).time}
                    </span>{' '}
                    drive from you
                  </>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowDirections(true)}
            className="press flex h-11 shrink-0 items-center gap-1.5 rounded-pill border border-stroke px-4 text-[15px] text-text-primary"
          >
            <IconNavigation size={16} aria-hidden />
            Directions
          </button>
        </ScCard>
      )}

      {/* Reaching people: the garage directly during the contact window,
          and Help (F8). */}
      <section aria-label="Contact" className="hub-card flex flex-col px-5">
        {garageCall && (
          <a
            href={garageCall}
            className="flex min-h-[56px] items-center justify-between gap-3 border-b border-line text-[15px] text-text-primary"
          >
            Call {booking.vendorName}
            <IconChevronRight
              size={16}
              stroke={1.5}
              aria-hidden
              className="text-dim"
            />
          </a>
        )}
        {garageWhatsApp && (
          <a
            href={garageWhatsApp}
            target="_blank"
            rel="noopener"
            className="flex min-h-[56px] items-center justify-between gap-3 border-b border-line text-[15px] text-text-primary"
          >
            WhatsApp the garage
            <IconChevronRight
              size={16}
              stroke={1.5}
              aria-hidden
              className="text-dim"
            />
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            setShowHelp(true)
            track('help_view', { step: 'booking' })
          }}
          className="flex min-h-[56px] items-center justify-between gap-3 text-left text-[15px] text-text-primary"
        >
          Help with this booking
          <IconChevronRight
            size={16}
            stroke={1.5}
            aria-hidden
            className="text-dim"
          />
        </button>
      </section>

      {/* "Did the garage ask you to book directly?" (0052): a quiet line. */}
      <BypassReportLine booking={booking} />

      {/* Money coming back on a booking that is still on: a payment that
          landed on a final bill the garage replaced. */}
      {!cancelled && customerRefundLine(booking.refund, 'earlier_bill') && (
        <ScCard>
          <h2 className="mb-1 text-[15px] font-medium text-text-primary">
            Refund
          </h2>
          <p className="text-[15px] text-text-secondary">
            {customerRefundLine(booking.refund, 'earlier_bill')}
          </p>
        </ScCard>
      )}

      {/* Not accepted in time (0042): somewhere else to book, same type. */}
      {booking.status === 'cancelled' && booking.notAcceptedInTime && (
        <OtherGaragesCard booking={booking} />
      )}

      {/* A cancelled job: the same booking again, quietly. */}
      {!finished && canBookAgain(booking) && (
        <ScButtonLink
          href={bookAgainPath(booking, matchSavedAddress(booking, addresses))}
          variant="secondary"
          fullWidth
          className="flex h-[52px] items-center justify-center gap-2 rounded-pill border-stroke py-0 text-[15px] font-medium"
        >
          <IconRepeat size={18} aria-hidden />
          Book again
        </ScButtonLink>
      )}

      {/* Says each step after payment out loud. */}
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

      {/* Pickup & drop once collected: no Reschedule or Cancel, and why. */}
      {carAway && OPEN_STATUSES.has(booking.status) && (
        <ScCard>
          <h2 className="mb-1 text-[15px] font-medium text-text-primary">
            Your car is with the garage
          </h2>
          <p className="text-[15px] text-text-secondary">
            {booking.vendorName} has collected your car, so this booking
            can&apos;t be cancelled or moved in the app. To change anything, or
            if something isn&apos;t right, use Help with this booking to reach
            the garage or our team, or raise a complaint there.
          </p>
        </ScCard>
      )}

      {/* Changing it: Reschedule as an outlined pill, Cancel as an amber
          text action behind a confirm step (F5, F8). */}
      {canChange && (
        <section
          aria-label="Change this booking"
          className="hub-card flex flex-col gap-3 p-5"
        >
          <p className="text-[13px] text-text-secondary">
            {lockedIn
              ? `Your slot is less than 2 hours away, so it can't be moved here. Use Help with this booking to reach ${booking.vendorName} or our team.`
              : booking.status === 'confirmed'
                ? `You can reschedule twice in all · ${booking.remainingReschedules} of 2 left. Your booking goes back to Requested until ${booking.vendorName} accepts the new time.`
                : `You can reschedule twice in all · ${booking.remainingReschedules} of 2 left. ${booking.vendorName} will need to accept the new time.`}
            {isPickup &&
              !lockedIn &&
              ' You can move it until the garage collects your car.'}
          </p>
          <button
            type="button"
            disabled={booking.remainingReschedules <= 0 || lockedIn}
            onClick={() => {
              setRescheduleSlot(null)
              setShowReschedule(true)
            }}
            className="press flex h-[52px] w-full items-center justify-center rounded-pill border border-stroke text-[15px] font-medium text-text-primary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-elevated disabled:text-text-muted"
          >
            {booking.remainingReschedules <= 0
              ? 'No reschedules left'
              : lockedIn
                ? 'Too close to your slot to move'
                : 'Reschedule'}
          </button>

          {lockedIn ? (
            // Shown instead of a control the server would refuse.
            <p className="text-[13px] text-text-secondary">
              Your slot is less than 2 hours away and {booking.vendorName} has
              accepted it, so it can&apos;t be cancelled here. Use Help with
              this booking to reach the garage or our team.
            </p>
          ) : showCancelConfirm ? (
            <div className="rise-in flex flex-col gap-3 border-t border-line pt-3">
              <p className="text-[15px] text-text-primary">
                {booking.status === 'pending'
                  ? `${booking.vendorName} hasn't accepted yet, so you can cancel any time. This cannot be undone.`
                  : 'Cancel this booking? This cannot be undone.'}
              </p>
              <ScInput
                placeholder="Reason (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              {booking.paymentMethod === 'online' &&
                booking.paymentStatus === 'paid' && (
                  <p className="text-[13px] text-text-muted">
                    {cancelRefundNote(booking)}
                  </p>
                )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => setShowCancelConfirm(false)}
                  className="press flex h-[52px] flex-1 items-center justify-center rounded-pill border border-stroke text-[15px] font-medium text-text-primary disabled:opacity-50"
                >
                  Keep booking
                </button>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={handleCancelBooking}
                  className="press flex h-[52px] flex-1 items-center justify-center rounded-pill border border-error/50 text-[15px] font-medium text-error disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling...' : 'Confirm cancel'}
                </button>
              </div>
            </div>
          ) : (
            // Amber text: cancelling is not what this screen wants pressed.
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="min-h-11 w-full text-center text-[15px] font-medium text-error"
            >
              Cancel booking
            </button>
          )}
        </section>
      )}

      {/* The full timeline, for the curious: when each step happened. */}
      {showProgress && (
        <ScCard>
          <h2 className="mb-3 text-[15px] font-medium text-text-primary">
            Progress
          </h2>
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
        </ScCard>
      )}

      {gettingThere && (
        <BookingDirectionsSheet
          open={showDirections}
          onClose={() => setShowDirections(false)}
          booking={booking}
        />
      )}
      <BookingHelpSheet
        open={showHelp}
        onClose={() => setShowHelp(false)}
        booking={booking}
      />

      {/* Not dismissible while the reschedule is in flight. */}
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
          <h2 className="text-[20px] font-normal tracking-[-0.015em] text-text-primary">
            Reschedule booking
          </h2>
          <p className="mb-4 mt-1 text-[13px] text-text-secondary">
            You can reschedule only twice · {booking.remainingReschedules} of 2
            left. Pick a new time; {booking.vendorName} will be asked to accept
            it.
          </p>
          <WhenPicker
            title="New time"
            vendorId={booking.vendorId}
            // Every service on the booking: a move has to fit the whole job.
            serviceIds={booking.items.map((item) => item.serviceId)}
            value={rescheduleSlot}
            onChange={setRescheduleSlot}
            onLapse={() =>
              toast.info(
                'That time is now too soon to book. Pick another time.'
              )
            }
            bookingType={booking.bookingType}
            // Its own time does not count against the garage.
            rescheduleOf={booking.id}
          />
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              disabled={rescheduling}
              onClick={() => setShowReschedule(false)}
              className="press flex h-[52px] flex-1 items-center justify-center rounded-pill border border-stroke text-[15px] font-medium text-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
            {/* The sheet's one action: red once a time is picked, grey until
                then (F5's "not ready yet"). */}
            <ScButton
              variant={rescheduleSlot ? 'hero' : 'secondary'}
              disabled={!rescheduleSlot || rescheduling}
              onClick={handleReschedule}
              className="h-[52px] flex-1 rounded-pill py-0 text-[15px] font-medium disabled:opacity-100 disabled:border-transparent disabled:bg-surface-elevated disabled:text-text-muted"
            >
              <span>
                {rescheduling ? 'Rescheduling...' : 'Confirm reschedule'}
              </span>
            </ScButton>
          </div>
        </div>
      </ScSheet>
    </CustomerShell>
  )
}

/** One short row of the details card: a label on the left, the value right. */
function Row({
  label,
  children,
  last = false,
}: {
  label: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className={cn(
        'flex min-h-[56px] items-center justify-between gap-4 py-3 text-[15px]',
        !last && 'border-b border-line'
      )}
    >
      <span className="shrink-0 text-text-primary">{label}</span>
      <span className="min-w-0 text-right text-text-secondary">{children}</span>
    </div>
  )
}
