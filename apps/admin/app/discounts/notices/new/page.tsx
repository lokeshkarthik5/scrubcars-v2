'use client'

import { useRouter } from 'next/navigation'
import { PageHeader } from '@repo/ui/sc/page-header'
import { useCreateNotice } from '@repo/core/api/hooks/use-notices'
import { NoticeForm } from '@/components/notice-form'

export default function NewNoticePage() {
  const router = useRouter()
  const create = useCreateNotice()

  return (
    // The whole workspace, as Add discount: the form and its preview column.
    <div className="flex w-full flex-col gap-5">
      <PageHeader showBack title="Add notice" />
      <NoticeForm
        isPending={create.isPending}
        error={create.error ?? undefined}
        onCancel={() => router.push('/discounts/notices')}
        onSubmit={(input) =>
          create.mutate(input, {
            onSuccess: () => router.push('/discounts/notices'),
          })
        }
      />
    </div>
  )
}
