'use client'

import Link from 'next/link'
import type { BookDay } from '@repo/core/api/garage-book'
import { dayLabel, rupees } from '@repo/core/garage-book'
import { Overline } from './parts'

/**
 * Closing time (moment 4): on Home once the day's last job has started and
 * every job is finished. Today's takings, cash, UPI and Detlio filling in
 * one after another, jobs done, and who still owes. The owner's: staff see
 * no money, so they never get it.
 */
export function ClosingCard({ day }: { day: BookDay }) {
  if (!day.taken || !day.closing) return null
  const { taken, closing } = day
  const max = Math.max(1, taken.cashPaise, taken.upiPaise, taken.detlioPaise)
  const bar = (label: string, paise: number, index: number, red = false) => (
    <div key={label}>
      <div className="flex justify-between text-t4">
        <span className="text-[#A8A8B2]">{label}</span>
        <b className="font-numeric font-semibold text-text-primary">{rupees(paise)}</b>
      </div>
      <div className="fx-recessed mt-1.5 h-2 overflow-hidden rounded-[4px]">
        <span
          className="gb-fill block h-full rounded-[4px]"
          style={
            {
              '--gb-i': index,
              width: `${Math.round((paise / max) * 100)}%`,
              background: red ? '#ff2d4a' : 'linear-gradient(180deg,#f2f2f5,#a5a5ae)',
              boxShadow: red ? '0 0 8px rgb(255 45 74 / .8)' : undefined,
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  )
  return (
    <section aria-label="Today, closed" className="fx-edge flex flex-col gap-3.5 rounded-surface p-4">
      <Overline>Today · {dayLabel(day.date)} · all jobs done</Overline>
      <p className="font-numeric text-[36px] font-semibold leading-10 tracking-[-0.02em] text-text-primary">{rupees(taken.totalPaise)}</p>
      {bar('Cash', taken.cashPaise, 0)}
      {bar('UPI', taken.upiPaise, 1)}
      {bar('Detlio', taken.detlioPaise, 2, true)}
      <p className="text-[12px] text-[#A8A8B2]">
        {closing.jobsDone} {closing.jobsDone === 1 ? 'job' : 'jobs'} done
        {taken.ownPaise - taken.cashPaise - taken.upiPaise > 0 && ` · ${rupees(taken.ownPaise - taken.cashPaise - taken.upiPaise)} paid back`}
      </p>
      {closing.owing.length > 0 && (
        <div className="flex flex-col gap-1">
          <Overline>Still owes</Overline>
          {closing.owing.map((row) => (
            <Link key={row.customerId} href={`/book/customers/${encodeURIComponent(row.customerId)}`} className="flex justify-between text-t4">
              <span className="text-text-primary">{row.name}</span>
              <span className="font-numeric text-[#FF8A95]">{rupees(row.amountPaise)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
