'use client'

import Link from 'next/link'
import { IconBell } from '@tabler/icons-react'
import { ScCard } from '@repo/ui/sc/card'
import { useCancelSlotAlert, useSlotAlerts } from '@repo/core/api/hooks/use-slot-alerts'
import { slotAlertSummary } from '@repo/core/slot-alerts'
import { useAuthStore } from '@repo/core/stores/auth-store'

/**
 * The garage page's line for the days the customer is waiting on here
 * (0047): each with Stop waiting. Nothing while signed out or when there are
 * none. Set from checkout's "Notify me if a slot opens".
 */
export function GarageSlotAlerts({ vendorId }: { vendorId: string }) {
  const user = useAuthStore((s) => s.user)
  const alerts = useSlotAlerts({ enabled: !!user })
  const cancel = useCancelSlotAlert()
  const here = (alerts.data?.items ?? []).filter((alert) => alert.vendorId === vendorId)
  if (!user || here.length === 0) return null

  return (
    <ScCard className="flex items-start gap-3" aria-label="Your slot alerts here">
      <IconBell size={18} stroke={1.6} aria-hidden="true" className="mt-px shrink-0 text-text-secondary" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-text-primary">Waiting for a slot</p>
        <ul className="mt-1 flex flex-col gap-1">
          {here.map((alert) => (
            <li key={alert.id} className="flex items-center justify-between gap-2 text-[12px] text-text-secondary">
              <span className="min-w-0">{slotAlertSummary(alert)}</span>
              <button
                type="button"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(alert.id)}
                aria-label={`Stop waiting for ${slotAlertSummary(alert)}`}
                className="tap-target shrink-0 px-1 font-medium text-text-primary underline disabled:opacity-40"
              >
                Stop waiting
              </button>
            </li>
          ))}
        </ul>
        <Link href="/profile/slot-alerts" className="mt-1 inline-block text-[12px] text-text-secondary underline">
          All slot alerts
        </Link>
      </div>
    </ScCard>
  )
}
