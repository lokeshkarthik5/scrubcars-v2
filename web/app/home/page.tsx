'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  IconBell,
  IconDroplet,
  IconMapPin,
  IconShield,
  IconSparkles,
  IconTool,
} from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScCard } from '@/components/sc/card'
import { Toast } from '@/components/sc/toast'
import { VendorCard } from '@/components/features/vendor-card'
import { getVendors } from '@/lib/api/vendors'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useUserStore } from '@/lib/stores/user-store'
import type { Vendor } from '@/lib/types'

const CATEGORIES = [
  { key: 'car_wash', label: 'Car wash', icon: IconDroplet },
  { key: 'detailing', label: 'Detailing', icon: IconSparkles },
  { key: 'coating', label: 'Coating', icon: IconShield },
  { key: 'scratch_removal', label: 'Scratch removal', icon: IconTool },
]

function HomeContent() {
  const searchParams = useSearchParams()
  const authUser = useAuthStore((s) => s.user)
  const profile = useUserStore((s) => s.profile)
  const fetchProfile = useUserStore((s) => s.fetchProfile)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [showToast, setShowToast] = useState(false)

  const user = profile ?? authUser

  useEffect(() => {
    getVendors({ bookingType: 'dropin' }).then(setVendors)
    void fetchProfile().catch(() => undefined)
  }, [fetchProfile])

  useEffect(() => {
    if (searchParams.get('welcome') === '1') {
      setShowToast(true)
    }
  }, [searchParams])

  return (
    <AppShell showNav className="gap-5 py-4">
      <Toast
        message={`Welcome, ${user?.name ?? 'there'}! Find your first car wash.`}
        visible={showToast}
        onDismiss={() => setShowToast(false)}
      />

      <div className="flex items-center justify-between">
        <button className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">
          <IconMapPin size={16} className="text-brand-red" />
          <span className="text-[13px] font-medium text-text-primary">
            {user?.area ?? 'Set location'}
          </span>
        </button>
        <button className="text-text-secondary">
          <IconBell size={22} stroke={1.5} />
        </button>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Categories</h2>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map(({ key, label, icon: Icon }) => (
            <Link key={key} href={`/search?category=${key}`}>
              <ScCard className="flex items-center gap-3 py-3.5">
                <Icon size={20} className="text-brand-red" />
                <span className="text-[13px] font-medium text-text-primary">{label}</span>
              </ScCard>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Featured garages</h2>
        <div className="flex flex-col gap-2">
          {vendors.length === 0 ? (
            <p className="text-[13px] text-text-secondary">No garages found nearby.</p>
          ) : (
            vendors.map((vendor) => <VendorCard key={vendor.id} vendor={vendor} />)
          )}
        </div>
      </section>
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
