'use client'

import { toast } from 'react-toastify'
import { IconCopy, IconShare } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { Figures } from '@repo/ui/sc/figures'
import type { MyRewards } from '@repo/core/api/rewards'
import { useCreateInvite } from '@repo/core/api/hooks/use-rewards'
import { rewardRupees } from '@repo/core/rewards'

/**
 * Invite a friend: the customer's own link, shared from their phone. Both
 * get the invite reward when the friend's first booking of ₹199 or more
 * completes. Detlio sends nothing itself.
 */
export function InviteCard({ invite }: { invite: MyRewards['invite'] }) {
  const create = useCreateInvite()
  const code = invite.code ?? create.data?.code ?? null
  const url = code ? `${typeof window === 'undefined' ? 'https://detlio.com' : window.location.origin}/invite/${code}` : null
  const text = `Book your car wash on Detlio and get ${rewardRupees(invite.amount)} off your first booking: ${url ?? ''}`

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.info("Couldn't copy the link. Press and hold it to copy it instead.")
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
        <h2 className="text-sm font-semibold text-text-primary">Invite a friend</h2>
        <p className="mt-1 text-[13px] text-text-secondary">
          <Figures
            text={`You both get ${rewardRupees(invite.amount)} off when their first booking of ${rewardRupees(invite.minAmount)} or more is done.`}
          />
        </p>
      </div>
      {url ? (
        <>
          <p className="truncate rounded-[10px] border border-line px-3 py-2 font-numeric text-[13px] text-text-primary">{url}</p>
          <div className="grid grid-cols-2 gap-2">
            <ScButton variant="secondary" onClick={() => void share()} className="flex min-h-11 items-center justify-center gap-2">
              <IconShare size={16} aria-hidden />
              Share
            </ScButton>
            <ScButton variant="secondary" onClick={() => void copy()} className="flex min-h-11 items-center justify-center gap-2">
              <IconCopy size={16} aria-hidden />
              Copy link
            </ScButton>
          </div>
        </>
      ) : (
        <ScButton variant="secondary" onClick={() => create.mutate()} disabled={create.isPending} className="flex min-h-11 items-center justify-center">
          {create.isPending ? 'Making your link…' : 'Get your invite link'}
        </ScButton>
      )}
      <p className="text-[11px] text-text-muted">
        <Figures
          text={`${invite.rewardedThisYear} rewarded this year (up to ${invite.maxPerYear}; ${left} left)${invite.pending > 0 ? ` · ${invite.pending} waiting for a first booking` : ''}. For people new to Detlio only.`}
        />
      </p>
    </ScCard>
  )
}
