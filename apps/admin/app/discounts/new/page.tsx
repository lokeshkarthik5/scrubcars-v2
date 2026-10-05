'use client'

import { useRouter } from 'next/navigation'
import { DiscountForm } from '@repo/ui/features/discount-form'
import { PageHeader } from '@repo/ui/sc/page-header'
import {
  errorMessage,
  useCreateDiscount,
} from '@repo/core/api/hooks/use-discounts'

export default function NewDiscountPage() {
  const router = useRouter()
  const create = useCreateDiscount()

  return (
    // The same 640px column as the vendor forms: a form this narrow reads
    // down one line, where the full 1100px workspace spread it thin.
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
      <PageHeader showBack title="Add discount" />
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
    </div>
  )
}
