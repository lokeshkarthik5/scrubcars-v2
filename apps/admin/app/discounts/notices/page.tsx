'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconPencil, IconPlus, IconSpeakerphone } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminNotices, useEndNotice } from '@repo/core/api/hooks/use-notices'
import type { AdminNotice, NoticeState } from '@repo/core/api/admin'
import { istDateTimeLabel, istWindowLabel } from '@repo/core/ist-input'
import { DiscountsTabs } from '@/components/discounts-tabs'
import { Meta } from '@/components/meta'

const SECTIONS: { state: NoticeState; title: string; badge: 'success' | 'pending' | 'muted' }[] = [
  { state: 'live', title: 'Live', badge: 'success' },
  { state: 'scheduled', title: 'Scheduled', badge: 'pending' },
  { state: 'ended', title: 'Ended', badge: 'muted' },
]

/** "Everyone" / "Booking between Mon 12 Oct, 10:00 AM and …, at Hub Promo". */
function audienceLabel(notice: AdminNotice): string {
  if (notice.audience === 'all') return 'Everyone'
  const window =
    notice.bookingFrom && notice.bookingTo
      ? `Booking between ${istDateTimeLabel(notice.bookingFrom)} and ${istDateTimeLabel(notice.bookingTo)} IST`
      : 'Booking window'
  return notice.vendorName ? `${window}, at ${notice.vendorName}` : window
}

// The small actions on a row: outline, 44px tall, never red.
const ROW_ACTION = 'flex min-h-11 items-center gap-1 px-3 py-1.5 text-[12px]'

export default function AdminNoticesPage() {
  const router = useRouter()
  const { data: notices = [], isPending, error, refetch } = useAdminNotices()
  const [actionError, setActionError] = useState('')
  const endNotice = useEndNotice({
    onError: (err) => setActionError(errorMessage(err, 'Failed to end the notice')),
  })

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const grouped = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        rows: notices.filter((notice) => notice.state === section.state),
      })),
    [notices]
  )

  const handleEnd = (notice: AdminNotice) => {
    const question =
      notice.state === 'live'
        ? `End "${notice.title}" now?\n\nCustomers stop seeing it straight away. The notice is kept, not deleted.`
        : `Switch off "${notice.title}"?\n\nIt will not go live. The notice is kept, not deleted.`
    if (!window.confirm(question)) return
    setActionError('')
    endNotice.mutate(notice.id)
  }

  return (
    <>
      <PageHeader
        title="Notices"
        subtitle="Messages from the team on customers' Home and in Updates"
        // The page's one red: writing a notice is what it is for.
        actions={
          <ScButtonLink href="/discounts/notices/new">
            <IconPlus size={16} aria-hidden="true" /> Add notice
          </ScButtonLink>
        }
      />

      <DiscountsTabs />

      {isPending ? (
        <SkeletonList count={3} itemClassName="h-32" />
      ) : error ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load notices')}
          onRetry={() => void refetch()}
        />
      ) : notices.length === 0 ? (
        <EmptyState
          icon={<IconSpeakerphone size={32} stroke={1.5} />}
          title="No notices yet"
          subtitle="Tell customers about something that affects their wash: rain, a holiday, a garage closing early."
          actionLabel="Add notice"
          onAction={() => router.push('/discounts/notices/new')}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {actionError && (
            <p role="alert" className="text-[12px] text-error">{actionError}</p>
          )}
          {grouped.map((section) => (
            <section key={section.state} aria-labelledby={`notices-${section.state}`} className="flex flex-col gap-2">
              <h2 id={`notices-${section.state}`} className="text-[15px] font-semibold text-text-primary">
                {section.title}{' '}
                <span className="font-numeric text-text-muted">{section.rows.length}</span>
              </h2>
              {section.rows.length === 0 ? (
                <p className="text-[12px] text-text-muted">None.</p>
              ) : (
                section.rows.map((notice, i) => (
                  <Reveal key={notice.id} index={i}>
                    <ScCard className="flex flex-col gap-3" data-notice-id={notice.id}>
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-text-primary">{notice.title}</p>
                          <p className="line-clamp-2 text-[12px] text-text-secondary">{notice.body}</p>
                        </div>
                        <ScBadge variant={section.badge}>
                          {/* Switched off before it started: still "Ended", said plainly. */}
                          {notice.state === 'ended' && !notice.isActive ? 'Switched off' : section.title}
                        </ScBadge>
                      </div>

                      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
                        <Meta label="Who sees it">{audienceLabel(notice)}</Meta>
                        <Meta label="When">
                          <span className="font-numeric">{istWindowLabel(notice.startsAt, notice.endsAt)}</span>
                        </Meta>
                        <Meta label="Closed by">
                          <span className="font-numeric">{notice.dismissals}</span>{' '}
                          {notice.dismissals === 1 ? 'customer' : 'customers'}
                        </Meta>
                      </div>
                      {notice.linkUrl && (
                        <Meta label="Link" truncate>
                          {notice.linkLabel} · {notice.linkUrl}
                        </Meta>
                      )}

                      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                        <ScButtonLink
                          href={`/discounts/notices/${notice.id}/edit`}
                          variant="secondary"
                          aria-label={`Edit ${notice.title}`}
                          className={ROW_ACTION}
                        >
                          <IconPencil size={14} aria-hidden="true" /> Edit
                        </ScButtonLink>
                        {/* No delete, as the API has none: ending keeps the record. */}
                        {notice.state !== 'ended' && (
                          <ScButton
                            fullWidth={false}
                            variant="secondary"
                            disabled={endNotice.isPending && endNotice.variables === notice.id}
                            onClick={() => handleEnd(notice)}
                            aria-label={`End now: ${notice.title}`}
                            className={ROW_ACTION}
                          >
                            End now
                          </ScButton>
                        )}
                      </div>
                    </ScCard>
                  </Reveal>
                ))
              )}
            </section>
          ))}
        </div>
      )}
    </>
  )
}
