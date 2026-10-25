import type { Metadata } from 'next'
import { GiftView } from '@/components/gifts/gift-view'

/**
 * A gift link (0049): /gift/<code>, opened by whoever the buyer sent it to,
 * signed in or not. The code is the gift, so the page never hands its
 * address on: no Referer to anything it links to, and kept out of search
 * engines. The title names no amount or person, since a tab title travels
 * (history sync, screenshots of the tab bar).
 */
export const metadata: Metadata = {
  title: 'A Detlio gift',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

export default async function GiftPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <GiftView code={code} />
}
