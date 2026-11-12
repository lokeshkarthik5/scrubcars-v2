import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { rupees } from '@repo/core/garage-book'
import { BillPaper } from '@/components/garage-book/bill-paper'
import { PrintButton } from '@/components/garage-book/print-button'
import { PublicMessage, PublicShell } from '@/components/garage-book/public-shell'
import { readBill, upiLink } from '@/lib/garage-book-public'

/**
 * A garage's bill (Garage Book 0073): /b/<token>, sent by the garage on
 * WhatsApp to its own customer, opened signed in or not. Rendered on the
 * server on every request (the paid state can change), so it is fast and
 * needs no script beyond Print. While unpaid it carries the garage's own
 * UPI QR and number; money goes straight to the garage.
 *
 * The token opens the bill, so the page never hands its address on: no
 * Referer, no Meta Pixel or Clarity (lib/meta-pixel.ts), kept out of search
 * engines. The title names no garage or amount. A 404 when the API says so
 * (an unknown bill, or Garage Book switched off).
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your bill',
  referrer: 'no-referrer',
  robots: { index: false, follow: false, nocache: true },
}

export default async function BillPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await readBill(token)
  if (result.kind === 'not_found') notFound()
  if (result.kind === 'rate_limited') {
    return (
      <PublicMessage title="Too many tries just now">
        <p>Please wait a minute and open the link again.</p>
      </PublicMessage>
    )
  }
  if (result.kind === 'unavailable') {
    return (
      <PublicMessage title="Couldn’t open this bill">
        <p>Detlio isn&apos;t answering right now. Please try again in a few minutes.</p>
      </PublicMessage>
    )
  }

  const bill = result.data
  const upi = !bill.paid && bill.pay ? upiLink(bill.pay, bill.totalPaise, bill.numberText) : null
  return (
    <PublicShell>
      <BillPaper bill={bill} />
      <div className="gbp-noprint flex flex-col gap-2.5">
        {upi && (
          // Opens the phone's UPI app with the garage, the amount and the bill filled in.
          <a href={upi} className="fx-red-button fx-press flex h-[52px] items-center justify-center rounded-control text-t3 font-semibold">
            Pay {rupees(bill.totalPaise)} in a UPI app
          </a>
        )}
        <PrintButton className="fx-raised fx-press h-12 rounded-control text-t3 font-semibold text-text-primary" />
        <p className="text-center text-[12px] leading-[17px] text-[#A8A8B2]">
          Your payment goes straight to {bill.garage.name}. Questions about this bill? Ask the garage.
        </p>
      </div>
    </PublicShell>
  )
}
