'use client'

import { useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput } from '@repo/ui/sc/input'
import { ScSelect } from '@repo/ui/sc/select'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useFindCustomerRewards } from '@repo/core/api/hooks/use-admin-rewards'
import { useAdminCustomerWrapped, useAdminWrappedStats } from '@repo/core/api/hooks/use-admin-reward-extras'
import { wrappedCards } from '@repo/core/wrapped'
import { percentOf, wrappedYearOptions } from '@/lib/rewards'

/**
 * Admin → Rewards → Wrapped (0054): for a year, how many customers have a
 * Wrapped, were told, opened and shared it (counts only), and a preview of
 * any customer's cards, found by phone (in the body). A preview is not
 * counted as opened.
 */
export function WrappedSection() {
  const years = wrappedYearOptions()
  const [year, setYear] = useState(years[0])
  const stats = useAdminWrappedStats(year, true)
  const find = useFindCustomerRewards()
  const [phone, setPhone] = useState('')
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null)
  const preview = useAdminCustomerWrapped(customer?.id ?? null, year)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <ScSelect label="Year" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="min-w-[120px]">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </ScSelect>
        <p className="pb-2 text-[12px] text-text-secondary">Customers open a year from 1 December, and the year before all year. The push goes out 1–7 December.</p>
      </div>

      {stats.isPending ? (
        <SkeletonList />
      ) : stats.isError || !stats.data ? (
        <ErrorState message={errorMessage(stats.error, "Couldn't load the Wrapped numbers")} onRetry={() => void stats.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Customers with washes" value={String(stats.data.customersWithWashes)} />
          <StatTile label="Told (push + Updates)" value={String(stats.data.notified)} />
          <StatTile
            label="Opened"
            value={String(stats.data.opened)}
            hint={`${percentOf(stats.data.opened, stats.data.customersWithWashes)} of customers · ${stats.data.opens} opens`}
          />
          <StatTile label="Shared" value={String(stats.data.sharers)} hint={`${percentOf(stats.data.sharers, stats.data.opened)} of openers · ${stats.data.shares} images`} />
        </div>
      )}

      <ScCard className="flex flex-col gap-3 px-4 py-4">
        <h2 className="text-sm font-semibold text-text-primary">Preview a customer&apos;s Wrapped</h2>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            find.mutate(phone.trim(), { onSuccess: (data) => setCustomer({ id: data.customer.id, name: data.customer.name }) })
          }}
        >
          <ScInput label="Phone (10 digits)" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
          <ScButton type="submit" fullWidth={false} className="min-h-10 px-4" disabled={phone.length !== 10 || find.isPending}>
            {find.isPending ? 'Finding…' : 'Find'}
          </ScButton>
        </form>
        {find.isError && <p className="text-[12px] text-error">{errorMessage(find.error, 'No customer has that phone number')}</p>}
        {customer &&
          (preview.isPending ? (
            <SkeletonList />
          ) : preview.isError || !preview.data ? (
            <p className="text-[12px] text-error">{errorMessage(preview.error, "Couldn't make the preview")}</p>
          ) : preview.data.washes === 0 ? (
            <p className="text-[12px] text-text-secondary">
              {customer.name} has no stamp-earning washes in {year}: no Wrapped for that year.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-text-secondary">
                {customer.name}, {year}: the cards as the customer sees them (first name on).
              </p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {wrappedCards(preview.data, { showName: true }).map((card) => (
                  <div key={card.key} className="flex aspect-[9/16] flex-col justify-end gap-1 rounded-[14px] border border-border bg-[linear-gradient(170deg,#1F2026,#0A0A0B_78%)] p-3">
                    <p className="text-[10px] text-text-secondary">{card.eyebrow}</p>
                    <p className="font-numeric text-[18px] font-semibold leading-tight text-text-primary">{card.big}</p>
                    <p className="text-[11px] text-text-secondary">{card.caption}</p>
                    {card.extra.map((line) => (
                      <p key={line} className="text-[10px] text-text-muted">
                        · {line}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
      </ScCard>
    </div>
  )
}
