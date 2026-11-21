'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-toastify'
import {
  IconChevronRight,
  IconHierarchy2,
  IconLink,
  IconMapPin,
  IconPlus,
  IconStarFilled,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScField } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import type { AdminBranch, AdminBranches, BranchState } from '@repo/core/api/admin-branches'
import { useAdminVendors } from '@repo/core/api/hooks/use-admin-vendors'
import { useAdminBranches, useLinkBranch, useRemoveBranch } from '@repo/core/api/hooks/use-admin-branches'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { cn } from '@repo/core/utils'
import { SignedAs } from '@/components/signed-as'
import {
  BRANCHES_NOTE,
  BRANCH_STATE_LABELS,
  NO_BRANCHES_NOTE,
  addedTodayLine,
  branchAddressLine,
  branchCount,
  branchRatingText,
} from '@/lib/branch-groups'
import { isInBin, matchesSearch } from '@/lib/vendor-list'

const STATE_TONE: Record<BranchState, string> = {
  live: 'bg-tone-done-tint text-success',
  paused: 'bg-white/[0.06] text-text-secondary',
  not_live: 'bg-warning/10 text-warning',
}
const STATE_DOT: Record<BranchState, string> = {
  live: 'bg-success',
  paused: 'bg-text-muted',
  not_live: 'bg-warning',
}

/**
 * The Branches card (0081, mockup 2-branches-1), at the top of every
 * branch's Details tab: the group's name and how many branches it has, then
 * each one with its area, address, state, rating and Open. "Add a branch"
 * opens today's sheet (passed in as `onAddBranch`); "Link an existing
 * garage" joins a garage copied before today into the group, and can take
 * one out ("Remove from group"). A garage in no group gets the same card,
 * with the two buttons and a line saying it has no other branches yet.
 */
export function BranchesCard({
  vendorId,
  readOnly,
  onAddBranch,
}: {
  vendorId: string
  readOnly: boolean
  onAddBranch: () => void
}) {
  const query = useAdminBranches(vendorId)
  const [linking, setLinking] = useState(false)
  const data = query.data
  const group = data?.group ?? null

  return (
    <section
      aria-labelledby="branches-title"
      className="mb-4 flex flex-col rounded-[16px] border border-border bg-surface"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <IconHierarchy2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-text-secondary" />
          <div className="min-w-0">
            <h2 id="branches-title" className="text-[15px] font-medium tracking-[-0.01em] text-text-primary">
              Branches
            </h2>
            {group && (
              <p className="mt-0.5 text-[12.5px] text-text-secondary">
                Group: <span className="font-medium text-text-primary">{group.name}</span> ·{' '}
                <span className="font-numeric">{branchCount(group.count)}</span>
              </p>
            )}
          </div>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <ScButton
              type="button"
              variant="outline"
              fullWidth={false}
              onClick={() => setLinking(true)}
              className="min-h-11 px-4 text-[13px]"
            >
              <IconLink size={16} aria-hidden="true" />
              Link an existing garage
            </ScButton>
            <ScButton
              type="button"
              variant="outline"
              fullWidth={false}
              onClick={onAddBranch}
              className="min-h-11 px-4 text-[13px]"
            >
              <IconPlus size={16} aria-hidden="true" />
              Add a branch
            </ScButton>
          </div>
        )}
      </div>

      {query.isError ? (
        <p role="alert" className="border-t border-border px-4 py-3 text-[12.5px] text-error">
          {errorMessage(query.error, 'Couldn’t load the branches.')}
        </p>
      ) : !data ? (
        <p role="status" className="border-t border-border px-4 py-3 text-[12.5px] text-text-muted">
          Loading the branches…
        </p>
      ) : group ? (
        <>
          <ul aria-label="Branches in this group" className="divide-y divide-line border-t border-border">
            {data.branches.map((branch) => (
              <li key={branch.id}>
                <BranchRow branch={branch} />
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-3 text-[12px] text-text-muted">{BRANCHES_NOTE}</p>
        </>
      ) : (
        <p className="border-t border-border px-4 py-3 text-[12.5px] text-text-secondary">{NO_BRANCHES_NOTE}</p>
      )}

      <LinkGarageSheet open={linking} onClose={() => setLinking(false)} vendorId={vendorId} current={data ?? null} />
    </section>
  )
}

function BranchRow({ branch }: { branch: AdminBranch }) {
  const added = addedTodayLine(branch)
  const address = branchAddressLine(branch)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.05] text-text-secondary"
      >
        <IconMapPin size={17} stroke={1.6} />
      </span>
      <div className="min-w-0 flex-1 basis-[200px]">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14.5px] text-text-primary">
          <span className="font-medium">{branch.label}</span>
          {branch.isMain && (
            <span className="rounded-[6px] bg-white/[0.07] px-1.5 py-0.5 text-[11px] text-text-secondary">Main branch</span>
          )}
          {branch.isCurrent && <span className="text-[12px] text-text-muted">· you are here</span>}
        </p>
        {address && <p className="mt-0.5 text-[12.5px] text-text-secondary">{address}</p>}
        {added && <p className="mt-0.5 text-[12.5px] text-warning">{added}</p>}
      </div>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium',
          STATE_TONE[branch.state]
        )}
      >
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', STATE_DOT[branch.state])} />
        {BRANCH_STATE_LABELS[branch.state]}
      </span>
      <span className="flex w-[104px] shrink-0 items-center gap-1 text-[12.5px] text-text-secondary">
        {branch.rating !== null && <IconStarFilled size={13} aria-hidden="true" className="text-warning" />}
        <span className={cn(branch.rating !== null && 'font-numeric')}>{branchRatingText(branch)}</span>
      </span>
      <Link
        href={`/vendors/${branch.id}/edit`}
        aria-label={`Open ${branch.label}`}
        className="inline-flex min-h-11 shrink-0 items-center gap-0.5 text-[13px] text-text-primary hover:underline"
      >
        Open
        <IconChevronRight size={15} aria-hidden="true" />
      </Link>
    </div>
  )
}

/** The most search results shown at once: a name narrows it further. */
const MAX_RESULTS = 8

/**
 * "Link an existing garage": the branches in this group, each with Remove
 * from group, and the admin garage search (the Garages list's own matching,
 * Bin left out) to link another. A garage in another group moves to this
 * one; a group left with one garage is undone (server rule).
 */
function LinkGarageSheet({
  open,
  onClose,
  vendorId,
  current,
}: {
  open: boolean
  onClose: () => void
  vendorId: string
  current: AdminBranches | null
}) {
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const vendors = useAdminVendors()
  const link = useLinkBranch(vendorId)
  const remove = useRemoveBranch(vendorId)
  const busy = link.isPending || remove.isPending
  const members = useMemo(() => new Set((current?.branches ?? []).map((branch) => branch.id)), [current])
  const results = useMemo(() => {
    if (!search.trim()) return []
    return (vendors.data ?? [])
      .filter((v) => v.id !== vendorId && !members.has(v.id) && !isInBin(v) && matchesSearch(v, search))
      .slice(0, MAX_RESULTS)
  }, [vendors.data, search, vendorId, members])

  const close = () => {
    if (busy) return
    setSearch('')
    setError(null)
    onClose()
  }

  const onLink = (id: string, name: string) => {
    setError(null)
    link.mutate(id, {
      onSuccess: () => {
        toast.success(`${name} is one of these branches now.`)
        setSearch('')
      },
      onError: (err) => setError(errorMessage(err, 'Couldn’t link the garage')),
    })
  }

  const onRemove = (branch: AdminBranch) => {
    setError(null)
    remove.mutate(branch.id, {
      onSuccess: () => toast.success(`${branch.businessName} is no longer one of these branches.`),
      onError: (err) => setError(errorMessage(err, 'Couldn’t remove the garage from the group')),
    })
  }

  return (
    <ScSheet
      open={open}
      onClose={close}
      dismissible={!busy}
      aria-label="Link an existing garage"
      className="flex flex-col gap-4 px-4 pt-2"
    >
      <div>
        <h2 className="text-[16px] font-semibold text-text-primary">Link an existing garage</h2>
        <p className="mt-0.5 text-[12.5px] text-text-secondary">
          A garage copied before today joins this group. Each branch keeps its own bookings, team, documents and reviews.
        </p>
      </div>

      {current?.group && (
        <div className="flex flex-col gap-1">
          <p className="text-[12px] font-medium text-text-secondary">
            In the {current.group.name} group
          </p>
          <ul className="flex flex-col divide-y divide-line rounded-[12px] border border-border">
            {current.branches.map((branch) => (
              <li key={branch.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-text-primary">{branch.businessName}</span>
                  {branch.isCurrent && <span className="block text-[12px] text-text-muted">This garage</span>}
                </span>
                <ScButton
                  type="button"
                  variant="text"
                  fullWidth={false}
                  disabled={busy}
                  onClick={() => onRemove(branch)}
                  aria-label={`Remove ${branch.businessName} from group`}
                  className="min-h-11 px-2 text-[12.5px]"
                >
                  Remove from group
                </ScButton>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScField
        label="Search garages"
        value={search}
        onChange={setSearch}
        placeholder="Name, area, pincode or phone"
        autoComplete="off"
      />
      {search.trim() &&
        (vendors.isLoading ? (
          <p role="status" className="text-[12.5px] text-text-muted">Loading the garages…</p>
        ) : results.length === 0 ? (
          <p role="status" className="text-[12.5px] text-text-muted">No other garage matches.</p>
        ) : (
          <ul aria-label="Garages found" className="flex flex-col divide-y divide-line rounded-[12px] border border-border">
            {results.map((garage) => (
              <li key={garage.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-text-primary">{garage.businessName}</span>
                  <span className="block truncate text-[12px] text-text-muted">
                    {[garage.city, garage.pincode].filter(Boolean).join(' · ')}
                    {garage.groupId ? ' · In another group: linking moves it here' : ''}
                  </span>
                </span>
                <ScButton
                  type="button"
                  variant="outline"
                  fullWidth={false}
                  disabled={busy}
                  onClick={() => onLink(garage.id, garage.businessName)}
                  aria-label={`Link ${garage.businessName}`}
                  className="min-h-11 px-4 text-[12.5px]"
                >
                  Link
                </ScButton>
              </li>
            ))}
          </ul>
        ))}

      {error && (
        <p role="alert" className="text-[12.5px] text-warning">
          {error}
        </p>
      )}
      <SignedAs />
      <ScButton type="button" variant="outline" onClick={close} disabled={busy} className="min-h-11">
        Done
      </ScButton>
    </ScSheet>
  )
}
