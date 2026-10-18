'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconStar } from '@tabler/icons-react'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { useAdminRewardsConfig } from '@repo/core/api/hooks/use-admin-rewards'
import { CustomerRewardsSection } from '@/components/rewards/customer-rewards-section'
import { RewardsOverview } from '@/components/rewards/rewards-overview'
import { RewardsSettingsForm } from '@/components/rewards/rewards-settings-form'
import { parseRewardsTab, type RewardsTab } from '@/lib/rewards'

const TAB_LABELS: Record<RewardsTab, string> = { overview: 'Overview', customers: 'Customers', settings: 'Settings' }

function RewardsContent() {
  const router = useRouter()
  const params = useSearchParams()
  const tab = parseRewardsTab(params.get('tab'))
  const customer = params.get('customer')
  const config = useAdminRewardsConfig()

  const go = (next: RewardsTab, extra?: Record<string, string>) => {
    const query = new URLSearchParams({ tab: next, ...extra })
    router.replace(`/rewards?${query.toString()}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Rewards" subtitle="Detlio Rewards: Shine Card, scratch cards, levels and invites" />
      {config.isPending ? (
        <SkeletonList />
      ) : !config.data?.masterSwitch ? (
        <EmptyState
          icon={<IconStar size={32} stroke={1.5} />}
          title="Rewards are off on the server"
          subtitle="Set REWARDS_ENABLED=on in the API's environment to set up and track the programme."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TAB_LABELS) as RewardsTab[]).map((key) => (
              <FilterChip key={key} label={TAB_LABELS[key]} active={tab === key} onClick={() => go(key)} />
            ))}
          </div>
          {tab === 'overview' && <RewardsOverview onOpenCustomer={(id) => go('customers', { customer: id })} />}
          {tab === 'customers' && <CustomerRewardsSection userId={customer} onUserId={(id) => go('customers', { customer: id })} />}
          {tab === 'settings' && <RewardsSettingsForm />}
        </>
      )}
    </div>
  )
}

/** Admin → Rewards (0050), super-admin; shown in the nav while REWARDS_ENABLED is on. */
export default function RewardsPage() {
  return (
    <Suspense>
      <RewardsContent />
    </Suspense>
  )
}
