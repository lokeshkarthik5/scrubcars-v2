'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconArchive,
  IconArchiveOff,
  IconBuildingStore,
  IconCheck,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react'
import { ScBadge, vendorAdminStatusBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { TopBar } from '@repo/ui/sc/top-bar'
import { ApiError } from '@repo/core/api/client'
import {
  listAdminVendors,
  verifyAdminVendor,
  archiveAdminVendor,
  unarchiveAdminVendor,
  deleteAdminVendor,
  type AdminVendor,
} from '@repo/core/api/admin'

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <div className="truncate text-[12px] text-text-secondary">{children}</div>
    </div>
  )
}

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
        router.replace('/login')
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
    <>
      <TopBar
        title="Vendors"
        right={
          <Link href="/vendors/new">
            <ScButton fullWidth={false} className="flex items-center gap-1.5 px-4 py-2">
              <IconPlus size={16} /> Add vendor
            </ScButton>
          </Link>
        }
      />

      {!loading && !error && vendors.length > 0 && (
        <p className="-mt-2 text-[11px] text-text-secondary">{vendors.length} total</p>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error && vendors.length === 0 ? (
        <ErrorState message={error} onRetry={load} />
      ) : vendors.length === 0 ? (
        <EmptyState
          icon={<IconBuildingStore size={32} stroke={1.5} />}
          title="No vendors yet"
          subtitle="Add your first vendor to start taking bookings."
          actionLabel="Add vendor"
          onAction={() => router.push('/vendors/new')}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {/* Errors from a row action surface above the list the row is in. */}
          {error && <p className="text-[12px] text-brand-red">{error}</p>}

          {vendors.map((v) => {
            const stage = vendorAdminStatusBadge(v.status)
            return (
              <ScCard key={v.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-text-primary">
                      {v.businessName}
                    </p>
                    <p className="text-[11px] text-text-secondary">{v.phone}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <ScBadge variant={stage.variant}>{stage.label}</ScBadge>
                    <ScBadge variant={v.isVerified ? 'success' : 'pending'}>
                      {v.isVerified ? 'Verified' : 'Unverified'}
                    </ScBadge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  <Meta label="Owner">
                    {v.owner ? (
                      <>
                        {v.owner.name}
                        <span className="text-text-muted"> · {v.owner.phone}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </Meta>
                  <Meta label="City">{v.city}</Meta>
                  <Meta label="Location">
                    {v.lat === null ? (
                      <Link
                        href={`/vendors/${v.id}/edit`}
                        className="text-warning underline-offset-2 hover:underline"
                      >
                        Not pinned
                      </Link>
                    ) : v.geoConfirmedAt ? (
                      'Confirmed'
                    ) : (
                      // Links straight to the map on the edit screen, since the
                      // fix is always "look at the pin", never something that can
                      // be done from this row.
                      <Link
                        href={`/vendors/${v.id}/edit`}
                        className="text-text-muted underline-offset-2 hover:text-text-primary hover:underline"
                      >
                        Unconfirmed pin →
                      </Link>
                    )}
                  </Meta>
                  <Meta label="Services">
                    {v.serviceCount > 0 ? (
                      `${v.serviceCount} service${v.serviceCount === 1 ? '' : 's'}`
                    ) : (
                      <span className="text-warning">None</span>
                    )}
                  </Meta>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  {v.isVerified ? (
                    <span className="inline-flex items-center gap-1 text-[12px] text-text-muted">
                      <IconCheck size={14} /> Verified
                    </span>
                  ) : v.lat === null ? (
                    // The server refuses to verify a garage with no pin, since
                    // listings gate on is_verified and an unpinned garage cannot
                    // be distance-sorted or checked against a doorstep radius.
                    // Surfaced here so the block is visible before the click.
                    <Link
                      href={`/vendors/${v.id}/edit`}
                      className="text-[12px] font-medium text-warning"
                    >
                      Set location before verifying →
                    </Link>
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
                  <Link href={`/vendors/${v.id}/edit`}>
                    <ScButton
                      fullWidth={false}
                      variant="secondary"
                      className="flex items-center gap-1 px-3 py-1.5 text-[12px]"
                    >
                      <IconPencil size={14} /> Edit
                    </ScButton>
                  </Link>
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
                    aria-label={`Delete ${v.businessName}`}
                    className="ml-auto inline-flex items-center rounded-[8px] p-1.5 text-brand-red transition-colors hover:bg-accent-muted disabled:opacity-50"
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </ScCard>
            )
          })}
        </div>
      )}
    </>
  )
}
