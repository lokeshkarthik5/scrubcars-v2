'use client'

import { useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import { Skeleton } from '@repo/ui/sc/skeleton'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useCreditBalances,
  useCustomerCredit,
  useFindCustomerCredit,
} from '@repo/core/api/hooks/use-admin-gifts'
import { cn } from '@repo/core/utils'
import { AdjustCreditDialog } from '@/components/gifts/adjust-credit-dialog'
import { formatRupees } from '@/lib/bookings'
import { cleanPhone, formatDay, signedRupees } from '@/lib/gifts'

/**
 * Admin → Gifts → Customer credit: find a customer by phone (sent in the
 * body, never the URL), or pick one from Top balances, to see their balance,
 * next expiry and ledger (with the team's reasons for adjustments), and to
 * adjust it by hand.
 */
export function CustomerCreditSection() {
  const balances = useCreditBalances(true)
  const find = useFindCustomerCredit()
  const [phone, setPhone] = useState('')
  const [phoneProblem, setPhoneProblem] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const customer = useCustomerCredit(userId)
  const [adjusting, setAdjusting] = useState(false)

  const search = () => {
    const clean = cleanPhone(phone)
    if (!clean) {
      setPhoneProblem('Enter the 10-digit mobile number.')
      return
    }
    setPhoneProblem(null)
    find.mutate(clean, { onSuccess: (found) => setUserId(found.customer.id) })
  }

  const data = customer.data
  const top = balances.data ?? []

  return (
    <ScSection title="Customer credit">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          search()
        }}
      >
        <div className="flex-1">
          <ScInput
            id="credit-phone"
            label="Customer's phone"
            inputMode="tel"
            autoComplete="off"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="min-h-11 font-numeric"
          />
        </div>
        <ScButton type="submit" variant="secondary" fullWidth={false} disabled={find.isPending} className="min-h-11 px-4">
          {find.isPending ? 'Finding…' : 'Find'}
        </ScButton>
      </form>
      {(phoneProblem || find.isError) && (
        <p role="alert" className="text-[12px] text-error">
          {phoneProblem ?? errorMessage(find.error, "Couldn't find that customer")}
        </p>
      )}

      {userId &&
        (customer.isPending ? (
          <Skeleton className="h-40 rounded-[14px]" />
        ) : customer.isError || !data ? (
          <ErrorState
            message={errorMessage(customer.error, "Couldn't load this customer's credit.")}
            onRetry={() => void customer.refetch()}
          />
        ) : (
          <ScCard className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-text-primary">{data.customer.name}</p>
                <p className="font-numeric text-[12px] text-text-secondary">+91 {data.customer.phone}</p>
              </div>
              <ScButton variant="secondary" fullWidth={false} className="min-h-11 px-4 text-[13px]" onClick={() => setAdjusting(true)}>
                Adjust credit
              </ScButton>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <p className="text-[12px] text-text-secondary">
                Balance{' '}
                <span className="font-numeric text-[15px] font-semibold text-text-primary">
                  {formatRupees(data.credit.balance)}
                </span>
              </p>
              {data.credit.nextExpiry && (
                <p className="text-[12px] text-text-secondary">
                  <span className="font-numeric">{formatRupees(data.credit.nextExpiry.amount)}</span> expires{' '}
                  <span className="font-numeric">{formatDay(data.credit.nextExpiry.at)}</span>
                </p>
              )}
              {Number(data.credit.expiringSoon) > 0 && (
                <p className="text-[12px] text-warning">
                  <span className="font-numeric">{formatRupees(data.credit.expiringSoon)}</span> in the next 30 days
                </p>
              )}
            </div>
            {data.credit.entries.length === 0 ? (
              <p className="text-[12px] text-text-muted">No credit history.</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border" aria-label="Credit history, newest first">
                {data.credit.entries.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] text-text-primary">{entry.label}</p>
                      {entry.reason && <p className="text-[12px] text-text-secondary">{entry.reason}</p>}
                      <p className="font-numeric text-[11px] text-text-muted">
                        {formatDay(entry.at)}
                        {entry.expiresAt && Number(entry.amount) > 0 ? ` · expires ${formatDay(entry.expiresAt)}` : ''}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 font-numeric text-[12px] font-medium',
                        Number(entry.amount) > 0 ? 'text-success' : 'text-text-primary'
                      )}
                    >
                      {signedRupees(entry.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ScCard>
        ))}

      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-text-primary">Top balances</h3>
        {balances.isPending ? (
          <Skeleton className="h-24 rounded-[14px]" />
        ) : balances.isError ? (
          <ErrorState message={errorMessage(balances.error, "Couldn't load balances.")} onRetry={() => void balances.refetch()} />
        ) : top.length === 0 ? (
          <p className="text-[12px] text-text-muted">No customer holds credit yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[14px] border border-border">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                  <th className="px-3 py-2 font-medium">Next expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {top.map((row) => (
                  <tr key={row.userId} className={cn(row.userId === userId && 'bg-surface')}>
                    <td className="px-3 py-1">
                      <button
                        type="button"
                        onClick={() => setUserId(row.userId)}
                        className="min-h-11 text-left text-text-primary underline-offset-2 hover:underline"
                      >
                        {row.name}
                      </button>
                    </td>
                    <td className="px-3 py-1 font-numeric text-text-secondary">{row.phone}</td>
                    <td className="px-3 py-1 text-right font-numeric text-text-primary">{formatRupees(row.balance)}</td>
                    <td className="px-3 py-1 font-numeric text-text-secondary">{formatDay(row.nextExpiry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adjusting && data && <AdjustCreditDialog data={data} onClose={() => setAdjusting(false)} />}
    </ScSection>
  )
}
