'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconPlus, IconCheck, IconArchive, IconArchiveOff, IconTrash } from '@tabler/icons-react'
import { ScButton } from '@/components/sc/button'
import { ApiError } from '@/lib/api/client'
import {
  listAdminVendors,
  verifyAdminVendor,
  archiveAdminVendor,
  unarchiveAdminVendor,
  deleteAdminVendor,
  type AdminVendor,
} from '@/lib/api/admin'

export default function AdminVendorsPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState<AdminVendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setVendors(await listAdminVendors())
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/admin/login')
        return
      }
      setError('Failed to load vendors')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const handleVerify = async (id: string) => {
    setVerifyingId(id)
    try {
      const updated = await verifyAdminVendor(id)
      setVendors((prev) => prev.map((v) => (v.id === id ? { ...v, ...updated } : v)))
    } catch {
      setError('Failed to verify vendor')
    } finally {
      setVerifyingId(null)
    }
  }

  const handleArchiveToggle = async (v: AdminVendor) => {
    const archiving = v.status !== 'archived'
    setBusyId(v.id)
    setError('')
    try {
      const updated = archiving
        ? await archiveAdminVendor(v.id)
        : await unarchiveAdminVendor(v.id)
      setVendors((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...updated } : x)))
    } catch {
      setError(`Failed to ${archiving ? 'archive' : 'restore'} vendor`)
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (v: AdminVendor) => {
    if (
      !window.confirm(
        `Permanently delete "${v.businessName}"?\n\nThis removes the vendor and all its bookings, reviews and services. This cannot be undone. Use Archive instead if you want to keep the data.`
      )
    ) {
      return
    }
    setBusyId(v.id)
    setError('')
    try {
      await deleteAdminVendor(v.id)
      setVendors((prev) => prev.filter((x) => x.id !== v.id))
    } catch {
      setError('Failed to delete vendor')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Vendors</h1>
          <p className="text-[13px] text-text-secondary">{vendors.length} total</p>
        </div>
        <Link href="/admin/vendors/new">
          <ScButton fullWidth={false} className="flex items-center gap-1.5 px-4 py-2">
            <IconPlus size={16} /> Add vendor
          </ScButton>
        </Link>
      </div>

      {error && <p className="text-[13px] text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-[13px] text-text-secondary">Loading…</p>
      ) : vendors.length === 0 ? (
        <p className="text-[13px] text-text-secondary">No vendors yet.</p>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-surface text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">Business</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">City</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Verified</th>
                <th className="px-4 py-2.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">{v.businessName}</div>
                    <div className="text-text-muted">{v.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {v.owner ? (
                      <>
                        <div>{v.owner.name}</div>
                        <div className="text-text-muted">{v.owner.phone}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{v.city}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] capitalize text-text-secondary">
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {v.isVerified ? (
                      <span className="text-[12px] text-success">Verified</span>
                    ) : (
                      <span className="text-[12px] text-warning">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {v.isVerified ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-text-muted">
                          <IconCheck size={14} /> Done
                        </span>
                      ) : (
                        <ScButton
                          fullWidth={false}
                          variant="secondary"
                          disabled={verifyingId === v.id}
                          onClick={() => handleVerify(v.id)}
                          className="px-3 py-1.5 text-[12px]"
                        >
                          {verifyingId === v.id ? 'Verifying…' : 'Verify'}
                        </ScButton>
                      )}
                      <ScButton
                        fullWidth={false}
                        variant="secondary"
                        disabled={busyId === v.id}
                        onClick={() => handleArchiveToggle(v)}
                        className="flex items-center gap-1 px-3 py-1.5 text-[12px]"
                      >
                        {v.status === 'archived' ? (
                          <>
                            <IconArchiveOff size={14} /> Restore
                          </>
                        ) : (
                          <>
                            <IconArchive size={14} /> Archive
                          </>
                        )}
                      </ScButton>
                      <button
                        type="button"
                        disabled={busyId === v.id}
                        onClick={() => handleDelete(v)}
                        title="Delete permanently"
                        className="inline-flex items-center rounded-[8px] p-1.5 text-brand-red hover:bg-brand-red/10 disabled:opacity-50"
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
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
