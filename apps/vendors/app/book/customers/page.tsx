'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconBell, IconSearch } from '@tabler/icons-react'
import { useBookCustomers } from '@repo/core/api/hooks/use-garage-book'
import type { BookCustomerRow } from '@repo/core/api/garage-book'
import { carName, customerTag, plateText, type BookFilter } from '@repo/core/garage-book'
import { useDebounced } from '@repo/core/hooks/use-debounced'
import { msg, useT, useTn } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { NumberPlate } from '@repo/ui/finish/number-plate'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { FILTERS } from '@/components/book/day-list'
import { BookScreen, Disc, Footnote, IconWell, LoadFailed, Seg, Tag, raised } from '@/components/book/parts'

/**
 * Customers (B2): search; All / Detlio / My own; a "N customers are due"
 * card with Remind; rows with their plate. Detlio customers say "Via
 * Detlio" and never show a phone number.
 */
export default function CustomersPage() {
  const t = useT()
  const tn = useTn()
  const [filter, setFilter] = useState<BookFilter>('all')
  const [q, setQ] = useState('')
  const search = useDebounced(q.trim(), 250)
  const list = useBookCustomers({ filter, q: search })
  const data = list.data

  return (
    <BookScreen>
      <h1 className="flex items-baseline gap-2 text-title font-semibold text-text-primary">
        {t('Customers')}
        {data && <span className="font-numeric text-[16px] font-semibold text-[#A8A8B2]">{data.counts.all}</span>}
      </h1>
      <label className="fx-recessed flex h-12 items-center gap-2.5 rounded-control px-3.5">
        <IconSearch size={20} className="text-[#8E8E98]" aria-hidden />
        <span className="sr-only">{t('Search customers')}</span>
        <input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('Name, phone or car number')}
          className="min-w-0 flex-1 border-0 bg-transparent text-t3 text-text-primary outline-none placeholder:text-[#8A8A94]"
        />
      </label>
      <Seg<BookFilter> label={msg('Show customers')} value={filter} options={FILTERS(data?.counts)} onChange={setFilter} />

      {data && data.dueCount > 0 && (
        <div className="fx-edge flex items-center gap-3 rounded-surface px-3.5 py-3">
          <IconWell>
            <IconBell size={19} className="text-[#F5A524]" aria-hidden />
          </IconWell>
          <div className="min-w-0 flex-1">
            <p className="text-t3 font-semibold text-text-primary">
              {tn(data.dueCount, '{count} customer is due', '{count} customers are due')}
            </p>
            <p className="mt-0.5 text-[12px] text-[#A8A8B2]">{t('Remind them from your own WhatsApp')}</p>
          </div>
          <Link href="/book/reminders" className={cn(raised, 'flex h-10 shrink-0 items-center rounded-small px-3 text-t4 font-semibold text-text-primary')}>
            {t('Remind')}
          </Link>
        </div>
      )}

      {data ? (
        data.customers.length === 0 ? (
          <p className="fx-edge rounded-control px-4 py-4 text-t4 text-[#A8A8B2]">
            {search
              ? t('No one matches that.')
              : filter === 'detlio'
                ? t('No Detlio customers yet.')
                : t('No customers yet. Add a walk-in with + and they’re here.')}
          </p>
        ) : (
          <ul className="flex flex-col">
            {data.customers.map((row) => (
              <CustomerRow key={row.id} row={row} />
            ))}
          </ul>
        )
      ) : list.isError ? (
        <LoadFailed what={t('your customers')} onRetry={() => void list.refetch()} />
      ) : (
        <SkeletonList count={5} itemClassName="h-16" />
      )}

      <Footnote>
        {t(
          'Customers you bring in are yours, and Detlio never shows them to other garages. Detlio customers show without a phone number; tap Remind and Detlio sends it in the Detlio app.'
        )}
      </Footnote>
    </BookScreen>
  )
}

function CustomerRow({ row }: { row: BookCustomerRow }) {
  const t = useT()
  const tag = customerTag(row)
  const car = row.cars[0]
  const plate = plateText(car?.plate)
  const sub = row.cars.length > 1 ? t('{count} cars', { count: row.cars.length }) : car ? car.model || carName(car) : ''
  return (
    <li>
      <Link href={`/book/customers/${encodeURIComponent(row.id)}`} className="flex items-center gap-3 border-b border-[#1d1d23] py-3">
        <Disc name={row.name} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-t3 font-semibold text-text-primary">
            <span className="truncate">{row.name}</span>
            {row.viaDetlio && <Tag detlio />}
          </span>
          <span className="flex min-w-0 items-center gap-2 text-t4 text-[#A8A8B2]">
            {plate && <NumberPlate plate={plate} size="xs" />}
            <span className="truncate">{sub}</span>
          </span>
        </span>
        <span
          className={cn(
            'max-w-[84px] shrink-0 text-right text-[12px] font-semibold',
            tag.tone === 'due' ? 'text-[#F5A524]' : tag.tone === 'owed' ? 'text-[#FF8A95]' : 'text-[#8E8E98]'
          )}
        >
          {tag.text}
        </span>
      </Link>
    </li>
  )
}
