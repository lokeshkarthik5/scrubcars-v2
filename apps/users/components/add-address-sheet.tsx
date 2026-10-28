'use client'

import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import {
  LocationPicker,
  type PickedLocation,
} from '@repo/ui/features/location-picker'
import { ScButton } from '@repo/ui/sc/button'
import { Chip } from '@repo/ui/sc/chip'
import { ScInput } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { createAddress } from '@repo/core/api/users'
import { useUserStore } from '@repo/core/stores/user-store'
import type { Address } from '@repo/core/types'
import { MainAction } from './main-action'
import { NO_PIN_TEXT, refillFromPin, type PinText } from './pin-autofill'

const LABELS = ['Home', 'Office', 'Other'] as const

const EMPTY = {
  label: 'Home' as string,
  address: '',
  city: '',
  pin: null as PickedLocation | null,
}

interface AddAddressSheetProps {
  open: boolean
  onClose: () => void
  /** The saved address, so the caller can select it straight away. */
  onAdded?: (address: Address) => void
  /** Pickup & drop: the garage collects the car from here, not visits it. */
  pickup?: boolean
}

/**
 * Add a doorstep (or pickup & drop) address without leaving checkout.
 *
 * Same reasoning as AddCarSheet: the slot, the car and any applied code are
 * page state, and the old link out to /profile threw all of it away. It
 * matters more now that sign-up asks only for a name — a new customer's first
 * doorstep booking is where they give an address at all.
 *
 * Unlike the profile form, the pin is required. This sheet only opens for a
 * doorstep booking, which the server refuses against an address without
 * coordinates (ADDRESS_LOCATION_REQUIRED); taking it here spares the customer
 * a separate "Pin the exact spot" step straight after saving.
 */
export function AddAddressSheet({ open, onClose, onAdded, pickup = false }: AddAddressSheetProps) {
  const [form, setForm] = useState(EMPTY)
  // What the last pin wrote into the text fields — see refillFromPin.
  const pinText = useRef<PinText>(NO_PIN_TEXT)
  const addresses = useUserStore((s) => s.addresses)

  const save = useMutation({
    mutationFn: (pin: PickedLocation) =>
      createAddress({
        label: form.label,
        address: form.address.trim(),
        city: form.city.trim(),
        lat: pin.lat,
        lng: pin.lng,
        geoSource: pin.source,
        // The first address is the default, as on the profile screen; a later
        // one added mid-checkout must not re-point every other screen.
        isDefault: addresses.length === 0,
      }),
    onSuccess: (created) => {
      useUserStore.setState((s) => ({ addresses: [...s.addresses, created] }))
      setForm(EMPTY)
      pinText.current = NO_PIN_TEXT
      onAdded?.(created)
      onClose()
      toast.success('Address added')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add address')
    },
  })

  const isValid =
    form.pin !== null &&
    form.address.trim().length > 0 &&
    form.city.trim().length > 0

  const close = () => {
    if (save.isPending) return
    setForm(EMPTY)
    pinText.current = NO_PIN_TEXT
    onClose()
  }

  return (
    <ScSheet
      open={open}
      onClose={close}
      dismissible={!save.isPending}
      aria-label="Add an address"
      className="px-4"
    >
      <h2 className="text-[19px] font-semibold text-text-primary">
        Add an address
      </h2>
      <p className="mt-1 text-[13px] text-text-secondary">
        {pickup
          ? 'Drop the pin where the car will be. We use it to check the garage collects from you, and the driver uses it to find your car.'
          : 'Drop the pin where the car will be. We use it to check the garage travels to you.'}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {LABELS.map((label) => (
            <Chip
              key={label}
              label={label}
              selected={form.label === label}
              onClick={() => setForm({ ...form, label })}
            />
          ))}
        </div>

        {/* GPS-first, as on the profile screen: a customer booking doorstep
            is usually standing at the address. The pin fills the text below,
            which stays editable for the flat number a geocoder never has. */}
        <LocationPicker
          showSearch
          value={form.pin ? { lat: form.pin.lat, lng: form.pin.lng } : null}
          onChange={(picked) => {
            const previous = pinText.current
            pinText.current = { address: picked.address, city: picked.city }
            setForm((current) =>
              refillFromPin({ ...current, pin: picked }, picked, previous)
            )
          }}
        />

        <ScInput
          data-clarity-mask="true"
          id="address-text"
          label="Address"
          placeholder="Flat, building, street"
          autoComplete="street-address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <ScInput
          data-clarity-mask="true"
          id="address-city"
          label="City"
          placeholder="e.g. Chennai"
          autoComplete="address-level2"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />

        <div className="mt-1 flex gap-2">
          {/* The sheet's one main action: the red pill behind the Home hub
              flag, as Save car is in its sibling sheet at checkout; off,
              today's button exactly. Like Save car, it shines once, when
              the form first becomes complete. */}
          <MainAction
            disabled={!isValid || save.isPending}
            onClick={() => form.pin && save.mutate(form.pin)}
          >
            {save.isPending ? 'Saving…' : 'Save address'}
          </MainAction>
          <ScButton variant="secondary" disabled={save.isPending} onClick={close}>
            Cancel
          </ScButton>
        </div>
      </div>
    </ScSheet>
  )
}
