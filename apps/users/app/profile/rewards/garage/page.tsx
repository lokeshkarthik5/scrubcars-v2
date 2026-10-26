'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconCards } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { TopBar } from '@repo/ui/sc/top-bar'
import { garageLive, useGarageAlbum, useGaragePulls } from '@repo/core/api/hooks/use-garage'
import { useRewardsConfig } from '@repo/core/api/hooks/use-rewards'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { CustomerShell } from '@/components/customer-shell'
import { GarageAlbumView, firstNameOf } from '@/components/garage/garage-album'
import { PullRevealSheet } from '@/components/garage/pull-reveal-sheet'
import { isHomeHubEnabled } from '@/lib/home-hub'

/**
 * Profile → Detlio Rewards → Garage (0057): the album of the live series.
 * 40 cards in 8 rows of 5 (by number): collected ones in full art, missing
 * ones as dark silhouettes with their number. The progress, each row's
 * reward, duplicates on their way to a stamp, a rarity filter, the odds in
 * plain words, and a card's sheet (the whole card, how many, Share). New
 * cards not seen yet are revealed first (?pull=<id> from a push).
 */
export default function GaragePage() {
  return (
    <Suspense>
      <GarageScreen />
    </Suspense>
  )
}

function GarageScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const config = useRewardsConfig()
  const on = garageLive(config.data)
  const album = useGarageAlbum(on && !!user)
  const pulls = useGaragePulls(on && !!user)
  const header = <TopBar title="Detlio Garage" showBack backHref="/profile/rewards" large={isHomeHubEnabled()} />

  if (ready && !user) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">Sign in to see your Garage</p>
          <ScButton className="mt-2 w-auto px-8" onClick={() => router.push(`/login?next=${encodeURIComponent('/profile/rewards/garage')}`)}>
            Sign in
          </ScButton>
        </div>
      </CustomerShell>
    )
  }
  if (ready && !config.isPending && !on) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <EmptyState icon={<IconCards size={32} stroke={1.5} />} title="The Garage isn't open right now" subtitle="Your rewards are still on the Rewards page." actionLabel="Detlio Rewards" onAction={() => router.push('/profile/rewards')} />
      </CustomerShell>
    )
  }
  return (
    <CustomerShell showNav showBrand className="gap-3.5 py-3">
      {header}
      {!ready || config.isPending || album.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : album.isError || !album.data ? (
        <ErrorState message="Couldn't load your Garage. Check your connection." onRetry={() => void album.refetch()} />
      ) : (
        <>
          <GarageAlbumView album={album.data} firstName={firstNameOf(user?.name)} />
          {pulls.data && pulls.data.unseen > 0 && <PullRevealSheet pulls={pulls.data.pulls} focusId={params.get('pull')} firstName={firstNameOf(user?.name)} />}
        </>
      )}
    </CustomerShell>
  )
}
