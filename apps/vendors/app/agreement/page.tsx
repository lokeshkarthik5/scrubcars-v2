'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCircleCheck, IconExternalLink, IconFileText } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { Notice } from '@repo/ui/sc/notice'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { TopBar } from '@repo/ui/sc/top-bar'
import { ApiError } from '@repo/core/api/client'
import { useAcceptAgreement, useGarageAgreement } from '@repo/core/api/hooks/use-tiers'
import { AGREEMENT_TICK } from '@repo/core/agreements'
import { dateKeyLabel } from '@repo/core/certification'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useAuthStore } from '@repo/core/stores/auth-store'

/** "3 Nov 2026" from an ISO time, in IST. */
function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

/**
 * The Detlio garage agreement, click to agree (0063): the latest version
 * Detlio published, "Read (PDF)", the tick "I agree to the terms" and
 * Confirm. Accepting earns Bronze; a new version asks again (Home's banner
 * says so) and the garage keeps Bronze for 30 days meanwhile.
 *
 * The owner seat only (the API refuses an operator); a Detlio support
 * session can read it but never accept it for the garage.
 */
export default function GarageAgreementPage() {
  const router = useRouter()
  const isVendorAdmin = useIsVendorAdmin()
  const vendorId = useAuthStore((s) => s.activeVendorId) ?? undefined
  const { data, isError, refetch } = useGarageAgreement(vendorId, isVendorAdmin)
  const accept = useAcceptAgreement(vendorId)
  // The tick is for one version of one garage's agreement: a new version
  // (or another garage after a switch) starts unticked.
  const [tickedFor, setTickedFor] = useState<string | null>(null)
  const tickId = useId()

  // Operators get 403 here, and their nav has no Settings, so this is only
  // reachable by typing the URL.
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home')
  }, [isVendorAdmin, router])

  const tickKey = data?.latest ? `${vendorId}:${data.latest.version}` : null
  const agreed = tickKey !== null && tickedFor === tickKey

  const confirm = () => {
    if (!data?.latest || !agreed) return
    accept.mutate(data.latest.version, {
      onSuccess: () => toast.success(`You accepted ${data.latest!.title}.`),
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'AGREEMENT_VERSION_CHANGED') void refetch()
        toast.error(error instanceof Error ? error.message : 'Couldn’t record that. Please try again.')
      },
    })
  }

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar title="Garage agreement" showBack backHref="/settings" />

      {isError ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-[13px] text-error">
            Couldn’t load the agreement.
          </p>
          <ScButton variant="outline" size="md" fullWidth={false} onClick={() => void refetch()} className="px-4">
            Try again
          </ScButton>
        </div>
      ) : !data ? (
        <SkeletonList count={2} itemClassName="h-32" />
      ) : !data.latest ? (
        <Notice tone="neutral" title="Nothing to accept yet">
          Detlio hasn’t published the garage agreement here yet. We’ll tell you when it is ready.
        </Notice>
      ) : (
        <>
          <ScCard className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <IconFileText size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-semibold text-text-primary">{data.latest.title}</h2>
                <p className="text-[12px] text-text-secondary">
                  Published {dayOf(data.latest.publishedAt)}
                  {data.latest.note ? ` · ${data.latest.note}` : ''}
                </p>
              </div>
            </div>
            <a
              href={data.latest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] border border-border text-[14px] font-medium text-text-primary hover:bg-surface-elevated"
            >
              Read (PDF)
              <IconExternalLink size={16} aria-hidden="true" />
            </a>
          </ScCard>

          {data.accepted ? (
            <Notice tone="neutral" title={`You accepted v${data.latest.version}`} role="status">
              On {dayOf(data.accepted.at)}, by {data.accepted.by}. You hold Bronze while this is the latest
              version.
            </Notice>
          ) : (
            <ScCard className="flex flex-col gap-3">
              {data.standing.status === 'grace' && data.standing.acceptBy && (
                <p className="rounded-[10px] bg-warning-muted px-3 py-2 text-[12px] text-warning">
                  Detlio updated the agreement. Accept v{data.latest.version} by{' '}
                  {dateKeyLabel(data.standing.acceptBy)} to keep your tier.
                </p>
              )}
              <label htmlFor={tickId} className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  id={tickId}
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setTickedFor(e.target.checked ? tickKey : null)}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand-red,#E11D2E)]"
                />
                <span className="text-[14px] text-text-primary">
                  {AGREEMENT_TICK}
                  <span className="block text-[12px] text-text-secondary">
                    I have read the {data.latest.title} and agree to it for my garage.
                  </span>
                </span>
              </label>
              <ScButton
                onClick={confirm}
                disabled={!agreed || accept.isPending}
                disabledReason={agreed ? undefined : `Tick “${AGREEMENT_TICK}” first`}
              >
                {accept.isPending ? 'Confirming…' : 'Confirm'}
              </ScButton>
            </ScCard>
          )}

          {data.accepted && (
            <p className="flex items-center gap-1.5 px-1 text-[12px] text-text-muted">
              <IconCircleCheck size={14} aria-hidden="true" className="text-success" />
              Detlio keeps a record of who accepted which version, and when.
            </p>
          )}
        </>
      )}
    </AppShell>
  )
}
