'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/sc/app-shell'
import { ScBadge } from '@/components/sc/badge'
import { ScCard } from '@/components/sc/card'
import { StarRating } from '@/components/sc/stars'
import { TopBar } from '@/components/sc/top-bar'
import {
  EMPTY_EARNINGS_SUMMARY,
  getEarningsSummary,
  getRecentEarningsJobs,
} from '@/lib/api/earnings'
import type { EarningsJob, EarningsSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function VendorEarningsPage() {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [summary, setSummary] = useState<EarningsSummary>(EMPTY_EARNINGS_SUMMARY)
  const [jobs, setJobs] = useState<EarningsJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)

    Promise.all([getEarningsSummary(period), getRecentEarningsJobs()])
      .then(([nextSummary, nextJobs]) => {
        if (!active) return
        setSummary(nextSummary)
        setJobs(nextJobs)
      })
      .catch(() => {
        if (!active) return
        setSummary(EMPTY_EARNINGS_SUMMARY)
        setJobs([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [period])

  const metrics = [
    { label: 'Total earned', value: `₹${summary.totalEarned.toLocaleString('en-IN')}`, color: 'text-success' },
    { label: 'Jobs done', value: summary.jobsDone, color: 'text-text-primary' },
    { label: 'Pending', value: `₹${summary.pending.toLocaleString('en-IN')}`, color: 'text-warning' },
    { label: 'Avg rating', value: null, color: 'text-brand-red', stars: summary.avgRating },
  ]

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar
        title="Earnings"
        right={
          <div className="flex rounded-md bg-surface p-0.5 text-[11px]">
            {(['week', 'month'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  'rounded px-2 py-1 capitalize',
                  period === p ? 'bg-brand-red text-brand-white' : 'text-text-secondary'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />

      <div className={cn('grid grid-cols-2 gap-2', loading && 'opacity-60')}>
        {metrics.map((m) => (
          <ScCard key={m.label}>
            <p className="text-[11px] text-text-secondary">{m.label}</p>
            {m.stars !== null && m.stars !== undefined ? (
              m.stars > 0 ? (
                <StarRating rating={m.stars} />
              ) : (
                <p className="text-lg font-semibold text-text-primary">0</p>
              )
            ) : (
              <p className={cn('text-lg font-semibold', m.color)}>{m.value}</p>
            )}
          </ScCard>
        ))}
      </div>

      <div className="border-t border-border pt-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Recent jobs</h2>
        <div className={cn('flex flex-col gap-2', loading && 'opacity-60')}>
          {jobs.length === 0 ? (
            <ScCard>
              <p className="text-[11px] text-text-secondary">Recent jobs</p>
              <p className="text-lg font-semibold text-text-primary">0</p>
            </ScCard>
          ) : (
            jobs.map((job) => (
              <ScCard key={job.id} className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium">{job.serviceName}</p>
                  <p className="text-[11px] text-text-secondary">{job.customerName} · {job.date} · {job.type}</p>
                </div>
                <div className="text-right">
                  <p className={cn('text-[13px] font-semibold', job.settled ? 'text-success' : 'text-warning')}>
                    ₹{job.amount}
                  </p>
                  {!job.settled && <ScBadge variant="pending">Pending</ScBadge>}
                </div>
              </ScCard>
            ))
          )}
        </div>
      </div>
    </AppShell>
  )
}
