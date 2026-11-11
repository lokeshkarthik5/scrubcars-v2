'use client'

import { useState } from 'react'
import { useBookStats } from '@repo/core/api/hooks/use-garage-book'
import { WEEK_LETTERS, busiestIndex, monthName, recentMonths, rupees, type BookFilter } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { msg, useT, useTn } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { BackHeader, BookScreen, LoadFailed, Overline, Seg, Tile, raised } from '@/components/book/parts'

/**
 * Stats (B4, the owner's): a month picker, All / Detlio / My own, takings
 * split own and Detlio, who came back, new customers, money owed and the
 * busiest days. Profit waits for Expenses (stage 2). Detlio figures are what
 * customers paid; the payout is on Payouts.
 */
export default function StatsPage() {
  const t = useT()
  const tn = useTn()
  const isOwner = useIsVendorAdmin()
  const now = new Date()
  const months = recentMonths(now)
  const [month, setMonth] = useState(months[0]!)
  const [filter, setFilter] = useState<BookFilter>('all')
  const stats = useBookStats(month === months[0] ? undefined : month, filter, isOwner)
  const data = stats.data
  const lit = data ? busiestIndex(data.busiestDays) : null
  const max = data ? Math.max(1, ...data.busiestDays) : 1
  const total = data ? data.split.ownPaise + data.split.detlioPaise : 0
  const detlioShare = data && total > 0 ? Math.round((data.split.detlioPaise / total) * 100) : 0

  return (
    <BookScreen>
      <BackHeader
        title={t('Stats')}
        back="/book/business"
        right={
          <label className={cn(raised, 'relative flex h-10 items-center rounded-small pr-2 pl-3.5 text-t4 font-semibold text-text-primary')}>
            <span className="sr-only">{t('Month')}</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)} className="appearance-none bg-transparent pr-5 outline-none">
              {months.map((m) => (
                <option key={m} value={m} className="bg-[#17171b]">
                  {monthName(m, now)}
                </option>
              ))}
            </select>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute right-2" aria-hidden>
              <path d="M6 9l6 6l6 -6" />
            </svg>
          </label>
        }
      />
      <Seg<BookFilter>
        label={msg('Show money from')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: msg('All') },
          { value: 'detlio', label: 'Detlio' },
          { value: 'own', label: msg('My own') },
        ]}
      />
      {!isOwner ? (
        <p className="fx-edge rounded-control px-4 py-4 text-t4 text-[#A8A8B2]">{t("Only the garage's owner sees Stats.")}</p>
      ) : !data ? (
        stats.isError ? <LoadFailed what={t('Stats')} onRetry={() => void stats.refetch()} /> : <SkeletonList count={3} itemClassName="h-28" />
      ) : (
        <>
          <div className="fx-edge flex flex-col gap-3 rounded-surface p-4">
            <div>
              <Overline>{month === months[0] ? t('This month so far') : monthName(month, now)}</Overline>
              <p className="mt-0.5 font-numeric text-[34px] font-semibold leading-[42px] tracking-[-0.02em] text-text-primary">{rupees(data.takenPaise)}</p>
              {data.changePercent !== null && (
                <p className={cn('text-[12px]', data.changePercent >= 0 ? 'text-[#4ADE80]' : 'text-[#FF8A95]')}>
                  {t('{arrow} {percent}% on last month, same days', {
                    arrow: data.changePercent >= 0 ? '↑' : '↓',
                    percent: Math.abs(data.changePercent),
                  })}
                </p>
              )}
            </div>
            {filter === 'all' && total > 0 && (
              <>
                <div role="img" aria-label={t('Detlio {detlio}, your own {own}', { detlio: rupees(data.split.detlioPaise) ?? '', own: rupees(data.split.ownPaise) ?? '' })} className="flex h-2 gap-[3px]">
                  {detlioShare > 0 && <span className="rounded-[4px] bg-[#ff2d4a] shadow-[0_0_8px_rgb(255_45_74/0.8)]" style={{ width: `${detlioShare}%` }} />}
                  {detlioShare < 100 && <span className="flex-1 rounded-[4px] bg-[linear-gradient(180deg,#f2f2f5,#a5a5ae)]" />}
                </div>
                <div className="flex justify-between gap-3 text-[12px] text-[#C8C8D0]">
                  <span>
                    Detlio <b className="font-numeric font-semibold text-text-primary">{rupees(data.split.detlioPaise)}</b>
                  </span>
                  <span>
                    {t('Your own')} <b className="font-numeric font-semibold text-text-primary">{rupees(data.split.ownPaise)}</b>
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Tile label={t('Came back')} value={data.cameBackPercent === null ? '–' : `${data.cameBackPercent}%`} sub={t("of last month's customers")} />
            <Tile label={t('New customers')} value={data.newCustomers} sub={data.newFromDetlio > 0 ? t('{count} found you on Detlio', { count: data.newFromDetlio }) : t('this month')} />
            {data.profitPaise !== null && <Tile label={t('Profit')} value={rupees(data.profitPaise)} />}
            <Tile label={t('Owed to you')} value={rupees(data.owedPaise)} sub={tn(data.owedCustomers, '{count} customer', '{count} customers')} />
          </div>
          <div className="fx-edge rounded-surface px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <Overline>{t('Busiest days')}</Overline>
              <span className="text-[11px] text-[#A8A8B2]">{t('last 4 weeks')}</span>
            </div>
            <div className="mt-2.5 flex gap-2">
              {data.busiestDays.map((n, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-[70px] w-full items-end">
                    <span
                      className="block w-full rounded-[6px_6px_3px_3px]"
                      style={{
                        height: `${Math.max(4, (n / max) * 100)}%`,
                        background: i === lit ? 'linear-gradient(180deg,#ff3550,#a8001f)' : 'linear-gradient(180deg,#e9e9ee,#8d8d97)',
                        boxShadow: i === lit ? '0 0 14px rgb(228 0 43 / .5)' : undefined,
                        opacity: i === lit ? 1 : 0.75,
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-[#A8A8B2]">{WEEK_LETTERS[i]}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[12px] leading-[17px] text-[#A8A8B2]">{t('Detlio figures are what customers paid for jobs done; your payout is on Payouts.')}</p>
        </>
      )}
    </BookScreen>
  )
}
