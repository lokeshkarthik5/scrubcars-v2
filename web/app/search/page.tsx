'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { IconAdjustments, IconSearch } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { FilterChip } from '@/components/sc/chip'
import { VendorCard } from '@/components/features/vendor-card'
import { getVendors } from '@/lib/api/vendors'
import { useUserStore } from '@/lib/stores/user-store'
import type { Vendor } from '@/lib/types'

const FILTERS = ['Distance', 'Rating', 'Price', 'Filter']

function SearchContent() {
  const searchParams = useSearchParams()
  const pincode = useUserStore((s) => s.profile?.pincode)
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [vendors, setVendors] = useState<Vendor[]>([])

  useEffect(() => {
    const category = searchParams.get('category') ?? undefined
    getVendors({ q: query, category, pincode }).then(setVendors)
  }, [query, searchParams, pincode])

  return (
    <AppShell showNav className="gap-4 py-4">
      <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5">
        <IconSearch size={18} className="shrink-0 text-text-muted" />
        <input
          type="search"
          placeholder="Search garages, services..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent text-[13px] text-text-primary outline-none"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.filter((f) => f !== 'Filter').map((f) => (
          <FilterChip
            key={f}
            label={f}
            active={activeFilter === f}
            onClick={() => setActiveFilter(activeFilter === f ? null : f)}
          />
        ))}
        <span className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-text-secondary">
          <IconAdjustments size={14} />
          Filter
        </span>
      </div>

      <p className="text-[11px] text-text-secondary">{vendors.length} garages found</p>

      <div className="flex flex-col gap-2">
        {vendors.map((vendor) => (
          <VendorCard key={vendor.id} vendor={vendor} />
        ))}
      </div>
    </AppShell>
  )
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  )
}
