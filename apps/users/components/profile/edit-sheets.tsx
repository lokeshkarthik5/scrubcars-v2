'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { updateAddress, updateProfile, updateVehicle } from '@repo/core/api/users'
import { useUserStore } from '@repo/core/stores/user-store'
import type { Address, User, Vehicle } from '@repo/core/types'

/**
 * Profile's Edit sheets (0066): the name and email, a car's make, model,
 * plate and colour, and a saved address's label, street and city. Each
 * saves through its PATCH route and puts the answer back in the user store,
 * so Profile, Home and checkout read the change at once. The phone is not
 * editable here (it is the sign-in).
 */

function SheetShell({
  open,
  onClose,
  title,
  busy,
  canSave,
  onSave,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  busy: boolean
  canSave: boolean
  onSave: () => void
  children: React.ReactNode
}) {
  return (
    <ScSheet open={open} onClose={onClose} dismissible={!busy} aria-label={title}>
      <form
        className="flex flex-col gap-3 px-5 pt-1"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSave && !busy) onSave()
        }}
      >
        <h2 className="text-[17px] font-semibold text-text-primary">{title}</h2>
        {children}
        <div className="mt-2 flex flex-col gap-2.5">
          <ScButton type="submit" variant="main" disabled={!canSave || busy}>
            {busy ? 'Saving...' : 'Save'}
          </ScButton>
          <ScButton type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </ScButton>
        </div>
      </form>
    </ScSheet>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EditProfileSheet({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email ?? '')
  const [busy, setBusy] = useState(false)
  const emailOk = email.trim() === '' || EMAIL_RE.test(email.trim())
  const canSave = name.trim().length > 0 && emailOk

  const save = async () => {
    setBusy(true)
    try {
      const updated = await updateProfile({ name: name.trim(), email: email.trim() === '' ? null : email.trim() })
      useUserStore.setState((s) => ({ profile: s.profile ? { ...s.profile, ...updated, area: s.profile.area, pincode: s.profile.pincode } : updated }))
      toast.success('Profile updated')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your profile')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SheetShell open={open} onClose={onClose} title="Edit your details" busy={busy} canSave={canSave} onSave={save}>
      <ScInput
        data-clarity-mask="true"
        label="Name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <ScInput
        data-clarity-mask="true"
        label="Email (optional)"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {!emailOk && (
        <p role="alert" className="text-[12px] text-warning">
          Enter an email like name@example.com, or leave it empty.
        </p>
      )}
      <p className="text-[12px] text-text-muted">Your phone number is how you sign in, so it can&apos;t be changed here.</p>
    </SheetShell>
  )
}

export function EditVehicleSheet({
  vehicle,
  open,
  onClose,
  onSaved,
}: {
  vehicle: Vehicle
  open: boolean
  onClose: () => void
  /** After a save: Home's car reads the new name (the caller invalidates it). */
  onSaved?: () => void
}) {
  const [make, setMake] = useState(vehicle.make)
  const [model, setModel] = useState(vehicle.model)
  const [plate, setPlate] = useState(vehicle.plate)
  const [color, setColor] = useState(vehicle.color ?? '')
  const [busy, setBusy] = useState(false)
  const canSave = make.trim().length > 0 && model.trim().length > 0

  const save = async () => {
    setBusy(true)
    try {
      const updated = await updateVehicle(vehicle.id, {
        make: make.trim(),
        model: model.trim(),
        licensePlate: plate.trim() === '' ? null : plate.trim(),
        color: color.trim() === '' ? null : color.trim(),
      })
      useUserStore.setState((s) => ({ vehicles: s.vehicles.map((v) => (v.id === vehicle.id ? updated : v)) }))
      onSaved?.()
      toast.success('Vehicle updated')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save this vehicle')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SheetShell open={open} onClose={onClose} title="Edit vehicle" busy={busy} canSave={canSave} onSave={save}>
      <div className="grid grid-cols-2 gap-2">
        <ScInput data-clarity-mask="true" label="Make" value={make} onChange={(e) => setMake(e.target.value)} />
        <ScInput data-clarity-mask="true" label="Model" value={model} onChange={(e) => setModel(e.target.value)} />
      </div>
      <ScInput
        data-clarity-mask="true"
        label="License plate (optional)"
        placeholder="e.g. TN 01 AB 1234"
        value={plate}
        onChange={(e) => setPlate(e.target.value.toUpperCase())}
      />
      <ScInput
        data-clarity-mask="true"
        label="Colour (optional)"
        placeholder="e.g. White"
        value={color}
        onChange={(e) => setColor(e.target.value)}
      />
    </SheetShell>
  )
}

export function EditAddressSheet({ address, open, onClose }: { address: Address; open: boolean; onClose: () => void }) {
  const [label, setLabel] = useState(address.label)
  const [street, setStreet] = useState(address.street ?? address.address)
  const [city, setCity] = useState(address.city ?? '')
  const [busy, setBusy] = useState(false)
  const canSave = label.trim().length > 0 && street.trim().length > 0 && city.trim().length > 0

  const save = async () => {
    setBusy(true)
    try {
      const updated = await updateAddress(address.id, { label: label.trim(), address: street.trim(), city: city.trim() })
      useUserStore.setState((s) => ({ addresses: s.addresses.map((a) => (a.id === address.id ? updated : a)) }))
      toast.success('Address updated')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save this address')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SheetShell open={open} onClose={onClose} title="Edit address" busy={busy} canSave={canSave} onSave={save}>
      <ScInput data-clarity-mask="true" label="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
      <ScInput
        data-clarity-mask="true"
        label="Address"
        placeholder="Street, area, pincode"
        value={street}
        onChange={(e) => setStreet(e.target.value)}
      />
      <ScInput data-clarity-mask="true" label="City" value={city} onChange={(e) => setCity(e.target.value)} />
      <p className="text-[12px] text-text-muted">
        The pin on the map stays where it is. To move it, remove this address and add it again.
      </p>
    </SheetShell>
  )
}
