'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput } from '@repo/ui/sc/input'
import { StatTile } from '@repo/ui/sc/stat-tile'
import type { AdminCustomerRewards } from '@repo/core/api/rewards'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useCustomerRewards, useFindCustomerRewards } from '@repo/core/api/hooks/use-admin-rewards'
import { levelLine } from '@repo/core/rewards'
import { formatRupees } from '@/lib/bookings'
import { AdjustRewardsDialog } from './adjust-rewards-dialog'

function when(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

const TYPE_LABELS: Record<string, string> = {
  booking: 'Booking',
  stamp: 'Stamp',
  scratch_card: 'Scratch card',
  voucher: 'Voucher',
  level_drop: 'Level',
}

/**
 * Admin → Rewards → Customers: one customer, found by phone (sent in the
 * body) or opened from the overview: their card, level, vouchers with
 * codes, scratch cards (with the prize drawn), perks, invites and a
 * timeline of every stamp, card and voucher with its booking; and Adjust.
 */
export function CustomerRewardsSection({ userId, onUserId }: { userId: string | null; onUserId: (id: string) => void }) {
  const find = useFindCustomerRewards()
  const customer = useCustomerRewards(userId)
  const [phone, setPhone] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const data = customer.data

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          find.mutate(phone.trim(), { onSuccess: (found) => onUserId(found.customer.id) })
        }}
      >
        <ScInput label="Customer's phone" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} className="min-h-11 font-numeric" />
        <ScButton type="submit" fullWidth={false} className="min-h-11 px-5" variant="secondary" disabled={phone.length !== 10 || find.isPending}>
          Find
        </ScButton>
      </form>
      {find.isError && <p role="alert" className="text-[12px] text-error">{errorMessage(find.error, 'Not found')}</p>}
      {customer.isError && <p role="alert" className="text-[12px] text-error">{errorMessage(customer.error, "Couldn't load the customer")}</p>}
      {data && <CustomerView data={data} onAdjust={() => setAdjusting(true)} />}
      {data && adjusting && <AdjustRewardsDialog data={data} onClose={() => setAdjusting(false)} />}
    </div>
  )
}

function CustomerView({ data, onAdjust }: { data: AdminCustomerRewards; onAdjust: () => void }) {
  return (
    <>
      <ScCard className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-[15px] font-semibold text-text-primary">{data.customer.name}</p>
          <p className="font-numeric text-[12px] text-text-secondary">
            {data.customer.phone} · joined {when(data.customer.joinedAt)}
            {data.customer.birthday ? ` · birthday ${data.customer.birthday}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.flagged && <ScBadge variant="danger">Flagged: mostly 80%+ off</ScBadge>}
          <ScBadge variant="muted">{data.level.label}</ScBadge>
          <ScButton fullWidth={false} variant="secondary" className="min-h-10 px-4 text-[13px]" onClick={onAdjust}>Adjust</ScButton>
        </div>
      </ScCard>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="On the card" value={`${data.card.onCard} / ${data.card.goal}`} hint={`₹${data.card.rewardAmount} when full`} />
        <StatTile label="Level" value={data.level.label} hint={levelLine(data.level)} />
        <StatTile label="Streak" value={`${data.streak.months} mo`} />
        <StatTile label="Saved" value={formatRupees(data.lifetime.saved)} hint={`${data.lifetime.washes} stamp bookings`} />
      </div>
      {data.referredBy && (
        <p className="text-[12px] text-text-secondary">Joined through {data.referredBy.firstName}&apos;s invite ({data.referredBy.status}).</p>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Vouchers</h3>
        <ScCard className="px-0 py-1">
          {data.vouchers.length === 0 ? (
            <p className="px-3.5 py-2 text-[12px] text-text-secondary">None in 180 days.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.vouchers.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-[12px]">
                  <span className="text-text-primary">
                    <span className="font-numeric">₹{Math.round(Number(v.amount))}</span> · {v.label}
                    <span className="font-numeric text-text-muted"> · {v.code}</span>
                  </span>
                  <span className="text-text-secondary">
                    {v.state} · until {v.lastDay}
                    {v.bookingId && (
                      <>
                        {' · '}
                        <Link className="underline underline-offset-4" href={`/bookings/${v.bookingId}`}>booking</Link>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ScCard>
      </section>
      {data.referrals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text-primary">Invites sent</h3>
          <ScCard className="px-0 py-1">
            <ul className="divide-y divide-border">
              {data.referrals.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 px-3.5 py-2 text-[12px] text-text-primary">
                  <span>{r.refereeName}</span>
                  <span className="text-text-secondary">
                    {r.status}
                    {r.refusal ? ` (${r.refusal})` : ''}
                    {r.status === 'rewarded' && !r.referrerRewarded ? ' · past the yearly limit' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </ScCard>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Timeline</h3>
        <ScCard className="px-0 py-1">
          <ul className="divide-y divide-border">
            {data.timeline.map((row, i) => (
              <li key={i} className="flex flex-wrap items-start justify-between gap-2 px-3.5 py-2 text-[12px]">
                <div className="min-w-0">
                  <p className="text-text-primary">
                    <span className="text-text-muted">{TYPE_LABELS[row.type] ?? row.type} · </span>
                    {row.title}
                  </p>
                  {row.detail && <p className="text-text-secondary">{row.detail}</p>}
                </div>
                <span className="shrink-0 font-numeric text-text-muted">
                  {when(row.at)}
                  {row.bookingId && (
                    <>
                      {' · '}
                      <Link className="underline underline-offset-4" href={`/bookings/${row.bookingId}`}>booking</Link>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </ScCard>
      </section>
    </>
  )
}
