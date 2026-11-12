'use client'

import { useState } from 'react'
import { IconBuildingCommunity, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { ScField } from '@repo/ui/sc/input'
import { LoadError } from '@repo/ui/sc/load-error'
import { ScSheet } from '@repo/ui/sc/modal'
import { Notice } from '@repo/ui/sc/notice'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { ScSwitch } from '@repo/ui/sc/switch'
import { LocationPicker } from '@repo/ui/features/location-picker'
import type { AdminCity, CitiesOverview } from '@repo/core/api/admin-cities'
import {
  useAdminCities,
  useCreateCity,
  useDeleteCity,
  useSetOtherTowns,
  useUpdateCity,
} from '@repo/core/api/hooks/use-admin-cities'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { CITY_REACH_MAX_KM, CITY_REACH_MIN_KM, OTHER_TOWNS_LABEL } from '@repo/core/cities'
import { SignedAs } from '@/components/signed-as'
import {
  addGarageHref,
  cityDraftFrom,
  cityDraftProblem,
  EMPTY_CITY_DRAFT,
  liveLine,
  offConfirmBody,
  type CityDraft,
} from '@/lib/cities'

/** A place about to be switched off, waiting for the confirm sheet. */
type SwitchingOff = { kind: 'city'; city: AdminCity } | { kind: 'other_towns'; hidden: number }

/**
 * Cities (owner, 10 Nov 2026): which cities customers see garages in. A
 * garage belongs to the city whose reach holds its pin (the nearest centre,
 * if several do), or, with no pin, the city its own city field names; one in
 * no city is under Other towns. All of that is the server's rule; this page
 * only lists the cities, their counts and their switches.
 *
 * Switching a city off hides its garages from customers (their pages too)
 * and refuses new bookings; bookings already made carry on. One garage can
 * still be shown from its edit page ("Show this garage anyway"). Each city
 * row has "Add a garage here", which opens Add garage with the city chosen
 * and the map over it: onboarding a garage in a new city is one tap.
 */
export default function CitiesPage() {
  const query = useAdminCities()
  const [editing, setEditing] = useState<AdminCity | 'new' | null>(null)
  const [switchingOff, setSwitchingOff] = useState<SwitchingOff | null>(null)
  const [deleting, setDeleting] = useState<AdminCity | null>(null)
  const [sheetError, setSheetError] = useState<string | undefined>()

  const update = useUpdateCity()
  const otherTowns = useSetOtherTowns()
  const remove = useDeleteCity()

  const data = query.data

  const turnOn = (city: AdminCity) =>
    update.mutate(
      { id: city.id, customersSee: true },
      {
        onSuccess: () => toast.success(`Customers see garages in ${city.name} again.`),
        onError: (err) => toast.error(errorMessage(err, `Couldn't switch ${city.name} on`)),
      }
    )

  // "Growing here" (0070) is a plain switch: it only changes what customers
  // in the city are told, never which garages they can find, so no confirm.
  const setGrowing = (city: AdminCity, growing: boolean) =>
    update.mutate(
      { id: city.id, growing },
      {
        onSuccess: () =>
          toast.success(
            growing
              ? `Customers in ${city.name} now see that more garages are joining.`
              : `Customers in ${city.name} see just the garages there.`
          ),
        onError: (err) => toast.error(errorMessage(err, `Couldn't change ${city.name}`)),
      }
    )

  const confirmOff = async () => {
    if (!switchingOff) return
    setSheetError(undefined)
    try {
      if (switchingOff.kind === 'city') {
        await update.mutateAsync({ id: switchingOff.city.id, customersSee: false })
        toast.success(`${switchingOff.city.name} is off for customers.`)
      } else {
        await otherTowns.mutateAsync(false)
        toast.success(`${OTHER_TOWNS_LABEL} are off for customers.`)
      }
      setSwitchingOff(null)
    } catch (err) {
      setSheetError(errorMessage(err, "Couldn't switch it off"))
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setSheetError(undefined)
    try {
      await remove.mutateAsync(deleting.id)
      toast.success(`${deleting.name} deleted.`)
      setDeleting(null)
    } catch (err) {
      setSheetError(errorMessage(err, `Couldn't delete ${deleting.name}`))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Cities"
        subtitle="Where customers see garages. A garage belongs to the city its pin is in; one in no city is under Other towns."
        actions={
          data?.available ? (
            <ScButton
              type="button"
              variant="main"
              onClick={() => setEditing('new')}
              fullWidth={false}
              className="h-11 px-4 text-[13px]"
            >
              <IconPlus size={16} aria-hidden />
              Add a city
            </ScButton>
          ) : undefined
        }
      />

      {query.isPending ? (
        <SkeletonList count={3} itemClassName="h-32 rounded-[14px]" />
      ) : query.isError || !data ? (
        <LoadError what="the cities" onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : !data.available ? (
        <Notice tone="neutral" title="Cities need the latest API.">
          This page works once the server with cities is live.
        </Notice>
      ) : (
        <>
          {data.cities.length === 0 ? (
            <EmptyState
              icon={<IconBuildingCommunity size={28} aria-hidden />}
              title="No cities yet"
              subtitle="Every garage is under Other towns until a city holds it."
              actionLabel="Add a city"
              onAction={() => setEditing('new')}
            />
          ) : (
            <ul aria-label="Cities" className="flex flex-col gap-3">
              {data.cities.map((city) => (
                <li key={city.id}>
                  <CityRow
                    city={city}
                    busy={update.isPending && update.variables?.id === city.id}
                    onSwitch={(on) => (on ? turnOn(city) : setSwitchingOff({ kind: 'city', city }))}
                    onGrowing={(on) => setGrowing(city, on)}
                    onEdit={() => setEditing(city)}
                    onDelete={() => setDeleting(city)}
                  />
                </li>
              ))}
            </ul>
          )}

          <OtherTownsRow
            otherTowns={data.otherTowns}
            busy={otherTowns.isPending}
            onSwitch={(on) =>
              on
                ? otherTowns.mutate(true, {
                    onSuccess: () => toast.success(`Customers see garages in ${OTHER_TOWNS_LABEL.toLowerCase()} again.`),
                    onError: (err) => toast.error(errorMessage(err, "Couldn't switch Other towns on")),
                  })
                : setSwitchingOff({ kind: 'other_towns', hidden: data.otherTowns.garagesHiddenWhenOff })
            }
          />
        </>
      )}

      <CitySheet
        key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.id}
        editing={editing}
        onClose={() => setEditing(null)}
      />

      <ConfirmSheet
        open={switchingOff !== null}
        onClose={() => {
          setSwitchingOff(null)
          setSheetError(undefined)
        }}
        onConfirm={confirmOff}
        level="firm"
        title={
          switchingOff?.kind === 'city'
            ? `Switch ${switchingOff.city.name} off for customers?`
            : `Switch ${OTHER_TOWNS_LABEL.toLowerCase()} off for customers?`
        }
        body={
          switchingOff
            ? switchingOff.kind === 'city'
              ? offConfirmBody(switchingOff.city.name, switchingOff.city.garagesHiddenWhenOff)
              : offConfirmBody(OTHER_TOWNS_LABEL.toLowerCase(), switchingOff.hidden)
            : undefined
        }
        confirmLabel="Switch off"
        busy={update.isPending || otherTowns.isPending}
        error={sheetError}
      />

      <ConfirmSheet
        open={deleting !== null}
        onClose={() => {
          setDeleting(null)
          setSheetError(undefined)
        }}
        onConfirm={confirmDelete}
        level="firm"
        title={deleting ? `Delete ${deleting.name}?` : 'Delete this city?'}
        body="Its garages move to the city that now holds their pin, or to Other towns, and follow that switch. No garage is changed or removed."
        confirmLabel="Delete city"
        busy={remove.isPending}
        error={sheetError}
      />
    </div>
  )
}

function CityRow({
  city,
  busy,
  onSwitch,
  onGrowing,
  onEdit,
  onDelete,
}: {
  city: AdminCity
  busy: boolean
  onSwitch: (on: boolean) => void
  onGrowing: (on: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const headingId = `city-${city.id}`
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="truncate text-[15px] font-semibold text-text-primary">
            {city.name}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">
            <span className="font-numeric text-text-primary">{liveLine(city)}</span> · reaches{' '}
            <span className="font-numeric">{city.reachKm}</span> km from its centre
          </p>
          {!city.customersSee && (
            <p className="mt-1 text-[12px] text-warning">Off: customers don&apos;t see garages here.</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden text-[12px] text-text-secondary sm:inline">Customers see garages here</span>
          <ScSwitch
            checked={city.customersSee}
            onChange={onSwitch}
            disabled={busy}
            label={`Customers see garages in ${city.name}`}
          />
        </div>
      </div>
      {/* Left out against an API from before 0070, which cannot save it. */}
      {city.growing !== undefined && (
        <div className="flex items-start gap-3 border-t border-border pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text-primary">Growing here</p>
            <p className="mt-0.5 text-[12px] text-text-secondary">
              Customers here see the free-wash card and that more garages are joining. Leave off for a city
              with just a partner garage.
            </p>
          </div>
          <ScSwitch
            checked={city.growing}
            onChange={onGrowing}
            disabled={busy}
            label={`Growing here: ${city.name}`}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <ScButtonLink
          href={addGarageHref(city.name)}
          variant="outline"
          className="h-11 px-4 text-[13px]"
        >
          <IconPlus size={14} aria-hidden />
          Add a garage here
        </ScButtonLink>
        <ScButton
          type="button"
          variant="outline"
          fullWidth={false}
          onClick={onEdit}
          className="h-11 px-4 text-[13px]"
          aria-label={`Edit ${city.name}`}
        >
          <IconPencil size={14} aria-hidden />
          Edit
        </ScButton>
        <ScButton
          type="button"
          variant="danger-outline"
          fullWidth={false}
          onClick={onDelete}
          className="h-11 px-4 text-[13px]"
          aria-label={`Delete ${city.name}`}
        >
          <IconTrash size={14} aria-hidden />
          Delete
        </ScButton>
      </div>
    </article>
  )
}

function OtherTownsRow({
  otherTowns,
  busy,
  onSwitch,
}: {
  otherTowns: CitiesOverview['otherTowns']
  busy: boolean
  onSwitch: (on: boolean) => void
}) {
  return (
    <section
      aria-labelledby="other-towns"
      className="flex items-start gap-3 rounded-[14px] border border-dashed border-border p-4"
    >
      <div className="min-w-0 flex-1">
        <h2 id="other-towns" className="text-[15px] font-semibold text-text-primary">
          {otherTowns.label}
        </h2>
        <p className="mt-0.5 text-[12.5px] text-text-secondary">
          Garages in no city. <span className="font-numeric text-text-primary">{liveLine(otherTowns)}</span>
        </p>
        {!otherTowns.visible && (
          <p className="mt-1 text-[12px] text-warning">Off: customers don&apos;t see these garages.</p>
        )}
      </div>
      <ScSwitch
        checked={otherTowns.visible}
        onChange={onSwitch}
        disabled={busy}
        label={`Customers see garages in ${otherTowns.label.toLowerCase()}`}
      />
    </section>
  )
}

/** Add a city, or edit one: its name, its centre on the map and its reach. */
function CitySheet({ editing, onClose }: { editing: AdminCity | 'new' | null; onClose: () => void }) {
  const isNew = editing === 'new'
  const [draft, setDraft] = useState<CityDraft>(() =>
    editing && editing !== 'new' ? cityDraftFrom(editing) : EMPTY_CITY_DRAFT
  )
  const [error, setError] = useState<string | null>(null)
  const create = useCreateCity()
  const update = useUpdateCity()
  const busy = create.isPending || update.isPending

  const save = () => {
    const problem = cityDraftProblem(draft)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    const input = {
      name: draft.name.trim(),
      lat: draft.lat!,
      lng: draft.lng!,
      reachKm: Number(draft.reachKm),
    }
    const done = {
      onSuccess: () => {
        toast.success(isNew ? `${input.name} added.` : `${input.name} saved.`)
        onClose()
      },
      onError: (err: unknown) => setError(errorMessage(err, "Couldn't save the city")),
    }
    if (isNew) create.mutate(input, done)
    else if (editing) update.mutate({ id: editing.id, ...input }, done)
  }

  return (
    <ScSheet
      open={editing !== null}
      onClose={onClose}
      dismissible={!busy}
      aria-label={isNew ? 'Add a city' : 'Edit city'}
      className="flex flex-col gap-4 px-4 pt-2"
    >
      <h2 className="text-[16px] font-semibold text-text-primary">{isNew ? 'Add a city' : `Edit ${draft.name || 'city'}`}</h2>
      <ScField
        label="City name"
        value={draft.name}
        onChange={(name) => setDraft({ ...draft, name })}
        maxLength={100}
        autoComplete="off"
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-text-secondary">Centre</p>
        <LocationPicker
          value={draft.lat !== null && draft.lng !== null ? { lat: draft.lat, lng: draft.lng } : null}
          onChange={(picked) =>
            setDraft((current) => ({
              ...current,
              lat: picked.lat,
              lng: picked.lng,
              // A new city takes the place's own name when none is typed yet.
              name: current.name || picked.city,
            }))
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <ScField
          label="Reach from the centre (km)"
          value={draft.reachKm}
          onChange={(reachKm) => setDraft({ ...draft, reachKm })}
          inputMode="numeric"
          className="font-numeric"
        />
        <p className="text-[12px] text-text-muted">
          Garages pinned within this distance of the centre belong to the city ({CITY_REACH_MIN_KM} to{' '}
          {CITY_REACH_MAX_KM} km). It is also how far &ldquo;All over {draft.name.trim() || 'the city'}&rdquo; reaches.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] text-warning">
          {error}
        </p>
      )}
      <SignedAs />
      <div className="flex gap-2">
        <ScButton type="button" variant="outline" onClick={onClose} disabled={busy} className="min-h-11">
          Cancel
        </ScButton>
        <ScButton type="button" variant="main" onClick={save} disabled={busy} className="min-h-11">
          {busy ? 'Saving…' : isNew ? 'Add city' : 'Save city'}
        </ScButton>
      </div>
    </ScSheet>
  )
}
