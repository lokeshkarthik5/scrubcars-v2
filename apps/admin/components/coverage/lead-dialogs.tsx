'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconCheck } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScField, ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScSelect } from '@repo/ui/sc/select'
import {
  findLeadDuplicates,
  resolveLeadPin,
  type CoverageGarage,
  type CoverageZone,
  type DuplicateMatch,
  type Lead,
} from '@repo/core/api/admin-coverage'
import { ApiError } from '@repo/core/api/client'
import {
  useCreateLead,
  useRemoveLead,
  useUpdateLead,
} from '@repo/core/api/hooks/use-admin-coverage'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  LEAD_NAME_MAX,
  LEAD_NOTE_MAX,
  LEAD_REASON_MAX,
  LEAD_STATUS_LABELS,
  MATCH_REASON_TEXT,
  normalisePhone,
} from '@repo/core/leads'
import {
  duplicateLine,
  leadOwnFieldsToSave,
  mapsLinkProblem,
  phoneProblem,
  showsGoogleDetails,
} from '@/lib/lead-form'

/** Active team logins, for "Assign to". */
export interface Assignee {
  id: string
  name: string
}

// ─── Shared pieces ──────────────────────────────────────────────────────────

function DialogTitle({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
      {hint && <p className="mt-0.5 text-[12px] text-text-secondary">{hint}</p>}
    </div>
  )
}

function FormError({ message }: { message: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-[12px] text-tone-attention-text">
      {message}
    </p>
  )
}

function DialogButtons({
  onCancel,
  submitLabel,
  busy,
  disabled,
}: {
  onCancel: () => void
  submitLabel: string
  busy: boolean
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <ScButton
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={busy}
        className="min-h-11"
      >
        Cancel
      </ScButton>
      <ScButton
        type="submit"
        variant="main"
        disabled={busy || disabled}
        className="min-h-11"
      >
        {busy ? 'Saving…' : submitLabel}
      </ScButton>
    </div>
  )
}

export function AssignSelect({
  value,
  onChange,
  assignees,
  label = 'Assign to',
  ariaLabel,
  className,
}: {
  value: string
  onChange: (value: string) => void
  assignees: Assignee[]
  /** The visible label; '' for none, with `ariaLabel` naming it instead. */
  label?: string
  ariaLabel?: string
  className?: string
}) {
  return (
    <ScSelect
      label={label || undefined}
      aria-label={label ? undefined : (ariaLabel ?? 'Assign to')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">Nobody yet</option>
      {assignees.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </ScSelect>
  )
}

export function ZoneSelect({
  value,
  onChange,
  zones,
  label = 'Zone',
}: {
  value: string
  onChange: (value: string) => void
  zones: CoverageZone[]
  label?: string
}) {
  return (
    <ScSelect
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Not in a zone</option>
      {zones.map((zone) => (
        <option key={zone.id} value={zone.id}>
          {zone.name}
        </option>
      ))}
    </ScSelect>
  )
}

type PinState =
  | { kind: 'none' }
  | { kind: 'looking' }
  | {
      kind: 'found'
      lat: number
      lng: number
      zone: { id: string; name: string } | null
    }
  | { kind: 'missing'; warning: string | null }
  | { kind: 'error'; message: string }

/**
 * A Maps link's pin, looked up a moment after it is pasted or typed (the
 * server's own link reader: no request at all for a full link), with the
 * zone the pin is in. The answer is kept with the link it was for, so a
 * changed link reads as "looking" until its own answer lands.
 */
function useLinkPin(mapsUrl: string): PinState {
  const url = mapsUrl.trim()
  const valid = url !== '' && !mapsLinkProblem(url)
  const [answer, setAnswer] = useState<{ url: string; pin: PinState } | null>(
    null
  )
  useEffect(() => {
    if (!valid) return
    let stale = false
    const timer = setTimeout(() => {
      resolveLeadPin(url)
        .then((found) => {
          if (stale) return
          setAnswer({
            url,
            pin:
              found.lat !== null && found.lng !== null
                ? {
                    kind: 'found',
                    lat: found.lat,
                    lng: found.lng,
                    zone: found.zone,
                  }
                : { kind: 'missing', warning: found.warning },
          })
        })
        .catch((err: unknown) => {
          if (!stale)
            setAnswer({
              url,
              pin: {
                kind: 'error',
                message: errorMessage(err, 'Couldn’t read that link.'),
              },
            })
        })
    }, 450)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [url, valid])
  if (!valid) return { kind: 'none' }
  return answer?.url === url ? answer.pin : { kind: 'looking' }
}

function PinNote({ pin }: { pin: PinState }) {
  if (pin.kind === 'looking')
    return (
      <span className="text-[11.5px] text-text-secondary">
        Finding the pin…
      </span>
    )
  if (pin.kind === 'found')
    return (
      <span className="flex items-center gap-1 text-[11.5px] text-tone-done-text">
        <IconCheck size={13} aria-hidden /> Pin found
      </span>
    )
  if (pin.kind === 'missing')
    return (
      <span className="text-[11.5px] text-tone-attention-text">
        No pin in that link
        {pin.warning === 'place_share_link'
          ? ' (a share link names no place)'
          : ''}
        . Pick the zone below.
      </span>
    )
  if (pin.kind === 'error')
    return (
      <span className="text-[11.5px] text-tone-attention-text">
        {pin.message}
      </span>
    )
  return null
}

/** "This looks like … already" with each match and why. */
function DuplicateWarning({ matches }: { matches: DuplicateMatch[] }) {
  return (
    <div
      role="alert"
      className="rounded-[12px] border border-tone-attention-dot/40 bg-tone-attention-tint px-3 py-2.5 text-[12.5px]"
    >
      <p className="font-medium text-text-primary">
        This may be a place you already have:
      </p>
      <ul className="mt-1 flex flex-col gap-0.5 text-text-secondary">
        {matches.map((match) => (
          <li key={`${match.kind}:${match.id}`}>
            {duplicateLine(match)}{' '}
            <span className="text-text-muted">
              ({MATCH_REASON_TEXT[match.reason]})
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-text-secondary">
        Check it before saving, or save anyway.
      </p>
    </div>
  )
}

const STATUS_OPTIONS = [
  { value: 'to_target' as const, label: LEAD_STATUS_LABELS.to_target },
  {
    value: 'not_interested' as const,
    label: LEAD_STATUS_LABELS.not_interested,
  },
]

// ─── Add lead ───────────────────────────────────────────────────────────────

/**
 * Add lead (mockup coverage-zones C): a garage the team wants to sign up.
 * Name, phone and a Maps link (the pin is read from it, and the zone from
 * the pin); without a pin, the zone it is added in. Warns before saving
 * something that looks like a lead or garage already known.
 */
export function AddLeadDialog({
  zones,
  defaultZoneId,
  assignees,
  onClose,
}: {
  zones: CoverageZone[]
  defaultZoneId: string | null
  assignees: Assignee[]
  onClose: () => void
}) {
  const create = useCreateLead()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [zoneId, setZoneId] = useState(defaultZoneId ?? '')
  const [status, setStatus] = useState<'to_target' | 'not_interested'>(
    'to_target'
  )
  const [reason, setReason] = useState('')
  const [retryAfter, setRetryAfter] = useState('')
  const [assignee, setAssignee] = useState('')
  const [note, setNote] = useState('')
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const pin = useLinkPin(mapsUrl)
  const pinned = pin.kind === 'found' ? pin : null
  // A warning is about what was typed when it was checked: a change asks again.
  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setMatches(null)
  }

  const problems = {
    name: name.trim() ? null : 'Enter the garage’s name.',
    phone: phoneProblem(phone),
    link: mapsLinkProblem(mapsUrl),
    reason:
      status === 'not_interested' && !reason.trim()
        ? 'Say why they are not interested.'
        : null,
  }
  const ready =
    !problems.name &&
    !problems.phone &&
    !problems.link &&
    !problems.reason &&
    pin.kind !== 'looking'
  const busy = create.isPending || checking

  const payload = () => ({
    name: name.trim(),
    phone: normalisePhone(phone),
    mapsUrl: mapsUrl.trim() || null,
    lat: pinned?.lat ?? null,
    lng: pinned?.lng ?? null,
    zoneId: pinned ? null : zoneId || null,
    status,
    ...(status === 'not_interested' && {
      reason: reason.trim(),
      retryAfter: retryAfter || null,
    }),
    assignedLoginId: assignee || null,
    ...(note.trim() && { note: note.trim() }),
  })

  const save = async (anyway: boolean) => {
    if (!ready || busy) return
    setError('')
    if (!anyway) {
      setChecking(true)
      try {
        const body = payload()
        const found = await findLeadDuplicates({
          name: body.name,
          phone: body.phone,
          lat: body.lat,
          lng: body.lng,
          zoneId: body.zoneId,
        })
        if (found.matches.length > 0) {
          setMatches(found.matches)
          return
        }
      } catch (err) {
        setError(errorMessage(err, 'Couldn’t check for duplicates. Try again.'))
        return
      } finally {
        setChecking(false)
      }
    }
    create.mutate(
      { ...payload(), allowDuplicate: anyway },
      {
        onSuccess: (lead) => {
          toast.success(`${lead.name} added as a lead`)
          onClose()
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'LEAD_DUPLICATE')
            setMatches([])
          setError(errorMessage(err, 'Couldn’t save the lead. Try again.'))
        },
      }
    )
  }

  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!busy}
      aria-label="Add lead"
      className="max-w-[440px]"
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          void save(matches !== null)
        }}
      >
        <DialogTitle
          title="Add lead"
          hint="A garage you want to sign up. Customers never see leads."
        />
        <ScField
          label="Garage name"
          value={name}
          onChange={edit(setName)}
          maxLength={LEAD_NAME_MAX}
          autoFocus
        />
        <div className="flex flex-col gap-1">
          <ScField
            label="Phone"
            value={phone}
            onChange={edit(setPhone)}
            inputMode="tel"
            placeholder="98400 12345"
          />
          {phone && problems.phone && (
            <span className="text-[11.5px] text-tone-attention-text">
              {problems.phone}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <ScField
            label="Google Maps link"
            value={mapsUrl}
            onChange={edit(setMapsUrl)}
            inputMode="url"
            placeholder="maps.app.goo.gl/…"
          />
          {mapsUrl && problems.link ? (
            <span className="text-[11.5px] text-tone-attention-text">
              {problems.link}
            </span>
          ) : (
            <PinNote pin={pin} />
          )}
        </div>
        {pinned ? (
          <p className="text-[12.5px] text-text-primary">
            <span className="block text-[11px] font-medium text-text-secondary">
              Zone
            </span>
            {pinned.zone ? pinned.zone.name : 'Not in a zone'}{' '}
            <span className="text-text-secondary">(from the pin)</span>
          </p>
        ) : (
          <ZoneSelect value={zoneId} onChange={setZoneId} zones={zones} />
        )}
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-text-secondary">Status</p>
          <ScSegmented
            aria-label="Status"
            value={status}
            onChange={setStatus}
            options={STATUS_OPTIONS}
          />
        </div>
        {status === 'not_interested' && (
          <>
            <ScField
              label="Why not interested"
              value={reason}
              onChange={setReason}
              maxLength={LEAD_REASON_MAX}
            />
            <ScInput
              label="Try again after (optional)"
              type="date"
              value={retryAfter}
              onChange={(e) => setRetryAfter(e.target.value)}
            />
          </>
        )}
        <AssignSelect
          value={assignee}
          onChange={setAssignee}
          assignees={assignees}
        />
        <ScTextarea
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={LEAD_NOTE_MAX}
          rows={2}
        />
        {matches && matches.length > 0 && (
          <DuplicateWarning matches={matches} />
        )}
        <FormError message={error} />
        <DialogButtons
          onCancel={onClose}
          submitLabel={matches !== null ? 'Save anyway' : 'Save lead'}
          busy={busy}
          disabled={!ready}
        />
      </form>
    </ScModal>
  )
}

// ─── Not interested ─────────────────────────────────────────────────────────

/** Not interested always says why; "try again after" is optional, so nobody calls next week by mistake. */
export function NotInterestedDialog({
  lead,
  onClose,
}: {
  lead: Lead
  onClose: () => void
}) {
  const update = useUpdateLead()
  const [reason, setReason] = useState(lead.notInterestedReason ?? '')
  const [retryAfter, setRetryAfter] = useState(lead.retryAfter ?? '')
  const [error, setError] = useState('')
  const ready = reason.trim().length > 0

  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!update.isPending}
      aria-label={`Not interested: ${lead.name}`}
      className="max-w-[400px]"
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!ready) return
          setError('')
          update.mutate(
            {
              id: lead.id,
              status: 'not_interested',
              reason: reason.trim(),
              retryAfter: retryAfter || null,
            },
            {
              onSuccess: () => {
                toast.success(`${lead.name}: not interested`)
                onClose()
              },
              onError: (err) =>
                setError(errorMessage(err, 'Couldn’t save. Try again.')),
            }
          )
        }}
      >
        <DialogTitle title="Not interested" hint={lead.name} />
        <ScField
          label="Why not interested"
          value={reason}
          onChange={setReason}
          maxLength={LEAD_REASON_MAX}
          autoFocus
        />
        <ScInput
          label="Try again after (optional)"
          type="date"
          value={retryAfter}
          onChange={(e) => setRetryAfter(e.target.value)}
        />
        <FormError message={error} />
        <DialogButtons
          onCancel={onClose}
          submitLabel="Save"
          busy={update.isPending}
          disabled={!ready}
        />
      </form>
    </ScModal>
  )
}

// ─── Note ───────────────────────────────────────────────────────────────────

/** The lead's last note: what happened on the last call, signed and dated. */
export function NoteDialog({
  lead,
  onClose,
}: {
  lead: Lead
  onClose: () => void
}) {
  const update = useUpdateLead()
  const [note, setNote] = useState(lead.lastNote ?? '')
  const [error, setError] = useState('')
  const save = (value: string) => {
    setError('')
    update.mutate(
      { id: lead.id, note: value },
      {
        onSuccess: () => {
          toast.success(value ? 'Note saved' : 'Note cleared')
          onClose()
        },
        onError: (err) =>
          setError(errorMessage(err, 'Couldn’t save the note. Try again.')),
      }
    )
  }
  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!update.isPending}
      aria-label={`Note: ${lead.name}`}
      className="max-w-[420px]"
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (note.trim()) save(note.trim())
        }}
      >
        <DialogTitle
          title="Note"
          hint={
            lead.lastNoteBy
              ? `${lead.name} · last by ${lead.lastNoteBy}`
              : lead.name
          }
        />
        <ScTextarea
          label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={LEAD_NOTE_MAX}
          rows={3}
          autoFocus
        />
        <FormError message={error} />
        {lead.lastNote && (
          <button
            type="button"
            onClick={() => save('')}
            disabled={update.isPending}
            className="min-h-9 self-start text-[12px] text-text-secondary underline underline-offset-4"
          >
            Clear note
          </button>
        )}
        <DialogButtons
          onCancel={onClose}
          submitLabel="Save note"
          busy={update.isPending}
          disabled={!note.trim()}
        />
      </form>
    </ScModal>
  )
}

// ─── Edit lead ──────────────────────────────────────────────────────────────

/**
 * Edit a lead: its name and phone (an edit, or "Confirmed by phone" for
 * what Google gave, makes them the team's own, kept whatever Google says
 * later; saving anything else leaves Google's apart), its Maps link and
 * pin, its zone when it has no pin, the garage it became, or remove it.
 */
export function EditLeadDialog({
  lead,
  zones,
  garages,
  onClose,
}: {
  lead: Lead
  zones: CoverageZone[]
  garages: CoverageGarage[]
  onClose: () => void
}) {
  const update = useUpdateLead()
  const remove = useRemoveLead()
  const [name, setName] = useState(lead.name)
  const [phone, setPhone] = useState(lead.phone ?? '')
  const [mapsUrl, setMapsUrl] = useState(lead.mapsUrl ?? '')
  const [dropPin, setDropPin] = useState(false)
  const [zoneId, setZoneId] = useState(lead.zoneId ?? '')
  const [vendorId, setVendorId] = useState(lead.vendorId ?? '')
  const [confirmed, setConfirmed] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null)
  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setMatches(null)
  }
  const [error, setError] = useState('')
  const linkChanged = mapsUrl.trim() !== (lead.mapsUrl ?? '')
  const pin = useLinkPin(linkChanged ? mapsUrl : '')
  const busy = update.isPending || remove.isPending
  const hasPin = lead.lat !== null && !dropPin
  const newPin = linkChanged && pin.kind === 'found' ? pin : null
  const sortedGarages = useMemo(
    () => [...garages].sort((a, b) => a.name.localeCompare(b.name, 'en')),
    [garages]
  )

  const problems = {
    name: name.trim() ? null : 'Enter a name.',
    phone: phoneProblem(phone),
    link: mapsLinkProblem(mapsUrl),
  }
  const nextPhone = normalisePhone(phone)
  // The team's own name and phone: only what was edited, or confirmed by
  // phone. Saving anything else leaves Google's apart (its 30 days).
  const own = leadOwnFieldsToSave(lead, {
    name,
    phone: nextPhone,
    confirmed,
  })
  const nameChanged = own.name !== undefined
  const phoneChanged = own.phone !== undefined
  const dirty =
    nameChanged ||
    phoneChanged ||
    linkChanged ||
    dropPin ||
    (zoneId || null) !== lead.zoneId ||
    (vendorId || null) !== lead.vendorId
  const ready =
    dirty &&
    !problems.name &&
    !problems.phone &&
    !problems.link &&
    pin.kind !== 'looking'

  const save = async (anyway: boolean) => {
    if (!ready || busy) return
    setError('')
    if (!anyway && (nameChanged || phoneChanged || newPin)) {
      try {
        const found = await findLeadDuplicates({
          name: name.trim(),
          phone: nextPhone,
          lat: newPin?.lat ?? (hasPin ? lead.lat : null),
          lng: newPin?.lng ?? (hasPin ? lead.lng : null),
          zoneId: zoneId || null,
          excludeLeadId: lead.id,
        })
        const others = found.matches.filter(
          (match) => !(match.kind === 'garage' && match.id === vendorId)
        )
        if (others.length > 0) {
          setMatches(others)
          return
        }
      } catch (err) {
        setError(errorMessage(err, 'Couldn’t check for duplicates. Try again.'))
        return
      }
    }
    update.mutate(
      {
        id: lead.id,
        ...own,
        ...(linkChanged && { mapsUrl: mapsUrl.trim() || null }),
        ...(newPin
          ? { lat: newPin.lat, lng: newPin.lng }
          : dropPin
            ? { lat: null, lng: null }
            : {}),
        ...(!hasPin &&
          !newPin &&
          (zoneId || null) !== lead.zoneId && { zoneId: zoneId || null }),
        ...((vendorId || null) !== lead.vendorId && {
          vendorId: vendorId || null,
        }),
      },
      {
        onSuccess: () => {
          toast.success('Lead saved')
          onClose()
        },
        onError: (err) =>
          setError(errorMessage(err, 'Couldn’t save the lead. Try again.')),
      }
    )
  }

  if (confirmRemove) {
    return (
      <ScModal
        open
        onClose={() => setConfirmRemove(false)}
        dismissible={!busy}
        aria-label={`Remove ${lead.name}`}
        className="max-w-[380px]"
      >
        <div className="flex flex-col gap-3.5">
          <DialogTitle
            title={`Remove ${lead.name}?`}
            hint="The lead and its note go. This can’t be undone."
          />
          <FormError message={error} />
          <div className="grid grid-cols-2 gap-2">
            <ScButton
              type="button"
              variant="outline"
              onClick={() => setConfirmRemove(false)}
              disabled={busy}
              className="min-h-11"
            >
              Keep it
            </ScButton>
            <ScButton
              type="button"
              variant="danger-outline"
              disabled={busy}
              className="min-h-11"
              onClick={() =>
                remove.mutate(lead.id, {
                  onSuccess: () => {
                    toast.success(`${lead.name} removed`)
                    onClose()
                  },
                  onError: (err) =>
                    setError(
                      errorMessage(err, 'Couldn’t remove it. Try again.')
                    ),
                })
              }
            >
              {remove.isPending ? 'Removing…' : 'Remove'}
            </ScButton>
          </div>
        </div>
      </ScModal>
    )
  }

  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!busy}
      aria-label={`Edit ${lead.name}`}
      className="max-w-[440px]"
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          void save(matches !== null)
        }}
      >
        <DialogTitle
          title="Edit lead"
          hint={
            showsGoogleDetails(lead)
              ? 'The name and phone shown are Google’s until you edit them or tick Confirmed by phone; then they are yours to keep.'
              : undefined
          }
        />
        <ScField
          label="Garage name"
          value={name}
          onChange={edit(setName)}
          maxLength={LEAD_NAME_MAX}
        />
        <div className="flex flex-col gap-1">
          <ScField
            label="Phone"
            value={phone}
            onChange={edit(setPhone)}
            inputMode="tel"
          />
          {phone && problems.phone && (
            <span className="text-[11.5px] text-tone-attention-text">
              {problems.phone}
            </span>
          )}
        </div>
        {showsGoogleDetails(lead) && (
          <ScCheckbox
            label="Confirmed by phone: keep this name and phone as ours"
            checked={confirmed}
            onChange={(checked) => {
              setConfirmed(checked)
              setMatches(null)
            }}
          />
        )}
        <div className="flex flex-col gap-1">
          <ScField
            label="Google Maps link"
            value={mapsUrl}
            onChange={edit(setMapsUrl)}
            inputMode="url"
          />
          {mapsUrl && problems.link ? (
            <span className="text-[11.5px] text-tone-attention-text">
              {problems.link}
            </span>
          ) : linkChanged ? (
            <PinNote pin={pin} />
          ) : null}
        </div>
        {newPin ? (
          <p className="text-[12.5px] text-text-primary">
            <span className="block text-[11px] font-medium text-text-secondary">
              Zone
            </span>
            {newPin.zone ? newPin.zone.name : 'Not in a zone'}{' '}
            <span className="text-text-secondary">(from the pin)</span>
          </p>
        ) : hasPin ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-text-primary">
            <span>
              <span className="block text-[11px] font-medium text-text-secondary">
                Zone
              </span>
              {zones.find((zone) => zone.id === lead.zoneId)?.name ??
                'Not in a zone'}{' '}
              <span className="text-text-secondary">(from the pin)</span>
            </span>
            <button
              type="button"
              onClick={() => setDropPin(true)}
              className="min-h-9 text-[12px] text-text-secondary underline underline-offset-4"
            >
              Remove the pin
            </button>
          </div>
        ) : (
          <ZoneSelect value={zoneId} onChange={setZoneId} zones={zones} />
        )}
        <ScSelect
          label="Linked garage"
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
        >
          <option value="">Not linked</option>
          {sortedGarages.map((garage) => (
            <option key={garage.id} value={garage.id}>
              {garage.name}
            </option>
          ))}
        </ScSelect>
        {lead.google && (
          <p className="text-[11.5px] text-text-secondary">
            From Google: {lead.google.name ?? 'no name'}
            {lead.google.rating !== null &&
              ` · ★ ${lead.google.rating} (${lead.google.reviewCount ?? 0})`}{' '}
            · read{' '}
            {new Date(lead.google.fetchedAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
            })}
            ; read again or cleared after 30 days.
          </p>
        )}
        {matches && matches.length > 0 && (
          <DuplicateWarning matches={matches} />
        )}
        <FormError message={error} />
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          className="min-h-9 self-start text-[12px] text-tone-late-text underline underline-offset-4"
        >
          Remove lead
        </button>
        <DialogButtons
          onCancel={onClose}
          submitLabel={matches !== null ? 'Save anyway' : 'Save changes'}
          busy={busy}
          disabled={!ready}
        />
      </form>
    </ScModal>
  )
}
