'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconLock, IconTrash } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput } from '@repo/ui/sc/input'
import { ScSelect } from '@repo/ui/sc/select'
import { TopBar } from '@repo/ui/sc/top-bar'
import {
  addMember,
  getMembers,
  removeMember,
  transferOwnership,
  updateMember,
  type ApiMember,
} from '@repo/core/api/members'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { onVendorSwitch, useAuthStore } from '@repo/core/stores/auth-store'
import type { VendorRole } from '@repo/core/api/types'

const ROLE_OPTIONS: { value: VendorRole; label: string }[] = [
  { value: 'vendor_operator', label: 'Operator — jobs only' },
  { value: 'vendor_admin', label: 'Admin — full access' },
]

function roleLabel(role: VendorRole) {
  return role === 'vendor_admin' ? 'Admin' : 'Operator'
}

export default function VendorMembersPage() {
  const router = useRouter()
  const isVendorAdmin = useIsVendorAdmin()
  const isOwner = useAuthStore((s) => s.isOwner)
  const activeVendorId = useAuthStore((s) => s.activeVendorId)

  const [members, setMembers] = useState<ApiMember[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<VendorRole>('vendor_operator')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      setMembers(await getMembers())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [])

  // Operators get 403 on every endpoint behind this screen, so there is nothing
  // here for them to see.
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home')
  }, [isVendorAdmin, router])

  // Refetch on a company switch as well as on mount — the list belongs to the
  // active company, and leaving the previous one on screen reads as a leak.
  useEffect(() => {
    if (!isVendorAdmin) return
    let cancelled = false

    void getMembers()
      .then((rows) => {
        if (!cancelled) setMembers(rows)
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load members')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isVendorAdmin, activeVendorId])

  useEffect(() => onVendorSwitch(() => void load()), [load])

  const handleAdd = async () => {
    if (phone.length !== 10) {
      toast.error('Enter a 10-digit phone number')
      return
    }

    setAdding(true)
    try {
      await addMember({ phone, name: name.trim() || undefined, role })
      setPhone('')
      setName('')
      setRole('vendor_operator')
      await load()
      toast.success('Member added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setAdding(false)
    }
  }

  const run = async (id: string, action: () => Promise<void>, done: string) => {
    setBusyId(id)
    try {
      await action()
      await load()
      toast.success(done)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar title="Team" showBack backHref="/settings" />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">
          Add a team member
        </h2>
        <ScCard className="flex flex-col gap-3">
          <ScInput
            id="member-phone"
            label="Phone"
            value={phone}
            inputMode="numeric"
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
          <ScInput
            id="member-name"
            label="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <ScSelect
            id="member-role"
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as VendorRole)}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ScSelect>
          {/* No invite step: being added grants access on their next login. */}
          <p className="text-[11px] text-text-secondary">
            They get access the next time they log in with this number. Operators
            can work on jobs but cannot see earnings or change settings.
          </p>
          <ScButton onClick={handleAdd} disabled={adding}>
            {adding ? 'Adding...' : 'Add member'}
          </ScButton>
        </ScCard>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Members</h2>
        {loading ? (
          <p className="text-[13px] text-text-secondary">Loading team...</p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((member) => (
              <ScCard key={member.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-text-primary">
                      {member.name}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      {member.phone}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {member.status === 'suspended' && (
                      <ScBadge variant="pending">Suspended</ScBadge>
                    )}
                    {member.isOwner ? (
                      <ScBadge variant="success">Owner</ScBadge>
                    ) : (
                      <ScBadge variant="pending">{roleLabel(member.role)}</ScBadge>
                    )}
                  </div>
                </div>

                {member.isOwner ? (
                  // The owner's row is locked for everyone, including the owner.
                  // It is what guarantees the company always has an admin.
                  <p className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                    <IconLock size={13} stroke={1.5} />
                    The owner cannot be changed or removed. Transfer ownership
                    first.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <ScSelect
                      value={member.role}
                      disabled={busyId === member.id}
                      onChange={(e) =>
                        run(
                          member.id,
                          () =>
                            updateMember(member.id, {
                              role: e.target.value as VendorRole,
                            }),
                          'Role updated'
                        )
                      }
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {roleLabel(option.value)}
                        </option>
                      ))}
                    </ScSelect>

                    <ScButton
                      variant="secondary"
                      disabled={busyId === member.id}
                      onClick={() =>
                        run(
                          member.id,
                          () =>
                            updateMember(member.id, {
                              status:
                                member.status === 'active'
                                  ? 'suspended'
                                  : 'active',
                            }),
                          member.status === 'active'
                            ? 'Member suspended'
                            : 'Member restored'
                        )
                      }
                    >
                      {member.status === 'active' ? 'Suspend' : 'Restore'}
                    </ScButton>

                    <ScButton
                      variant="secondary"
                      disabled={busyId === member.id}
                      onClick={() =>
                        run(
                          member.id,
                          () => removeMember(member.id),
                          'Member removed'
                        )
                      }
                    >
                      <IconTrash size={14} stroke={1.5} /> Remove
                    </ScButton>

                    {isOwner && member.status === 'active' && (
                      <ScButton
                        variant="secondary"
                        disabled={busyId === member.id}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Make ${member.name} the owner? You stay an admin, but you cannot undo this yourself.`
                            )
                          ) {
                            return
                          }
                          void run(
                            member.id,
                            async () => {
                              await transferOwnership(member.userId)
                              await useAuthStore.getState().refreshVendors()
                            },
                            'Ownership transferred'
                          )
                        }}
                      >
                        Make owner
                      </ScButton>
                    )}
                  </div>
                )}
              </ScCard>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}
