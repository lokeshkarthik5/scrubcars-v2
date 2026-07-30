'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/api/client'
import { listAdminBookings, type AdminBooking } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const STATUSES = ['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'] as const

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminBookingsPage() {
  const router = useRouter()
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setBookings(await listAdminBookings(status === 'all' ? undefined : status))
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/admin/login')
        return
      }
      setError('Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }, [router, status])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Bookings</h1>
        <p className="text-[13px] text-text-secondary">{bookings.length} shown</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'rounded-full px-3 py-1 text-[12px] capitalize transition-colors',
              status === s
                ? 'bg-brand-red text-brand-white'
                : 'bg-surface text-text-secondary hover:text-text-primary'
            )}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {error && <p className="text-[13px] text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-[13px] text-text-secondary">Loading…</p>
      ) : bookings.length === 0 ? (
        <p className="text-[13px] text-text-secondary">No bookings found.</p>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-surface text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Vendor</th>
                <th className="px-4 py-2.5 font-medium">Service</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-4 py-3 text-text-secondary">{formatDate(b.scheduledAt)}</td>
                  <td className="px-4 py-3">
                    {b.user ? (
                      <>
                        <div className="text-text-primary">{b.user.name}</div>
                        <div className="text-text-muted">{b.user.phone}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {b.vendor?.businessName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{b.service?.name ?? '—'}</td>
                  <td className="px-4 py-3 capitalize text-text-secondary">
                    {b.bookingType.replace('_', ' ')}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">₹{b.amount}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] capitalize text-text-secondary">
                      {b.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
