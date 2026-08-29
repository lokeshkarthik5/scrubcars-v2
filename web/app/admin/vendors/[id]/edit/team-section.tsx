'use client'

import { useEffect, useState } from 'react'
import { IconLock, IconTrash } from '@tabler/icons-react'
import { ScButton } from '@/components/sc/button'
import { ScField } from '@/components/sc/input'
import { ScSection } from '@/components/sc/section'
import { ScSelect } from '@/components/sc/select'
import {
  addAdminVendorMember,
  listAdminVendorMembers,
  removeAdminVendorMember,
  updateAdminVendorMember,
} from '@/lib/api/admin'
import type { ApiMember } from '@/lib/api/members'
import type { VendorRole } from '@/lib/api/types'

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

      {error && <p className="text-[12px] text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-[12px] text-text-muted">Loading team…</p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center gap-2 rounded-[10px] bg-surface px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-text-primary">
                  {member.name}
                  {member.status === 'suspended' && (
                    <span className="ml-2 text-[11px] text-warning">
                      Suspended
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-text-muted">{member.phone}</p>
              </div>

              {member.isOwner ? (
                <span className="flex items-center gap-1 text-[11px] text-text-muted">
                  <IconLock size={13} stroke={1.5} /> Owner — locked
                </span>
              ) : (
                <>
                  <ScSelect
                    value={member.role}
                    disabled={busyId === member.id}
                    className="w-auto py-1.5 text-[12px]"
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
                    className="px-3 py-2 text-[12px]"
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
                    className="text-brand-red disabled:opacity-50"
                    aria-label={`Remove ${member.name}`}
                  >
                    <IconTrash size={16} stroke={1.5} />
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
        <ScButton
          fullWidth={false}
          disabled={busyId === 'add'}
          className="px-4 py-2.5 text-[12px]"
          onClick={handleAdd}
        >
          {busyId === 'add' ? 'Adding…' : 'Add member'}
        </ScButton>
      </div>
    </ScSection>
  )
}
