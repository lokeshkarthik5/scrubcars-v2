'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconPlus } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import {
  LocationPicker,
  type PickedLocation,
} from '@repo/ui/features/location-picker'
import { Chip } from '@repo/ui/sc/chip'
import { ScField, ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/sc/tabs'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ScSelect } from '@repo/ui/sc/select'
import { ApiError } from '@repo/core/api/client'
import { createAdminVendor } from '@repo/core/api/admin'
import { SERVICE_CATEGORY_OPTIONS } from '@repo/core/categories'
import { VENDOR_VEHICLE_TYPE_OPTIONS } from '@repo/core/vehicles'
import type { ServiceCategory } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import {
  missingServiceFields,
  rowsToSave,
  serviceRowProblem,
  servicesSaveBlock,
  switchPricingType,
  type PricingType,
} from '@/lib/service-rows'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PICKUP_OPTIONS = [
  { value: 'yes' as const, label: 'Yes' },
  { value: 'nearby' as const, label: 'Nearby only' },
  { value: 'no' as const, label: 'No' },
]
const SLOT_INTERVALS = [30, 45, 60] as const
const STATUS_OPTIONS = [
  { value: 'pending' as const, label: 'Pending' },
  { value: 'active' as const, label: 'Active (live)' },
  { value: 'suspended' as const, label: 'Suspended' },
]

const SERVICE_CATEGORIES = SERVICE_CATEGORY_OPTIONS

const PRICING_TYPES: Array<{ value: PricingType; label: string }> = [
  { value: 'flat', label: 'Flat' },
  { value: 'per_vehicle', label: 'Per vehicle' },
  { value: 'on_inspection', label: 'On inspection' },
]

type DurationUnit = 'min' | 'hour' | 'day'
const DURATION_UNITS: Array<{ value: DurationUnit; label: string }> = [
  { value: 'min', label: 'Minutes' },
  { value: 'hour', label: 'Hours' },
  { value: 'day', label: 'Days' },
]
const DURATION_FACTOR: Record<DurationUnit, number> = { min: 1, hour: 60, day: 1440 }

// Convert a value + unit into minutes to send; blank/zero → undefined (omit).
function durationToMins(value: string, unit: DurationUnit): number | undefined {
  const n = Number(value)
  return n > 0 ? n * DURATION_FACTOR[unit] : undefined
}

interface ServiceRow {
  name: string
  description: string
  category: ServiceCategory
  pricingType: PricingType
  price: string
  priceHatchback: string
  priceSedan: string
  priceSuv: string
  durationValue: string
  durationUnit: DurationUnit
}

const emptyService = (): ServiceRow => ({
  name: '',
  description: '',
  category: 'car_wash',
  pricingType: 'flat',
  price: '',
  priceHatchback: '',
  priceSedan: '',
  priceSuv: '',
  durationValue: '',
  durationUnit: 'min',
})

export default function NewVendorPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    ownerName: '',
    ownerPhone: '',
    businessName: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
    email: '',
    whatsapp: '',
    yearsInOperation: '',
    mapsUrl: '',
    bays: '',
    jobsPerDay: '',
    pickupRadiusKm: '',
    doorstepRadiusKm: '',
    openTime: '09:00',
    closeTime: '18:00',
    notes: '',
  })
  const [pickup, setPickup] = useState<'yes' | 'nearby' | 'no' | ''>('')
  // Optional here, unlike the vendor's own onboarding: staff often create a
  // garage from a phone call and pin it later. The consequence lands at
  // verification, which the server refuses without coordinates.
  const [pin, setPin] = useState<PickedLocation | null>(null)
  const [dropinEnabled, setDropinEnabled] = useState(true)
  const [doorstepEnabled, setDoorstepEnabled] = useState(false)
  const [slotIntervalMins, setSlotIntervalMins] = useState<30 | 45 | 60>(30)
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6])
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([])
  const [status, setStatus] = useState<'pending' | 'active' | 'suspended'>('pending')
  const [isVerified, setIsVerified] = useState(false)
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof typeof form) => (v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }))

  const updateService = (i: number, patch: Partial<ServiceRow>) =>
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const removeService = (i: number) =>
    setServices((prev) => prev.filter((_, idx) => idx !== i))

  // Every row typed into is sent, as on the edit screen: a service left out
  // here for a missing price would simply not exist, with nothing said. A row
  // that is not ready says so and holds "Create vendor" instead.
  const servicesBlock = servicesSaveBlock(services)
  const servicesToSave = rowsToSave(services)

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

  const isValid =
    form.ownerName &&
    /^\d{10}$/.test(form.ownerPhone) &&
    form.businessName &&
    /^\d{10}$/.test(form.phone) &&
    form.address &&
    form.city &&
    /^\d{6}$/.test(form.pincode)

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

  const handleSubmit = async () => {
    if (!isValid || servicesBlock) return
    setLoading(true)
    setError('')
    try {
      await createAdminVendor({
        ownerName: form.ownerName.trim(),
        ownerPhone: form.ownerPhone.trim(),
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        email: form.email.trim() || undefined,
        whatsapp: form.whatsapp.trim() || undefined,
        yearsInOperation: form.yearsInOperation.trim() || undefined,
        mapsUrl: form.mapsUrl.trim() || undefined,
        pickup: pickup || undefined,
        pickupRadiusKm: num(form.pickupRadiusKm),
        doorstepRadiusKm: num(form.doorstepRadiusKm),
        lat: pin?.lat,
        lng: pin?.lng,
        dropinEnabled,
        doorstepEnabled,
        slotIntervalMins,
        bays: num(form.bays),
        jobsPerDay: num(form.jobsPerDay),
        vehicleTypes: vehicleTypes.length ? vehicleTypes : undefined,
        workingDays: workingDays.length ? workingDays : undefined,
        openTime: form.openTime,
        closeTime: form.closeTime,
        status,
        isVerified,
        notes: form.notes.trim() || undefined,
        services: servicesToSave.length
          ? servicesToSave.map((s) => {
              const pos = (v: string) => (Number(v) > 0 ? Number(v) : undefined)
              const durationMins = durationToMins(s.durationValue, s.durationUnit)
              return {
                name: s.name.trim(),
                ...(s.description.trim() && { description: s.description.trim() }),
                category: s.category,
                pricingType: s.pricingType,
                ...(durationMins != null && { durationMins }),
                ...(s.pricingType === 'per_vehicle'
                  ? {
                      priceHatchback: pos(s.priceHatchback),
                      priceSedan: pos(s.priceSedan),
                      priceSuv: pos(s.priceSuv),
                    }
                  : { price: pos(s.price) }),
              }
            })
          : undefined,
      })
      router.replace('/vendors')
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/login')
        return
      }
      setError(err instanceof ApiError ? err.message : 'Failed to create vendor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-5">
      <PageHeader title="Add vendor" backHref="/vendors" />

      <div className="space-y-4">
        {/* Mirrors the edit screen's tabs, which mirror the vendor settings
          screen — one shape for "a garage's details", wherever you edit it. */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <ScSection title="Business & contact">
            <div className="grid grid-cols-2 gap-3">
              <ScField label="Owner name" value={form.ownerName} onChange={set('ownerName')} />
              <ScField label="Owner phone" value={form.ownerPhone} onChange={set('ownerPhone')} placeholder="10 digits" />
            </div>
            <ScField label="Business name" value={form.businessName} onChange={set('businessName')} />
            <div className="grid grid-cols-2 gap-3">
              <ScField label="Business phone" value={form.phone} onChange={set('phone')} placeholder="10 digits" />
              <ScField label="WhatsApp (optional)" value={form.whatsapp} onChange={set('whatsapp')} placeholder="10 digits" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ScField label="Email (optional)" value={form.email} onChange={set('email')} type="email" />
              <ScField label="Years in operation (optional)" value={form.yearsInOperation} onChange={set('yearsInOperation')} placeholder="e.g. 5–10 years" />
            </div>
          </ScSection>

          <ScSection title="Onboarding status">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-text-secondary">Stage</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    selected={status === o.value}
                    onClick={() => setStatus(o.value)}
                  />
                ))}
              </div>
            </div>
            <ScCheckbox label="Mark as verified" checked={isVerified} onChange={setIsVerified} />
            <p className="text-[11px] text-text-muted">
              A vendor is visible to customers only when stage is <b>Active</b> and it is <b>verified</b>.
            </p>
            <ScTextarea
              label="Notes (optional)"
              value={form.notes}
              onChange={(e) => set('notes')(e.target.value)}
              rows={3}
            />
          </ScSection>
        </TabsContent>

        <TabsContent value="location">
          <ScSection title="Location">
            <ScField label="Address" value={form.address} onChange={set('address')} />
            <div className="grid grid-cols-2 gap-3">
              <ScField label="City" value={form.city} onChange={set('city')} />
              <ScField label="Pincode" value={form.pincode} onChange={set('pincode')} placeholder="6 digits" />
            </div>
            <ScField label="Google Maps link (optional)" value={form.mapsUrl} onChange={set('mapsUrl')} placeholder="https://maps.app.goo.gl/…" />
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-text-secondary">
                Garage location
              </span>
              <p className="text-[11px] text-text-muted">
                Optional now, required before this garage can be verified.
              </p>
              <LocationPicker
                value={pin ? { lat: pin.lat, lng: pin.lng } : null}
                onChange={setPin}
                expectedCity={form.city}
              />
            </div>
          </ScSection>
        </TabsContent>

        <TabsContent value="operations">
          <ScSection title="Operations">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-text-secondary">Pickup &amp; drop</label>
              <div className="flex flex-wrap gap-2">
                {PICKUP_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    selected={pickup === o.value}
                    onClick={() => setPickup(pickup === o.value ? '' : o.value)}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ScField label="Pickup radius km (optional)" value={form.pickupRadiusKm} onChange={set('pickupRadiusKm')} type="number" placeholder="e.g. 5" />
              <ScField label="Doorstep travel radius km" value={form.doorstepRadiusKm} onChange={set('doorstepRadiusKm')} type="number" placeholder="e.g. 8" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-end gap-4 pb-1">
                <ScCheckbox label="Drop-in" checked={dropinEnabled} onChange={setDropinEnabled} />
                <ScCheckbox label="Doorstep" checked={doorstepEnabled} onChange={setDoorstepEnabled} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-text-secondary">Working days</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((label, day) => (
                  <Chip
                    key={day}
                    label={label}
                    selected={workingDays.includes(day)}
                    onClick={() => setWorkingDays((d) => toggle(d, day).sort())}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ScField label="Opening time" value={form.openTime} onChange={set('openTime')} type="time" className="font-numeric" />
              <ScField label="Closing time" value={form.closeTime} onChange={set('closeTime')} type="time" className="font-numeric" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-text-secondary">Slot interval</label>
              <div className="flex gap-2">
                {SLOT_INTERVALS.map((mins) => (
                  <Chip
                    key={mins}
                    label={`${mins} min`}
                    selected={slotIntervalMins === mins}
                    onClick={() => setSlotIntervalMins(mins)}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ScField label="Bays (optional)" value={form.bays} onChange={set('bays')} type="number" placeholder="e.g. 10" />
              <ScField label="Jobs per day (optional)" value={form.jobsPerDay} onChange={set('jobsPerDay')} type="number" placeholder="e.g. 15" />
            </div>
          </ScSection>

          <ScSection title="Vehicle types">
            <div className="flex flex-wrap gap-2">
              {VENDOR_VEHICLE_TYPE_OPTIONS.map((v) => (
                <Chip
                  key={v}
                  label={v}
                  selected={vehicleTypes.includes(v)}
                  onClick={() => setVehicleTypes((list) => toggle(list, v))}
                />
              ))}
            </div>
          </ScSection>
        </TabsContent>

        <TabsContent value="services">
          <ScSection title="Services offered">
            {services.length === 0 ? (
              <p className="text-[12px] text-text-muted">No services added yet.</p>
            ) : (
              <div className="space-y-3">
                {services.map((s, i) => {
                  const missing = missingServiceFields(s)
                  const problem = serviceRowProblem(s)
                  const problemId = `service-${i}-problem`
                  // What an input missing its value carries: the amber edge,
                  // and the row's line as its description.
                  const flag = (field: (typeof missing)[number]) => {
                    const on = missing.includes(field)
                    return {
                      'aria-invalid': on || undefined,
                      'aria-describedby': on ? problemId : undefined,
                      className: on ? 'border-error' : undefined,
                    }
                  }
                  return (
                  <div
                    key={i}
                    className={cn(
                      'space-y-2 rounded-[12px] border p-3',
                      problem ? 'border-error' : 'border-border'
                    )}
                  >
                    <div className="flex items-end gap-2">
                      {/* The wrapper takes the row's width: ScInput's className
                          styles the field inside, not the box around it. */}
                      <div className="min-w-0 flex-1">
                        <ScInput
                          value={s.name}
                          aria-label={`Service ${i + 1} name`}
                          placeholder="Service name (e.g. Foam wash)"
                          onChange={(e) => updateService(i, { name: e.target.value })}
                          {...flag('name')}
                        />
                      </div>
                      {/* Quiet: removing a row is not the form's main action. */}
                      <button
                        type="button"
                        onClick={() => removeService(i)}
                        aria-label={`Remove service ${i + 1}`}
                        className="min-h-11 rounded-[10px] px-3 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                      >
                        Remove
                      </button>
                    </div>
                    {/* Amber, as errors are: what this row needs before the
                        garage can be created. */}
                    {problem && (
                      <p id={problemId} className="text-[12px] text-error">
                        {problem}
                      </p>
                    )}
                    <ScTextarea
                      value={s.description}
                      aria-label={`Service ${i + 1} description`}
                      placeholder="Description (optional)"
                      rows={2}
                      onChange={(e) => updateService(i, { description: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <ScSelect
                        value={s.category}
                        aria-label={`Service ${i + 1} category`}
                        onChange={(e) => updateService(i, { category: e.target.value as ServiceCategory })}
                      >
                        {SERVICE_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </ScSelect>
                      <ScSelect
                        value={s.pricingType}
                        aria-label={`Service ${i + 1} pricing`}
                        onChange={(e) =>
                          updateService(i, switchPricingType(s, e.target.value as PricingType))
                        }
                      >
                        {PRICING_TYPES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </ScSelect>
                    </div>
                    {(s.pricingType === 'flat' ||
                      s.pricingType === 'on_inspection') && (
                      <ScInput
                        value={s.price}
                        type="number"
                        min={0}
                        placeholder={
                          s.pricingType === 'on_inspection'
                            ? 'Inspection fee ₹'
                            : 'Price ₹'
                        }
                        aria-label={`Service ${i + 1} price in rupees`}
                        onChange={(e) => updateService(i, { price: e.target.value })}
                        {...flag('price')}
                        className={cn('font-numeric', flag('price').className)}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <ScInput
                        value={s.durationValue}
                        type="number"
                        min={0}
                        aria-label={`Service ${i + 1} duration`}
                        className="font-numeric"
                        placeholder="Duration (optional)"
                        onChange={(e) => updateService(i, { durationValue: e.target.value })}
                      />
                      <ScSelect
                        value={s.durationUnit}
                        aria-label={`Service ${i + 1} duration unit`}
                        onChange={(e) => updateService(i, { durationUnit: e.target.value as DurationUnit })}
                      >
                        {DURATION_UNITS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </ScSelect>
                    </div>
                    {s.pricingType === 'per_vehicle' && (
                      <div className="grid grid-cols-3 gap-2">
                        <ScInput
                          value={s.priceHatchback}
                          type="number"
                          min={0}
                          aria-label={`Service ${i + 1} hatchback price in rupees`}
                          {...flag('priceHatchback')}
                          className={cn('font-numeric', flag('priceHatchback').className)}
                          placeholder="Hatch ₹"
                          onChange={(e) => updateService(i, { priceHatchback: e.target.value })}
                        />
                        <ScInput
                          value={s.priceSedan}
                          type="number"
                          min={0}
                          aria-label={`Service ${i + 1} sedan price in rupees`}
                          {...flag('priceSedan')}
                          className={cn('font-numeric', flag('priceSedan').className)}
                          placeholder="Sedan ₹"
                          onChange={(e) => updateService(i, { priceSedan: e.target.value })}
                        />
                        <ScInput
                          value={s.priceSuv}
                          type="number"
                          min={0}
                          aria-label={`Service ${i + 1} SUV price in rupees`}
                          {...flag('priceSuv')}
                          className={cn('font-numeric', flag('priceSuv').className)}
                          placeholder="SUV ₹"
                          onChange={(e) => updateService(i, { priceSuv: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
            <ScButton
              fullWidth={false}
              variant="secondary"
              onClick={() => setServices((prev) => [...prev, emptyService()])}
              className="flex min-h-11 items-center gap-1.5 px-3.5 py-2 text-[12px]"
            >
              <IconPlus size={14} aria-hidden="true" /> Add service
            </ScButton>
            <p className="text-[11px] text-text-muted">
              Each service needs a name and price. Duration is optional — leave it
              blank to use one booking slot; it drives the bookable time slots.
            </p>
          </ScSection>
        </TabsContent>
      </Tabs>

      {/* Amber, as errors are: red on this page is Create vendor. */}
      {error && (
        <p role="alert" className="text-[13px] text-error">
          {error}
        </p>
      )}

        {/* Why Create is off, here rather than only on the Services tab: the
            admin may be on any tab when they reach for it. */}
        {servicesBlock && (
          <p id="services-save-block" className="text-[13px] text-error">
            {servicesBlock} — see the Services tab.
          </p>
        )}

        <ScButton
          disabled={!isValid || loading || servicesBlock !== null}
          aria-describedby={servicesBlock ? 'services-save-block' : undefined}
          onClick={handleSubmit}
        >
          {loading ? 'Creating…' : 'Create vendor'}
        </ScButton>
      </div>
    </div>
  )
}
