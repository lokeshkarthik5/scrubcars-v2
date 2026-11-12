'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconBell } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { Reveal } from '@repo/ui/sc/reveal'
import { TopBar } from '@repo/ui/sc/top-bar'
import {
  useCancelSlotAlert,
  useSlotAlerts,
} from '@repo/core/api/hooks/use-slot-alerts'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { slotAlertSummary } from '@repo/core/slot-alerts'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { CustomerShell } from '@/components/customer-shell'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { useT } from '@repo/core/i18n'

/**
 * Profile → Slot alerts (0047): the days the customer is waiting on, soonest
 * first, each with Stop waiting. Set from checkout's "Notify me if a slot
 * opens" on a fully booked day. One that was told a time opened, or whose
 * day is over, is not here: the first is in Updates.
 */
export default function SlotAlertsPage() {
  const t = useT()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const alerts = useSlotAlerts({ enabled: !!user })
  const cancel = useCancelSlotAlert()

  if (ready && !user) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        <TopBar
          title={t('Slot alerts')}
          showBack
          backHref="/profile"
          large={isHomeHubEnabled()}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-t3 font-semibold text-text-primary">
            {t('Sign in to see your slot alerts')}
          </p>
          <ScButton
            variant="main"
            className="mt-2 w-auto px-8"
            onClick={() =>
              router.push(
                `/login?next=${encodeURIComponent('/profile/slot-alerts')}`
              )
            }
          >
            {t('Sign in')}
          </ScButton>
        </div>
      </CustomerShell>
    )
  }

  const items = alerts.data?.items ?? []

  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
      <TopBar
        title={t('Slot alerts')}
        showBack
        backHref="/profile"
        large={isHomeHubEnabled()}
      />

      {!ready || alerts.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonCard />
        </div>
      ) : alerts.isError && items.length === 0 ? (
        <ErrorState
          message={t("Couldn't load your slot alerts. Check your connection.")}
          onRetry={() => void alerts.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconBell size={32} stroke={1.5} />}
          title={t('No slot alerts')}
          subtitle={t('When a day is fully booked at checkout, tap Notify me if a slot opens.')}
          actionLabel={t('Find garages')}
          onAction={() => router.push('/garages')}
        />
      ) : (
        <>
          <ul
            aria-label={t('Slot alerts, soonest first')}
            className="flex flex-col gap-2"
          >
            {items.map((alert, i) => (
              <Reveal as="li" key={alert.id} index={i}>
                <ScCard className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/garage/${alert.vendorId}`}
                      className="text-t4 font-medium text-text-primary"
                    >
                      {alert.vendorName}
                    </Link>
                    <p className="text-t5 text-text-secondary">
                      {slotAlertSummary(alert)}
                    </p>
                    <p className="text-t5 text-text-muted">
                      {t(BOOKING_TYPE_LABELS[alert.bookingType])}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(alert.id)}
                    aria-label={t('Stop waiting for {vendorName}, {slotAlertSummary}', { vendorName: alert.vendorName, slotAlertSummary: slotAlertSummary(alert) })}
                    className="tap-target shrink-0 px-2 text-t5 font-medium text-text-primary underline disabled:opacity-40"
                  >
                    {t('Stop waiting')}
                  </button>
                </ScCard>
              </Reveal>
            ))}
          </ul>
          <p className="text-t5 text-text-muted">
            {t("Up to {value} at once. If a time opens it shows in Updates, and as a notification if they're on. It isn't held: the first to book gets it.", { value: alerts.data?.max ?? 5 })}
          </p>
        </>
      )}
    </CustomerShell>
  )
}
