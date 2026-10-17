'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import {
  LocationPicker,
  type PickedLocation,
} from '@repo/ui/features/location-picker'
import { Chip } from '@repo/ui/sc/chip'
import { ScField, ScTextarea } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/sc/tabs'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ApiError } from '@repo/core/api/client'
import { createAdminVendor } from '@repo/core/api/admin'
import { VENDOR_VEHICLE_TYPE_OPTIONS } from '@repo/core/vehicles'
import { BookingModeCard } from '@/components/booking-mode-card'
import { ServicesEditor } from '@/components/services-editor'
import {
  bookingModeFlags,
  parseRadiusInput,
  type BookingMode,
} from '@/lib/garage-edit'
import { toServicePayload, type ServiceRow } from '@/lib/service-editor'
import { rowsToSave, servicesSaveBlock } from '@/lib/service-rows'

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
    openTime: '09:00',
    closeTime: '18:00',
    notes: '',
  })
  const [pickup, setPickup] = useState<'yes' | 'nearby' | 'no' | ''>('')
  // Optional here, unlike the vendor's own onboarding: staff often create a
  // garage from a phone call and pin it later. The consequence lands at
  // verification, which the server refuses without coordinates.
  const [pin, setPin] = useState<PickedLocation | null>(null)
  // How customers book: the same card as the edit page, held here and sent
  // with Create rather than saved on tap — there is no garage to save to yet.
  const [bookingMode, setBookingMode] = useState<BookingMode>('garage')
  const [doorstepRadius, setDoorstepRadius] = useState('')
  const [slotIntervalMins, setSlotIntervalMins] = useState<30 | 45 | 60>(30)
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6])
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([])
  const [status, setStatus] = useState<'pending' | 'active' | 'suspended'>('pending')
  const [isVerified, setIsVerified] = useState(false)
  const [services, setServices] = useState<ServiceRow[]>([])
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // AI text still arriving in the services editor: Create waits for it, or
  // the garage would be created without the text the admin is watching land.
  const [describing, setDescribing] = useState(false)

  const set = (key: keyof typeof form) => (v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }))

  // Every row typed into is sent, as on the edit screen: a service left out
  // here for a missing price would simply not exist, with nothing said. A row
  // that is not ready says so and holds "Create vendor" instead.
  const servicesBlock = servicesSaveBlock(services)
  const servicesToSave = rowsToSave(services)
  // Only read while doorstep is on: an "At the garage" garage travels nowhere.
  const travels = bookingMode !== 'garage'
  const radius = parseRadiusInput(doorstepRadius)
  const radiusBlock = travels && !radius.ok ? radius.message : null

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
    if (!isValid || servicesBlock || radiusBlock || describing) return
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
        // Empty means the default distance, so nothing is sent for it.
        doorstepRadiusKm: travels && radius.ok ? (radius.km ?? undefined) : undefined,
        lat: pin?.lat,
        lng: pin?.lng,
        ...bookingModeFlags(bookingMode),
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
          ? servicesToSave.map(toServicePayload)
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
        {/* The same card as the edit page, above the tabs; here it is part of
            the form and goes with Create. */}
        <BookingModeCard
          mode={bookingMode}
          onModeChange={setBookingMode}
          radius={doorstepRadius}
          onRadiusChange={setDoorstepRadius}
          reachKm={radius.ok ? radius.km : null}
          radiusError={radiusBlock}
          live={status === 'active' && isVerified}
        />

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
              <label className="text-[11px] font-medium text-text-secondary">Pickup &amp; drop (optional)</label>
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
              <ScField label="Pickup radius km (optional)" value={form.pickupRadiusKm} onChange={set('pickupRadiusKm')} type="number" placeholder="e.g. 5" className="font-numeric" />
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
          <ServicesEditor
            rows={services}
            setRows={setServices}
            openRows={openRows}
            setOpenRows={setOpenRows}
            garageName={form.businessName}
            onAiBusyChange={setDescribing}
            emptyText="No services yet. Add one, or start from a template above."
            saving={loading}
            onAuthError={() => router.replace('/login')}
            footnote={
              <>
                Each service needs a name and a price. Leave the duration on
                “Duration” to use one booking slot. Photos can be added once the
                garage is created.
              </>
            }
          />
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
        {(servicesBlock || radiusBlock) && (
          <p id="services-save-block" className="text-[13px] text-error">
            {servicesBlock ? `${servicesBlock} — see the Services tab.` : 'Check the doorstep distance above.'}
          </p>
        )}

        <ScButton
          disabled={!isValid || loading || describing || servicesBlock !== null || radiusBlock !== null}
          aria-describedby={servicesBlock || radiusBlock ? 'services-save-block' : undefined}
          onClick={handleSubmit}
        >
          {loading ? 'Creating…' : 'Create vendor'}
        </ScButton>
      </div>
    </div>
  )
}
