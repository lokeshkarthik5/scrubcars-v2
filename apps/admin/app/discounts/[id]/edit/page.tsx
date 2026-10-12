'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { DiscountForm } from '@repo/ui/features/discount-form'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import {
  errorMessage,
  useAdminDiscount,
  useUpdateDiscount,
} from '@repo/core/api/hooks/use-discounts'

export default function EditDiscountPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: discount, isPending, error, refetch } = useAdminDiscount(id)
  const update = useUpdateDiscount(id)

  return (
    // The whole workspace, as Add discount: the form and its preview column.
    <div className="flex w-full flex-col gap-5">
      <PageHeader showBack title="Edit discount" />
      {error ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load the discount')}
          onRetry={() => void refetch()}
        />
      ) : isPending || !discount ? (
        <SkeletonList count={3} itemClassName="h-40" />
      ) : (
        <DiscountForm
          // Remount when the loaded discount changes so the form's initial
          // state is taken from fresh data rather than a stale first render.
          key={discount.id}
          discount={discount}
          isPending={update.isPending}
          error={update.error ?? undefined}
          onCancel={() => router.push('/discounts')}
          onSubmit={(input) =>
            update.mutate(input, {
              onSuccess: () => router.push('/discounts'),
            })
          }
        />
      )}
    </div>
  )
}
