'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import { IconCheck, IconChevronRight, IconCopy, IconSparkles, IconStar } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { Figures } from '@repo/ui/sc/figures'
import { TopBar } from '@repo/ui/sc/top-bar'
import { rewardsEnabled, useMyRewards, useRewardsConfig } from '@repo/core/api/hooks/use-rewards'
import { useRewardExtras } from '@repo/core/api/hooks/use-reward-extras'
import type { RewardExtras } from '@repo/core/api/reward-extras'
import type { MyRewards, RewardVoucher } from '@repo/core/api/rewards'
import { levelLine, lifetimeLine, rewardDay, stampsToGoLine, streakLine } from '@repo/core/rewards'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { CustomerShell } from '@/components/customer-shell'
import { BadgeCabinet } from '@/components/rewards/badge-cabinet'
import { BadgeCelebration } from '@/components/rewards/badge-celebration'
import { ChallengeCard } from '@/components/rewards/challenge-card'
import { BirthdayForm } from '@/components/rewards/birthday-form'
import { InviteCard } from '@/components/rewards/invite-card'
import { LevelBadge } from '@/components/rewards/level-badge'
import { ScratchCardPanel } from '@/components/rewards/scratch-card'
import { StampStars } from '@/components/rewards/stamp-stars'
import { isHomeHubEnabled } from '@/lib/home-hub'

const VOUCHER_STATE_LABELS: Record<RewardVoucher['state'], string> = {
  available: 'Ready',
  spent: 'Used',
  expired: 'Ran out',
  cancelled: 'Withdrawn',
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

/**
 * Profile → Detlio Rewards (0050): the Shine Card, scratch cards waiting,
 * vouchers to use at checkout, the level and the ladder, the monthly
 * streak, the birthday, Invite a friend and the history, with the lifetime
 * line on top. Every number comes from the API (the live settings). 0054
 * adds the live challenges, Detlio Wrapped (when open), the badge cabinet
 * and the celebration of a badge not seen yet (?badge=<id> from its push;
 * ?challenge=<id> scrolls to that challenge).
 */
export default function RewardsPage() {
  return (
    <Suspense>
      <RewardsScreen />
    </Suspense>
  )
}

function RewardsScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const config = useRewardsConfig()
  const on = rewardsEnabled(config.data)
  const rewards = useMyRewards(on && !!user)
  const extras = useRewardExtras(on && !!user)
  const params = useSearchParams()

  const header = <TopBar title="Detlio Rewards" showBack backHref="/profile" large={isHomeHubEnabled()} />

  if (ready && !user) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">Sign in to see your rewards</p>
          <ScButton className="mt-2 w-auto px-8" onClick={() => router.push(`/login?next=${encodeURIComponent('/profile/rewards')}`)}>
            Sign in
          </ScButton>
        </div>
      </CustomerShell>
    )
  }

  if (ready && !config.isPending && !on) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <EmptyState
          icon={<IconStar size={32} stroke={1.5} />}
          title="Rewards aren't available right now"
          subtitle="You can still book a wash as usual."
          actionLabel="Find garages"
          onAction={() => router.push('/garages')}
        />
      </CustomerShell>
    )
  }

  const view = rewards.data
  const settings = config.data?.settings ?? null
  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
      {header}
      {!ready || config.isPending || rewards.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : rewards.isError || !view ? (
        <ErrorState message="Couldn't load your rewards. Check your connection." onRetry={() => void rewards.refetch()} />
      ) : (
        <RewardsBody
          view={view}
          extras={extras.data ?? null}
          focusBadge={params.get('badge')}
          focusChallenge={params.get('challenge')}
          birthdayPerkFrom={settings?.levels.find((l) => l.birthdayVoucher !== null)?.label ?? null}
        />
      )}
    </CustomerShell>
  )
}

function RewardsBody({
  view,
  extras,
  focusBadge,
  focusChallenge,
  birthdayPerkFrom,
}: {
  view: MyRewards
  extras: RewardExtras | null
  focusBadge: string | null
  focusChallenge: string | null
  birthdayPerkFrom: string | null
}) {
  const { card, level, streak } = view
  // A challenge's push opens the page on it.
  useEffect(() => {
    if (!focusChallenge || !extras) return
    document.getElementById(`challenge-${focusChallenge}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusChallenge, extras])
  const waiting = view.scratchCards.filter((c) => c.state === 'waiting')
  const available = view.vouchers.filter((v) => v.state === 'available')
  const past = view.vouchers.filter((v) => v.state !== 'available').slice(0, 10)
  const next = view.ladder.find((step) => step.key === level.next)
  const prevMin = view.ladder.find((step) => step.key === level.level)?.minBookings ?? 0
  const nextMin = next?.minBookings ?? null
  const progress = nextMin === null || level.toNext === null ? 100 : Math.round(((nextMin - level.toNext - prevMin) / Math.max(1, nextMin - prevMin)) * 100)

  return (
    <>
      {view.lifetime.washes > 0 && (
        <p className="text-[12px] text-text-secondary">
          <Figures text={lifetimeLine(view.lifetime)} />
        </p>
      )}

      {/* The Shine Card */}
      <section aria-labelledby="shine-card" className="shine-card flex flex-col gap-3 rounded-card px-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] text-text-secondary">Shine Card</p>
            <h2 id="shine-card" className="mt-0.5 text-[20px] font-semibold leading-tight text-text-primary">
              <Figures text={stampsToGoLine(card.toGo)} />
            </h2>
          </div>
          <LevelBadge level={level.level} label={level.label} />
        </div>
        <div className="flex justify-center gap-3 py-2" aria-label={`${card.onCard} of ${card.goal} stamps`} role="img">
          <StampStars onCard={card.onCard} goal={card.goal} size={30} remember />
        </div>
        <p className="text-[13px] text-text-secondary">
          <Figures text={`${card.goal} stamps make ₹${card.rewardAmount} off your next booking. One stamp for every booking of ₹${view.invite.minAmount} or more paid through Detlio.`} />
        </p>
        {card.nextExpiry && (
          <p className="text-[12px] text-text-muted">
            <Figures text={`${card.nextExpiry.count} ${card.nextExpiry.count === 1 ? 'stamp ends' : 'stamps end'} after ${rewardDay(card.nextExpiry.lastDay)}`} />
          </p>
        )}
      </section>

      {extras && extras.unseen.length > 0 && <BadgeCelebration badges={extras.unseen} focusId={focusBadge} />}

      {/* Detlio Wrapped (0054): from 1 December, and the year before all year. */}
      {extras && extras.wrapped.years.length > 0 && (
        <Link
          href={`/profile/rewards/wrapped?year=${extras.wrapped.years[0]}`}
          className="wrapped-teaser flex items-center justify-between gap-3 rounded-[14px] px-4 py-3.5"
        >
          <span className="flex min-w-0 items-center gap-3">
            <IconSparkles size={20} stroke={1.6} className="shrink-0 text-text-primary" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-text-primary">
                Your <span className="font-numeric">{extras.wrapped.years[0]}</span> Detlio Wrapped
              </span>
              <span className="block text-[12px] text-text-secondary">Your year in washes, garages and shine.</span>
            </span>
          </span>
          <IconChevronRight size={18} className="shrink-0 text-text-secondary" aria-hidden />
        </Link>
      )}

      {/* Seasonal challenges (0054). */}
      {extras && extras.challenges.length > 0 && (
        <section aria-labelledby="challenges" className="flex flex-col gap-2">
          <h2 id="challenges" className="text-sm font-semibold text-text-primary">
            {extras.challenges.length === 1 ? 'Challenge' : 'Challenges'}
          </h2>
          {extras.challenges.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} highlight={challenge.id === focusChallenge} />
          ))}
        </section>
      )}

      {waiting.length > 0 && (
        <section aria-labelledby="scratch-cards" className="flex flex-col gap-2">
          <h2 id="scratch-cards" className="text-sm font-semibold text-text-primary">
            {waiting.length === 1 ? 'A scratch card for you' : `${waiting.length} scratch cards for you`}
          </h2>
          {waiting.map((c) => (
            <ScratchCardPanel key={c.id} card={c} />
          ))}
        </section>
      )}

      <section aria-labelledby="vouchers" className="flex flex-col gap-2">
        <h2 id="vouchers" className="text-sm font-semibold text-text-primary">Your rewards</h2>
        {available.length === 0 ? (
          <ScCard>
            <p className="text-[12px] text-text-secondary">Nothing to use yet. Fill your Shine Card or scratch a card to win one.</p>
          </ScCard>
        ) : (
          available.map((v) => <VoucherRow key={v.id} voucher={v} />)
        )}
        {available.length > 0 && (
          <p className="text-[11px] text-text-muted">Choose one at checkout under Your rewards. One per booking, with Detlio credit but not with another code. Given back if the booking is cancelled.</p>
        )}
      </section>

      {/* The badge cabinet (0054). */}
      {extras && <BadgeCabinet extras={extras} />}

      {/* Level */}
      <section aria-labelledby="level" className="flex flex-col gap-2">
        <h2 id="level" className="text-sm font-semibold text-text-primary">Your level</h2>
        <ScCard className="flex flex-col gap-3 py-4">
          <div className="flex items-center justify-between gap-3">
            <LevelBadge level={level.level} label={level.label} className="text-[13px]" />
            <span className="font-numeric text-[12px] text-text-secondary">{level.bookings} in 12 months</span>
          </div>
          <p className="text-[13px] text-text-primary">
            <Figures text={levelLine(level)} />
          </p>
          {level.next && (
            <div className="h-[4px] w-full overflow-hidden rounded-full bg-surface-elevated" aria-hidden>
              <div className="h-full rounded-full bg-[#DCE1EC] transition-[width] duration-500" style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} />
            </div>
          )}
          {level.noShowDrops > 0 && (
            <p className="text-[11px] text-warning">A missed booking took one level off for 12 months.</p>
          )}
          <ol className="relative mt-1 flex flex-col gap-3">
            <span aria-hidden className="level-ladder__rail" />
            {view.ladder.map((step) => (
              <li key={step.key} className="relative flex gap-3">
                <span
                  aria-hidden
                  className={cn(
                    'z-[1] mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',
                    step.reached ? 'border-[#DCE1EC] bg-[#DCE1EC] text-brand-black' : 'border-stroke bg-surface'
                  )}
                >
                  {step.reached && <IconCheck size={12} stroke={2.5} />}
                </span>
                <div className="min-w-0">
                  <p className={cn('text-[13px]', step.current ? 'font-semibold text-text-primary' : 'text-text-primary')}>
                    {step.label}
                    <span className="font-numeric text-[12px] text-text-muted"> · {step.minBookings === 0 ? 'everyone' : `${step.minBookings} washes`}</span>
                    {step.current && <span className="text-[12px] text-text-secondary"> · you</span>}
                  </p>
                  <ul className="text-[12px] text-text-secondary">
                    {step.unlocks.map((u) => (
                      <li key={u}>
                        <Figures text={u} />
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </ScCard>
      </section>

      <section aria-labelledby="streak" className="flex flex-col gap-2">
        <h2 id="streak" className="text-sm font-semibold text-text-primary">Monthly streak</h2>
        <ScCard className="flex flex-col gap-1 py-3">
          <p className="text-[13px] text-text-primary">
            <Figures text={streakLine(streak)} />
          </p>
          <p className="text-[11px] text-text-muted">
            <Figures text={`A booking in ${streak.monthsNeeded} months in a row earns ${streak.bonusStamps === 1 ? 'a bonus stamp' : `${streak.bonusStamps} bonus stamps`}.`} />
          </p>
        </ScCard>
      </section>

      <section aria-labelledby="birthday" className="flex flex-col gap-2">
        <h2 id="birthday" className="text-sm font-semibold text-text-primary">Birthday</h2>
        <ScCard className="py-3">
          <BirthdayForm birthday={view.birthday} perkFrom={birthdayPerkFrom} />
        </ScCard>
      </section>

      <InviteCard invite={view.invite} />
      {view.referredBy && (
        <p className="text-[12px] text-text-secondary">
          You joined through {view.referredBy.firstName}&apos;s invite.
          {view.referredBy.status === 'pending' && ' Your reward comes with your first booking.'}
        </p>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past-rewards" className="flex flex-col gap-2">
          <h2 id="past-rewards" className="text-sm font-semibold text-text-primary">Used and past rewards</h2>
          <ScCard className="px-0 py-1">
            <ul className="divide-y divide-border">
              {past.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] text-text-primary">{v.label}</p>
                    <p className="font-numeric text-[11px] text-text-muted">{formatDay(v.issuedAt)}</p>
                  </div>
                  <span className="shrink-0 text-[12px] text-text-secondary">
                    <span className="font-numeric">₹{Math.round(Number(v.amount))}</span> · {VOUCHER_STATE_LABELS[v.state]}
                  </span>
                </li>
              ))}
            </ul>
          </ScCard>
        </section>
      )}

      <section aria-labelledby="rewards-history" className="flex flex-col gap-2">
        <h2 id="rewards-history" className="text-sm font-semibold text-text-primary">History</h2>
        {view.history.length === 0 ? (
          <ScCard>
            <p className="text-[12px] text-text-secondary">Your first completed booking through Detlio starts your card.</p>
          </ScCard>
        ) : (
          <ScCard className="px-0 py-1">
            <ul className="divide-y divide-border">
              {view.history.map((row) => {
                const body = (
                  <div className="px-3.5 py-2.5">
                    <p className="text-[13px] text-text-primary">{row.title}</p>
                    <p className="text-[11px] text-text-muted">
                      <span className="font-numeric">{formatDay(row.at)}</span>
                      {row.detail ? ` · ${row.detail}` : ''}
                    </p>
                  </div>
                )
                return (
                  <li key={row.id}>
                    {row.bookingId ? (
                      <Link href={`/bookings/${row.bookingId}`} className="block hover:bg-surface-elevated/40">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                )
              })}
            </ul>
          </ScCard>
        )}
      </section>
    </>
  )
}

function VoucherRow({ voucher }: { voucher: RewardVoucher }) {
  const copy = async () => {
    if (!voucher.code) return
    try {
      await navigator.clipboard.writeText(voucher.code)
      toast.success('Code copied')
    } catch {
      toast.info(`Your code is ${voucher.code}`)
    }
  }
  return (
    <ScCard className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-[18px] font-semibold leading-tight text-text-primary">
          <Figures text={`₹${Math.round(Number(voucher.amount))} off`} />
        </p>
        <p className="text-[12px] text-text-secondary">{voucher.label}</p>
        <p className="text-[11px] text-text-muted">
          Use by <span className="font-numeric">{rewardDay(voucher.lastDay)}</span>
        </p>
      </div>
      {voucher.code && (
        <button
          type="button"
          onClick={() => void copy()}
          className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 font-numeric text-[12px] text-text-primary"
          aria-label={`Copy code ${voucher.code}`}
        >
          {voucher.code}
          <IconCopy size={14} aria-hidden />
        </button>
      )}
    </ScCard>
  )
}
