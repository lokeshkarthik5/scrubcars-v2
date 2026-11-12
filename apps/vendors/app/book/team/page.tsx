'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import type { TeamMember } from '@repo/core/api/garage-book'
import { useAddTeamMember, useBookTeam, useRemoveTeamMember, useUpdateTeamMember } from '@repo/core/api/hooks/use-garage-book'
import { GARAGE_BOOK_2_LIMITS, GARAGE_BOOK_LIMITS, rupees } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { msg, useT } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { RedLight } from '@repo/ui/finish/red-light'
import { ScSheet } from '@repo/ui/sc/modal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { AddButton, BackHeader, BookScreen, Disc, Field, Footnote, LoadFailed, Overline, Seg, Switch, errorText, raised } from '@/components/book/parts'

type View = 'today' | 'month'

/**
 * Team (T1): who works here, their jobs today or this month, the job each
 * is on now, and a day off. The owner adds and changes people and sees the
 * money (value of work, advances); staff see the list without it. The team
 * needs no login: it is a list the garage keeps, picked as "Done by" when
 * a job is finished.
 */
export default function TeamPage() {
  const t = useT()
  const isOwner = useIsVendorAdmin()
  const [view, setView] = useState<View>('month')
  const team = useBookTeam(undefined)
  const [editing, setEditing] = useState<TeamMember | 'new' | null>(null)
  const data = team.data

  return (
    <BookScreen>
      <BackHeader title={t('Team')} back="/book/business" right={isOwner ? <AddButton label={t('Add')} onClick={() => setEditing('new')} /> : undefined} />
      <Seg<View>
        label={msg('Show')}
        value={view}
        onChange={setView}
        options={[
          { value: 'today', label: msg('Today') },
          { value: 'month', label: msg('This month') },
        ]}
      />
      {!data ? (
        team.isError ? <LoadFailed what={t('your team')} onRetry={() => void team.refetch()} /> : <SkeletonList count={3} itemClassName="h-20" />
      ) : data.members.length === 0 ? (
        <div className="fx-edge flex flex-col gap-3 rounded-surface px-4 py-4">
          <p className="text-t3 font-semibold text-text-primary">{t('No one in your team yet')}</p>
          <p className="text-t4 text-[#A8A8B2]">{t('Add the people who work with you. Pick who did each job when you finish it.')}</p>
          {isOwner && (
            <button type="button" onClick={() => setEditing('new')} className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary')}>
              {t('Add someone')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {data.members.map((member) => (
              <MemberCard key={member.id} member={member} view={view} onOpen={isOwner ? () => setEditing(member) : undefined} />
            ))}
          </div>
          <WhoDidIt names={data.members.map((member) => member.name)} />
        </>
      )}
      <Footnote>{t('Your team needs no login. Only you see the money; staff logins see jobs only.')}</Footnote>
      {editing && <MemberSheet key={editing === 'new' ? 'new' : editing.id} member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </BookScreen>
  )
}

function MemberCard({ member, view, onOpen }: { member: TeamMember; view: View; onOpen?: () => void }) {
  const t = useT()
  const count = view === 'today' ? member.jobsToday : member.jobs
  const work = view === 'month' ? rupees(member.valuePaise) : null
  const advance = view === 'month' && member.advancePaise ? rupees(member.advancePaise) : null
  const body = (
    <>
      <Disc name={member.name} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-t3 font-semibold text-text-primary">{member.name}</span>
          <span className="shrink-0 font-numeric text-[18px] font-semibold text-text-primary">{count}</span>
        </span>
        <span className="mt-0.5 flex justify-between gap-2 text-[12px] text-[#A8A8B2]">
          <span className="min-w-0 truncate">{member.role || t('Team')}</span>
          <span className="shrink-0">
            {view === 'today' ? t('jobs today') : work ? t('jobs · {amount} of work', { amount: work }) : t('jobs this month')}
          </span>
        </span>
        {member.onNow && (
          <span className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#8DB8FF]">
            <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-[#8DB8FF]" />
            <span className="truncate">{[t('On now'), member.onNow.car || member.onNow.plate, member.onNow.service].filter(Boolean).join(' · ')}</span>
          </span>
        )}
        {advance && <span className="mt-1 block text-[12px] text-[#F5A524]">{t('Advance {amount} this month', { amount: advance })}</span>}
        {member.offToday && <span className="mt-1 block text-[12px] text-[#A8A8B2]">{t('Day off today')}</span>}
      </span>
    </>
  )
  const className = 'fx-edge flex w-full items-start gap-3 rounded-[20px] px-3.5 py-3 text-left'
  return onOpen ? (
    <button type="button" onClick={onOpen} className={cn(className, 'fx-press')}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  )
}

/** How "Done by" looks when a job is finished: a picture of it, not a control. */
function WhoDidIt({ names }: { names: string[] }) {
  const t = useT()
  return (
    <div className="fx-edge flex flex-col gap-2.5 rounded-[20px] px-3.5 py-3">
      <Overline>{t('When you finish a job · who did it?')}</Overline>
      <div aria-hidden className="grid grid-cols-3 gap-2">
        {names.slice(0, 3).map((name, index) => (
          <span key={name + index} className={cn(raised, 'flex h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] px-2 text-[13px]', index === 0 ? 'font-semibold text-text-primary' : 'font-medium text-[#A8A8B2]')}>
            <span className="max-w-full truncate">{name.split(/\s+/)[0]}</span>
            <RedLight state={index === 0 ? 'on' : 'dim'} className="w-[18px]" />
          </span>
        ))}
      </div>
    </div>
  )
}

function MemberSheet({ member, onClose }: { member: TeamMember | null; onClose: () => void }) {
  const t = useT()
  const add = useAddTeamMember()
  const update = useUpdateTeamMember()
  const remove = useRemoveTeamMember()
  const [name, setName] = useState(member?.name ?? '')
  const [role, setRole] = useState(member?.role ?? '')
  const [phone, setPhone] = useState(member?.phone ?? '')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const digits = phone.replace(/\D/g, '')
  const phoneOk = digits.length === 0 || digits.length === 10
  const ok = name.trim().length > 0 && phoneOk
  const busy = add.isPending || update.isPending || remove.isPending
  const failed = (error: unknown) => toast.error(errorText(error, t("Couldn't save. Try again.")))

  const save = () => {
    if (member) {
      update.mutate(
        { id: member.id, patch: { name: name.trim(), role: role.trim() || null, phone: digits || null } },
        { onSuccess: onClose, onError: failed }
      )
    } else {
      add.mutate(
        { name: name.trim(), ...(role.trim() ? { role: role.trim() } : {}), ...(digits ? { phone: digits } : {}) },
        {
          onSuccess: () => {
            toast.success(t('{name} added', { name: name.trim() }))
            onClose()
          },
          onError: failed,
        }
      )
    }
  }

  return (
    <ScSheet open onClose={onClose} aria-label={member ? member.name : t('Add someone')} className="px-4">
      <div className="flex flex-col gap-4 pb-2">
        <h2 className="text-t2 font-semibold text-text-primary">{member ? member.name : t('Add someone')}</h2>
        <Field id="member-name" label={t('Name')} value={name} onChange={setName} maxLength={GARAGE_BOOK_LIMITS.nameMax} placeholder={t('Arun')} />
        <Field id="member-role" label={t('What they do')} value={role} onChange={setRole} maxLength={GARAGE_BOOK_2_LIMITS.roleMax} placeholder={t('Washer')} />
        <Field id="member-phone" label={t('Phone (if you like)')} value={phone} onChange={(next) => setPhone(next.replace(/[^\d ]/g, '').slice(0, 12))} inputMode="tel" placeholder="98400 12345" />
        {!phoneOk && <p className="text-[12px] font-semibold text-[#FF8A95]">{t('A mobile number has 10 digits.')}</p>}
        {member && (
          <div className="fx-edge flex items-center gap-3 rounded-control px-3.5 py-3">
            <span className="min-w-0 flex-1 text-t3 font-semibold text-text-primary">{t('Day off today')}</span>
            <Switch
              checked={member.offToday}
              label={t('Day off today')}
              onChange={(offToday) => update.mutate({ id: member.id, patch: { offToday } }, { onSuccess: onClose, onError: failed })}
            />
          </div>
        )}
        <button type="button" disabled={!ok || busy} onClick={save} className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary disabled:text-[#8E8E98]')}>
          {busy ? t('Saving…') : member ? t('Save') : t('Add')}
        </button>
        {member && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              confirmRemove
                ? remove.mutate(member.id, {
                    onSuccess: () => {
                      toast.success(t('{name} removed', { name: member.name }))
                      onClose()
                    },
                    onError: failed,
                  })
                : setConfirmRemove(true)
            }
            className="min-h-11 text-t4 font-medium text-[#FF8A95]"
          >
            {confirmRemove ? t('Tap again to remove {name}', { name: member.name }) : t('Remove from team')}
          </button>
        )}
      </div>
    </ScSheet>
  )
}
