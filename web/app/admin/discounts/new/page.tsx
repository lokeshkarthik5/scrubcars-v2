'use client'

import { useRouter } from 'next/navigation'
import { DiscountForm } from '@/components/features/discount-form'
import { TopBar } from '@/components/sc/top-bar'
import {
  errorMessage,
  useCreateDiscount,
} from '@/lib/api/hooks/use-discounts'

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
        onCancel={() => router.push('/admin/discounts')}
        onSubmit={(input) =>
          // Navigation lives here, not in the hook: the mutation's job is the
          // write and the cache invalidation that follows it.
          create.mutate(input, {
            onSuccess: () => router.push('/admin/discounts'),
          })
        }
      />
    </>
  )
}
