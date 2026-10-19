'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconChevronRight } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { TopBar } from '@repo/ui/sc/top-bar'
import {
  giftsEnabled,
  useGiftsConfig,
  useMyCredit,
} from '@repo/core/api/hooks/use-gifts'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { CustomerShell } from '@/components/customer-shell'
import { GiftsUnavailable } from '@/components/gifts/gifts-unavailable'
import { RedeemCodeBox } from '@/components/gifts/redeem-code-box'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { formatGiftDate, giftRupees, signedRupees } from '@/lib/gifts'

/**
 * Profile → Detlio credit (0049): what the customer can spend at checkout,
 * what runs out first and when, the latest ins and outs, a box for a gift
 * code, and the way to gift a wash. Credit comes from redeemed gifts and
 * from bookings paid with credit that were cancelled; checkout uses it on
 * its own, oldest expiry first.
 */
export default function CreditPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const config = useGiftsConfig()
  const on = giftsEnabled(config.data)
  const credit = useMyCredit(on && !!user)

  const header = (
    <TopBar
      title="Detlio credit"
      showBack
      backHref="/profile"
      large={isHomeHubEnabled()}
    />
  )

  if (ready && !user) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">
            Sign in to see your Detlio credit
          </p>
          <ScButton
            variant="main"
            className="mt-2 w-auto px-8"
            onClick={() =>
              router.push(
                `/login?next=${encodeURIComponent('/profile/credit')}`
              )
            }
          >
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
        <GiftsUnavailable />
      </CustomerShell>
    )
  }

  const view = credit.data
  const soon = view ? Number(view.expiringSoon) : 0

  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
      {header}

      {!ready || config.isPending || credit.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : credit.isError || !view ? (
        <ErrorState
          message="Couldn't load your credit. Check your connection."
          onRetry={() => void credit.refetch()}
        />
      ) : (
        <>
          <ScCard className="flex flex-col gap-1 py-4">
            <p className="text-[12px] text-text-secondary">Balance</p>
            <p className="font-numeric text-[40px] font-bold leading-none tracking-tight text-text-primary">
              {giftRupees(view.balance)}
            </p>
            {view.nextExpiry && (
              <p className="mt-2 text-[12px] text-text-secondary">
                <span className="font-numeric">
                  {giftRupees(view.nextExpiry.amount)}
                </span>{' '}
                expires on{' '}
                <span className="font-numeric">
                  {formatGiftDate(view.nextExpiry.at)}
                </span>
              </p>
            )}
            {soon > 0 && (
              <p className="text-[12px] text-warning">
                <span className="font-numeric">{giftRupees(soon)}</span> expires
                in the next 30 days
              </p>
            )}
            <p className="mt-2 text-[11px] text-text-muted">
              Used on your next booking at checkout, after any coupon. You can
              turn it off there.
            </p>
          </ScCard>

          <RedeemCodeBox />

          <Link href="/profile/gifts/new">
            <ScCard className="flex items-center justify-between text-[13px] text-text-primary">
              Gift a wash
              <IconChevronRight
                size={16}
                className="text-text-muted"
                aria-hidden="true"
              />
            </ScCard>
          </Link>

          <section
            aria-labelledby="credit-history"
            className="flex flex-col gap-2"
          >
            <h2
              id="credit-history"
              className="text-sm font-semibold text-text-primary"
            >
              History
            </h2>
            {view.entries.length === 0 ? (
              <ScCard>
                <p className="text-[12px] text-text-secondary">
                  Nothing yet. A gift you redeem shows here.
                </p>
              </ScCard>
            ) : (
              <ScCard className="px-0 py-1">
                <ul className="divide-y divide-border">
                  {view.entries.map((entry) => {
                    const amount = Number(entry.amount)
                    const row = (
                      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <div className="min-w-0">
                          <p className="text-[13px] text-text-primary">
                            {entry.label}
                          </p>
                          <p className="font-numeric text-[11px] text-text-muted">
                            {formatGiftDate(entry.at)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 font-numeric text-[13px] font-medium',
                            amount > 0 ? 'text-success' : 'text-text-primary'
                          )}
                        >
                          {signedRupees(entry.amount)}
                        </span>
                      </div>
                    )
                    return (
                      <li key={entry.id}>
                        {entry.bookingId ? (
                          <Link
                            href={`/bookings/${entry.bookingId}`}
                            className="block transition-colors hover:bg-surface-elevated/40"
                          >
                            {row}
                          </Link>
                        ) : (
                          row
                        )}
                      </li>
                    )
                  })}
                </ul>
              </ScCard>
            )}
          </section>
        </>
      )}
    </CustomerShell>
  )
}
