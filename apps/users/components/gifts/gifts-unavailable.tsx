'use client'

import { useRouter } from 'next/navigation'
import { IconGift } from '@tabler/icons-react'
import { EmptyState } from '@repo/ui/sc/empty-state'

/**
 * What a gift or credit page says when Gift a wash is switched off at the
 * API (GIFTS_ENABLED) and the page was opened directly: calm, with the way
 * back to booking. No entry point links here while it is off.
 */
export function GiftsUnavailable() {
  const router = useRouter()
  return (
    <EmptyState
      icon={<IconGift size={32} stroke={1.5} />}
      title="Gifts aren't available yet"
      subtitle="You can still book a wash as usual."
      actionLabel="Find garages"
      onAction={() => router.push('/garages')}
    />
  )
}
