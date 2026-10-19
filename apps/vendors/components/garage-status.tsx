'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { IconBellOff } from '@tabler/icons-react'
import { usePushDevice } from '@repo/ui/features/push-notifications'
import {
  getVendorClosures,
  getVendorWorkingHours,
  getWorkingHours,
} from '@repo/core/api/vendors'
import { useNow } from '@repo/core/hooks/use-now'
import { openStatus } from '@repo/core/opening-hours'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'

/**
 * Whether the garage is open right now, from its own hours and holidays, or
 * null while unknown (loading, no hours, or an operator who can't read the
 * owner's settings and a garage not listed yet). Re-read every few minutes.
 */
export function useShopOpen(): boolean | null {
  const vendorId = useAuthStore((s) => s.vendor?.id)
  const now = useNow(60_000)
  const hours = useQuery({
    queryKey: ['garage-hours', vendorId],
    enabled: Boolean(vendorId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [weekly, closures] = await Promise.all([
        // The owner's own hours; an operator reads the public copy instead.
        getWorkingHours().catch(() => getVendorWorkingHours(vendorId!)),
        getVendorClosures(vendorId!).catch(() => [] as string[]),
      ])
      return { weekly, closures }
    },
  })
  if (!hours.data) return null
  return (
    openStatus(hours.data.weekly, new Date(now), hours.data.closures)?.isOpen ??
    null
  )
}

/**
 * Beside the wordmark (garage mockup 01): which garage, whether it is open
 * now, and "Alerts: Off" while this phone would miss a new booking, linking
 * to where they are turned on. The garage's name is left out for someone
 * with two or more garages: the switcher above already says which one.
 */
export function GarageStatus() {
  const vendor = useAuthStore((s) => s.vendor)
  const vendorCount = useAuthStore((s) => s.vendors.length)
  const activeVendorId = useAuthStore((s) => s.activeVendorId)
  const device = usePushDevice('garage', activeVendorId)
  const open = useShopOpen()

  if (!vendor) return null
  const alertsOff =
    device.loaded &&
    Boolean(device.config?.enabled) &&
    !device.subscribed &&
    device.support !== 'unsupported'

  return (
    <div className="flex min-w-0 flex-col items-end gap-0.5">
      <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-medium text-text-secondary">
        {open !== null && (
          <span
            aria-hidden="true"
            className={cn(
              'size-2 shrink-0 rounded-full',
              open ? 'bg-success' : 'bg-text-muted'
            )}
          />
        )}
        <span className="truncate">
          {vendorCount > 1 ? '' : vendor.businessName}
          {open !== null &&
            `${vendorCount > 1 ? '' : ' · '}${open ? 'Open' : 'Closed'}`}
        </span>
      </p>
      {alertsOff && (
        <Link
          href="/settings/notifications"
          className="-my-2 flex min-h-11 items-center gap-1 text-[13px] font-medium text-warning"
        >
          <IconBellOff size={14} aria-hidden="true" />
          Alerts: Off
        </Link>
      )}
    </div>
  )
}
