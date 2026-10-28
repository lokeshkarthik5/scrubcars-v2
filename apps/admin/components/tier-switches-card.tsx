'use client'

import { toast } from 'react-toastify'
import { ScCard } from '@repo/ui/sc/card'
import { ScSwitch } from '@repo/ui/sc/switch'
import { Skeleton } from '@repo/ui/sc/skeleton'
import { TierMedalIcon } from '@repo/ui/features/tier-medal'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useSetTierSwitch, useTierSettings } from '@repo/core/api/hooks/use-tiers'
import { SILVER_FILTER_LABEL, TIER_LABELS, type Tier } from '@repo/core/tiers'
import { formatRelative } from '@repo/core/format'

/**
 * Settings → Tiers (0063): whether customers see each medal, Bronze, Silver
 * and Gold (only Gold during the pilot, say). Each switch saves at once and
 * is in the audit log. A garage always sees its own tier whatever these say,
 * and a garage's own medal can also be hidden on its Tier tab.
 */
export function TierSwitchesCard() {
  const settings = useTierSettings()
  const setSwitch = useSetTierSwitch()

  const toggle = (tier: Tier, shown: boolean) =>
    setSwitch.mutate(
      { tier, shown },
      {
        onSuccess: () =>
          toast.success(shown ? `${TIER_LABELS[tier]} medals shown to customers` : `${TIER_LABELS[tier]} medals hidden from customers`),
        onError: (err) => toast.error(errorMessage(err, 'Couldn’t change the tier')),
      }
    )

  return (
    <ScCard className="flex flex-col gap-3" role="region" aria-label="Tiers">
      <div>
        <h3 className="text-[15px] font-medium text-text-primary">Tiers</h3>
        <p className="text-[13px] text-text-secondary">
          Which medals customers see on garages. Garages always see their own tier.
        </p>
      </div>
      {settings.isError ? (
        <p role="alert" className="text-[12px] text-error">
          {errorMessage(settings.error, 'Couldn’t load the tiers.')}
        </p>
      ) : !settings.data ? (
        <Skeleton className="h-36 rounded-[10px]" />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border">
            {settings.data.tiers.map((row) => (
              <li key={row.tier} className="flex items-center justify-between gap-3 py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                  <TierMedalIcon tier={row.tier} size={18} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[14px] text-text-primary">{TIER_LABELS[row.tier]}</span>
                    <span className="truncate text-[12px] text-text-muted">
                      {row.shown ? 'Shown to customers' : 'Hidden from customers'}
                      {row.updatedBy && row.updatedAt && ` · ${row.updatedBy}, ${formatRelative(row.updatedAt)}`}
                    </span>
                  </span>
                </span>
                <ScSwitch
                  label={`Show ${TIER_LABELS[row.tier]} medals to customers`}
                  checked={row.shown}
                  disabled={setSwitch.isPending}
                  onChange={(shown) => toggle(row.tier, shown)}
                />
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-text-muted">
            A garage shows the highest medal it holds that is switched on (a Gold garage shows Silver while Gold is
            off). “{SILVER_FILTER_LABEL}” is offered to customers only while Silver or Gold is on
            {settings.data.silverFilter ? '' : ', so it is hidden now'}.
          </p>
        </>
      )}
    </ScCard>
  )
}
