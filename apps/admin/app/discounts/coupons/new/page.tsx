'use client'

import { useRouter } from 'next/navigation'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminCouponConfig, useCreateCouponBatch } from '@repo/core/api/hooks/use-admin-coupons'
import { BatchForm } from '@/components/coupons/batch-form'

/** Discounts → Coupons → New batch. On success, the batch's page, where its sheet is printed. */
export default function NewCouponBatchPage() {
  const router = useRouter()
  const config = useAdminCouponConfig()
  const create = useCreateCouponBatch()

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader showBack backHref="/discounts/coupons" title="New coupon batch" />
      {config.isPending ? (
        <SkeletonList count={3} itemClassName="h-40" />
      ) : config.isError || !config.data ? (
        <ErrorState message={errorMessage(config.error, "Couldn't load the coupon settings.")} onRetry={() => void config.refetch()} />
      ) : (
        <BatchForm
          config={config.data}
          isPending={create.isPending}
          error={create.error ? errorMessage(create.error, "Couldn't create the batch.") : null}
          onCancel={() => router.push('/discounts/coupons')}
          onSubmit={(payload) =>
            create.mutate(payload, {
              onSuccess: ({ batch }) => router.push(`/discounts/coupons/${batch.id}`),
            })
          }
        />
      )}
    </div>
  )
}
