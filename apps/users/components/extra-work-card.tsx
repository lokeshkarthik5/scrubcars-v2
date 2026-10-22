'use client'

import { useRef, useState } from 'react'
import { IconArrowUpRight, IconCircleCheck, IconLoader2, IconTool } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { getBooking } from '@repo/core/api/bookings'
import { ApiError } from '@repo/core/api/client'
import { declineExtraWork, payFinalBill, verifyExtraWorkPayment } from '@repo/core/api/job-records'
import { formatRupees } from '@repo/core/job-records'
import { confirmPayment, extraWorkPollResult, realClock } from '@repo/core/payment-confirmation'
import { openRazorpayCheckout, RazorpayReportedError } from '@repo/core/razorpay'
import type { Booking, ExtraWork } from '@repo/core/types'
import { APP_TIMEZONE } from '@repo/core/utils'
import { MainAction } from '@/components/main-action'
import { PaymentReceivedPanel, paymentReceivedText } from '@/components/payment-received-panel'

function paidOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: APP_TIMEZONE })
}

/** Where paying one request stands once Razorpay has reported it paid. */
interface WorkPayment {
  paymentId: string
  phase: 'confirming' | 'paid' | 'unconfirmed' | 'failed'
  refundMessage?: string
}

const STATE_LINE: Record<Exclude<ExtraWork['state'], 'awaiting'>, string> = {
  paid: 'Approved and paid',
  declined: 'You declined it',
  withdrawn: 'The garage withdrew it',
  closed: 'Closed with the booking',
}

interface ExtraWorkCardProps {
  booking: Booking
  /** The booking as it reads after a payment or a decline, to replace the page's copy. */
  onUpdated: (booking: Booking) => void
  /** The profile, for Razorpay's prefill. */
  customer?: { name?: string; phone?: string }
}

/**
 * Extra work the garage asked for mid-job (0041): what, the photos, the
 * price. "Approve & pay" is the approval — paid here like the booking was,
 * through the same order and confirm as a final bill, so a dropped
 * connection ends in "we have your payment", never a second charge. Decline
 * tells the garage. Answered ones stay listed, with where they stand.
 */
export function ExtraWorkCard({ booking, onUpdated, customer }: ExtraWorkCardProps) {
  const [payments, setPayments] = useState<Record<string, WorkPayment>>({})
  const [opening, setOpening] = useState<string | null>(null)
  const [declining, setDeclining] = useState<string | null>(null)
  // Ids Razorpay reported paid: never offered again, whatever happens next.
  const paidRef = useRef(new Set<string>())
  const record = (id: string, payment: WorkPayment) => setPayments((current) => ({ ...current, [id]: payment }))

  const awaiting = booking.extraWork.filter((work) => work.state === 'awaiting')
  // Only the first waiting request carries the red pill; the rest are outlined.
  const firstAwaiting = awaiting[0]?.id

  const handlePay = async (work: ExtraWork) => {
    if (opening || paidRef.current.has(work.id) || payments[work.id]) return
    setOpening(work.id)
    try {
      const order = await payFinalBill(booking.id, work.id)
      await openRazorpayCheckout({
        order,
        description: `Extra work at ${booking.vendorName}`,
        customer,
        onSuccess: async (response) => {
          const paymentId = response.razorpay_payment_id
          paidRef.current.add(work.id)
          record(work.id, { paymentId, phase: 'confirming' })

          const outcome = await confirmPayment({
            verify: async () => {
              await verifyExtraWorkPayment(booking.id, work.id, {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: paymentId,
                razorpaySignature: response.razorpay_signature,
              })
              return { bookingId: booking.id }
            },
            poll: async () => {
              const fresh = await getBooking(booking.id)
              if (!fresh) return { kind: 'pending' }
              return extraWorkPollResult(booking.id, work.id, fresh.extraWork, fresh.status)
            },
            ...realClock,
          })

          if (outcome.kind === 'booked') {
            const updated = await getBooking(booking.id)
            if (updated) onUpdated(updated)
            record(work.id, { paymentId, phase: 'paid' })
            toast.success(`Approved. ${booking.vendorName} can go ahead.`)
          } else {
            record(work.id, {
              paymentId,
              phase: outcome.kind,
              refundMessage: outcome.kind === 'failed' ? outcome.message : undefined,
            })
            if (outcome.kind === 'failed') toast.error(outcome.message)
          }
        },
        onDismiss: () => {
          toast.info('Payment cancelled. You can approve it any time from this page.')
        },
        onFailure: (message) => {
          toast.error(message)
        },
      })
    } catch (error) {
      if (!(error instanceof RazorpayReportedError) && error instanceof Error) {
        toast.error(error.message)
        if (error instanceof ApiError && error.code === 'EXTRA_WORK_CLOSED') {
          const fresh = await getBooking(booking.id)
          if (fresh) onUpdated(fresh)
        }
      }
    } finally {
      setOpening(null)
    }
  }

  const handleDecline = async (work: ExtraWork) => {
    if (declining || opening) return
    setDeclining(work.id)
    try {
      await declineExtraWork(booking.id, work.id)
      toast.success(`Declined. ${booking.vendorName} can see your answer.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    } finally {
      const fresh = await getBooking(booking.id)
      if (fresh) onUpdated(fresh)
      setDeclining(null)
    }
  }

  if (booking.extraWork.length === 0) return null

  return (
    // #extra-work: Home's "Review ₹X" lands here (/bookings/:id?then=extra).
    <ScCard id="extra-work" className="flex scroll-mt-4 flex-col gap-4 px-4 py-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <IconTool size={18} stroke={1.5} aria-hidden className="text-text-secondary" />
          Extra work
        </h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          Asked for by {booking.vendorName}. Nothing is done or charged unless you approve and pay here.
        </p>
      </div>

      {booking.extraWork.map((work) => {
        const payment = payments[work.id]
        const settled = work.state === 'paid' || payment?.phase === 'paid'
        const showPanel = !settled && (payment?.phase === 'unconfirmed' || payment?.phase === 'failed')
        const open = work.state === 'awaiting' && !payment && extraWorkOpen(booking)
        return (
          <article
            key={work.id}
            aria-label={`Extra work: ${work.description}`}
            className="flex flex-col gap-2.5 border-t border-border pt-3 first-of-type:border-t-0 first-of-type:pt-0"
          >
            {work.photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {work.photos.map((photo, index) => (
                  <a
                    key={photo.url}
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open photo ${index + 1} of ${work.photos.length} of ${work.description}`}
                    className="shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- R2 photo, sized here */}
                    <img
                      src={photo.url}
                      alt=""
                      className="size-24 rounded-[10px] border border-border object-cover"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            )}

            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-[14px] font-medium text-text-primary">{work.description}</p>
              <span className="shrink-0 font-numeric text-[15px] font-bold text-text-primary">
                {formatRupees(work.amount)}
              </span>
            </div>
            {work.note && (
              <p className="text-[12px] text-text-secondary">
                <span className="font-medium text-text-primary">Garage&apos;s note:</span> {work.note}
              </p>
            )}

            <p role="status" className="sr-only">
              {payment?.phase === 'confirming'
                ? 'Payment received. Confirming the extra work.'
                : settled && payment
                  ? 'Extra work approved and paid.'
                  : showPanel && payment
                    ? paymentReceivedText(payment.paymentId, payment.refundMessage, 'bill_not_marked_paid')
                    : ''}
            </p>

            {settled ? (
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-success">
                <IconCircleCheck size={16} aria-hidden />
                Approved and paid on{' '}
                <span className="font-numeric">{paidOn(work.paidAt ?? new Date().toISOString())}</span>
              </p>
            ) : payment?.phase === 'confirming' ? (
              <ScButton
                disabled
                className="flex items-center justify-center gap-2 rounded-full bg-surface-elevated py-4 text-[15px] text-text-primary ring-1 ring-inset ring-border hover:bg-surface-elevated disabled:cursor-wait disabled:opacity-100"
              >
                <IconLoader2 size={16} className="shrink-0 animate-spin" aria-hidden="true" />
                Payment received — confirming…
              </ScButton>
            ) : showPanel && payment ? (
              <PaymentReceivedPanel
                paymentId={payment.paymentId}
                refundMessage={payment.phase === 'failed' ? payment.refundMessage : undefined}
                waitingOn="bill_not_marked_paid"
              />
            ) : open ? (
              <div className="flex flex-col gap-2">
                {work.id === firstAwaiting ? (
                  <MainAction
                    disabled={opening !== null || declining !== null}
                    onClick={() => handlePay(work)}
                    className="rounded-full py-4 text-[15px]"
                    heroIcon={opening !== work.id && <IconArrowUpRight size={17} stroke={1.5} aria-hidden />}
                  >
                    {opening === work.id ? (
                      'Opening payment...'
                    ) : (
                      <>
                        Approve &amp; pay <span className="font-numeric font-bold">{formatRupees(work.amount)}</span>
                      </>
                    )}
                  </MainAction>
                ) : (
                  <ScButton
                    variant="secondary"
                    disabled={opening !== null || declining !== null}
                    onClick={() => handlePay(work)}
                  >
                    {opening === work.id ? (
                      'Opening payment...'
                    ) : (
                      <>
                        Approve &amp; pay <span className="font-numeric font-bold">{formatRupees(work.amount)}</span>
                      </>
                    )}
                  </ScButton>
                )}
                <ScButton
                  variant="secondary"
                  disabled={opening !== null || declining !== null}
                  onClick={() => handleDecline(work)}
                  aria-label={`Decline ${work.description}`}
                >
                  {declining === work.id ? 'Declining...' : 'Decline'}
                </ScButton>
              </div>
            ) : work.state !== 'awaiting' ? (
              <p className="text-[13px] text-text-secondary">{STATE_LINE[work.state]}</p>
            ) : null}
          </article>
        )
      })}
    </ScCard>
  )
}

/** Extra work can be answered while the job is on (accepted or under way). */
function extraWorkOpen(booking: Booking): boolean {
  return booking.status === 'confirmed' || booking.status === 'in_progress'
}
