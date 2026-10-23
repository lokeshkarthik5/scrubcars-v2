'use client'

import { useCallback, useEffect, useState } from 'react'
import { IconBellRinging, IconDeviceMobile } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ApiError } from '@repo/core/api/client'
import {
  getPushConfig,
  getPushStatus,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  type PushApp,
  type PushConfig,
} from '@repo/core/api/push'
import {
  currentPushSubscription,
  detectPushSupport,
  PushSetupError,
  subscribeThisBrowser,
  unsubscribeThisBrowser,
  type PushSupport,
} from '@repo/core/push'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { Notice } from '@repo/ui/sc/notice'
import { Skeleton } from '@repo/ui/sc/skeleton'
import { ScSwitch } from '@repo/ui/sc/switch'

/**
 * Browser notifications on this device (0044), for the customer app's
 * Profile → Notifications and the garage portal's Settings → Notifications
 * and jobs-page banner. Shared because both turn them on the same way; the
 * words differ only where the app does.
 */

export interface PushDevice {
  /** False until the first read settles. */
  loaded: boolean
  /** Null while loading, or when the API could not be asked. */
  config: PushConfig | null
  support: PushSupport
  /** This browser is on for this person (and garage). */
  subscribed: boolean
  /** How many of their devices are on. */
  devices: number
  busy: boolean
  turnOn: () => Promise<boolean>
  turnOff: () => Promise<void>
  sendTest: () => Promise<void>
  reload: () => Promise<void>
}

function problem(error: unknown, fallback: string): string {
  if (error instanceof PushSetupError) return error.message
  if (error instanceof ApiError) return error.message
  return fallback
}

/**
 * The state of this device, and turning it on and off. `scopeKey` reloads it
 * when it changes (the garage portal's active garage: a device is on for
 * one garage at a time).
 */
export function usePushDevice(app: PushApp, scopeKey?: string | null): PushDevice {
  const [loaded, setLoaded] = useState(false)
  const [config, setConfig] = useState<PushConfig | null>(null)
  const [support, setSupport] = useState<PushSupport>('unsupported')
  const [subscribed, setSubscribed] = useState(false)
  const [devices, setDevices] = useState(0)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const next = await getPushConfig(app)
      setConfig(next)
      setSupport(detectPushSupport())
      if (!next.enabled) {
        setSubscribed(false)
        return
      }
      const current = await currentPushSubscription().catch(() => null)
      if (!current) {
        setSubscribed(false)
        setDevices(0)
        return
      }
      // The browser has a subscription; whether it is this person's (and
      // this garage's) is the API's to say.
      const status = await getPushStatus(app, current.endpoint)
      setSubscribed(status.subscribed)
      setDevices(status.devices)
    } catch {
      setConfig(null)
    } finally {
      setLoaded(true)
    }
  }, [app])

  useEffect(() => {
    void reload()
  }, [reload, scopeKey])

  const turnOn = useCallback(async () => {
    if (!config?.publicKey) return false
    setBusy(true)
    try {
      const subscription = await subscribeThisBrowser(config.publicKey)
      const status = await savePushSubscription(app, subscription)
      setSubscribed(true)
      setDevices(status.devices)
      toast.success('Notifications are on for this device')
      return true
    } catch (error) {
      setSupport(detectPushSupport())
      toast.error(problem(error, "Couldn't turn notifications on. Try again."))
      return false
    } finally {
      setBusy(false)
    }
  }, [app, config])

  const turnOff = useCallback(async () => {
    setBusy(true)
    try {
      const current = await currentPushSubscription()
      if (current) {
        const status = await removePushSubscription(app, current.endpoint)
        setDevices(status.devices)
      }
      await unsubscribeThisBrowser()
      setSubscribed(false)
      toast.success('Notifications are off for this device')
    } catch (error) {
      toast.error(problem(error, "Couldn't turn notifications off. Try again."))
    } finally {
      setBusy(false)
    }
  }, [app])

  const sendTest = useCallback(async () => {
    setBusy(true)
    try {
      const current = await currentPushSubscription()
      if (!current) {
        setSubscribed(false)
        toast.error('Turn notifications on first')
        return
      }
      const { result } = await sendTestPush(app, current.endpoint)
      if (result === 'sent') toast.success('Sent. It should show in a few seconds.')
      else if (result === 'expired') {
        setSubscribed(false)
        toast.error('This device stopped taking notifications. Turn them on again.')
      } else toast.error("The browser's push service didn't take it. Try again in a minute.")
    } catch (error) {
      toast.error(problem(error, "Couldn't send a test notification."))
    } finally {
      setBusy(false)
    }
  }, [app])

  return { loaded, config, support, subscribed, devices, busy, turnOn, turnOff, sendTest, reload }
}

/** What to tell someone whose browser cannot be switched on here. */
export function PushSupportNotice({ support, appName }: { support: PushSupport; appName: string }) {
  if (support === 'ios_install') {
    return (
      <Notice tone="neutral" title={`On iPhone, add ${appName} to your Home Screen first`}>
        In Safari, tap Share, then Add to Home Screen. Open {appName} from the new icon and turn notifications on
        here. Needs iOS 16.4 or later.
      </Notice>
    )
  }
  if (support === 'denied') {
    return (
      <Notice title="Notifications are blocked for this site">
        Allow them in your browser&apos;s site settings, then come back to this page.
      </Notice>
    )
  }
  if (support === 'unsupported') {
    return (
      <Notice tone="neutral" title="This browser can't show notifications">
        Try Chrome, Edge, Firefox or Samsung Internet, or Safari from the Home Screen on iPhone.
      </Notice>
    )
  }
  return null
}

/**
 * "Notifications on this device": the switch, why it cannot be turned on
 * when it cannot, and "Send me a test notification" once it is on.
 */
export function PushDeviceCard({
  device,
  appName,
  description,
}: {
  device: PushDevice
  /** "Detlio" or "Detlio Partner": what the Home Screen icon is called. */
  appName: string
  /** What turning it on gets this person. */
  description: string
}) {
  if (!device.loaded) return <Skeleton className="h-[88px] rounded-[14px]" />
  if (!device.config) {
    return (
      <Notice tone="neutral" title="Couldn't load your notification settings">
        Check your connection and open this page again.
      </Notice>
    )
  }

  const canSwitch = device.support === 'supported'
  const others = device.devices - (device.subscribed ? 1 : 0)

  return (
    <div className="flex flex-col gap-3">
      <ScCard className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-text-primary">
            <IconDeviceMobile size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-text-primary">Notifications on this device</p>
            <p className="text-[11px] text-text-secondary">{description}</p>
          </div>
          <ScSwitch
            label="Notifications on this device"
            checked={device.subscribed}
            disabled={device.busy || (!canSwitch && !device.subscribed)}
            onChange={(on) => void (on ? device.turnOn() : device.turnOff())}
          />
        </div>
        {others > 0 && (
          <p className="text-[11px] text-text-muted">
            Also on for <span className="font-numeric">{others}</span> other {others === 1 ? 'device' : 'devices'}.
          </p>
        )}
        {device.subscribed && (
          <ScButton variant="secondary" disabled={device.busy} onClick={() => void device.sendTest()}>
            <span className="flex items-center justify-center gap-2">
              <IconBellRinging size={16} aria-hidden="true" />
              Send me a test notification
            </span>
          </ScButton>
        )}
      </ScCard>
      {!device.subscribed && <PushSupportNotice support={device.support} appName={appName} />}
    </div>
  )
}
