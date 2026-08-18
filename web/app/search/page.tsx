'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { IconAdjustments, IconSearch } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { FilterChip } from '@/components/sc/chip'
import { SortSheet, sortLabel, type SortKey } from '@/components/sc/sort-sheet'
import { VendorCard } from '@/components/features/vendor-card'
import { Reveal } from '@/components/sc/reveal'
import { getVendors } from '@/lib/api/vendors'
import { sortVendors } from '@/lib/sort-vendors'

import type { Vendor } from '@/lib/types'

// Quick-access shortcuts for the most-used sorts. The Filter button opens the
// sheet with the full set, and both drive the same `sort` state so the chip
// highlight always reflects what the list is actually ordered by.
const SORT_CHIPS: { label: string; value: SortKey }[] = [
  { label: 'Rating', value: 'rating' },
  { label: 'Price', value: 'price_asc' },
]

function SearchContent() {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('relevance')
  const [sortOpen, setSortOpen] = useState(false)
  const [vendors, setVendors] = useState<Vendor[]>([])

  useEffect(() => {
    const category = searchParams.get('category') ?? undefined
    getVendors({ q: query, category }).then(setVendors)
  }, [query, searchParams])

  const sorted = useMemo(() => sortVendors(vendors, sort), [vendors, sort])

  return (
    <AppShell showNav showBrand className="gap-4 py-4">
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
        {SORT_CHIPS.map((chip) => (
          <FilterChip
            key={chip.value}
            label={chip.label}
            active={sort === chip.value}
            // Tapping the active chip clears back to the default order.
            onClick={() => setSort(sort === chip.value ? 'relevance' : chip.value)}
          />
        ))}
        <button
          type="button"
          onClick={() => setSortOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:text-text-primary"
        >
          <IconAdjustments size={14} />
          Filter
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-text-secondary">{sorted.length} garages found</p>
        {sort !== 'relevance' && (
          <p className="text-[11px] text-text-secondary">Sorted by {sortLabel(sort)}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-secondary">
            No garages match your search.
          </p>
        ) : (
          sorted.map((vendor, i) => (
            <Reveal key={vendor.id} index={i}>
              <VendorCard vendor={vendor} />
            </Reveal>
          ))
        )}
      </div>

      <SortSheet
        open={sortOpen}
        value={sort}
        onChange={setSort}
        onClose={() => setSortOpen(false)}
      />
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
