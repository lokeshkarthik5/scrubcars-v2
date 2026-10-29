'use client'

import { useState } from 'react'
import { IconDownload } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { getDeletedTestPayments } from '@repo/core/api/admin'
import { ApiError } from '@repo/core/api/client'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { downloadCsv, todayIst } from '@/lib/bookings'
import { deletedTestPaymentsCsv } from '@/lib/refunds'

/**
 * "Deleted team tests (CSV)" (0065): the money record of every real payment
 * deleted with a Test booking, downloaded on demand. Nothing else shows it.
 */
export function DeletedTestPaymentsDownload() {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'done'; count: number }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  const download = async () => {
    if (state.kind === 'busy') return
    setState({ kind: 'busy' })
    try {
      const { payments } = await getDeletedTestPayments()
      if (payments.length > 0) {
        downloadCsv(
          deletedTestPaymentsCsv(payments),
          `detlio-deleted-team-tests-${todayIst()}.csv`
        )
      }
      setState({ kind: 'done', count: payments.length })
    } catch (error) {
      setState({
        kind: 'error',
        // The panel deploys before the API: say so rather than "Not found".
        message:
          error instanceof ApiError && error.status === 404
            ? 'This isn’t on the server yet. Try again after the next update.'
            : errorMessage(error, "Couldn't download the list"),
      })
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <ScButton
        variant="secondary"
        fullWidth={false}
        onClick={download}
        disabled={state.kind === 'busy'}
        className="flex min-h-11 items-center gap-1.5 px-3 text-[12px]"
      >
        <IconDownload size={16} aria-hidden />
        {state.kind === 'busy' ? 'Preparing…' : 'Deleted team tests (CSV)'}
      </ScButton>
      {state.kind === 'done' && (
        <p role="status" className="text-[12px] text-text-secondary">
          {state.count === 0
            ? 'No real payment has been deleted as a team test.'
            : `Downloaded ${state.count === 1 ? '1 payment' : `${state.count} payments`}.`}
        </p>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="text-[12px] text-error">
          {state.message}
        </p>
      )}
    </div>
  )
}
