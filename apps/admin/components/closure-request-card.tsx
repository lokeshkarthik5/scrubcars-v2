'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IconDoorExit } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { getGarageClosureRequest, getOpenClosureRequests } from '@repo/core/api/garage-closure'
import { MoveToBinDialog } from '@/components/vendor-bin-dialogs'
import { binDoneMessage } from '@/lib/vendor-bin'
import { formatWhen } from '@/lib/bookings'

export const closureRequestKey = (vendorId: string) => ['admin-garage-closure', vendorId] as const

/**
 * "Close my garage" (0066): the owner's open request on the garage page,
 * with their reason, and the way to act on it: Move to Bin (the existing
 * dialog, its reason filled in), which marks the request confirmed in the
 * same transaction. Nothing while there is no open request, or the API has
 * no such route yet. The owner can still cancel it until then.
 */
export function ClosureRequestCard({
  vendor,
  inBin,
  onBinned,
}: {
  vendor: { id: string; businessName: string }
  inBin: boolean
  /** After the move: the page reloads the garage (it is read-only in the Bin). */
  onBinned?: () => void
}) {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: closureRequestKey(vendor.id),
    queryFn: () => getGarageClosureRequest(vendor.id),
    retry: false,
  })
  const [binning, setBinning] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Said after the move, even though the garage is in the Bin by then.
  if (notice) {
    return (
      <p role="status" className="rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-text-primary">
        {notice}
      </p>
    )
  }
  if (!data || data.status !== 'open' || inBin) return null

  return (
    <ScCard className="flex flex-col gap-2 border-warning/50">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
        <IconDoorExit size={16} aria-hidden className="shrink-0" />
        The owner asked to close this garage
      </p>
      <p className="text-[12.5px] text-text-secondary">
        {data.requestedByName} · <span className="font-numeric">{formatWhen(data.createdAt)}</span>
      </p>
      <p className="whitespace-pre-wrap break-words text-[13px] text-text-primary">“{data.reason}”</p>
      <p className="text-[12px] text-text-secondary">
        Call the owner first. Moving it to the Bin closes it, cancels its bookings still to come (refunds owed) and
        confirms this request. The owner can cancel the request until then.
      </p>
      <ScButton
        variant="secondary"
        fullWidth={false}
        onClick={() => setBinning(true)}
        className="min-h-11 self-start px-4 text-[13px]"
      >
        Move to Bin
      </ScButton>
      {binning && (
        <MoveToBinDialog
          vendor={vendor}
          initialReason={`Owner asked to close: ${data.reason}`.slice(0, 200)}
          onClose={() => setBinning(false)}
          onDone={(result) => {
            setBinning(false)
            setNotice(binDoneMessage(result))
            void queryClient.invalidateQueries({ queryKey: closureRequestKey(vendor.id) })
            onBinned?.()
          }}
        />
      )}
    </ScCard>
  )
}

/**
 * The Garages list's line for open "Close my garage" requests (0066): each
 * garage by name, linking to its page where the request and Move to Bin
 * are. Nothing while none are open, or the API has no such route yet.
 */
export function ClosureRequestsNotice() {
  const { data } = useQuery({
    queryKey: ['admin-garage-closures'] as const,
    queryFn: getOpenClosureRequests,
    retry: false,
  })
  if (!data || data.length === 0) return null
  return (
    <section
      aria-label="Garages asking to close"
      className="flex flex-col gap-1.5 rounded-[14px] border border-warning/40 bg-warning-muted px-4 py-3"
    >
      <p className="text-[13px] font-semibold text-text-primary">
        <span className="font-numeric">{data.length}</span> {data.length === 1 ? 'garage asks' : 'garages ask'} to close
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {data.map((request) => (
          <li key={request.id}>
            <Link
              href={`/vendors/${request.vendorId}/edit`}
              className="inline-flex min-h-11 items-center text-[13px] text-text-primary underline underline-offset-2"
            >
              {request.garageName}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
