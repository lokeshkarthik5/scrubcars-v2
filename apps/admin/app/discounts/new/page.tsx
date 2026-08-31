'use client'

import { useRouter } from 'next/navigation'
import { DiscountForm } from '@repo/ui/features/discount-form'
import { TopBar } from '@repo/ui/sc/top-bar'
import {
  errorMessage,
  useCreateDiscount,
} from '@repo/core/api/hooks/use-discounts'

export default function NewDiscountPage() {
  const router = useRouter()
  const create = useCreateDiscount()

  return (
    <>
      <TopBar showBack title="Add discount" />
      <DiscountForm
        isPending={create.isPending}
        error={
          create.error
            ? errorMessage(create.error, 'Failed to save the discount')
            : undefined
        }
        onCancel={() => router.push('/discounts')}
        onSubmit={(input) =>
          // Navigation lives here, not in the hook: the mutation's job is the
          // write and the cache invalidation that follows it.
          create.mutate(input, {
            onSuccess: () => router.push('/discounts'),
          })
        }
      />
    </>
  )
}
