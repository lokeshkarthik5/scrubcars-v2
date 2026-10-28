'use client'

import { Chip } from '@repo/ui/sc/chip'
import { ScInput } from '@repo/ui/sc/input'
import type { DraftCar } from '@repo/core/booking-draft'
import { VEHICLE_TIERS } from '@repo/core/vehicles'
import type { VehicleType } from '@repo/core/types'

/** A draft car with both names given: ready to be saved at sign-in. */
export function draftCarReady(car: DraftCar | null): car is DraftCar {
  return car !== null && car.make.trim().length > 0 && car.model.trim().length > 0
}

/**
 * A guest's car at checkout (0062): the body type first, since it sets the
 * price (hatchback, sedan or SUV: the three tiers a garage prices), then the
 * make and model the garage needs to know which car is theirs. Kept on the
 * phone; saved as the account's car (the ordinary vehicle API) when they
 * sign in at "Confirm". The plate is left for later (Profile), so nothing
 * here is personal.
 */
export function GuestCarForm({
  car,
  onChange,
}: {
  car: DraftCar | null
  onChange: (car: DraftCar) => void
}) {
  const current: DraftCar = car ?? { vehicleType: 'sedan', make: '', model: '' }
  const typeChosen = car !== null

  const setType = (vehicleType: VehicleType) => onChange({ ...current, vehicleType })

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p id="guest-car-type" className="mb-2 text-[13px] text-text-secondary">
          Body type — it sets the price
        </p>
        <div role="group" aria-labelledby="guest-car-type" className="flex flex-wrap gap-2">
          {VEHICLE_TIERS.map((tier) => (
            <Chip
              key={tier.value}
              label={tier.label}
              selected={typeChosen && current.vehicleType === tier.value}
              onClick={() => setType(tier.value)}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ScInput
          id="guest-car-make"
          label="Make"
          placeholder="e.g. Maruti"
          autoComplete="off"
          maxLength={100}
          value={current.make}
          onChange={(event) => onChange({ ...current, make: event.target.value })}
        />
        <ScInput
          id="guest-car-model"
          label="Model"
          placeholder="e.g. Swift"
          autoComplete="off"
          maxLength={100}
          value={current.model}
          onChange={(event) => onChange({ ...current, model: event.target.value })}
        />
      </div>
    </div>
  )
}
