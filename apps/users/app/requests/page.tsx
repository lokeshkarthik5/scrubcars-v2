'use client'

import { useRouter } from 'next/navigation'
import { IconSend } from '@tabler/icons-react'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { TopBar } from '@repo/ui/sc/top-bar'
import { useMyRequests } from '@repo/core/api/hooks/use-booking-requests'
import { useNow } from '@repo/core/hooks/use-now'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { CustomerShell } from '@/components/customer-shell'
import { RequestCard } from '@/components/reach/request-card'
import { FreeWashPiece } from '@/components/reach/free-wash'
import { isHomeHubEnabled } from '@/lib/home-hub'

/**
 * Your requests (customer reach, part 2, 0062): every request to a garage
 * just outside its reach, open first, with its clock, the yes to confirm
 * and pay, or what to do when no garage could take it. Pushes about a
 * request open here. Signed-in customers only (CUSTOMER_ROUTES).
 */
export default function RequestsPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const requests = useMyRequests({ enabled: !!user })
  const now = useNow(1000)
  const items = requests.data ?? []
  const ended = items.some((r) => r.state === 'no_garage')

  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
      <TopBar title="Your requests" showBack backHref="/home" large={isHomeHubEnabled()} />
      {requests.isPending ? (
        <SkeletonCard />
      ) : requests.isError && items.length === 0 ? (
        <ErrorState message="Couldn't load your requests. Check your connection." onRetry={() => void requests.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconSend size={28} stroke={1.5} />}
          title="No requests"
          subtitle="Ask a garage just outside its area to come to you, from the Doorstep or Pickup & drop list."
          actionLabel="See who comes to you"
          onAction={() => router.push('/garages?mode=doorstep')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((request) => (
            <RequestCard key={request.rootId} request={request} now={now} />
          ))}
          {/* Nobody could take it: the free wash for when we reach their area. */}
          {ended && <FreeWashPiece placement="bottom" />}
        </div>
      )}
    </CustomerShell>
  )
}
