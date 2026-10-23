'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconBellRinging, IconX } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { usePushDevice } from '@repo/ui/features/push-notifications'
import { useAuthStore } from '@repo/core/stores/auth-store'

/** Remembered on this device only: a dismissed banner stays dismissed here. */
const DISMISSED_KEY = 'detlio.pushBannerDismissed'

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function rememberDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Private mode or blocked storage: it shows again next time.
  }
}

/**
 * "Turn on new-booking alerts" on the jobs pages (0044), until this device
 * has them on or someone closes it. For every seat: operators have no
 * Settings tab, so this is their way in. Shows nothing while the API has
 * notifications off, while loading, or on a browser that cannot take them
 * at all; an iPhone tab is sent to the Notifications page, which explains
 * the Home Screen step.
 */
export function PushBanner() {
  const activeVendorId = useAuthStore((s) => s.activeVendorId)
  const device = usePushDevice('garage', activeVendorId)
  // Read once on the client. The first render shows nothing either way (the
  // device state is still loading), so the server's render always matches.
  const [dismissed, setDismissed] = useState(() => typeof window === 'undefined' || wasDismissed())

  if (dismissed || !device.loaded || !device.config?.enabled || device.subscribed) return null
  if (device.support === 'unsupported') return null

  const close = () => {
    rememberDismissed()
    setDismissed(true)
  }

  return (
    <ScCard role="region" aria-label="New-booking alerts" className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-text-primary">
        <IconBellRinging size={18} aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="text-[13px] font-semibold text-text-primary">Turn on new-booking alerts</p>
          <p className="text-[11px] text-text-secondary">
            Hear about a new booking the moment it is paid, even with the portal closed. Free.
          </p>
        </div>
        {device.support === 'supported' ? (
          <div className="flex items-center gap-3">
            <ScButton variant="secondary" fullWidth={false} className="px-4" disabled={device.busy} onClick={() => void device.turnOn()}>
              Turn on
            </ScButton>
            <Link href="/settings/notifications" className="tap-target text-[12px] text-text-secondary hover:text-text-primary">
              More
            </Link>
          </div>
        ) : (
          <Link href="/settings/notifications" className="tap-target self-start text-[12px] font-medium text-text-primary underline">
            {device.support === 'ios_install' ? 'How to turn them on on iPhone' : 'Why they are off'}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="-m-2 flex size-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
      >
        <IconX size={16} aria-hidden="true" />
      </button>
    </ScCard>
  )
}
