'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { IconAlertCircle, IconBrandWhatsapp } from '@tabler/icons-react'
import { paymentHelpMessage, type PaymentHelpSituation } from '@repo/core/payment-confirmation'
import { supportWhatsAppHref } from '@repo/core/support'

const SECONDARY =
  'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-medium text-text-primary transition-colors'

interface PaymentReceivedPanelProps {
  /** Razorpay's payment id: the one thing the team needs to find it. */
  paymentId: string
  /**
   * Set when the payment landed but no booking could be written: the server's
   * words, which say it will be refunded. Unset while the booking is simply
   * not confirmed yet.
   */
  refundMessage?: string
  /**
   * What the customer is waiting on, for the WhatsApp message they send us.
   * Checkout waits on a booking; the Pay Now page waits on an existing
   * booking showing as paid. The refund case is taken from `refundMessage`.
   */
  waitingOn?: Exclude<PaymentHelpSituation, 'refund'>
}

/**
 * What the panel says, as one sentence. Also what the page's status region
 * reads out when the panel appears, so the two can never disagree.
 */
export function paymentReceivedText(paymentId: string, refundMessage?: string): string {
  return refundMessage
    ? `${refundMessage} Payment ID ${paymentId}.`
    : `We've received your payment (ID ${paymentId}). We're confirming your booking — check My bookings in a minute, or WhatsApp us with this payment ID.`
}

/**
 * What a customer sees when they have paid and we cannot yet show them a
 * booking. Takes the place of the Pay button for good: the money has gone,
 * and the one thing this screen must never do is ask for it again.
 *
 * Calm on purpose. The usual cause is a dropped connection, and the Razorpay
 * webhook writes the booking on its own minutes later, so the message says
 * where it will appear and how to reach a person with the payment id.
 *
 * Focus moves here when it appears. The button that had focus is gone by
 * then, and without this a keyboard or screen-reader user is left on the
 * page body with no idea the wait has ended. The page's own status region,
 * which is there from first render, is what announces the sentence.
 */
export function PaymentReceivedPanel({
  paymentId,
  refundMessage,
  waitingOn = 'missing_booking',
}: PaymentReceivedPanelProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const text = paymentReceivedText(paymentId, refundMessage)

  return (
    <div ref={ref} tabIndex={-1} className="flex flex-col gap-3 focus:outline-none">
      {refundMessage ? (
        <p className="flex items-start gap-1.5 text-[13px] leading-5 text-text-primary">
          {/* Amber, as errors are everywhere: nothing here is to be pressed. */}
          <IconAlertCircle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
          <span>{text}</span>
        </p>
      ) : (
        <p className="text-[13px] leading-5 text-text-primary">{text}</p>
      )}
      <div className="flex gap-2">
        <a
          href={supportWhatsAppHref(
            paymentHelpMessage(paymentId, refundMessage ? 'refund' : waitingOn)
          )}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp Detlio support with this payment ID"
          className={`${SECONDARY} hover:border-[#25D366]`}
        >
          <IconBrandWhatsapp size={16} className="text-[#25D366]" aria-hidden />
          WhatsApp us
        </a>
        <Link href="/bookings" className={`${SECONDARY} hover:border-text-secondary`}>
          My bookings
        </Link>
      </div>
    </div>
  )
}
