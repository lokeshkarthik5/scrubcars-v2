'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { IconExternalLink, IconInfoCircle } from '@tabler/icons-react'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { Skeleton } from '@repo/ui/sc/skeleton'
import type {
  StatsBehaviourDevice,
  StatsBehaviourReport,
  StatsBehaviourSource,
} from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useStatsBehaviour } from '@repo/core/api/hooks/use-admin-stats'
import { cn } from '@repo/core/utils'
import { CardHeading, ShareBar } from '@/components/statistics/breakdown-tab'
import { HowWeCount } from '@/components/statistics/how-we-count'
import {
  behaviourLeftOutLine,
  behaviourStartNote,
  biggestLeakLine,
  clarityProjectId,
  clarityRecordingsUrl,
  percent,
  plural,
  type DateRange,
} from '@/lib/statistics'

const HOW_WE_COUNT = [
  'A visit is one browser tab on detlio.com, from opening it to closing it, recorded by Detlio’s own usage events (sent to our API, nothing to a third party). Visits are the unit: each step counts the visits that landed on the homepage in the period and did that step at any point in the visit.',
  'Saw a garage: a garage card was at least half on screen in a list, once a visit. Opened a service: a service’s details opened, or one added. Started booking: Book Now on a garage’s page, or checkout. Gave a number: a sign-in code was sent, or the visit was already signed in. Paid: the payment went through in that visit.',
  'A step nothing records yet shows “Not recorded yet”, and what was lost is counted from the step before it.',
  'Left out: visits by the team (an admin account, or an account whose number is a team login’s phone), visits that made a booking marked Test, and, never recorded at all, browsers that ask not to be tracked (Do Not Track or Global Privacy Control) and team devices (detlio.com/?team-device=1).',
  'Source comes from the visit’s first page: its campaign tag, the site it came from, or Instagram’s in-app browser. Direct means none of those. Desktop is any screen 640px wide or more, tablets included.',
  'Usage events are kept for 180 days. Clarity’s recordings are only of visitors who said Allow to analytics and marketing cookies.',
]

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-[14px] border border-border bg-surface px-3.5 py-3 text-[12px] leading-[1.45] text-text-secondary">
      <IconInfoCircle
        size={18}
        aria-hidden="true"
        className="mt-px shrink-0 text-text-secondary"
      />
      <span>{children}</span>
    </p>
  )
}

function Funnel({ report }: { report: StatsBehaviourReport }) {
  const { funnel } = report
  const landed = funnel.steps[0]?.count ?? 0
  const leak = funnel.biggestLeak
  const leakLine = biggestLeakLine(funnel)

  return (
    <ScCard className="px-4 py-4">
      <CardHeading
        title="From landing to paid"
        subtitle={`${plural(landed, 'visit', 'visits')} landed · ${plural(report.visits, 'visit', 'visits')} in all`}
      />
      <ol
        aria-label="Steps from landing to paid"
        className="mt-4 flex flex-col gap-1"
      >
        {funnel.steps.map((step) => {
          const isLeak = leak?.key === step.key
          return (
            <li
              key={step.key}
              data-step={step.key}
              className={cn(
                '-mx-2 rounded-[10px] px-2 py-2',
                isLeak && 'border border-warning/40 bg-warning-muted'
              )}
            >
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span
                  className={cn(
                    'min-w-0 text-text-primary',
                    isLeak && 'font-medium'
                  )}
                >
                  {step.label}
                </span>
                {step.count === null ? (
                  <span className="text-[12px] text-text-muted">
                    Not recorded yet
                  </span>
                ) : (
                  <span className="flex shrink-0 items-baseline gap-2.5">
                    {step.lost !== null && step.lost > 0 && (
                      <em
                        className={cn(
                          'not-italic text-[12px]',
                          isLeak ? 'text-warning' : 'text-text-muted'
                        )}
                      >
                        −{step.lost.toLocaleString('en-IN')}
                        {isLeak && ' left here'}
                      </em>
                    )}
                    <b className="font-numeric text-[17px] font-medium tabular-nums text-text-primary">
                      {step.count.toLocaleString('en-IN')}
                    </b>
                  </span>
                )}
              </div>
              {step.count !== null && (
                <ShareBar
                  share={landed > 0 ? step.count / landed : 0}
                  className="mt-2 h-2"
                />
              )}
            </li>
          )
        })}
      </ol>
      {leakLine ? (
        <p className="mt-3 rounded-[10px] border border-border px-3 py-2 text-[12px] text-text-secondary">
          {leakLine}
        </p>
      ) : (
        <p className="mt-3 text-[12px] text-text-muted">
          Nobody left between steps in this period.
        </p>
      )}
    </ScCard>
  )
}

function LastSteps({
  lastSteps,
}: {
  lastSteps: StatsBehaviourReport['lastSteps']
}) {
  return (
    <ScCard className="px-4 pb-1.5 pt-4">
      <CardHeading
        title="Last step before leaving"
        subtitle={`Top 5 · of ${plural(lastSteps.leavers, 'visit', 'visits')} that landed and did not pay`}
      />
      {lastSteps.rows.length === 0 ? (
        <p className="py-4 text-[13px] text-text-secondary">
          Nobody left without paying in this period.
        </p>
      ) : (
        <ol className="mt-2.5">
          {lastSteps.rows.map((row) => (
            <li
              key={row.event}
              className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-[13px] last:border-b-0"
            >
              <span className="min-w-0 truncate text-text-primary">
                {row.label}
              </span>
              <span className="shrink-0 font-numeric tabular-nums text-text-secondary">
                {row.sessions.toLocaleString('en-IN')} · {percent(row.share)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </ScCard>
  )
}

/** "Open recordings in Clarity", only when the build names the project. */
function ClarityLink() {
  const projectId = clarityProjectId(process.env.NEXT_PUBLIC_CLARITY_ID)
  if (!projectId) return null
  return (
    <a
      href={clarityRecordingsUrl(projectId)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-11 items-center justify-between gap-3 rounded-[14px] border border-border bg-surface px-3.5 py-2.5 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-elevated outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70"
    >
      <span>
        Open recordings in Clarity
        <span className="mt-0.5 block text-[12px] font-normal text-text-secondary">
          Heatmaps, scroll depth, rage taps and replays: the why behind the
          drops
        </span>
      </span>
      <IconExternalLink
        size={16}
        aria-hidden="true"
        className="shrink-0 text-text-secondary"
      />
    </a>
  )
}

/**
 * The Behaviour tab (0061): where visits from the landing page leave on the
 * way to a paid booking, by visit, with the last thing they did and a link
 * to Clarity's recordings for the why. Test bookings, the team's own visits
 * and Do-Not-Track browsers are left out, and the page says so.
 */
export function BehaviourTab({
  range,
  source,
  device,
}: {
  range: DateRange
  source: StatsBehaviourSource
  device: StatsBehaviourDevice
}) {
  const router = useRouter()
  const stats = useStatsBehaviour({ ...range, source, device })

  useEffect(() => {
    if (isAuthError(stats.error)) router.replace('/login')
  }, [stats.error, router])

  if (!stats.data) {
    return stats.isError ? (
      <ErrorState
        message={errorMessage(stats.error, "Couldn't load Behaviour.")}
        onRetry={() => void stats.refetch()}
      />
    ) : (
      <div role="status" aria-busy="true" className="mt-3 flex flex-col gap-5">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[260px]" />
      </div>
    )
  }

  const report = stats.data
  const startNote = behaviourStartNote(report.stepsSince, report.range)
  return (
    // Its own spacing: the page's children sit in the route template's
    // plain div, so the shell's gap does not reach them.
    <div className="mt-3 flex flex-col gap-5">
      <div
        aria-busy={stats.isFetching || undefined}
        className={cn(
          'flex flex-col gap-5 transition-opacity',
          stats.isPlaceholderData && 'opacity-60'
        )}
      >
        <Note>
          Test bookings, the team’s own visits and browsers that ask not to be
          tracked are left out. {behaviourLeftOutLine(report.leftOut)}
        </Note>
        {startNote && <Note>{startNote}</Note>}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <Funnel report={report} />
          <div className="flex flex-col gap-5">
            <LastSteps lastSteps={report.lastSteps} />
            <ClarityLink />
          </div>
        </div>
      </div>
      <HowWeCount lines={HOW_WE_COUNT} />
    </div>
  )
}
