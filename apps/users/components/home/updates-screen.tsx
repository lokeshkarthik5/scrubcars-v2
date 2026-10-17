'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { IconArrowLeft } from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { HUB_TITLE_CLASS } from '@repo/ui/sc/top-bar'
import {
  useDismissNotice,
  useDismissReviewPrompt,
  useMarkUpdatesSeen,
  useUpdates,
} from '@repo/core/api/hooks/use-home'
import type { HomeActionCard } from '@repo/core/api/home'
import { groupUpdates } from '@repo/core/home-display'
import { cn } from '@repo/core/utils'
import { BillDueCard, GarageClosedCard, RateWashCard } from './action-cards'
import { UpdateList, UpdateRow } from './update-row'

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="px-1 pt-[22px] pb-2.5 text-[15px] text-[#A1A1AA]">{children}</h2>
}

/**
 * Updates: what is waiting on the customer (To do), the team's pinned
 * notice, then the last 30 days under Today, This week and Earlier, all in
 * Chennai time.
 *
 * Opening it is reading it: the read marker moves to the server's `now` from
 * this very feed (never the phone's clock), so Home's bell goes quiet. The
 * dots stay on the rows that were new for this visit, so the customer can see
 * what changed, until they tap Mark all read.
 */
export function UpdatesScreen() {
  const updates = useUpdates()
  const markSeen = useMarkUpdatesSeen()
  const dismissNotice = useDismissNotice()
  const dismissRate = useDismissReviewPrompt()
  const [cleared, setCleared] = useState(false)
  const markedAt = useRef<string | null>(null)

  const data = updates.data
  const anyUnread = !!data && (data.items.some((item) => item.unread) || !!data.pinnedNotice?.unread)

  useEffect(() => {
    if (!data || !anyUnread || markedAt.current === data.now) return
    markedAt.current = data.now
    markSeen.mutate(data.now)
  }, [data, anyUnread, markSeen])

  const now = data ? new Date(data.now) : null
  const unread = (value: boolean) => value && !cleared

  // One red button on the screen: the oldest bill's Pay (To do lists them
  // oldest first); any other bill's Pay is outlined.
  const redBill = data?.todo.find((card) => card.kind === 'bill_due')
  const todoCard = (card: HomeActionCard) => {
    switch (card.kind) {
      case 'bill_due':
        return <BillDueCard key={card.chargeId} card={card} now={now!} quiet={card !== redBill} />
      case 'garage_closed':
        return <GarageClosedCard key={card.bookingId} card={card} />
      case 'rate':
        return (
          <RateWashCard
            key={card.bookingId}
            card={card}
            dismissing={dismissRate.isPending}
            onDismiss={() => dismissRate.mutate(card.bookingId)}
          />
        )
      case 'complaint_resolved':
        // Never under To do: an answer is not something to do. Its row is
        // in the feed below.
        return null
    }
  }

  return (
    <AppShell className="pt-2 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="flex min-h-[60px] items-center justify-between">
        <Link
          href="/home"
          aria-label="Back to Home"
          className="grid size-11 place-items-center rounded-full border border-line text-text-primary"
        >
          <IconArrowLeft size={20} stroke={1.5} aria-hidden />
        </Link>
        <button
          type="button"
          disabled={!data || !anyUnread || cleared}
          onClick={() => {
            setCleared(true)
            if (data && markedAt.current !== data.now) {
              markedAt.current = data.now
              markSeen.mutate(data.now)
            }
          }}
          className="-mr-2 min-h-11 px-2 text-[15px] text-[#A1A1AA] disabled:opacity-50"
        >
          Mark all read
        </button>
      </div>
      <h1 className={cn('px-1 pt-1', HUB_TITLE_CLASS)}>Updates</h1>

      {updates.isPending ? (
        <div className="mt-6 flex flex-col gap-3">
          <div className="h-24 rounded-card shimmer" />
          <div className="h-48 rounded-card shimmer" />
        </div>
      ) : !data || !now ? (
        <ErrorState message="Couldn't load your updates. Check your connection." onRetry={() => void updates.refetch()} />
      ) : (
        <>
          {data.todo.length > 0 && (
            <section aria-label="To do">
              <GroupLabel>To do</GroupLabel>
              <div className="flex flex-col gap-3">{data.todo.map(todoCard)}</div>
            </section>
          )}

          {/* Under To do, not above it: what is waiting on the customer
              (a bill to pay) comes first, as on the approved screen. */}
          {data.pinnedNotice && (
            <div className={data.todo.length > 0 ? 'mt-3' : 'mt-6'}>
              <UpdateList label="Notice from Detlio">
                <UpdateRow
                  pinned
                  now={now}
                  row={{
                    kind: 'notice',
                    title: data.pinnedNotice.title,
                    body: data.pinnedNotice.body,
                    at: data.pinnedNotice.startsAt,
                    unread: unread(data.pinnedNotice.unread),
                    bookingId: null,
                    from: 'Detlio team',
                    linkUrl: data.pinnedNotice.linkUrl,
                    linkLabel: data.pinnedNotice.linkLabel,
                  }}
                  onDismiss={() => dismissNotice.mutate(data.pinnedNotice!.id)}
                />
              </UpdateList>
            </div>
          )}

          {groupUpdates(data.items, now).map((group) => (
            <section key={group.name} aria-label={group.name}>
              <GroupLabel>{group.name}</GroupLabel>
              <UpdateList label={group.name}>
                {group.items.map((item) => (
                  <UpdateRow
                    key={item.id}
                    now={now}
                    row={{
                      ...item,
                      unread: unread(item.unread),
                      from: item.kind === 'notice' ? 'Detlio team' : null,
                    }}
                    onDismiss={item.noticeId ? () => dismissNotice.mutate(item.noticeId!) : undefined}
                  />
                ))}
              </UpdateList>
            </section>
          ))}

          {data.items.length === 0 && data.todo.length === 0 && !data.pinnedNotice ? (
            <p className="mt-10 px-6 text-center text-[15px] text-[#A1A1AA]">
              Nothing yet. Your bookings, bills and notes from the Detlio team will show here.
            </p>
          ) : (
            <p className="mt-[18px] text-center text-[13px] text-dim">The last 30 days.</p>
          )}
        </>
      )}
    </AppShell>
  )
}
