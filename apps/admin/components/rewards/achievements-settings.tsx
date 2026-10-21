'use client'

import { cn } from '@repo/core/utils'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput } from '@repo/ui/sc/input'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { ScSwitch } from '@repo/ui/sc/switch'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminRewardsSettings,
  useSaveAdminRewardsSettings,
} from '@repo/core/api/hooks/use-admin-rewards'
import {
  adminRewardExtrasKeys,
  useAdminAchievements,
} from '@repo/core/api/hooks/use-admin-reward-extras'
import type { AdminRewardsSettings } from '@repo/core/api/rewards'
import type { AdminAchievements } from '@repo/core/api/reward-extras'
import {
  achievementSettings,
  BADGE_BONUS_LIMITS,
  type BadgeKey,
  type BadgeSettings,
} from '@repo/core/achievements'
import { SignedAs } from '@/components/signed-as'

/**
 * Admin → Rewards → Achievements (0054): each badge on or off, the bonus
 * stamps it gives, and how many customers earned it. Saved as a new
 * version of the rewards settings with the typed name (one form, one
 * version history, one audit log). Going forward only: a badge already
 * earned keeps the stamps it gave; a badge switched on is given at the next
 * nightly pass to everyone who has reached it.
 */
export function AchievementsSettings() {
  const settings = useAdminRewardsSettings(true)
  const achievements = useAdminAchievements(true)
  if (settings.isPending || achievements.isPending) return <SkeletonList />
  if (
    settings.isError ||
    !settings.data ||
    achievements.isError ||
    !achievements.data
  ) {
    return (
      <ErrorState
        message={errorMessage(
          settings.error ?? achievements.error,
          "Couldn't load the badges"
        )}
        onRetry={() => {
          void settings.refetch()
          void achievements.refetch()
        }}
      />
    )
  }
  return (
    <Editor
      key={settings.data.version}
      current={settings.data}
      counts={achievements.data}
    />
  )
}

function Editor({
  current,
  counts,
}: {
  current: AdminRewardsSettings
  counts: AdminAchievements
}) {
  const save = useSaveAdminRewardsSettings()
  const queryClient = useQueryClient()
  const saved = achievementSettings(current.settings)
  const [draft, setDraft] = useState<Record<BadgeKey, BadgeSettings>>(() =>
    structuredClone(saved)
  )
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const badBonus = Object.values(draft).some(
    (b) =>
      b.bonusStamps < BADGE_BONUS_LIMITS.min ||
      b.bonusStamps > BADGE_BONUS_LIMITS.max
  )

  const set = (key: BadgeKey, patch: Partial<BadgeSettings>) =>
    setDraft({ ...draft, [key]: { ...draft[key], ...patch } })

  const submit = () => {
    if (!dirty || badBonus) return
    save.mutate(
      {
        version: current.version,
        settings: { ...current.settings, achievements: draft },
      },
      {
        onSuccess: (data) => {
          toast.success(`Saved as version ${data.version}`)
          void queryClient.invalidateQueries({
            queryKey: adminRewardExtrasKeys.achievements,
          })
        },
        onError: (err) =>
          toast.error(errorMessage(err, "Couldn't save the badges")),
      }
    )
  }

  const totalEarned = counts.badges.reduce((sum, b) => sum + b.earned, 0)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] text-text-secondary">
        Badges are earned with stamp-earning bookings only (completed, paid
        through Detlio, not refunded, not Test), checked when a booking earns
        its stamp and every night. Each is earned once. Bonus stamps go on the
        Shine Card. <span className="font-numeric">{totalEarned}</span> earned
        so far, plus{' '}
        <span className="font-numeric">{counts.challengeBadges}</span> challenge
        badges.
      </p>
      {/* Below 640px each badge is a two-line row (its name, then its switch,
          bonus and figures) instead of a table that hides three columns and
          the switch off the edge (quick win 2). */}
      <ScCard className="overflow-x-auto px-0 py-1">
        <table className="w-full text-left text-[12px] sm:min-w-[640px]">
          <thead className="max-sm:hidden">
            <tr className="text-text-secondary">
              <th className="px-3.5 py-2 font-medium">Badge</th>
              <th className="px-3 py-2 font-medium">On</th>
              <th className="px-3 py-2 font-medium">Bonus stamps</th>
              <th className="px-3 py-2 text-right font-medium">Earned</th>
              <th className="px-3 py-2 text-right font-medium">This month</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border max-sm:block">
            {counts.badges.map((badge) => (
              <tr
                key={badge.key}
                className={cn(
                  'max-sm:grid max-sm:grid-cols-[auto_90px_1fr] max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-2 max-sm:px-3.5 max-sm:py-3',
                  !draft[badge.key].enabled && 'opacity-60'
                )}
              >
                <td className="px-3.5 py-2.5 max-sm:col-span-3 max-sm:p-0">
                  <p className="text-[13px] text-text-primary">{badge.label}</p>
                  <p className="text-text-muted">{badge.howTo}</p>
                </td>
                <td className="px-3 py-2.5 max-sm:p-0">
                  <ScSwitch
                    label={`${badge.label} on`}
                    checked={draft[badge.key].enabled}
                    onChange={(enabled) => set(badge.key, { enabled })}
                  />
                </td>
                <td className="w-[110px] px-3 py-2.5 max-sm:w-auto max-sm:p-0">
                  <ScInput
                    aria-label={`${badge.label}: bonus stamps`}
                    inputMode="numeric"
                    value={String(draft[badge.key].bonusStamps)}
                    onChange={(e) => {
                      const digits = e.target.value
                        .replace(/\D/g, '')
                        .slice(0, 2)
                      set(badge.key, {
                        bonusStamps: digits === '' ? 0 : Number(digits),
                      })
                    }}
                    className="min-h-9 font-numeric"
                  />
                </td>
                <td className="px-3 py-2.5 text-right font-numeric max-sm:p-0 max-sm:text-left max-sm:text-text-secondary">
                  {badge.earned}
                  <span className="font-sans sm:hidden">
                    {' '}
                    earned ·{' '}
                    <span className="font-numeric">
                      {badge.earnedThisMonth}
                    </span>{' '}
                    this month
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-numeric max-sm:hidden">
                  {badge.earnedThisMonth}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScCard>
      {badBonus && (
        <p role="alert" className="text-[12px] text-error">
          Bonus stamps are {BADGE_BONUS_LIMITS.min} to {BADGE_BONUS_LIMITS.max}{' '}
          per badge.
        </p>
      )}
      <ScCard className="flex flex-col gap-3 px-4 py-4">
        <SignedAs />
        <p className="text-[12px] text-text-muted">
          Saved as a new version of the rewards settings with your name; every
          change is in the audit log. A badge already earned keeps what it gave.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <ScButton
            variant="secondary"
            className="min-h-11"
            disabled={!dirty}
            onClick={() => setDraft(structuredClone(saved))}
          >
            Undo changes
          </ScButton>
          <ScButton
            className="min-h-11"
            disabled={!dirty || badBonus || save.isPending}
            onClick={submit}
          >
            {save.isPending ? 'Saving…' : 'Save badges'}
          </ScButton>
        </div>
      </ScCard>
    </div>
  )
}
