'use client'

import Link from 'next/link'
import { useDismissNotice } from '@repo/core/api/hooks/use-home'
import type { HomeData } from '@repo/core/api/home'
import { UpdateList, UpdateRow } from './update-row'

/**
 * Home's Updates: the pinned notice to everyone, then the newest two rows,
 * then See all. Shown whenever there is anything to show, even to a customer
 * with no bookings when a notice is live. A notice about the customer's own
 * booking leads the rows (the server puts it first); both kinds of notice
 * close with ×, for good, on every device.
 */
export function UpdatesBlock({
  updates,
  now,
}: {
  updates: NonNullable<HomeData['updates']>
  now: Date
}) {
  const dismiss = useDismissNotice()
  const { pinnedNotice, items } = updates
  if (!pinnedNotice && items.length === 0) return null

  return (
    <section aria-labelledby="home-updates" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1 pt-4">
        <h2 id="home-updates" className="text-[17px] font-medium tracking-[-0.012em] text-text-primary">
          Updates
        </h2>
        <Link href="/updates" className="-my-3 py-3 text-[15px] text-[#A1A1AA]">
          See all
        </Link>
      </div>
      <UpdateList label="Latest updates">
        {pinnedNotice && (
          <UpdateRow
            pinned
            now={now}
            row={{
              kind: 'notice',
              title: pinnedNotice.title,
              body: pinnedNotice.body,
              at: pinnedNotice.startsAt,
              unread: false,
              bookingId: null,
              from: 'Detlio team',
              linkUrl: pinnedNotice.linkUrl,
              linkLabel: pinnedNotice.linkLabel,
            }}
            onDismiss={() => dismiss.mutate(pinnedNotice.id)}
          />
        )}
        {items.map((item) => (
          <UpdateRow
            key={item.id}
            now={now}
            row={{ ...item, from: item.kind === 'notice' ? 'Detlio team' : null }}
            onDismiss={item.noticeId ? () => dismiss.mutate(item.noticeId!) : undefined}
          />
        ))}
      </UpdateList>
    </section>
  )
}
