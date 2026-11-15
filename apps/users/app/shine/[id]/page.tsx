'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-toastify'
import { IconClock, IconShare2, IconStarFilled } from '@tabler/icons-react'
import { shineOn, useShineConfig, useShineScan, useShineSuggestions } from '@repo/core/api/hooks/use-shine-score'
import type { ShineSuggestion } from '@repo/core/api/shine-score'
import { formatClock, formatDay } from '@repo/core/format'
import { formatRupees } from '@repo/core/job-records'
import { SHINE_AREAS, SHINE_AREA_LABELS, SHINE_FOOTNOTE } from '@repo/core/shine-score'
import { coarse, isCitywide, useLocationStore } from '@repo/core/stores/location-store'
import { formatDuration } from '@repo/core/utils'
import { cn } from '@repo/core/utils'
import { useT } from '@repo/core/i18n'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { WashGauge } from '@repo/ui/finish/wash-gauge'
import { TopBar } from '@repo/ui/sc/top-bar'
import { CustomerShell } from '@/components/customer-shell'
import { NextFreeRow } from '@/components/garages/next-free-row'
import { ScCard } from '@/components/ui/card'
import { shareShineScore } from '@/lib/shine-share'

function SuggestionCard({ suggestion: s }: { suggestion: ShineSuggestion }) {
  const t = useT()
  const price = formatRupees(Number(s.service.fromPrice))
  return (
    <li className="hub-card overflow-hidden">
      <Link
        href={`/book/${s.vendorId}?service=${s.service.id}`}
        className="flex items-start justify-between gap-3 px-3.5 pt-3.5 pb-3"
      >
        <span className="min-w-0">
          <span className="block truncate text-t3 font-semibold text-text-primary">{s.service.name}</span>
          <span className="mt-0.5 flex items-center gap-1 text-t5 text-text-secondary">
            <span className="truncate">{s.vendorName}</span>
            {s.rating !== null && (
              <>
                <span aria-hidden>·</span>
                <IconStarFilled size={11} aria-hidden className="shrink-0 text-[#F5B83D]" />
                <span className="font-numeric">{s.rating.toFixed(1)}</span>
              </>
            )}
            {s.distanceKm !== null && (
              <>
                <span aria-hidden>·</span>
                <span className="font-numeric whitespace-nowrap">{t('{km} km', { km: s.distanceKm })}</span>
              </>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-numeric text-t2 font-semibold text-text-primary">
            {s.service.perVehicle ? t('From {price}', { price }) : price}
          </span>
          {s.service.durationMins !== null && (
            <span className="mt-0.5 flex items-center justify-end gap-1 text-t5 text-text-secondary">
              <IconClock size={11} aria-hidden />
              <span className="font-numeric">{formatDuration(s.service.durationMins)}</span>
            </span>
          )}
        </span>
      </Link>
      <NextFreeRow
        vendor={{ id: s.vendorId, name: s.vendorName }}
        mode="dropin"
        visible
        serviceIds={[s.service.id]}
        className="border-t border-line pt-3"
      />
    </li>
  )
}

/**
 * The result (0075): the score on the Last wash gauge turned round (higher
 * is greener), the summary, a score per area, what was noticed, real
 * services nearby for it with times to tap, and Share. Scores are
 * suggestions, and the page says so.
 */
export default function ShineResultPage() {
  const t = useT()
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : ''
  const config = useShineConfig()
  const on = shineOn(config.data)
  const scan = useShineScan(id, on)
  const location = useLocationStore((s) => s.location)
  // Rounded before it leaves the phone, as Home's Nearby does; never stored.
  const origin = location && !isCitywide(location) ? coarse(location) : null
  const suggestions = useShineSuggestions(scan.data?.need, origin)

  const share = async () => {
    if (!scan.data) return
    const outcome = await shareShineScore({ score: scan.data.overall })
    if (outcome === 'copied') toast.success(t('Copied. Paste it anywhere to share.'))
    if (outcome === 'failed') toast.error(t("Couldn't share right now."))
  }

  const header = (
    <TopBar
      title={t('Your Shine Score')}
      showBack
      backHref="/home"
      right={
        scan.data ? (
          <button
            type="button"
            onClick={() => void share()}
            aria-label={t('Share')}
            className="-m-[11px] grid size-11 place-items-center text-text-primary"
          >
            <IconShare2 size={20} stroke={1.5} />
          </button>
        ) : undefined
      }
    />
  )

  if (scan.isPending || config.isPending) {
    return (
      <CustomerShell className="gap-3 pt-1 pb-8">
        {header}
        <div className="h-[210px] rounded-card shimmer" />
        <div className="h-[220px] rounded-card shimmer" />
      </CustomerShell>
    )
  }
  if (!scan.data) {
    return (
      <CustomerShell className="gap-3 pt-1 pb-8">
        {header}
        <ErrorState message={t("Couldn't load your score.")} onRetry={() => void scan.refetch()} />
      </CustomerShell>
    )
  }

  const s = scan.data
  const list = suggestions.data?.suggestions ?? []
  return (
    <CustomerShell className="gap-3 pt-1 pb-8">
      {header}

      <ScCard className="flex flex-col gap-3 px-5 py-4">
        <p className="text-t5 text-text-secondary">
          {t(formatDay(s.scoredAt))}, <span className="font-numeric">{formatClock(s.scoredAt)}</span>
        </p>
        <div className="flex items-end gap-4">
          <WashGauge
            daysSinceWash={s.overall}
            intervalDays={100}
            over={false}
            reversed
            className="mb-1 origin-bottom-left scale-125"
          />
          <p className="ml-6 flex items-baseline gap-1.5" aria-label={t('Score {score} out of 100', { score: s.overall })}>
            <span className="font-numeric text-[56px] leading-[0.9] font-medium tracking-[-0.045em] text-text-primary">
              {s.overall}
            </span>
            <span className="text-t4 text-dim">/ 100</span>
          </p>
        </div>
        <p className="text-t3 leading-snug text-text-secondary">
          <b className="font-medium text-text-primary">{t(s.summary)}</b> {t(s.suggestion)}
        </p>
      </ScCard>

      <ScCard className="px-5 py-1">
        <ul aria-label={t('Score by area')}>
          {SHINE_AREAS.map((area, i) => {
            const value = s.scores[area]
            return (
              <li
                key={area}
                className={cn('flex min-h-[50px] items-center gap-3', i > 0 && 'border-t border-line')}
              >
                <span className="flex-1 text-t3 text-text-primary">{t(SHINE_AREA_LABELS[area])}</span>
                <span aria-hidden className="h-[3px] w-14 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-text-primary" style={{ width: `${value}%` }} />
                </span>
                <span className="w-8 text-right font-numeric text-t3 font-semibold text-text-primary">{value}</span>
              </li>
            )
          })}
        </ul>
      </ScCard>

      {s.findings.length > 0 && (
        <ScCard className="flex flex-col gap-2.5 px-5 py-4">
          <h2 className="text-t3 font-semibold text-text-primary">{t('What we noticed')}</h2>
          <ul className="flex flex-col gap-2.5">
            {s.findings.map((finding) => (
              <li key={finding.text} className="flex gap-2.5">
                <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-text-primary" />
                <span>
                  <span className="block text-t3 text-text-primary">{finding.text}</span>
                  <span className="block text-t5 text-text-muted">{t(SHINE_AREA_LABELS[finding.area])}</span>
                </span>
              </li>
            ))}
          </ul>
        </ScCard>
      )}

      {list.length > 0 && (
        <section aria-labelledby="shine-suggested" className="mt-2 flex flex-col gap-2.5">
          <div>
            <h2 id="shine-suggested" className="text-t2 font-medium text-text-primary">
              {t('Suggested for you')}
            </h2>
            <p className="text-t5 text-text-secondary">{t("Picked for what we noticed. Prices are the garages' own.")}</p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {list.map((suggestion) => (
              <SuggestionCard key={suggestion.vendorId} suggestion={suggestion} />
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={() => void share()}
        className="fx-edge press mt-1 flex min-h-12 items-center justify-center gap-2 rounded-[18px] text-t3 font-medium text-text-primary"
      >
        <IconShare2 size={17} stroke={1.5} aria-hidden />
        {t('Share my score')}
      </button>
      <p className="px-4 text-center text-t5 text-text-muted">{t(SHINE_FOOTNOTE)}</p>
    </CustomerShell>
  )
}
