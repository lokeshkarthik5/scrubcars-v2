'use client'

import { useState } from 'react'
import { IconMapPin, IconStarFilled } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScField } from '@repo/ui/sc/input'
import type { CoverageZone } from '@repo/core/api/admin-coverage'
import {
  useCreateZone,
  useRemoveZone,
  useUpdateZone,
} from '@repo/core/api/hooks/use-admin-coverage'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { cn } from '@repo/core/utils'
import {
  zoneDraftProblem,
  zoneDraftFrom,
  zoneChanges,
  type ZoneDraft,
} from '@/lib/zone-editor'

/**
 * A zone's centre is being placed on the map: which zone (or the new one),
 * so the page's map click fills its latitude and longitude.
 */
export type PickTarget = { zoneId: string | 'new'; name: string } | null

const EMPTY_DRAFT: ZoneDraft = {
  name: '',
  priority: false,
  target: '5',
  lat: '',
  lng: '',
}

function ZoneFields({
  draft,
  onChange,
  onPick,
  picking,
  label,
}: {
  draft: ZoneDraft
  onChange: (draft: ZoneDraft) => void
  onPick: () => void
  picking: boolean
  label: string
}) {
  const set = (key: keyof ZoneDraft) => (value: string) =>
    onChange({ ...draft, [key]: value })
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div className="col-span-2">
        <ScField
          label="Name"
          value={draft.name}
          onChange={set('name')}
          maxLength={60}
        />
      </div>
      <ScField
        label="Target (live garages)"
        value={draft.target}
        onChange={set('target')}
        inputMode="numeric"
      />
      <ScCheckbox
        label="Priority"
        checked={draft.priority}
        onChange={(priority) => onChange({ ...draft, priority })}
        className="self-end"
      />
      <ScField
        label="Centre latitude"
        value={draft.lat}
        onChange={set('lat')}
        inputMode="decimal"
      />
      <ScField
        label="Centre longitude"
        value={draft.lng}
        onChange={set('lng')}
        inputMode="decimal"
      />
      <button
        type="button"
        onClick={onPick}
        aria-pressed={picking}
        aria-label={`Pick ${label}'s centre on the map`}
        className={cn(
          'col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium',
          picking
            ? 'border-tone-progress-dot bg-tone-progress-tint text-tone-progress-text'
            : 'border-white/25 text-text-primary hover:bg-surface'
        )}
      >
        <IconMapPin size={14} aria-hidden />
        {picking
          ? 'Click the map to place the centre'
          : 'Pick the centre on the map'}
      </button>
    </div>
  )
}

function ZoneEditRow({
  zone,
  open,
  onToggle,
  picked,
  picking,
  onPick,
}: {
  zone: CoverageZone
  open: boolean
  onToggle: () => void
  picked: { lat: number; lng: number } | null
  picking: boolean
  onPick: () => void
}) {
  const update = useUpdateZone()
  const remove = useRemoveZone()
  const [draft, setDraft] = useState<ZoneDraft>(() => zoneDraftFrom(zone))
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  // A point picked on the map lands in the fields (once per pick).
  const [lastPicked, setLastPicked] = useState(picked)
  if (picked !== lastPicked) {
    setLastPicked(picked)
    if (picked)
      setDraft((current) => ({
        ...current,
        lat: String(picked.lat),
        lng: String(picked.lng),
      }))
  }
  const problem = zoneDraftProblem(draft)
  const changes = problem ? null : zoneChanges(zone, draft)
  const busy = update.isPending || remove.isPending

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Edit zone ${zone.name}`}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left hover:bg-white/[0.03]"
      >
        <span className="flex items-center gap-1 text-[13.5px] text-text-primary">
          {zone.name}
          {zone.priority && (
            <IconStarFilled
              size={11}
              aria-hidden
              className="text-tone-attention-dot"
            />
          )}
        </span>
        <span className="text-[11.5px] text-text-secondary">
          Target {zone.target}
        </span>
      </button>
      {open && (
        <form
          className="flex flex-col gap-2.5 px-3.5 pb-3.5"
          onSubmit={(event) => {
            event.preventDefault()
            if (!changes || Object.keys(changes).length === 0 || busy) return
            setError('')
            update.mutate(
              { id: zone.id, ...changes },
              {
                onSuccess: (saved) =>
                  toast.success(
                    `${saved.name} saved. Customers see it within a few minutes.`
                  ),
                onError: (err) =>
                  setError(
                    errorMessage(err, 'Couldn’t save the zone. Try again.')
                  ),
              }
            )
          }}
        >
          <ZoneFields
            draft={draft}
            onChange={setDraft}
            onPick={onPick}
            picking={picking}
            label={zone.name}
          />
          {(problem || error) && (
            <p role="alert" className="text-[12px] text-tone-attention-text">
              {problem ?? error}
            </p>
          )}
          {confirming ? (
            <div className="flex flex-col gap-2 rounded-[12px] border border-border p-3">
              <p className="text-[12.5px] text-text-primary">
                Remove {zone.name}? Customers stop seeing it. Only a zone
                nothing points at can go: no leads, and no customer’s sign-up,
                request or recommendation.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <ScButton
                  type="button"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="min-h-10"
                >
                  Keep it
                </ScButton>
                <ScButton
                  type="button"
                  variant="danger-outline"
                  disabled={busy}
                  className="min-h-10"
                  onClick={() =>
                    remove.mutate(zone.id, {
                      onSuccess: () => toast.success(`${zone.name} removed`),
                      onError: (err) => {
                        setConfirming(false)
                        setError(
                          errorMessage(
                            err,
                            'Couldn’t remove the zone. Try again.'
                          )
                        )
                      },
                    })
                  }
                >
                  {remove.isPending ? 'Removing…' : `Remove ${zone.name}`}
                </ScButton>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="min-h-9 text-[12px] text-tone-late-text underline underline-offset-4"
              >
                Remove zone
              </button>
              <ScButton
                type="submit"
                variant="main"
                disabled={!changes || Object.keys(changes).length === 0 || busy}
                fullWidth={false}
                className="h-10 px-5 text-[14px]"
              >
                {update.isPending ? 'Saving…' : 'Save zone'}
              </ScButton>
            </div>
          )}
        </form>
      )}
    </li>
  )
}

/**
 * Edit zones (mockup coverage-zones D7): rename, priority on or off, the
 * target, move the centre (type it, or click the map), add a zone, remove
 * one no lead points at. Changes reach customers through GET /zones within
 * a few minutes (its caches).
 */
export function ZoneEditor({
  zones,
  pick,
  picked,
  onPick,
  onDone,
}: {
  zones: CoverageZone[]
  pick: PickTarget
  /** The last point clicked on the map, for the zone being picked. */
  picked: { target: string; lat: number; lng: number; at: number } | null
  onPick: (target: PickTarget) => void
  onDone: () => void
}) {
  const create = useCreateZone()
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<ZoneDraft>(EMPTY_DRAFT)
  const [lastPicked, setLastPicked] = useState(picked)
  const [error, setError] = useState('')
  if (picked !== lastPicked) {
    setLastPicked(picked)
    if (picked?.target === 'new')
      setDraft((current) => ({
        ...current,
        lat: String(picked.lat),
        lng: String(picked.lng),
      }))
  }
  const problem = zoneDraftProblem(draft)
  // The same object while nothing new is picked, so a row takes each pick once.
  const pickedFor = (id: string) =>
    picked && picked.target === id ? picked : null

  return (
    <section aria-label="Edit zones" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[12.5px] text-text-secondary">
          Edit zones · {zones.length}
        </h2>
        <ScButton
          type="button"
          variant="outline"
          onClick={onDone}
          fullWidth={false}
          className="h-9 px-4 text-[12.5px]"
        >
          Done
        </ScButton>
      </div>

      <div className="rounded-[14px] border border-border bg-surface">
        {adding ? (
          <form
            className="flex flex-col gap-2.5 p-3.5"
            onSubmit={(event) => {
              event.preventDefault()
              if (problem || create.isPending) return
              setError('')
              create.mutate(
                {
                  name: draft.name.trim(),
                  priority: draft.priority,
                  target: Number(draft.target),
                  lat: Number(draft.lat),
                  lng: Number(draft.lng),
                },
                {
                  onSuccess: (zone) => {
                    toast.success(`${zone.name} added`)
                    setDraft(EMPTY_DRAFT)
                    setAdding(false)
                    onPick(null)
                  },
                  onError: (err) =>
                    setError(
                      errorMessage(err, 'Couldn’t add the zone. Try again.')
                    ),
                }
              )
            }}
          >
            <h3 className="text-[13px] font-medium text-text-primary">
              New zone
            </h3>
            <ZoneFields
              draft={draft}
              onChange={setDraft}
              onPick={() =>
                onPick(
                  pick?.zoneId === 'new'
                    ? null
                    : { zoneId: 'new', name: draft.name || 'the new zone' }
                )
              }
              picking={pick?.zoneId === 'new'}
              label="the new zone"
            />
            {(error || (draft.name && problem)) && (
              <p role="alert" className="text-[12px] text-tone-attention-text">
                {error || problem}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <ScButton
                type="button"
                variant="outline"
                onClick={() => {
                  setAdding(false)
                  setDraft(EMPTY_DRAFT)
                  onPick(null)
                }}
                className="min-h-10"
              >
                Cancel
              </ScButton>
              <ScButton
                type="submit"
                variant="main"
                disabled={Boolean(problem) || create.isPending}
                className="min-h-10"
              >
                {create.isPending ? 'Adding…' : 'Add zone'}
              </ScButton>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full px-3.5 py-3 text-left text-[13px] font-medium text-text-primary hover:bg-white/[0.03]"
          >
            + Add a zone
          </button>
        )}
      </div>

      <ul className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface">
        {zones.map((zone) => (
          <ZoneEditRow
            key={`${zone.id}:${zone.updatedAt}`}
            zone={zone}
            open={openId === zone.id}
            onToggle={() => {
              setOpenId(openId === zone.id ? null : zone.id)
              if (pick && pick.zoneId === zone.id) onPick(null)
            }}
            picked={pickedFor(zone.id)}
            picking={pick?.zoneId === zone.id}
            onPick={() =>
              onPick(
                pick?.zoneId === zone.id
                  ? null
                  : { zoneId: zone.id, name: zone.name }
              )
            }
          />
        ))}
      </ul>
    </section>
  )
}
