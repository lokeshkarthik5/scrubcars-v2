import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LinkBooking } from '@/components/garage-book/link-booking'
import { PublicMessage, PublicShell } from '@/components/garage-book/public-shell'
import { readLinkPage } from '@/lib/garage-book-public'

/**
 * A garage's own booking page (Garage Book 0073, board L2): /g/<slug>, the
 * link and QR the garage shares with its own customers. Pick a service and
 * a time, give a name and phone, and pay at the garage; no sign-in, no
 * OTP, no commission. Someone who has booked this garage through Detlio
 * before is sent to book in Detlio instead (decision 5).
 *
 * Kept out of search engines and away from the Meta Pixel and Clarity
 * (the customer types a phone number here). A 404 when the API says so: an
 * unknown or switched-off link, or Garage Book switched off.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const result = await readLinkPage(slug)
  return {
    title: result.kind === 'found' ? `Book at ${result.data.garage.name}` : 'Book a car wash',
    referrer: 'no-referrer',
    robots: { index: false, follow: false, nocache: true },
  }
}

export default async function GarageLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const result = await readLinkPage(slug)
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
      <PublicMessage title="Couldn’t open this page">
        <p>Detlio isn&apos;t answering right now. Please try again in a few minutes.</p>
      </PublicMessage>
    )
  }
  return (
    <PublicShell>
      <LinkBooking slug={slug} page={result.data} />
    </PublicShell>
  )
}
