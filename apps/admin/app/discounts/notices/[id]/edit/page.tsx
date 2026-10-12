'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminNotice, useUpdateNotice } from '@repo/core/api/hooks/use-notices'
import { NoticeForm } from '@/components/notice-form'

export default function EditNoticePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: notice, isPending, error, refetch } = useAdminNotice(id)
  const update = useUpdateNotice(id)

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader showBack title="Edit notice" />
      {error ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load the notice')}
          onRetry={() => void refetch()}
        />
      ) : isPending || !notice ? (
        <SkeletonList count={3} itemClassName="h-40" />
      ) : (
        <NoticeForm
          // Remount on fresh data, as Edit discount does.
          key={notice.id}
          notice={notice}
          isPending={update.isPending}
          error={update.error ?? undefined}
          onCancel={() => router.push('/discounts/notices')}
          onSubmit={(input) =>
            update.mutate(input, {
              onSuccess: () => router.push('/discounts/notices'),
            })
          }
        />
      )}
    </div>
  )
}
