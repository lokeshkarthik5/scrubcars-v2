'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconReceipt } from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { Reveal } from '@repo/ui/sc/reveal'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import { Stars } from '@repo/ui/sc/stars'
import { TopBar } from '@repo/ui/sc/top-bar'
import { EMPTY_EARNINGS_SUMMARY, getEarningsData } from '@repo/core/api/earnings'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { formatRupees } from '@repo/core/job-records'
import { useAuthStore } from '@repo/core/stores/auth-store'
import type { EarningsJob, EarningsSummary } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { formatRating } from '@repo/core/vendor-stats'
import { ActiveGarage } from '@/components/active-garage'

export default function VendorEarningsPage() {
  const vendor = useAuthStore((s) => s.vendor)
  const isVendorAdmin = useIsVendorAdmin()
  const router = useRouter()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [summary, setSummary] = useState<EarningsSummary>(EMPTY_EARNINGS_SUMMARY)
  const [jobs, setJobs] = useState<EarningsJob[]>([])
  const [loading, setLoading] = useState(true)
  // Whether any period has been read yet. The first load shows placeholders;
  // a switch of period keeps the last figures on screen, dimmed, until the
  // new ones land.
  const [loadedOnce, setLoadedOnce] = useState(false)

  // Operators have no Earnings tab, so this is only reachable by typing the
  // URL. Send them home rather than showing an empty screen full of zeros.
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home')
  }, [isVendorAdmin, router])

  useEffect(() => {
    if (!vendor?.id || !isVendorAdmin) return
    let active = true

    getEarningsData(period)
      .then(({ summary: nextSummary, jobs: nextJobs }) => {
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
        if (!active) return
        setLoading(false)
        setLoadedOnce(true)
      })

    return () => {
      active = false
    }
  }, [period, vendor?.id, isVendorAdmin])

  // An operator is on their way back to Home (above); nothing here is theirs
  // to see, not even a row of zeros.
  if (!isVendorAdmin) return null

  return (
    <AppShell
      showNav
      navType="vendor"
      showBrand
      brandRight={<ActiveGarage />}
      className="gap-5 py-4"
    >
      <TopBar
        title="Earnings"
        right={
          <ScSegmented
            aria-label="Earnings period"
            size="sm"
            value={period}
            onChange={(next) => {
              // Raised here rather than in the effect below: this is the only
              // thing that refetches after mount, and a spinner owed to a tap
              // belongs to the tap.
              setLoading(true)
              setPeriod(next)
            }}
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        }
      />

      {!loadedOnce ? (
        <SkeletonList count={2} itemClassName="h-[76px]" className="grid grid-cols-2" />
      ) : (
        // Dimmed, not replaced, while another period loads: the previous
        // figures stay readable and the change is a fade, not a jump.
        <div
          aria-busy={loading || undefined}
          className={cn(
            'grid grid-cols-2 gap-2 transition-opacity duration-200 motion-reduce:transition-none',
            loading && 'opacity-60'
          )}
        >
          <StatTile label="Total earned" tone="success" value={formatRupees(summary.totalEarned)} />
          <StatTile label="Jobs done" value={summary.jobsDone} />
          <StatTile label="Pending" tone="warning" value={formatRupees(summary.pending)} />
          <StatTile
            label="Avg rating"
            value={
              <span className="flex items-center gap-1.5">
                {formatRating(summary.avgRating)}
                {summary.avgRating > 0 && <Stars rating={summary.avgRating} size={12} />}
              </span>
            }
            // Ratings run 1 to 5, so 0 here means none yet; the dash above
            // says "no figure", and this says why.
            hint={summary.avgRating > 0 ? undefined : 'No reviews yet'}
          />
        </div>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Recent jobs" />
        {!loadedOnce ? (
          <SkeletonList count={3} itemClassName="h-[72px]" />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<IconReceipt size={28} stroke={1.5} />}
            title={period === 'week' ? 'No jobs this week' : 'No jobs this month'}
            subtitle="Jobs you complete show up here with what they earned."
          />
        ) : (
          <div
            className={cn(
              'flex flex-col gap-2 transition-opacity duration-200 motion-reduce:transition-none',
              loading && 'opacity-60'
            )}
          >
            {jobs.map((job, i) => (
              <Reveal key={job.id} index={i}>
                <ScCard className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-text-primary">{job.serviceName}</p>
                    <p className="text-[11px] text-text-secondary">
                      {job.customerName} · <span className="font-numeric">{job.date}</span> · {job.type}
                    </p>
                    {/* Paid as if the job happened: the garage held the slot
                        and the customer didn't come. Said, so the garage knows
                        why a job it never did is on the list. */}
                    {job.kind === 'customer_no_show' && (
                      <ScBadge variant="muted" className="mt-1">Customer no-show</ScBadge>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p
                      className={cn(
                        'font-numeric text-[14px] font-bold',
                        job.settled ? 'text-success' : 'text-warning'
                      )}
                    >
                      {formatRupees(job.amount)}
                    </p>
                    {!job.settled && <ScBadge variant="pending">Pending</ScBadge>}
                  </div>
                </ScCard>
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}
