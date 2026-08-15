'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconArrowsSort,
  IconBuildingStore,
  IconChevronDown,
  IconHome,
  IconMapPin,
  IconSearch,
} from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { SortSheet, sortLabel, type SortKey } from '@/components/sc/sort-sheet'
import { Toast } from '@/components/sc/toast'
import { VendorCard } from '@/components/features/vendor-card'
import { getVendors } from '@/lib/api/vendors'
import { sortVendors } from '@/lib/sort-vendors'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useUserStore } from '@/lib/stores/user-store'
import type { Vendor } from '@/lib/types'
import { cn } from '@/lib/utils'

type ServiceMode = 'dropin' | 'doorstep'

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'car_wash', label: 'Car Wash' },
  { key: 'detailing', label: 'Detailing' },
  { key: 'coating', label: 'Coating' },
  { key: 'scratch_removal', label: 'Scratch Removal' },
] as const

type CategoryKey = (typeof CATEGORIES)[number]['key']

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const authUser = useAuthStore((s) => s.user)
  const profile = useUserStore((s) => s.profile)
  const fetchProfile = useUserStore((s) => s.fetchProfile)

  const [vendors, setVendors] = useState<Vendor[]>([])
  const [serviceMode, setServiceMode] = useState<ServiceMode>('dropin')
  const [category, setCategory] = useState<CategoryKey>('all')
  const [sort, setSort] = useState<SortKey>('relevance')
  const [sortOpen, setSortOpen] = useState(false)
  const [showToast, setShowToast] = useState(false)

  const user = profile ?? authUser

  useEffect(() => {
    getVendors({
      bookingType: serviceMode,
      category: category === 'all' ? undefined : category,
    })
      .then(setVendors)
      .catch(console.error)
  }, [serviceMode, category])

  useEffect(() => {
    if (authUser) void fetchProfile().catch(() => undefined)
  }, [authUser, fetchProfile])

  useEffect(() => {
    if (searchParams.get('welcome') === '1') setShowToast(true)
  }, [searchParams])

  const sorted = useMemo(() => sortVendors(vendors, sort), [vendors, sort])

  return (
    <AppShell
      showNav
      showBrand
      className="gap-4 py-4"
      brandRight={
        <div className="min-w-0">
          <div className="flex items-center justify-end gap-1.5">
            <IconMapPin size={15} className="shrink-0 text-brand-red" />
            <span className="text-[14px] font-semibold text-text-primary">Home</span>
          </div>
          <p className="truncate text-[12px] text-text-secondary">
            {user?.area || 'Set your location in Profile'}
          </p>
        </div>
      }
    >
      <Toast
        message={`Welcome, ${user?.name ?? 'there'}! Find your first car wash.`}
        visible={showToast}
        onDismiss={() => setShowToast(false)}
      />

      <div className="flex rounded-[12px] bg-surface p-1">
        {(
          [
            { value: 'dropin', label: 'At Garage', icon: IconBuildingStore },
            { value: 'doorstep', label: 'Doorstep', icon: IconHome },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setServiceMode(value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-2.5 text-[13px] font-medium transition-colors',
              serviceMode === value
                ? 'bg-surface-elevated text-text-primary shadow-sm ring-1 ring-border'
                : 'text-text-secondary'
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => router.push('/search')}
        className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface px-3.5 py-3 text-left"
      >
        <IconSearch size={17} className="text-text-secondary" />
        <span className="text-[13px] text-text-muted">Search garages, services...</span>
      </button>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors',
              category === c.key
                ? 'bg-brand-red text-brand-white'
                : 'bg-surface text-text-primary'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-text-primary">Nearby Garages</h2>
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-[9px] bg-surface px-2.5 py-1.5 text-[12px] text-text-secondary"
          >
            <IconArrowsSort size={14} />
            {sortLabel(sort)}
            <IconChevronDown size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-text-secondary">
              No garages found nearby.
            </p>
          ) : (
            sorted.map((vendor) => <VendorCard key={vendor.id} vendor={vendor} />)
          )}
        </div>
      </section>

      <SortSheet
        open={sortOpen}
        value={sort}
        onChange={setSort}
        onClose={() => setSortOpen(false)}
      />
    </AppShell>
  )
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  )
}
