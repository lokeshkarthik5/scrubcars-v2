'use client'

import { toast } from 'react-toastify'
import { IconCopy, IconShare } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { Figures } from '@repo/ui/sc/figures'
import type { MyRewards } from '@repo/core/api/rewards'
import { useCreateInvite } from '@repo/core/api/hooks/use-rewards'
import { rewardRupees } from '@repo/core/rewards'
import { useT } from '@repo/core/i18n'

/**
 * Invite a friend: the customer's own link, shared from their phone. Both
 * get the invite reward when the friend's first booking of ₹199 or more
 * completes. Detlio sends nothing itself.
 */
export function InviteCard({ invite }: { invite: MyRewards['invite'] }) {
  const t = useT()
  const create = useCreateInvite()
  const code = invite.code ?? create.data?.code ?? null
  const url = code
    ? `${typeof window === 'undefined' ? 'https://detlio.com' : window.location.origin}/invite/${code}`
    : null
  const text = `Book your car wash on Detlio and get ${rewardRupees(invite.amount)} off your first booking: ${url ?? ''}`

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('Link copied'))
    } catch {
      toast.info(
        t("Couldn't copy the link. Press and hold it to copy it instead.")
      )
    }
  }

  const share = async () => {
    if (!url) return
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Detlio', text, url })
        return
      } catch {
        return
      }
    }
    await copy()
  }

  const left = Math.max(0, invite.maxPerYear - invite.rewardedThisYear)

  return (
    <ScCard className="flex flex-col gap-3 py-4">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">
          {t('Invite a friend')}
        </h2>
        <p className="mt-1 text-t4 text-text-secondary">
          <Figures
            text={t('You both get {rewardRupees} off when their first booking of {rewardRupees2} or more is done.', { rewardRupees: rewardRupees(invite.amount), rewardRupees2: rewardRupees(invite.minAmount) })}
          />
        </p>
      </div>
      {url ? (
        <>
          <p className="truncate rounded-[10px] border border-line px-3 py-2 font-numeric text-t4 text-text-primary">
            {url}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ScButton
              variant="secondary"
              onClick={() => void share()}
              className="flex min-h-11 items-center justify-center gap-2"
            >
              <IconShare size={16} aria-hidden />
              {t('Share')}
            </ScButton>
            <ScButton
              variant="secondary"
              onClick={() => void copy()}
              className="flex min-h-11 items-center justify-center gap-2"
            >
              <IconCopy size={16} aria-hidden />
              {t('Copy link')}
            </ScButton>
          </div>
        </>
      ) : (
        <ScButton
          variant="secondary"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="flex min-h-11 items-center justify-center"
        >
          {create.isPending ? t('Making your link…') : t('Get your invite link')}
        </ScButton>
      )}
      <p className="text-t5 text-text-muted">
        <Figures
          text={
            invite.pending > 0
              ? t('{rewarded} rewarded this year (up to {max}; {left} left) · {pending} waiting for a first booking. For people new to Detlio only.', {
                  rewarded: invite.rewardedThisYear,
                  max: invite.maxPerYear,
                  left,
                  pending: invite.pending,
                })
              : t('{rewarded} rewarded this year (up to {max}; {left} left). For people new to Detlio only.', {
                  rewarded: invite.rewardedThisYear,
                  max: invite.maxPerYear,
                  left,
                })
          }
        />
      </p>
    </ScCard>
  )
}
