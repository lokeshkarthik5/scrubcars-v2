'use client'

import { useRouter } from 'next/navigation'
import { IconBellOff } from '@tabler/icons-react'
import { useT } from '@repo/core/i18n'
import { msg } from '@repo/core/i18n/translate'
import { AppShell } from '@repo/ui/sc/app-shell'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { StatusChip } from '@repo/ui/sc/status-chip'
import { TopBar } from '@repo/ui/sc/top-bar'
import {
  PushDeviceCard,
  usePushDevice,
} from '@repo/ui/features/push-notifications'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useAuthStore } from '@repo/core/stores/auth-store'

// English, shown as `t(line)`.
const WHAT_YOU_GET = [
  msg('A new booking, with how long you have to accept it'),
  msg('A reminder 10 minutes before the time to accept runs out'),
  msg('The customer picked one of your times, or none of them'),
  msg('Extra work paid for or declined'),
  msg('A booking cancelled or moved by the customer'),
]

/**
 * Settings → Notifications (0044): new-booking alerts on this device, free
 * through the browser. Open to every seat, owner and operator alike: the
 * people at the counter are the ones who need them (Settings itself is the
 * owner's, so an operator arrives here from the jobs page banner). A device
 * is on for the garage it was turned on in; switching garage shows that
 * garage's state.
 *
 * Only while the API has notifications set up (VAPID); otherwise it says so.
 */
export default function GarageNotificationsPage() {
  const t = useT()
  const router = useRouter()
  const isVendorAdmin = useIsVendorAdmin()
  const activeVendorId = useAuthStore((s) => s.activeVendorId)
  const vendor = useAuthStore((s) => s.vendor)
  const device = usePushDevice('garage', activeVendorId)

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar
        title={t('Notifications')}
        showBack
        backHref={isVendorAdmin ? '/settings' : '/home'}
      />

      {device.loaded && device.config && !device.config.enabled ? (
        <EmptyState
          icon={<IconBellOff size={32} stroke={1.5} />}
          title={t("Notifications aren't available yet")}
          subtitle={t('New bookings show on Home and Bookings.')}
          actionLabel={t('Open Bookings')}
          onAction={() => router.push('/bookings')}
        />
      ) : (
        <>
          {/* The switch below has no word of its own: say On or Off in words
              (UX audit, garage finding 8). */}
          {device.loaded && device.support !== 'unsupported' && (
            <p
              role="status"
              className="flex items-center gap-2 text-[16px] text-text-primary"
            >
              {t('New-booking alerts on this phone:')}
              <StatusChip
                tone={device.subscribed ? 'done' : 'attention'}
                size="md"
              >
                {device.subscribed ? t('On') : t('Off')}
              </StatusChip>
            </p>
          )}
          <PushDeviceCard
            device={device}
            appName="Detlio Partner"
            description={
              vendor?.businessName
                ? t('New bookings for {garage}, even with the portal closed', {
                    garage: vendor.businessName,
                  })
                : t('New bookings, even with the portal closed')
            }
          />

          <section
            aria-labelledby="garage-alerts"
            className="flex flex-col gap-2"
          >
            <h2
              id="garage-alerts"
              className="text-sm font-semibold text-text-primary"
            >
              {t("What you'll get")}
            </h2>
            <ul className="flex flex-col gap-1.5 text-[14px] text-text-secondary">
              {WHAT_YOU_GET.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="text-text-muted">
                    ·
                  </span>
                  {t(line)}
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-text-secondary">
              {t(
                "Turn it on for each phone or computer at the garage. A notification never shows the customer's number or address: open the job for those."
              )}
            </p>
          </section>
        </>
      )}
    </AppShell>
  )
}
