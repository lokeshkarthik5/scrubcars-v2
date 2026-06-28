'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/sc/app-shell'
import { ScBadge } from '@/components/sc/badge'
import { ScCard } from '@/components/sc/card'
import { StarRating } from '@/components/sc/stars'
import { TopBar } from '@/components/sc/top-bar'
import { getEarningsSummary, getRecentEarningsJobs } from '@/lib/api/earnings'
import type { EarningsJob, EarningsSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function VendorEarningsPage() {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [summary, setSummary] = useState<EarningsSummary | null>(null)
  const [jobs, setJobs] = useState<EarningsJob[]>([])

  useEffect(() => {
    getEarningsSummary(period).then(setSummary)
    getRecentEarningsJobs().then(setJobs)
  }, [period])

  if (!summary) return null

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

      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <ScCard key={m.label}>
            <p className="text-[11px] text-text-secondary">{m.label}</p>
            {m.stars ? (
              <StarRating rating={m.stars} />
            ) : (
              <p className={cn('text-lg font-semibold', m.color)}>{m.value}</p>
            )}
          </ScCard>
        ))}
      </div>

      <div className="border-t border-border pt-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Recent jobs</h2>
        <div className="flex flex-col gap-2">
          {jobs.map((job) => (
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
          ))}
        </div>
      </div>
    </AppShell>
  )
}
