'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { StockItem } from '@repo/core/api/garage-book'
import { useBookStock } from '@repo/core/api/hooks/use-garage-book'
import { stockAmountText } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useT, useTn } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { AddButton, BackHeader, BookScreen, Footnote, LoadFailed, raised } from '@/components/book/parts'
import { StockGauge } from '@/components/book/stock-gauge'
import { StockItemSheet } from '@/components/book/stock-sheet'

/**
 * Stock (K1): each item on its dial (moment 7), what is running low on
 * top with Order again (the owner's), and how many jobs what is left still
 * covers. Stock goes down by itself as jobs are finished, by what each
 * service uses. Staff see the levels and can count, with no prices.
 */
export default function StockPage() {
  const t = useT()
  const tn = useTn()
  const isOwner = useIsVendorAdmin()
  const stock = useBookStock()
  const [adding, setAdding] = useState(false)
  const data = stock.data

  return (
    <BookScreen>
      <BackHeader title={t('Stock')} back="/book/business" right={isOwner ? <AddButton label={t('Add')} onClick={() => setAdding(true)} /> : undefined} />
      {!data ? (
        stock.isError ? <LoadFailed what={t('your stock')} onRetry={() => void stock.refetch()} /> : <SkeletonList count={2} itemClassName="h-36" />
      ) : data.items.length === 0 ? (
        <div className="fx-edge flex flex-col gap-3 rounded-surface px-4 py-4">
          <p className="text-t3 font-semibold text-text-primary">{t('No stock written down yet')}</p>
          <p className="text-t4 text-[#A8A8B2]">{t('Add what you use, like foam shampoo or wax, and how much each service uses. It goes down by itself as you finish jobs.')}</p>
          {isOwner && (
            <button type="button" onClick={() => setAdding(true)} className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary')}>
              {t('Add stock')}
            </button>
          )}
        </div>
      ) : (
        <>
          {data.lowCount > 0 && (
            <div className="fx-edge flex items-center gap-3 rounded-surface px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-t3 font-semibold text-[#F5A524]">{tn(data.lowCount, '{count} running low', '{count} running low')}</span>
                <span className="block truncate text-[12px] text-[#A8A8B2]">{data.lowNames.join(' · ')}</span>
              </span>
              {isOwner && (
                <Link href="/book/stock/order" className={cn(raised, 'grid h-11 shrink-0 place-items-center rounded-small px-3.5 text-t4 font-semibold text-text-primary')}>
                  {t('Order again')}
                </Link>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {data.items.map((item) => (
              <StockTile key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
      <Footnote>{t('Stock goes down by itself when you finish a job, by what each service uses.')}</Footnote>
      {adding && <StockItemSheet item={null} onClose={() => setAdding(false)} />}
    </BookScreen>
  )
}

function StockTile({ item }: { item: StockItem }) {
  const t = useT()
  const tn = useTn()
  const left = item.jobsLeft !== null ? tn(item.jobsLeft, 'About {count} job', 'About {count} jobs') : item.low ? t('Running low') : null
  return (
    <Link href={`/book/stock/${item.id}`} className="fx-edge fx-press flex min-w-0 flex-col items-center gap-1 rounded-surface px-3 pt-3.5 pb-3 text-center">
      <StockGauge share={item.share} low={item.low} width={92} />
      <span className="mt-1 block max-w-full truncate text-t3 font-semibold text-text-primary">{item.name}</span>
      <span className="block text-[12px] text-[#A8A8B2]">{t('{amount} left', { amount: stockAmountText(item.level, item.unit) })}</span>
      {left && <span className={cn('block text-[12px]', item.low ? 'font-semibold text-[#F5A524]' : 'text-[#A8A8B2]')}>{left}</span>}
    </Link>
  )
}
