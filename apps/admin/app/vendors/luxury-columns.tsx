'use client'

import { StatusChip } from '@repo/ui/sc/status-chip'
import { TierMedalIcon } from '@repo/ui/features/tier-medal'
import type { AdminVendor } from '@repo/core/api/admin'
import { TIER_LABELS } from '@repo/core/tiers'
import type { AdminTableColumn } from '@/components/table'
import { istDayMonth, luxuryStatusCell } from '@/lib/vendor-list'
import { GarageCell } from './garage-columns'

/**
 * The Garages table under More filters' luxury chips (0083, mockup E1/E2):
 * Garage · Tier · Sent (applications) or Since (specialists) · Status. The
 * row opens the side panel with the evidence, as on the full list.
 */
export function luxuryColumns(ctx: {
  mode: 'applications' | 'specialists'
  openId: string | null
  onOpen: (v: AdminVendor) => void
}): AdminTableColumn<AdminVendor>[] {
  const when = (v: AdminVendor) =>
    ctx.mode === 'applications' ? (v.luxury?.sentAt ?? null) : (v.luxury?.approvedAt ?? null)
  return [
    {
      id: 'garage',
      header: 'Garage',
      phone: 'contents',
      sortValue: (v) => v.businessName,
      cell: (v) => <GarageCell v={v} open={ctx.openId === v.id} onOpen={ctx.onOpen} />,
    },
    {
      id: 'tier',
      header: 'Tier',
      phone: 'subtitle',
      sortValue: (v) => (v.tier ? TIER_LABELS[v.tier] : null),
      cell: (v) =>
        v.tier ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-1.5 py-0.5 text-[12px] text-text-primary">
            <TierMedalIcon tier={v.tier} size={12} />
            {TIER_LABELS[v.tier]}
          </span>
        ) : (
          <span className="text-[12px] text-text-muted">No tier</span>
        ),
    },
    {
      id: 'when',
      header: ctx.mode === 'applications' ? 'Sent' : 'Since',
      phone: 'asideSub',
      sortValue: (v) => when(v),
      cell: (v) => {
        const at = when(v)
        return at ? <span className="font-numeric text-[13px] text-text-secondary">{istDayMonth(at)}</span> : null
      },
    },
    {
      id: 'status',
      header: 'Status',
      phone: 'aside',
      cell: (v) => {
        const status = luxuryStatusCell(v)
        return status ? (
          <StatusChip tone={status.tone} className="whitespace-nowrap max-md:ml-2">
            {status.label}
          </StatusChip>
        ) : null
      },
    },
  ]
}
