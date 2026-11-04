'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import {
  garageAddOnsApi,
  type AddOn,
  type AddOnInput,
} from '@repo/core/api/add-ons'
import { ScButton } from '@repo/ui/sc/button'
import { Chip } from '@repo/ui/sc/chip'
import { ScInput } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { ScSwitch } from '@repo/ui/sc/switch'

type Form = {
  name: string
  pricingType: 'flat' | 'per_vehicle'
  price: string
  priceHatchback: string
  priceSedan: string
  priceSuv: string
  extraMins: string
  isActive: boolean
}

function formFrom(addOn: AddOn | null): Form {
  const text = (value: number | null) => (value === null ? '' : String(value))
  return {
    name: addOn?.name ?? '',
    pricingType: addOn?.pricingType ?? 'flat',
    price: addOn?.pricingType === 'flat' ? String(addOn.price) : '',
    priceHatchback: text(addOn?.priceHatchback ?? null),
    priceSedan: text(addOn?.priceSedan ?? null),
    priceSuv: text(addOn?.priceSuv ?? null),
    // 0 is left empty: the form's own word for no extra time.
    extraMins: addOn && addOn.extraMins > 0 ? String(addOn.extraMins) : '',
    isActive: addOn?.isActive ?? true,
  }
}

function ready(form: Form): boolean {
  if (!form.name.trim()) return false
  const mins = form.extraMins.trim()
  if (
    mins !== '' &&
    !(
      Number.isInteger(Number(mins)) &&
      Number(mins) >= 0 &&
      Number(mins) <= 480
    )
  )
    return false
  return form.pricingType === 'per_vehicle'
    ? [form.priceHatchback, form.priceSedan, form.priceSuv].every(
        (p) => Number(p) > 0
      )
    : Number(form.price) > 0
}

function inputFrom(form: Form): AddOnInput {
  return {
    name: form.name.trim(),
    pricingType: form.pricingType,
    ...(form.pricingType === 'flat'
      ? { price: Number(form.price) }
      : {
          priceHatchback: Number(form.priceHatchback),
          priceSedan: Number(form.priceSedan),
          priceSuv: Number(form.priceSuv),
        }),
    extraMins: form.extraMins.trim() === '' ? null : Number(form.extraMins),
    isActive: form.isActive,
  }
}

/**
 * The add-on form (frame B): the service form's labels, in a sheet. No
 * category, description, photos or On inspection.
 */
export function AddOnSheet({
  open,
  addOn,
  onClose,
  onSaved,
}: {
  open: boolean
  addOn: AddOn | null
  onClose: () => void
  onSaved: (saved: AddOn) => void
}) {
  return (
    <ScSheet
      open={open}
      onClose={onClose}
      aria-label={addOn ? 'Edit add-on' : 'Add an add-on'}
    >
      {/* Keyed so each opening starts from what it is editing. */}
      {open && (
        <AddOnForm key={addOn?.id ?? 'new'} addOn={addOn} onSaved={onSaved} />
      )}
    </ScSheet>
  )
}

function AddOnForm({
  addOn,
  onSaved,
}: {
  addOn: AddOn | null
  onSaved: (saved: AddOn) => void
}) {
  const [form, setForm] = useState<Form>(() => formFrom(addOn))
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<Form>) =>
    setForm((current) => ({ ...current, ...patch }))

  const submit = async () => {
    setSaving(true)
    try {
      const input = inputFrom(form)
      onSaved(
        addOn
          ? await garageAddOnsApi.update(addOn.id, input)
          : await garageAddOnsApi.create(input)
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-5">
      <h2 className="text-[17px] font-medium text-text-primary">
        {addOn ? 'Edit add-on' : 'Add an add-on'}
      </h2>
      <ScInput
        id="add-on-name"
        label="Add-on name"
        value={form.name}
        onChange={(e) => set({ name: e.target.value })}
      />
      <div>
        <p className="mb-2 text-[11px] font-medium text-text-secondary">
          Pricing
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip
            label="Flat"
            selected={form.pricingType === 'flat'}
            onClick={() => set({ pricingType: 'flat' })}
          />
          <Chip
            label="Per vehicle"
            selected={form.pricingType === 'per_vehicle'}
            onClick={() => set({ pricingType: 'per_vehicle' })}
          />
        </div>
      </div>
      {form.pricingType === 'flat' ? (
        <ScInput
          id="add-on-price"
          label="Price (₹)"
          type="number"
          className="font-numeric"
          value={form.price}
          onChange={(e) => set({ price: e.target.value })}
        />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <ScInput
            label="Hatchback (₹)"
            type="number"
            className="font-numeric"
            value={form.priceHatchback}
            onChange={(e) => set({ priceHatchback: e.target.value })}
          />
          <ScInput
            label="Sedan (₹)"
            type="number"
            className="font-numeric"
            value={form.priceSedan}
            onChange={(e) => set({ priceSedan: e.target.value })}
          />
          <ScInput
            label="SUV (₹)"
            type="number"
            className="font-numeric"
            value={form.priceSuv}
            onChange={(e) => set({ priceSuv: e.target.value })}
          />
        </div>
      )}
      <div>
        <ScInput
          id="add-on-mins"
          label="Extra minutes (optional)"
          type="number"
          className="font-numeric"
          value={form.extraMins}
          onChange={(e) => set({ extraMins: e.target.value })}
        />
        <p className="mt-1.5 text-[11px] text-text-muted">
          Added to the job&apos;s time. Leave empty if it adds none.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-text-primary">Offered to customers</p>
          <p className="text-[11px] text-text-muted">
            Works with any of your services.
          </p>
        </div>
        <ScSwitch
          label="Offered to customers"
          checked={form.isActive}
          onChange={(isActive) => set({ isActive })}
        />
      </div>
      <ScButton
        variant="main"
        size="lg"
        disabled={!ready(form) || saving}
        onClick={() => void submit()}
      >
        {saving ? 'Saving...' : addOn ? 'Update add-on' : 'Add add-on'}
      </ScButton>
    </div>
  )
}
