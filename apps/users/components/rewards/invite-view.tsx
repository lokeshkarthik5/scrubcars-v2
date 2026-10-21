'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconStar } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { Figures } from '@repo/ui/sc/figures'
import { openInvite, type InviteOpened } from '@repo/core/api/rewards'
import { rewardsEnabled, useClaimInvite, useRewardsConfig } from '@repo/core/api/hooks/use-rewards'
import { rewardRupees } from '@repo/core/rewards'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { CustomerShell } from '@/components/customer-shell'
import { forgetInvite, readStoredInvite, storeInvite } from '@/lib/invite'

/**
 * The invite page. Opening it asks the API who invited (first name only)
 * and for a signed note of when it was opened, kept on this device. A
 * visitor signs up and comes back here, and the new account takes the
 * invite up with that note: only an account made after the invite was
 * opened counts.
 */
export function InviteView({ code }: { code: string }) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const config = useRewardsConfig()
  const on = rewardsEnabled(config.data)
  const claim = useClaimInvite()
  const [invite, setInvite] = useState<InviteOpened | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const claimed = useRef(false)

  useEffect(() => {
    if (!on || invite) return
    openInvite(code)
      .then((opened) => {
        setInvite(opened)
        // A note from before signing up is the one that counts: keep it.
        if (!readStoredInvite(code)) storeInvite({ code, token: opened.token })
      })
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : "This invite link isn't valid."))
  }, [on, code, invite])

  useEffect(() => {
    if (!ready || !user || !invite || claimed.current) return
    const stored = readStoredInvite(code)
    claimed.current = true
    claim.mutate(stored?.token ?? invite.token, { onSettled: () => forgetInvite() })
  }, [ready, user, invite, code, claim])

  const next = `/invite/${encodeURIComponent(code)}`

  return (
    <CustomerShell showBrand className="gap-4 py-6">
      {!config.isPending && !on ? (
        <EmptyState
          icon={<IconStar size={32} stroke={1.5} />}
          title="Invites aren't available right now"
          subtitle="You can still book a wash on Detlio."
          actionLabel="Find garages"
          onAction={() => router.push('/garages')}
        />
      ) : failed ? (
        <EmptyState icon={<IconStar size={32} stroke={1.5} />} title={failed} actionLabel="Find garages" onAction={() => router.push('/garages')} />
      ) : !invite ? (
        <SkeletonCard />
      ) : (
        <ScCard className="shine-card flex flex-col gap-3 rounded-card px-5 py-6">
          <p className="text-[12px] text-text-secondary">Detlio Rewards</p>
          <h1 className="text-[24px] font-semibold leading-tight text-text-primary">
            {invite.referrerFirstName} invited you to Detlio
          </h1>
          <p className="text-[14px] text-text-secondary">
            <Figures text={`Get ${rewardRupees(invite.amount)} off when your first booking of ${rewardRupees(invite.minAmount)} or more is done. ${invite.referrerFirstName} gets ${rewardRupees(invite.amount)} off too.`} />
          </p>
          {!user ? (
            <ScButton className="mt-2" onClick={() => router.push(`/login?next=${encodeURIComponent(next)}`)}>
              Sign up to join
            </ScButton>
          ) : claim.isPending ? (
            <p className="text-[13px] text-text-secondary">Adding the invite to your account…</p>
          ) : claim.isSuccess ? (
            <>
              <p className="text-[13px] text-success">You&apos;re in. Book your first wash to get your reward.</p>
              <ScButton className="mt-1" onClick={() => router.push('/garages')}>
                Book a wash
              </ScButton>
            </>
          ) : claim.isError ? (
            <>
              <p className="text-[13px] text-warning">{claim.error instanceof Error ? claim.error.message : "Couldn't add the invite."}</p>
              <ScButton variant="secondary" className="mt-1" onClick={() => router.push('/garages')}>
                Find garages
              </ScButton>
            </>
          ) : null}
          <p className="text-[11px] text-text-muted">For people new to Detlio. One invite per person.</p>
        </ScCard>
      )}
    </CustomerShell>
  )
}
