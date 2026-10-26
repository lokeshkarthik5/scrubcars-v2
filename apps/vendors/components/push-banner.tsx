'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconBell, IconX } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { usePushDevice } from '@repo/ui/features/push-notifications'
import { useAuthStore } from '@repo/core/stores/auth-store'

/**
 * When it was closed, on this device only. It comes back a week later while
 * alerts are still off: push is the garage's main guard against the
 * 30-minute timeout, so a close is a "not now", never a "never" (UX audit,
 * garage finding 8). The old key said "closed for good"; it is ignored.
 */
const SNOOZED_AT_KEY = 'detlio.pushBannerSnoozedAt'
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

function snoozed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(SNOOZED_AT_KEY))
    return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS
  } catch {
    return false
  }
}

function snooze() {
  try {
    window.localStorage.setItem(SNOOZED_AT_KEY, String(Date.now()))
  } catch {
    // Private mode or blocked storage: it shows again next time.
  }
}

/**
 * "Booking alerts are off on this phone · Turn on", one row at the top of
 * Home and Bookings (0044), until this device has them on. For every seat:
 * operators have no Settings tab, so this (and Home's "Alerts: Off") is
 * their way in. Shows nothing while the API has notifications off, while
 * loading, or on a browser that cannot take them at all; an iPhone tab is
 * sent to the Notifications page, which explains the Home Screen step.
 */
export function PushBanner() {
  const activeVendorId = useAuthStore((s) => s.activeVendorId)
  const device = usePushDevice('garage', activeVendorId)
  // Read once on the client. The first render shows nothing either way (the
  // device state is still loading), so the server's render always matches.
  const [hidden, setHidden] = useState(
    () => typeof window === 'undefined' || snoozed()
  )

  if (hidden || !device.loaded || !device.config?.enabled || device.subscribed)
    return null
  if (device.support === 'unsupported') return null

  return (
    <section
      aria-label="New-booking alerts"
      className="flex items-center gap-3 rounded-[20px] border border-border bg-surface py-2 pl-4 pr-2"
    >
      <IconBell
        size={22}
        aria-hidden="true"
        className="shrink-0 text-text-primary"
      />
      <p className="min-w-0 flex-1 text-[15px] leading-snug text-text-secondary">
        <span className="font-semibold text-text-primary">
          Booking alerts are off
        </span>{' '}
        on this phone
      </p>
      {device.support === 'supported' ? (
        <ScButton
          variant="outline"
          size="md"
          fullWidth={false}
          className="shrink-0 bg-text-primary px-4 text-brand-black hover:bg-text-primary/90"
          disabled={device.busy}
          onClick={() => void device.turnOn()}
        >
          Turn on
        </ScButton>
      ) : (
        <Link
          href="/settings/notifications"
          className="flex min-h-12 shrink-0 items-center px-3 text-[15px] font-semibold text-text-primary underline underline-offset-4"
        >
          {device.support === 'ios_install' ? 'How' : 'Why'}
        </Link>
      )}
      <button
        type="button"
        onClick={() => {
          snooze()
          setHidden(true)
        }}
        aria-label="Not now"
        className="-ml-1 flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary"
      >
        <IconX size={18} aria-hidden="true" />
      </button>
    </section>
  )
}
