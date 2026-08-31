'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { DiscountForm } from '@repo/ui/features/discount-form'
import { ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { TopBar } from '@repo/ui/sc/top-bar'
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
    <>
      <TopBar showBack title="Edit discount" />
      {error ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load the discount')}
          onRetry={() => void refetch()}
        />
      ) : isPending || !discount ? (
        <div className="flex flex-col gap-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <DiscountForm
          // Remount when the loaded discount changes so the form's initial
          // state is taken from fresh data rather than a stale first render.
          key={discount.id}
          discount={discount}
          isPending={update.isPending}
          error={
            update.error
              ? errorMessage(update.error, 'Failed to save the discount')
              : undefined
          }
          onCancel={() => router.push('/discounts')}
          onSubmit={(input) =>
            update.mutate(input, {
              onSuccess: () => router.push('/discounts'),
            })
          }
        />
      )}
    </>
  )
}
