'use client'

import { use } from 'react'
import { ApiError } from '@repo/core/api/client'
import { useAdminBook } from '@repo/core/api/hooks/use-garage-book'
import { carName, jobTime, plateText, rupees, shortDate } from '@repo/core/garage-book'
import { Notice } from '@repo/ui/sc/notice'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'

/**
 * A garage's Garage Book, read-only (0069; owner decision 4: Detlio staff
 * can see all of it). Every opening is logged by the API before it reads
 * the book. Nothing here can be changed: the garage keeps its own book.
 */
export default function AdminGarageBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const book = useAdminBook(id)
  const data = book.data
  const off = book.error instanceof ApiError && book.error.status === 404

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data ? `${data.vendor.name} · Garage Book` : 'Garage Book'}
        subtitle="Read-only. The garage's own customers, walk-ins, money owed and stats. Each look is logged."
        showBack
        backHref="/vendors"
      />

      {off ? (
        <Notice tone="neutral" title="Garage Book is off">
          It shows here once GARAGE_BOOK is on for the API.
        </Notice>
      ) : !data ? (
        book.isError ? (
          <Notice title="Couldn't load the book">{book.error instanceof Error ? book.error.message : 'Try again.'}</Notice>
        ) : (
          <SkeletonList count={4} itemClassName="h-24" />
        )
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Customers', String(data.counts.all), `${data.counts.own} own · ${data.counts.detlio} Detlio`],
              ['This month', rupees(data.stats.takenPaise) ?? '–', `${rupees(data.stats.split.ownPaise)} own · ${rupees(data.stats.split.detlioPaise)} Detlio`],
              ['Owed to the garage', rupees(data.owed.totalPaise) ?? '–', `${data.owed.customers.length} customers`],
              ['New customers', String(data.stats.newCustomers), `${data.stats.newFromDetlio} via Detlio`],
            ].map(([label, value, sub]) => (
              <div key={label} className="rounded-[14px] border border-border bg-surface p-4">
                <p className="text-[12px] text-text-secondary">{label}</p>
                <p className="mt-1 font-numeric text-[22px] font-semibold text-text-primary">{value}</p>
                <p className="text-[12px] text-text-secondary">{sub}</p>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold text-text-primary">Customers</h2>
            <div className="overflow-x-auto rounded-[14px] border border-border">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-surface text-text-secondary">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Car</th>
                    <th className="px-3 py-2 font-medium">Visits</th>
                    <th className="px-3 py-2 font-medium">Last visit</th>
                    <th className="px-3 py-2 font-medium">Owes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.customers.map((c) => (
                    <tr key={c.id} className="border-t border-border text-text-primary">
                      <td className="px-3 py-2">{c.name}</td>
                      <td className="px-3 py-2">{c.viaDetlio ? 'Detlio' : 'Own'}</td>
                      <td className="px-3 py-2 font-numeric">{c.phone ?? '—'}</td>
                      <td className="px-3 py-2">{[plateText(c.cars[0]?.plate), carName(c.cars[0])].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-3 py-2 font-numeric">{c.visits}</td>
                      <td className="px-3 py-2">{shortDate(c.lastVisitAt) || '—'}</td>
                      <td className="px-3 py-2 font-numeric">{c.owesPaise ? rupees(c.owesPaise) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold text-text-primary">Walk-ins, last 90 days</h2>
            <div className="overflow-x-auto rounded-[14px] border border-border">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-surface text-text-secondary">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Services</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map((job) => (
                    <tr key={job.id} className="border-t border-border text-text-primary">
                      <td className="px-3 py-2">
                        {shortDate(job.scheduledAt)} · {jobTime(job.scheduledAt)}
                      </td>
                      <td className="px-3 py-2">{job.name}</td>
                      <td className="px-3 py-2">{job.lines.map((line) => line.label).join(', ')}</td>
                      <td className="px-3 py-2">{job.status.replace('_', ' ')}</td>
                      <td className="px-3 py-2">{job.payment === 'later' ? 'Pay later' : job.payment.toUpperCase()}</td>
                      <td className="px-3 py-2 font-numeric">{rupees(job.totalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
