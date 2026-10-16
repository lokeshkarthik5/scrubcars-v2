'use client'

import { useEffect, useState } from 'react'
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
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { Meta } from '@/components/meta'
import { type AdminVendor } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminVendors,
  useArchiveAdminVendor,
  useDeleteAdminVendor,
  useVerifyAdminVendor,
} from '@repo/core/api/hooks/use-admin-vendors'

// The small actions on a garage's card: outline, 44px tall, never red.
const ROW_ACTION = 'flex min-h-11 items-center gap-1 px-3 py-1.5 text-[12px]'

export default function AdminVendorsPage() {
  const router = useRouter()

  const { data, isPending, error: loadError, refetch } = useAdminVendors()
  const vendors = data ?? []
  const loading = isPending

  const verify = useVerifyAdminVendor()
  const archive = useArchiveAdminVendor()
  const remove = useDeleteAdminVendor()

  // Row-action failures surface in the same place a load failure does, which
  // is what this screen has always done — a failed verify replaces the list
  // rather than sitting above it.
  const [actionError, setActionError] = useState('')
  const error = loadError
    ? errorMessage(loadError, 'Failed to load vendors')
    : actionError

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(loadError)) router.replace('/login')
  }, [loadError, router])

  const verifyingId = verify.isPending ? verify.variables : null
  const busyId = archive.isPending
    ? archive.variables?.id
    : remove.isPending
      ? remove.variables
      : null

  const handleVerify = (id: string) => {
    setActionError('')
    verify.mutate(id, {
      onError: () => setActionError('Failed to verify vendor'),
    })
  }

  const handleArchiveToggle = (v: AdminVendor) => {
    const archiving = v.status !== 'archived'
    setActionError('')
    archive.mutate(
      { id: v.id, archiving },
      {
        onError: () =>
          setActionError(
            `Failed to ${archiving ? 'archive' : 'restore'} vendor`
          ),
      }
    )
  }

  const handleDelete = (v: AdminVendor) => {
    if (
      !window.confirm(
        `Permanently delete "${v.businessName}"?\n\nThis removes the vendor, its services and photos. It cannot be undone. A garage that has any bookings cannot be deleted — archive it instead.`
      )
    ) {
      return
    }
    setActionError('')
    remove.mutate(v.id, {
      // The server's own words: a garage with bookings is refused with "This
      // garage has bookings. Archive it instead.", which tells the admin what
      // to do next where a generic failure would not.
      onError: (err) => setActionError(errorMessage(err, 'Failed to delete vendor')),
    })
  }

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle={
          !loading && !error && vendors.length > 0 ? (
            <>
              <span className="font-numeric">{vendors.length}</span> total
            </>
          ) : undefined
        }
        // The page's one red: adding a garage is what it is for.
        actions={
          <ScButtonLink href="/vendors/new">
            <IconPlus size={16} aria-hidden="true" /> Add vendor
          </ScButtonLink>
        }
      />

      <SectionHeader title="Garages" />

      {loading ? (
        <SkeletonList count={3} itemClassName="h-40" />
      ) : error && vendors.length === 0 ? (
        <ErrorState message={error} onRetry={() => void refetch()} />
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
          {error && <p role="alert" className="text-[12px] text-error">{error}</p>}

          {vendors.map((v, i) => {
            const stage = vendorAdminStatusBadge(v.status)
            return (
              <Reveal key={v.id} index={i}>
                <ScCard className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-text-primary">
                        {v.businessName}
                      </p>
                      <p className="font-numeric text-[12px] text-text-secondary">{v.phone}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <ScBadge variant={stage.variant}>{stage.label}</ScBadge>
                      {/* Live but hidden from customers by its own (or ops')
                          choice — worth seeing at a glance in the list. */}
                      {v.bookingsPausedAt && <ScBadge variant="pending">Paused</ScBadge>}
                      <ScBadge variant={v.isVerified ? 'success' : 'pending'}>
                        {v.isVerified ? 'Verified' : 'Unverified'}
                      </ScBadge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                    <Meta label="Owner" truncate>
                      {v.owner ? (
                        <>
                          {v.owner.name}
                          <span className="font-numeric text-text-muted"> · {v.owner.phone}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </Meta>
                    <Meta label="City" truncate>{v.city}</Meta>
                    <Meta label="Location" truncate>
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
                    <Meta label="Services" truncate>
                      {v.serviceCount > 0 ? (
                        <>
                          <span className="font-numeric">{v.serviceCount}</span> service
                          {v.serviceCount === 1 ? '' : 's'}
                        </>
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
                        className="flex min-h-11 items-center text-[12px] font-medium text-warning underline-offset-2 hover:underline"
                      >
                        Set location before verifying →
                      </Link>
                    ) : (
                      <ScButton
                        fullWidth={false}
                        variant="secondary"
                        disabled={verifyingId === v.id}
                        aria-label={`Verify ${v.businessName}`}
                        onClick={() => handleVerify(v.id)}
                        className={ROW_ACTION}
                      >
                        {verifyingId === v.id ? 'Verifying…' : 'Verify'}
                      </ScButton>
                    )}
                    <ScButtonLink
                      href={`/vendors/${v.id}/edit`}
                      variant="secondary"
                      aria-label={`Edit ${v.businessName}`}
                      className={ROW_ACTION}
                    >
                      <IconPencil size={14} aria-hidden="true" /> Edit
                    </ScButtonLink>
                    <ScButton
                      fullWidth={false}
                      variant="secondary"
                      disabled={busyId === v.id}
                      aria-label={
                        v.status === 'archived'
                          ? `Restore ${v.businessName}`
                          : `Archive ${v.businessName}`
                      }
                      onClick={() => handleArchiveToggle(v)}
                      className={ROW_ACTION}
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
                      // Grey until hovered, then amber: destructive, but not the
                      // thing to press — it asks first, and red is Add vendor's.
                      className="ml-auto inline-flex size-11 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-error-muted hover:text-error disabled:opacity-50"
                    >
                      <IconTrash size={16} aria-hidden="true" />
                    </button>
                  </div>
                </ScCard>
              </Reveal>
            )
          })}
        </div>
      )}
    </>
  )
}
