'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { useHeroShine } from '@repo/ui/sc/hero-shine'
import { Chip } from '@repo/ui/sc/chip'
import { ScInput } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { createVehicle } from '@repo/core/api/users'
import { useUserStore } from '@repo/core/stores/user-store'
import { VEHICLE_TIERS } from '@repo/core/vehicles'
import type { Vehicle, VehicleType } from '@repo/core/types'

const EMPTY = {
  make: '',
  model: '',
  licensePlate: '',
  vehicleType: 'sedan' as VehicleType,
}

interface AddCarSheetProps {
  open: boolean
  onClose: () => void
  /** The saved car, so the caller can select it straight away. */
  onAdded?: (vehicle: Vehicle) => void
  /**
   * Draws Save car, the sheet's one main action, as the Home hub's red pill
   * (ScButton "hero"). The customer app passes it while NEXT_PUBLIC_HOME_HUB
   * is on; unset, the button is the plain primary it has always been.
   */
  hero?: boolean
}

/**
 * Add a car without leaving what you were doing.
 *
 * Checkout needs this because the alternative — a link out to the profile
 * screen — abandons a half-made booking: the date, time and any applied promo
 * code are page state, and none of it survives the round trip.
 *
 * Vehicles live in the user store rather than the query cache, so the new car
 * is pushed there on success; the mutation is only here for the request
 * lifecycle.
 */
export function AddCarSheet({ open, onClose, onAdded, hero = false }: AddCarSheetProps) {
  const [form, setForm] = useState(EMPTY)
  const vehicles = useUserStore((s) => s.vehicles)
  const { attach: attachShine, className: shineClassName } = useHeroShine<HTMLButtonElement>(hero)

  const save = useMutation({
    mutationFn: () =>
      createVehicle({
        make: form.make.trim(),
        model: form.model.trim(),
        licensePlate: form.licensePlate.trim() || undefined,
        vehicleType: form.vehicleType,
        // The first car a customer adds is their default; later ones are not,
        // so adding a second car mid-checkout can't silently re-point every
        // other screen that reads the default.
        isDefault: vehicles.length === 0,
      }),
    onSuccess: (created) => {
      useUserStore.setState((s) => ({ vehicles: [...s.vehicles, created] }))
      setForm(EMPTY)
      onAdded?.(created)
      onClose()
      toast.success('Car added')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add car')
    },
  })

  const isValid = form.make.trim().length > 0 && form.model.trim().length > 0

  const close = () => {
    if (save.isPending) return
    setForm(EMPTY)
    onClose()
  }

  return (
    <ScSheet
      open={open}
      onClose={close}
      dismissible={!save.isPending}
      aria-label="Add a car"
      className="px-4"
    >
      <h2 className="text-[19px] font-semibold text-text-primary">Add a car</h2>

      <div className="mt-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <ScInput
            id="car-make"
            label="Make"
            placeholder="e.g. Maruti"
            autoFocus
            value={form.make}
            onChange={(e) => setForm({ ...form, make: e.target.value })}
          />
          <ScInput
            id="car-model"
            label="Model"
            placeholder="e.g. Swift"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
        </div>

        <ScInput
          id="car-plate"
          label="License plate (optional)"
          placeholder="e.g. TN 01 AB 1234"
          value={form.licensePlate}
          onChange={(e) =>
            setForm({ ...form, licensePlate: e.target.value.toUpperCase() })
          }
        />

        <div>
          <p className="mb-2 text-[11px] font-medium text-text-secondary">
            Type
          </p>
          <div className="flex flex-wrap gap-2">
            {VEHICLE_TIERS.map((tier) => (
              <Chip
                key={tier.value}
                label={tier.label}
                selected={form.vehicleType === tier.value}
                onClick={() => setForm({ ...form, vehicleType: tier.value })}
              />
            ))}
          </div>
          {/* The tier is what the garage priced against, so it decides the
              amount charged for a per-vehicle service. */}
          <p className="mt-2 text-[11px] text-text-muted">
            Pricing can differ by car type.
          </p>
        </div>

        <div className="mt-1 flex gap-2">
          {hero ? (
            // The label as an element of its own, so it sits above the
            // shine's band. The shine waits for the form to be complete, on
            // purpose: a disabled hero never shines, so it plays when Save
            // car first becomes something to press. Once only — clearing a
            // field and typing it again does not replay it (useHeroShine).
            // The sheet draws a new button each time it opens, so opening it
            // again is a new visit.
            <ScButton
              ref={attachShine}
              variant="hero"
              className={shineClassName}
              disabled={!isValid || save.isPending}
              onClick={() => save.mutate()}
            >
              <span>{save.isPending ? 'Saving…' : 'Save car'}</span>
            </ScButton>
          ) : (
            <ScButton
              disabled={!isValid || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Saving…' : 'Save car'}
            </ScButton>
          )}
          <ScButton variant="secondary" disabled={save.isPending} onClick={close}>
            Cancel
          </ScButton>
        </div>
      </div>
    </ScSheet>
  )
}
