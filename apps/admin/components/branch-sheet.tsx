'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScField } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { ScSelect } from '@repo/ui/sc/select'
import { LocationPicker } from '@repo/ui/features/location-picker'
import { useAdminCities, useCreateBranch } from '@repo/core/api/hooks/use-admin-cities'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { SignedAs } from '@/components/signed-as'
import {
  ANOTHER_TOWN,
  branchDraftFrom,
  branchInput,
  branchPriceLabel,
  branchProblem,
  withCity,
  type BranchDraft,
} from '@/lib/branch'
import type { ServiceRow } from '@/lib/service-editor'

/**
 * "Add a branch…" (owner, 10 Nov 2026): a second garage for the same
 * business, often in another city, started from this one. Admin names it,
 * picks its city (or types a town that is not a city yet), places it, and
 * chooses what comes along: the services with their prices (each package
 * made only of ticked services, and the add-ons, come too), the opening
 * hours, the same logo and photos, and the same owner login so the garage
 * app's switcher shows both. Documents never come: each branch needs its own.
 *
 * The branch is added Pending and not shown to customers; the editor opens
 * on it next, to check it and switch on Show to customers.
 */
export function BranchSheet({
  open,
  onClose,
  vendorId,
  garageName,
  services,
  atGarage,
}: {
  open: boolean
  onClose: () => void
  vendorId: string
  garageName: string
  /** The garage's live services, as saved (ids and prices). */
  services: ServiceRow[]
  /** Customers come to the garage: the branch then needs its address. */
  atGarage: boolean
}) {
  const router = useRouter()
  const citiesQuery = useAdminCities()
  const cities = useMemo(() => citiesQuery.data?.cities ?? [], [citiesQuery.data])
  const saved = useMemo(() => services.filter((row): row is ServiceRow & { id: string } => Boolean(row.id)), [services])
  const [draft, setDraft] = useState<BranchDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const create = useCreateBranch(vendorId)

  // Starts afresh on each opening, once the cities are known.
  const current = draft ?? (open && citiesQuery.data ? branchDraftFrom(garageName, saved.map((row) => row.id), cities) : null)
  const chosenCity = current && current.cityChoice !== ANOTHER_TOWN
    ? cities.find((city) => city.id === current.cityChoice) ?? null
    : null

  const update = (next: BranchDraft) => setDraft(next)
  const close = () => {
    if (create.isPending) return
    setDraft(null)
    setError(null)
    onClose()
  }

  const submit = () => {
    if (!current) return
    const problem = branchProblem(current, cities, atGarage)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    create.mutate(branchInput(current, cities), {
      onSuccess: ({ id }) => {
        toast.success('Branch added. Check its details, then switch on Show to customers.')
        setDraft(null)
        onClose()
        router.push(`/vendors/${id}/edit`)
      },
      onError: (err) => setError(errorMessage(err, "Couldn't add the branch")),
    })
  }

  const toggleService = (id: string, on: boolean) =>
    current &&
    update({
      ...current,
      serviceIds: on ? [...current.serviceIds, id] : current.serviceIds.filter((serviceId) => serviceId !== id),
    })

  return (
    <ScSheet
      open={open}
      onClose={close}
      dismissible={!create.isPending}
      aria-label="Add a branch"
      className="flex flex-col gap-4 px-4 pt-2"
    >
      <div>
        <h2 className="text-[16px] font-semibold text-text-primary">Add a branch</h2>
        <p className="mt-0.5 text-[12.5px] text-text-secondary">
          A new garage for the same business, started from {garageName}. It starts Pending and not shown to customers.
        </p>
      </div>

      {!current ? (
        <p role="status" className="text-[13px] text-text-secondary">
          {citiesQuery.isError ? "Couldn't load the cities. Close and try again." : 'Loading the cities…'}
        </p>
      ) : (
        <>
          <ScField
            label="Branch name"
            value={current.businessName}
            onChange={(businessName) => update({ ...current, businessName, nameEdited: true })}
            maxLength={255}
            autoComplete="off"
          />

          <ScSelect
            label="City"
            value={current.cityChoice}
            onChange={(event) => update(withCity(current, garageName, { cityChoice: event.target.value }, cities))}
          >
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
            <option value={ANOTHER_TOWN}>Another town…</option>
          </ScSelect>
          {current.cityChoice === ANOTHER_TOWN && (
            <ScField
              label="Town"
              value={current.townTyped}
              onChange={(townTyped) => update(withCity(current, garageName, { townTyped }, cities))}
              maxLength={100}
              autoComplete="off"
            />
          )}

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium text-text-secondary">Where the branch is</p>
            <LocationPicker
              value={current.pin ? { lat: current.pin.lat, lng: current.pin.lng } : null}
              initialCenter={chosenCity ? { lat: chosenCity.lat, lng: chosenCity.lng } : null}
              onChange={(pin) =>
                setDraft((prev) => {
                  const base = prev ?? current
                  return {
                    ...base,
                    pin,
                    // The picker's address and pincode fill only empty boxes.
                    address: base.address || pin.address,
                    pincode: base.pincode || pin.pincode,
                  }
                })
              }
            />
          </div>
          <ScField
            label={atGarage ? 'Address' : 'Address (optional for doorstep only)'}
            value={current.address}
            onChange={(address) => update({ ...current, address })}
            autoComplete="off"
          />
          <ScField
            label="Pincode"
            value={current.pincode}
            onChange={(pincode) => update({ ...current, pincode })}
            inputMode="numeric"
            maxLength={6}
            className="font-numeric"
          />

          <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
            <legend className="mb-1 text-[12px] font-medium text-text-secondary">Services to copy</legend>
            {saved.length === 0 ? (
              <p className="text-[12.5px] text-text-muted">This garage has no services yet.</p>
            ) : (
              saved.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3">
                  <ScCheckbox
                    label={row.name}
                    checked={current.serviceIds.includes(row.id)}
                    onChange={(on) => toggleService(row.id, on)}
                    className="min-w-0 flex-1"
                  />
                  <span className="shrink-0 font-numeric text-[12.5px] text-text-secondary">{branchPriceLabel(row)}</span>
                </div>
              ))
            )}
            <p className="text-[12px] text-text-muted">
              Packages made only of ticked services, and the garage&apos;s add-ons, come along.
            </p>
          </fieldset>

          <div className="flex flex-col">
            <ScCheckbox
              label="Copy opening hours"
              checked={current.copyHours}
              onChange={(copyHours) => update({ ...current, copyHours })}
            />
            <ScCheckbox
              label="Copy the logo and photos"
              checked={current.copyPhotos}
              onChange={(copyPhotos) => update({ ...current, copyPhotos })}
            />
            <ScCheckbox
              label="Same owner login (both garages in the garage app)"
              checked={current.sameOwner}
              onChange={(sameOwner) => update({ ...current, sameOwner })}
            />
            {!current.sameOwner && (
              <p className="text-[12px] text-text-muted">No login yet. Set one up later in the branch&apos;s Team.</p>
            )}
            <p className="mt-1 text-[12px] text-text-muted">Documents are not copied: each branch needs its own.</p>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-[12.5px] text-warning">
          {error}
        </p>
      )}
      <SignedAs />
      <div className="flex gap-2">
        <ScButton type="button" variant="outline" onClick={close} disabled={create.isPending} className="min-h-11">
          Cancel
        </ScButton>
        <ScButton
          type="button"
          variant="main"
          onClick={submit}
          disabled={!current || create.isPending}
          className="min-h-11"
        >
          {create.isPending ? 'Adding…' : 'Add branch'}
        </ScButton>
      </div>
    </ScSheet>
  )
}
