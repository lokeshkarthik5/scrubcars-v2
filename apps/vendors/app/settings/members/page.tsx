'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconLock, IconTrash } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useT } from '@repo/core/i18n'
import { msg, t } from '@repo/core/i18n/translate'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput } from '@repo/ui/sc/input'
import { Reveal } from '@repo/ui/sc/reveal'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { ScSelect } from '@repo/ui/sc/select'
import { SkeletonList } from '@repo/ui/sc/skeleton'
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

// English, shown as `t(…)`.
/** Said from an effect, so it reads the language in use without being one of the effect's dependencies. */
const loadFailed = () => t('Failed to load members')

const ROLE_OPTIONS: { value: VendorRole; label: string }[] = [
  { value: 'vendor_operator', label: msg('Operator — jobs only') },
  { value: 'vendor_admin', label: msg('Admin — full access') },
]

function roleLabel(role: VendorRole) {
  return role === 'vendor_admin' ? msg('Admin') : msg('Operator')
}

export default function VendorMembersPage() {
  const t = useT()
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
      toast.error(err instanceof Error ? err.message : loadFailed())
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
        toast.error(
          err instanceof Error ? err.message : loadFailed()
        )
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
      toast.error(t('Enter a 10-digit phone number'))
      return
    }

    setAdding(true)
    try {
      await addMember({ phone, name: name.trim() || undefined, role })
      setPhone('')
      setName('')
      setRole('vendor_operator')
      await load()
      toast.success(t('Member added'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Failed to add member'))
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
      toast.error(err instanceof Error ? err.message : t('Something went wrong'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar title={t('Team')} showBack backHref="/settings" />

      <section className="flex flex-col gap-3">
        <SectionHeader title={t('Add a team member')} />
        <ScCard className="flex flex-col gap-3">
          <ScInput
            id="member-phone"
            label={t('Phone')}
            value={phone}
            inputMode="numeric"
            className="font-numeric"
            onChange={(e) =>
              setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
            }
          />
          <ScInput
            id="member-name"
            label={t('Name (optional)')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <ScSelect
            id="member-role"
            label={t('Role')}
            value={role}
            onChange={(e) => setRole(e.target.value as VendorRole)}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </ScSelect>
          {/* No invite step: being added grants access on their next login. */}
          <p className="text-[11px] text-text-secondary">
            {t(
              'They get access the next time they log in with this number. Operators can work on jobs but cannot see earnings or change settings.'
            )}
          </p>
          <ScButton
            variant="main"
            size="lg"
            onClick={handleAdd}
            disabled={adding}
          >
            {adding ? t('Adding...') : t('Add member')}
          </ScButton>
        </ScCard>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title={t('Members')}
          action={
            !loading && members.length > 0 ? (
              <span className="font-numeric text-[12px] text-text-muted">
                {members.length}
              </span>
            ) : undefined
          }
        />
        {loading ? (
          <SkeletonList count={2} itemClassName="h-28" />
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((member, i) => (
              <Reveal key={member.id} index={i}>
                <ScCard className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-text-primary">
                        {member.name}
                      </p>
                      <p className="font-numeric text-[12px] text-text-secondary">
                        {member.phone}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {member.status === 'suspended' && (
                        <ScBadge variant="danger">{t('Suspended')}</ScBadge>
                      )}
                      {member.isOwner ? (
                        <ScBadge variant="success">{t('Owner')}</ScBadge>
                      ) : (
                        <ScBadge variant="pending">
                          {t(roleLabel(member.role))}
                        </ScBadge>
                      )}
                    </div>
                  </div>

                  {member.isOwner ? (
                    // The owner's row is locked for everyone, including the owner.
                    // It is what guarantees the company always has an admin.
                    <p className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                      <IconLock
                        size={13}
                        stroke={1.5}
                        aria-hidden="true"
                        className="shrink-0"
                      />
                      {t('The owner cannot be changed or removed. Transfer ownership first.')}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <ScSelect
                        aria-label={t('Role for {name}', { name: member.name })}
                        value={member.role}
                        disabled={busyId === member.id}
                        className="min-h-11 w-auto"
                        onChange={(e) =>
                          run(
                            member.id,
                            () =>
                              updateMember(member.id, {
                                role: e.target.value as VendorRole,
                              }),
                            t('Role updated')
                          )
                        }
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(roleLabel(option.value))}
                          </option>
                        ))}
                      </ScSelect>

                      <ScButton
                        variant="outline"
                        size="md"
                        fullWidth={false}
                        disabled={busyId === member.id}
                        className="px-3.5"
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
                              ? t('Member suspended')
                              : t('Member restored')
                          )
                        }
                      >
                        {member.status === 'active' ? t('Suspend') : t('Restore')}
                      </ScButton>

                      <ScButton
                        variant="outline"
                        size="md"
                        fullWidth={false}
                        disabled={busyId === member.id}
                        className="flex items-center gap-1.5 px-3.5"
                        onClick={() =>
                          run(
                            member.id,
                            () => removeMember(member.id),
                            t('Member removed')
                          )
                        }
                      >
                        <IconTrash size={14} stroke={1.5} aria-hidden="true" />{' '}
                        {t('Remove')}
                      </ScButton>

                      {isOwner && member.status === 'active' && (
                        <ScButton
                          variant="outline"
                          size="md"
                          fullWidth={false}
                          disabled={busyId === member.id}
                          className="px-3.5"
                          onClick={() => {
                            if (
                              !window.confirm(
                                t(
                                  'Make {name} the owner? You stay an admin, but you cannot undo this yourself.',
                                  { name: member.name }
                                )
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
                              t('Ownership transferred')
                            )
                          }}
                        >
                          {t('Make owner')}
                        </ScButton>
                      )}
                    </div>
                  )}
                </ScCard>
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}
