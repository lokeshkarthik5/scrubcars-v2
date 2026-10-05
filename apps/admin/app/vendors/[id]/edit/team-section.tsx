'use client'

import { useEffect, useState } from 'react'
import { IconLock, IconTrash } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScField } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import { ScSelect } from '@repo/ui/sc/select'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import {
  addAdminVendorMember,
  listAdminVendorMembers,
  removeAdminVendorMember,
  updateAdminVendorMember,
} from '@repo/core/api/admin'
import type { ApiMember } from '@repo/core/api/members'
import type { VendorRole } from '@repo/core/api/types'

const ROLE_OPTIONS: { value: VendorRole; label: string }[] = [
  { value: 'vendor_operator', label: 'Operator' },
  { value: 'vendor_admin', label: 'Admin' },
]

/**
 * Team management for one named garage, from the admin panel.
 *
 * Same service as the vendor-facing team screen, so the rules are identical
 * rather than restated: the owner's row cannot be removed, demoted or
 * suspended, and re-adding someone who was removed reactivates their row.
 *
 * Ownership transfer is deliberately absent here. Adding and removing people is
 * admin work; reassigning who *owns* a business is not.
 *
 * Saves immediately — this section does not wait for "Save changes", which only
 * covers the vendor form around it.
 */
export function VendorTeamSection({ vendorId }: { vendorId: string }) {
  const [members, setMembers] = useState<ApiMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<VendorRole>('vendor_operator')

  useEffect(() => {
    let cancelled = false

    void listAdminVendorMembers(vendorId)
      .then((rows) => {
        if (!cancelled) setMembers(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load team')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [vendorId])

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id)
    setError('')
    try {
      await action()
      setMembers(await listAdminVendorMembers(vendorId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  const handleAdd = () =>
    run('add', async () => {
      if (phone.length !== 10) throw new Error('Enter a 10-digit phone number')
      await addAdminVendorMember(vendorId, {
        phone,
        name: name.trim() || undefined,
        role,
      })
      setPhone('')
      setName('')
      setRole('vendor_operator')
    })

  return (
    <ScSection title="Team">
      <p className="text-[11px] text-text-muted">
        Saved immediately — these do not wait for “Save changes”. A phone with no
        account yet gets access the next time it logs in.
      </p>

      {/* Amber, as errors are: red on this page is Save changes. */}
      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}

      {loading ? (
        <SkeletonList count={2} itemClassName="h-14 rounded-[10px]" />
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center gap-2 rounded-[12px] bg-surface px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[13px] font-medium text-text-primary">
                  <span className="truncate">{member.name}</span>
                  {member.status === 'suspended' && (
                    <ScBadge variant="danger">Suspended</ScBadge>
                  )}
                </p>
                <p className="font-numeric text-[12px] text-text-muted">{member.phone}</p>
              </div>

              {member.isOwner ? (
                <span className="flex items-center gap-1 text-[11px] text-text-muted">
                  <IconLock size={13} stroke={1.5} aria-hidden="true" /> Owner — locked
                </span>
              ) : (
                <>
                  <ScSelect
                    aria-label={`Role for ${member.name}`}
                    value={member.role}
                    disabled={busyId === member.id}
                    className="min-h-11 w-auto py-1.5 text-[12px]"
                    onChange={(e) =>
                      run(member.id, () =>
                        updateAdminVendorMember(vendorId, member.id, {
                          role: e.target.value as VendorRole,
                        })
                      )
                    }
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </ScSelect>

                  <ScButton
                    fullWidth={false}
                    variant="secondary"
                    disabled={busyId === member.id}
                    className="min-h-11 px-3.5 py-2 text-[12px]"
                    onClick={() =>
                      run(member.id, () =>
                        updateAdminVendorMember(vendorId, member.id, {
                          status:
                            member.status === 'active' ? 'suspended' : 'active',
                        })
                      )
                    }
                  >
                    {member.status === 'active' ? 'Suspend' : 'Restore'}
                  </ScButton>

                  <button
                    type="button"
                    disabled={busyId === member.id}
                    onClick={() =>
                      run(member.id, () =>
                        removeAdminVendorMember(vendorId, member.id)
                      )
                    }
                    // Grey until hovered, then amber, as the panel's other
                    // removals are; red on this page is Save changes.
                    className="inline-flex size-11 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-error-muted hover:text-error disabled:opacity-50"
                    aria-label={`Remove ${member.name}`}
                  >
                    <IconTrash size={16} stroke={1.5} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ScField
          label="Phone"
          inputMode="numeric"
          className="font-numeric"
          value={phone}
          onChange={(value) => setPhone(value.replace(/\D/g, '').slice(0, 10))}
          placeholder="10 digits"
        />
        <ScField
          label="Name (optional)"
          value={name}
          onChange={setName}
        />
      </div>
      <div className="flex items-end gap-3">
        <ScSelect
          label="Role"
          value={role}
          className="flex-1"
          onChange={(e) => setRole(e.target.value as VendorRole)}
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </ScSelect>
        {/* Secondary: Save changes at the foot of the page is its one red,
            and this saves on its own the moment it is pressed. */}
        <ScButton
          fullWidth={false}
          variant="secondary"
          disabled={busyId === 'add'}
          className="min-h-11 px-4 py-2.5 text-[12px]"
          onClick={handleAdd}
        >
          {busyId === 'add' ? 'Adding…' : 'Add member'}
        </ScButton>
      </div>
    </ScSection>
  )
}
