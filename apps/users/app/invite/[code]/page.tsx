import type { Metadata } from 'next'
import { InviteView } from '@/components/rewards/invite-view'

/**
 * An invite link (Detlio Rewards, 0050): /invite/<code>, opened by a friend
 * of a customer, signed in or not. Kept out of search engines; the title
 * names nobody.
 */
export const metadata: Metadata = {
  title: 'Join Detlio',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <InviteView code={code} />
}
