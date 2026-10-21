'use client'

import { useRouter } from 'next/navigation'
import { IconHeart } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { Reveal } from '@repo/ui/sc/reveal'
import { TopBar } from '@repo/ui/sc/top-bar'
import { VendorCard } from '@repo/ui/features/vendor-card'
import { useSavedGarages } from '@repo/core/api/hooks/use-favourites'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { CustomerShell } from '@/components/customer-shell'
import { SaveGarageButton } from '@/components/favourites/save-garage-button'
import { isHomeHubEnabled } from '@/lib/home-hub'

/**
 * Profile → Saved garages (under /profile, so the nav's Profile stays lit):
 * the garages the customer saved with the heart, newest first, as the
 * list's own cards. A paused one is still here (its page opens and says
 * why) with a line saying it isn't taking bookings; one that left the app
 * is not, and comes back if the garage does. The heart on each card unsaves
 * it.
 */
export default function SavedGaragesPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const saved = useSavedGarages({ enabled: !!user })

  if (ready && !user) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        <TopBar title="Saved garages" showBack backHref="/profile" large={isHomeHubEnabled()} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">Sign in to see your saved garages</p>
          <ScButton
            className="mt-2 w-auto px-8"
            onClick={() => router.push(`/login?next=${encodeURIComponent('/profile/saved-garages')}`)}
          >
            Sign in
          </ScButton>
        </div>
      </CustomerShell>
    )
  }

  const vendors = saved.data?.vendors ?? []

  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
      <TopBar title="Saved garages" showBack backHref="/profile" large={isHomeHubEnabled()} />

      {!ready || saved.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : saved.isError && vendors.length === 0 ? (
        <ErrorState
          message="Couldn't load your saved garages. Check your connection."
          onRetry={() => void saved.refetch()}
        />
      ) : vendors.length === 0 ? (
        <EmptyState
          icon={<IconHeart size={32} stroke={1.5} />}
          title="No saved garages yet"
          subtitle="Tap the heart on a garage to keep it here."
          actionLabel="Find garages"
          onAction={() => router.push('/garages')}
        />
      ) : (
        <ul aria-label="Saved garages, newest first" className="flex flex-col gap-3">
          {vendors.map((vendor, i) => (
            <Reveal as="li" key={vendor.id} index={i}>
              <VendorCard
                vendor={vendor}
                action={<SaveGarageButton vendor={vendor} />}
                note={vendor.bookingsPaused ? 'Not taking bookings right now' : null}
              />
            </Reveal>
          ))}
        </ul>
      )}
    </CustomerShell>
  )
}
