'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { ScSwitch } from '@repo/ui/sc/switch'
import { TopBar } from '@repo/ui/sc/top-bar'
import {
  PushDeviceCard,
  usePushDevice,
} from '@repo/ui/features/push-notifications'
import { setPushPreferences } from '@repo/core/api/push'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { IconBellOff } from '@tabler/icons-react'
import { CustomerShell } from '@/components/customer-shell'
import { isHomeHubEnabled } from '@/lib/home-hub'

type Switches = { bookingUpdates: boolean; reminders: boolean }

const SWITCHES: Array<{
  key: keyof Switches
  title: string
  description: string
}> = [
  {
    key: 'bookingUpdates',
    title: 'Booking updates',
    description:
      'Accepted, other times suggested, extra work, your car on its way back, refunds',
  },
  {
    key: 'reminders',
    title: 'Reminders',
    description: 'The evening before a booking, and about an hour before it',
  },
]

/**
 * Profile → Notifications (0044): browser notifications on this device, and
 * the account's two switches, which apply to every device it has turned on.
 * Free notifications through the browser, while SMS and WhatsApp wait; an
 * iPhone needs Detlio on its Home Screen first (iOS 16.4+).
 *
 * Only reachable while the API has notifications set up (VAPID); Profile
 * shows no link otherwise, and this page says so if opened directly.
 */
export default function NotificationsPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const device = usePushDevice('customer', user?.id ?? null)
  // What the account says, from the config until a switch is changed here.
  const [saved, setSaved] = useState<Switches | null>(null)
  const switches: Switches = saved ?? {
    bookingUpdates: device.config?.bookingUpdates ?? true,
    reminders: device.config?.reminders ?? true,
  }
  const [saving, setSaving] = useState<keyof Switches | null>(null)

  const setSwitch = async (key: keyof Switches, on: boolean) => {
    const before = switches
    setSaved({ ...switches, [key]: on })
    setSaving(key)
    try {
      setSaved(await setPushPreferences({ [key]: on }))
    } catch {
      setSaved(before)
      toast.error("Couldn't save that. Try again.")
    } finally {
      setSaving(null)
    }
  }

  if (ready && !user) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        <TopBar
          title="Notifications"
          showBack
          backHref="/profile"
          large={isHomeHubEnabled()}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">
            Sign in to set up notifications
          </p>
          <ScButton
            variant="main"
            className="mt-2 w-auto px-8"
            onClick={() =>
              router.push(
                `/login?next=${encodeURIComponent('/profile/notifications')}`
              )
            }
          >
            Sign in
          </ScButton>
        </div>
      </CustomerShell>
    )
  }

  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
      <TopBar
        title="Notifications"
        showBack
        backHref="/profile"
        large={isHomeHubEnabled()}
      />

      {device.loaded && device.config && !device.config.enabled ? (
        <EmptyState
          icon={<IconBellOff size={32} stroke={1.5} />}
          title="Notifications aren't available yet"
          subtitle="Everything about your bookings is in Updates."
          actionLabel="Open Updates"
          onAction={() => router.push('/updates')}
        />
      ) : (
        <>
          <PushDeviceCard
            device={device}
            appName="Detlio"
            description="News about your bookings, even with Detlio closed"
          />

          {device.config?.enabled && (
            <section
              aria-labelledby="notification-kinds"
              className="flex flex-col gap-2"
            >
              <h2
                id="notification-kinds"
                className="text-sm font-semibold text-text-primary"
              >
                What to send
              </h2>
              <ScCard className="px-0 py-1">
                <ul className="divide-y divide-border">
                  {SWITCHES.map((item) => (
                    <li
                      key={item.key}
                      className="flex items-center gap-3 px-3.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-text-primary">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-text-secondary">
                          {item.description}
                        </p>
                      </div>
                      <ScSwitch
                        label={item.title}
                        checked={switches[item.key]}
                        disabled={saving !== null}
                        onChange={(on) => void setSwitch(item.key, on)}
                      />
                    </li>
                  ))}
                </ul>
              </ScCard>
              <p className="text-[11px] text-text-muted">
                For every device you turn notifications on for. A notification
                says the garage, the service and the time, never your number or
                address. Your bookings&apos; news is in Updates too.
              </p>
            </section>
          )}
        </>
      )}
    </CustomerShell>
  )
}
