'use client'

import { useId, useState, type FormEvent } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { ScInput } from '@repo/ui/sc/input'
import { LoadError } from '@repo/ui/sc/load-error'
import { Notice } from '@repo/ui/sc/notice'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Skeleton } from '@repo/ui/sc/skeleton'
import { StatusChip } from '@repo/ui/sc/status-chip'
import type { AdminLogin } from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminLogins,
  useAdminMe,
  useChangeOwnAdminPassword,
  useCreateAdminLogin,
  useResetAdminLoginPassword,
  useSetAdminLoginStatus,
  useUpdateAdminLogin,
} from '@repo/core/api/hooks/use-admin-logins'
import {
  adminNameProblem,
  adminPasswordProblem,
  adminUsernameProblem,
  normalizeAdminName,
  normalizeAdminUsername,
} from '@repo/core/admin-logins'
import { formatRelative } from '@repo/core/format'
import { displayPhone, teammatePhone, teammatePhoneProblem } from '@/lib/collection'

/** A row's small buttons: the pill family, at the height of a list row. */
const ROW_BUTTON = 'h-10 px-4 text-[13px]'

/**
 * Settings → Team logins (0058): a login for each person, so every action
 * in the panel is signed with who did it. Add one, reset someone's password
 * or turn their login off (both end their sessions at once), and change your
 * own. The shared env login stays as the way in for the first ones.
 */
export default function TeamLoginsPage() {
  const { data: me } = useAdminMe()
  const logins = useAdminLogins()

  return (
    <>
      <PageHeader
        title="Team logins"
        subtitle="A login for each person, so every action is signed."
        backHref="/settings"
      />

      {me?.kind === 'shared' && logins.data && !logins.data.ownerExists && (
        <Notice
          tone="neutral"
          title="You’re on the shared login. Add your own login first: it becomes the owner. Then sign in with it and add the rest of the team."
        />
      )}
      {logins.data && !logins.data.canManage && (
        <Notice tone="neutral" title="Only the owner can add logins, reset passwords or turn logins on or off." />
      )}

      <section aria-labelledby="team-logins-list" className="flex flex-col gap-2">
        <h2 id="team-logins-list" className="text-[13px] font-medium text-text-secondary">
          Logins
        </h2>
        {logins.isPending ? (
          <Skeleton className="h-36 rounded-[14px]" />
        ) : logins.isError || !logins.data ? (
          <LoadError
            what="the team logins"
            onRetry={() => void logins.refetch()}
            retrying={logins.isFetching}
          />
        ) : (
          <LoginList logins={logins.data.logins} youId={logins.data.youId} canManage={logins.data.canManage} />
        )}
      </section>

      {logins.data?.canManage && <AddLoginForm />}

      {me?.kind === 'personal' && <OwnPasswordForm />}
    </>
  )
}

function LoginList({
  logins,
  youId,
  canManage,
}: {
  logins: AdminLogin[]
  youId: string | null
  /** Only the owner (or the shared login before there is one) gets the buttons. */
  canManage: boolean
}) {
  const reset = useResetAdminLoginPassword()
  const status = useSetAdminLoginStatus()
  const update = useUpdateAdminLogin()

  // Each sheet keeps its login while it closes, so the title doesn't blank.
  const [resetFor, setResetFor] = useState<AdminLogin | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [resetError, setResetError] = useState('')

  const [statusFor, setStatusFor] = useState<AdminLogin | null>(null)
  const [statusOpen, setStatusOpen] = useState(false)
  const [statusError, setStatusError] = useState('')

  // The phone (0059): only for "Also send on WhatsApp" with a collection list.
  const [phoneFor, setPhoneFor] = useState<AdminLogin | null>(null)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const phoneId = useId()
  const phoneProblem = teammatePhoneProblem(phone)

  const passwordId = useId()
  const passwordProblem = newPassword ? adminPasswordProblem(newPassword) : null

  const openReset = (login: AdminLogin) => {
    setResetFor(login)
    setNewPassword('')
    setResetError('')
    setResetOpen(true)
  }

  const openStatus = (login: AdminLogin) => {
    setStatusFor(login)
    setStatusError('')
    setStatusOpen(true)
  }

  const confirmReset = async () => {
    if (!resetFor) return
    const problem = adminPasswordProblem(newPassword)
    if (problem) {
      setResetError(problem)
      return
    }
    setResetError('')
    try {
      await reset.mutateAsync({ id: resetFor.id, password: newPassword })
      setResetOpen(false)
      setNewPassword('')
      toast.success(`New password set for ${resetFor.name}`)
    } catch (err) {
      setResetError(errorMessage(err, "Couldn't set the new password"))
    }
  }

  const openPhone = (login: AdminLogin) => {
    setPhoneFor(login)
    setPhone(login.phone ?? '')
    setPhoneError('')
    setPhoneOpen(true)
  }

  const confirmPhone = async () => {
    if (!phoneFor) return
    if (phoneProblem) {
      setPhoneError(phoneProblem)
      return
    }
    setPhoneError('')
    const next = teammatePhone(phone) || null
    try {
      await update.mutateAsync({ id: phoneFor.id, phone: next })
      setPhoneOpen(false)
      toast.success(next ? `Phone saved for ${phoneFor.name}` : `Phone removed for ${phoneFor.name}`)
    } catch (err) {
      setPhoneError(errorMessage(err, "Couldn't save the phone"))
    }
  }

  const confirmStatus = async () => {
    if (!statusFor) return
    const next = statusFor.status === 'active' ? 'off' : 'active'
    setStatusError('')
    try {
      await status.mutateAsync({ id: statusFor.id, status: next })
      setStatusOpen(false)
      toast.success(`${statusFor.name}’s login is ${next === 'off' ? 'off' : 'on'}`)
    } catch (err) {
      setStatusError(errorMessage(err, "Couldn't change the login"))
    }
  }

  if (logins.length === 0) {
    return (
      <p className="rounded-[14px] border border-border bg-surface px-4 py-4 text-[13px] text-text-secondary">
        No personal logins yet. Add one for each person below.
      </p>
    )
  }

  const turningOff = statusFor?.status === 'active'

  return (
    <>
      <ul
        aria-label="Team logins"
        className="flex flex-col divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-surface"
      >
        {logins.map((login) => {
          const you = login.id === youId
          return (
            <li key={login.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[15px] font-medium text-text-primary">{login.name}</span>
                  {you && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[12px] font-medium text-text-secondary">
                      You
                    </span>
                  )}
                  {login.isOwner && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[12px] font-medium text-text-secondary">
                      Owner
                    </span>
                  )}
                  <StatusChip tone={login.status === 'active' ? 'done' : 'closed'}>
                    {login.status === 'active' ? 'On' : 'Off'}
                  </StatusChip>
                </div>
                <span className="text-[13px] text-text-secondary">
                  @{login.username}
                  {login.phone ? <span className="font-numeric"> · {displayPhone(login.phone)}</span> : null}
                </span>
                <span className="text-[12px] text-text-muted">
                  {login.lastLoginAt ? `Last signed in ${formatRelative(login.lastLoginAt)}` : 'Never signed in'}
                </span>
              </div>
              {(canManage || you) && login.phone !== undefined && (
                <ScButton
                  type="button"
                  variant="outline"
                  fullWidth={false}
                  className={ROW_BUTTON}
                  aria-label={`${login.phone ? 'Change' : 'Add'} ${login.name}’s phone`}
                  onClick={() => openPhone(login)}
                >
                  {login.phone ? 'Change phone' : 'Add phone'}
                </ScButton>
              )}
              {canManage && !you && (
                <div className="flex flex-wrap gap-2">
                  <ScButton
                    type="button"
                    variant="outline"
                    fullWidth={false}
                    className={ROW_BUTTON}
                    onClick={() => openReset(login)}
                  >
                    Reset password
                  </ScButton>
                  {login.status === 'active' ? (
                    <ScButton
                      type="button"
                      variant="danger-outline"
                      fullWidth={false}
                      className={ROW_BUTTON}
                      onClick={() => openStatus(login)}
                    >
                      Turn off
                    </ScButton>
                  ) : (
                    <ScButton
                      type="button"
                      variant="outline"
                      fullWidth={false}
                      className={ROW_BUTTON}
                      onClick={() => openStatus(login)}
                    >
                      Turn on
                    </ScButton>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <ConfirmSheet
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={confirmReset}
        level="firm"
        title={`Reset ${resetFor?.name ?? ''}’s password?`}
        body={
          <div className="flex flex-col gap-3">
            <p>They’re signed out everywhere. Tell them the new password in person or on a call.</p>
            <div className="flex flex-col gap-1">
              <ScInput
                id={passwordId}
                label="New password"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setResetError('')
                }}
                aria-invalid={Boolean(passwordProblem)}
                aria-describedby={`${passwordId}-hint`}
                className="min-h-11"
              />
              <p
                id={`${passwordId}-hint`}
                className={passwordProblem ? 'text-[12px] text-error' : 'text-[12px] text-text-muted'}
              >
                {passwordProblem ?? 'At least 10 characters.'}
              </p>
            </div>
          </div>
        }
        confirmLabel="Set new password"
        busy={reset.isPending}
        error={resetError || undefined}
      />

      <ConfirmSheet
        open={phoneOpen}
        onClose={() => setPhoneOpen(false)}
        onConfirm={confirmPhone}
        level="light"
        title={`${phoneFor?.name ?? ''}’s phone`}
        body={
          <div className="flex flex-col gap-3">
            <p>Optional. Only used to send them a collection list on WhatsApp. Leave it empty to remove it.</p>
            <div className="flex flex-col gap-1">
              <ScInput
                id={phoneId}
                label="Phone (optional)"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  setPhoneError('')
                }}
                aria-invalid={Boolean(phone && phoneProblem)}
                aria-describedby={`${phoneId}-hint`}
                className="min-h-11"
              />
              <p
                id={`${phoneId}-hint`}
                className={phone && phoneProblem ? 'text-[12px] text-error' : 'text-[12px] text-text-muted'}
              >
                {(phone && phoneProblem) || 'A 10-digit mobile number.'}
              </p>
            </div>
          </div>
        }
        confirmLabel="Save phone"
        busy={update.isPending}
        error={phoneError || undefined}
      />

      <ConfirmSheet
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        onConfirm={confirmStatus}
        level={turningOff ? 'firm' : 'light'}
        title={turningOff ? `Turn off ${statusFor?.name ?? ''}’s login?` : `Turn on ${statusFor?.name ?? ''}’s login?`}
        body={
          turningOff
            ? 'Their sessions end now: they’re signed out everywhere and can’t sign in until the login is turned on again.'
            : 'They can sign in again with their password.'
        }
        confirmLabel={turningOff ? 'Turn off' : 'Turn on'}
        busy={status.isPending}
        error={statusError || undefined}
      />
    </>
  )
}

/** One input with its rule underneath, said once there is something to say. */
function RuledInput({
  label,
  value,
  onChange,
  problem,
  showProblem,
  hint,
  type = 'text',
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  problem: string | null
  showProblem: boolean
  hint?: string
  type?: string
  autoComplete?: string
}) {
  const id = useId()
  const shown = showProblem ? problem : null
  const line = shown ?? hint
  return (
    <div className="flex flex-col gap-1">
      <ScInput
        id={id}
        label={label}
        type={type}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(shown)}
        aria-describedby={line ? `${id}-hint` : undefined}
        className="min-h-11"
      />
      {line && (
        <p id={`${id}-hint`} className={shown ? 'text-[12px] text-error' : 'text-[12px] text-text-muted'}>
          {line}
        </p>
      )}
    </div>
  )
}

function AddLoginForm() {
  const create = useCreateAdminLogin()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [tried, setTried] = useState(false)
  const [error, setError] = useState('')

  const nameProblem = adminNameProblem(name)
  const usernameProblem = adminUsernameProblem(username)
  const passwordProblem = adminPasswordProblem(password)
  const phoneProblem = teammatePhoneProblem(phone)
  const valid = !nameProblem && !usernameProblem && !passwordProblem && !phoneProblem

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTried(true)
    if (!valid || create.isPending) return
    setError('')
    create.mutate(
      {
        name: normalizeAdminName(name),
        username: normalizeAdminUsername(username),
        password,
        // Left out when empty, so an API older than 0059 still takes it.
        ...(phone.trim() ? { phone: teammatePhone(phone) } : {}),
      },
      {
        onSuccess: (login) => {
          toast.success(`Login added for ${login.name}`)
          setName('')
          setUsername('')
          setPassword('')
          setPhone('')
          setTried(false)
        },
        onError: (err) => setError(errorMessage(err, "Couldn't add the login")),
      }
    )
  }

  return (
    <section aria-labelledby="team-logins-add" className="flex flex-col gap-2">
      <h2 id="team-logins-add" className="text-[13px] font-medium text-text-secondary">
        Add a login
      </h2>
      <ScCard className="flex max-w-xl flex-col gap-3 px-4 py-4">
        <form noValidate onSubmit={submit} className="flex flex-col gap-3">
          <RuledInput
            label="Name"
            value={name}
            onChange={setName}
            problem={nameProblem}
            showProblem={tried || name.length > 0}
            hint="Every action they take is signed with this."
            autoComplete="off"
          />
          <RuledInput
            label="Username"
            value={username}
            onChange={(value) => {
              setUsername(value)
              setError('')
            }}
            problem={usernameProblem}
            showProblem={tried || username.length > 0}
            hint="What they type to sign in, in small letters."
            autoComplete="off"
          />
          <RuledInput
            label="Temporary password"
            value={password}
            onChange={setPassword}
            problem={passwordProblem}
            showProblem={tried || password.length > 0}
            hint="At least 10 characters. Tell them in person or on a call; they can change it."
            autoComplete="off"
          />
          <RuledInput
            label="Phone (optional)"
            type="tel"
            value={phone}
            onChange={setPhone}
            problem={phoneProblem}
            showProblem={tried || phone.length >= 10}
            hint="A 10-digit mobile, only for sending them a collection list on WhatsApp."
            autoComplete="off"
          />
          {error && (
            <p role="alert" className="text-[13px] text-error">
              {error}
            </p>
          )}
          <ScButton
            type="submit"
            variant="main"
            fullWidth={false}
            className="self-start px-6"
            disabled={create.isPending}
            aria-busy={create.isPending || undefined}
          >
            {create.isPending ? 'Adding…' : 'Add login'}
          </ScButton>
        </form>
      </ScCard>
    </section>
  )
}

function OwnPasswordForm() {
  const change = useChangeOwnAdminPassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [tried, setTried] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const nextProblem = adminPasswordProblem(next)
  const currentProblem = current.length === 0 ? 'Type your current password' : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTried(true)
    setDone(false)
    if (nextProblem || currentProblem || change.isPending) return
    setError('')
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('')
          setNext('')
          setTried(false)
          setDone(true)
        },
        onError: (err) => setError(errorMessage(err, "Couldn't change your password")),
      }
    )
  }

  return (
    <section aria-labelledby="team-logins-own" className="flex flex-col gap-2">
      <h2 id="team-logins-own" className="text-[13px] font-medium text-text-secondary">
        Your password
      </h2>
      <ScCard className="flex max-w-xl flex-col gap-3 px-4 py-4">
        <form noValidate onSubmit={submit} className="flex flex-col gap-3">
          <RuledInput
            label="Current password"
            type="password"
            value={current}
            onChange={(value) => {
              setCurrent(value)
              setError('')
            }}
            problem={currentProblem}
            showProblem={tried}
            autoComplete="current-password"
          />
          <RuledInput
            label="Your new password"
            type="password"
            value={next}
            onChange={setNext}
            problem={nextProblem}
            showProblem={tried || next.length > 0}
            hint="At least 10 characters."
            autoComplete="new-password"
          />
          {error && (
            <p role="alert" className="text-[13px] text-error">
              {error}
            </p>
          )}
          {done && (
            <p role="status" className="text-[13px] text-success">
              Password changed. Your other sessions are signed out.
            </p>
          )}
          <ScButton
            type="submit"
            variant="outline"
            fullWidth={false}
            className="self-start px-6"
            disabled={change.isPending}
            aria-busy={change.isPending || undefined}
          >
            {change.isPending ? 'Changing…' : 'Change password'}
          </ScButton>
        </form>
      </ScCard>
    </section>
  )
}
