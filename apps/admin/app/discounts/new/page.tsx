'use client'

import { useRouter } from 'next/navigation'
import { DiscountForm } from '@repo/ui/features/discount-form'
import { PageHeader } from '@repo/ui/sc/page-header'
import { useCreateDiscount } from '@repo/core/api/hooks/use-discounts'

export default function NewDiscountPage() {
  const router = useRouter()
  const create = useCreateDiscount()

  return (
    // The whole workspace: the form reads down its own column and the
    // "Preview on Home" column sits beside it on a wide screen (under it on a
    // phone), so the card is in view while it is typed.
    <div className="flex w-full flex-col gap-5">
      <PageHeader showBack title="Add discount" />
      <DiscountForm
        isPending={create.isPending}
        // The error itself, not its message: the form places a refusal
        // about the Show on Home settings beside the field it is about.
        error={create.error ?? undefined}
        onCancel={() => router.push('/discounts')}
        onSubmit={(input) =>
          // Navigation lives here, not in the hook: the mutation's job is the
          // write and the cache invalidation that follows it.
          create.mutate(input, {
            onSuccess: () => router.push('/discounts'),
          })
        }
      />
    </div>
  )
}
