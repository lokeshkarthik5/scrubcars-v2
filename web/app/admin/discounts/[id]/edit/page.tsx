'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { DiscountForm } from '@/components/features/discount-form'
import { ErrorState, SkeletonCard } from '@/components/sc/empty-state'
import { TopBar } from '@/components/sc/top-bar'
import {
  errorMessage,
  useAdminDiscount,
  useUpdateDiscount,
} from '@/lib/api/hooks/use-discounts'

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
          onCancel={() => router.push('/admin/discounts')}
          onSubmit={(input) =>
            update.mutate(input, {
              onSuccess: () => router.push('/admin/discounts'),
            })
          }
        />
      )}
    </>
  )
}
