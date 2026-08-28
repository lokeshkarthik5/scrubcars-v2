'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  IconBuildingStore,
  IconPhotoPlus,
  IconTrash,
} from '@tabler/icons-react'
import { ScButton } from '@/components/sc/button'
import { ScCheckbox } from '@/components/sc/checkbox'
import { Chip } from '@/components/sc/chip'
import { SkeletonCard } from '@/components/sc/empty-state'
import { ScField, ScInput, ScTextarea } from '@/components/sc/input'
import { ScSection } from '@/components/sc/section'
import { ScSelect } from '@/components/sc/select'
import { TopBar } from '@/components/sc/top-bar'
import { ApiError } from '@/lib/api/client'
import {
  deleteAdminServiceImage,
  deleteAdminVendorLogo,
  deleteAdminVendorPhoto,
  getAdminVendor,
  updateAdminVendor,
  uploadAdminServiceImage,
  uploadAdminVendorLogo,
  uploadAdminVendorPhoto,
  type AdminPhoto,
} from '@/lib/api/admin'
import { SERVICE_CATEGORY_OPTIONS } from '@/lib/categories'
import {
  legacyVehicleTypes,
  VENDOR_VEHICLE_TYPE_OPTIONS,
} from '@/lib/vehicles'
import type { ServiceCategory } from '@/lib/types'
import { VendorTeamSection } from './team-section'

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
  { value: 'archived' as const, label: 'Archived' },
]

const SERVICE_CATEGORIES = SERVICE_CATEGORY_OPTIONS

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB
// Mirrors R2_MAX_IMAGES_PER_SERVICE on the server, which is the real cap.
const MAX_IMAGES_PER_SERVICE = 3

// Shared guard for every media picker on this page.
function rejectFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'Unsupported type (use JPEG, PNG or WebP)'
  }
  if (file.size > MAX_IMAGE_BYTES) return 'Image too large (max 5 MB)'
  return null
}

type PricingType = 'flat' | 'per_vehicle' | 'on_inspection'
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

// Present stored minutes in the largest clean unit (e.g. 120 → 2 hours).
function minsToDuration(mins: number): { durationValue: string; durationUnit: DurationUnit } {
  if (mins > 0 && mins % 1440 === 0)
    return { durationValue: String(mins / 1440), durationUnit: 'day' }
  if (mins > 0 && mins % 60 === 0)
    return { durationValue: String(mins / 60), durationUnit: 'hour' }
  return { durationValue: mins > 0 ? String(mins) : '', durationUnit: 'min' }
}

interface ServiceRow {
  id?: string
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
  // Images are stored per service row, so they exist only once the service
  // itself does — a row that has never been saved has nowhere to attach them.
  images: AdminPhoto[]
}

const emptyService = (): ServiceRow => ({
  images: [],
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

// Decimal columns arrive as strings; drop the trailing ".00" for display.
const decToInput = (v: string | null): string =>
  v == null ? '' : String(Number(v))

// A row's pricing is complete when the right price(s) exist for its type.
function rowPricingValid(s: ServiceRow): boolean {
  if (s.pricingType === 'per_vehicle') {
    // Every tier, matching the server: a gap would leave that vehicle
    // unable to book the service.
    return [s.priceHatchback, s.priceSedan, s.priceSuv].every((p) => Number(p) > 0)
  }
  return Number(s.price) > 0
}

export default function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
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
  const [dropinEnabled, setDropinEnabled] = useState(true)
  const [doorstepEnabled, setDoorstepEnabled] = useState(false)
  const [slotIntervalMins, setSlotIntervalMins] = useState<30 | 45 | 60>(30)
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6])
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([])
  const [status, setStatus] = useState<'pending' | 'active' | 'suspended' | 'archived'>('pending')
  const [isVerified, setIsVerified] = useState(false)
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Media is saved the moment it is picked, not on "Save changes" — an upload
  // has already happened by then, and holding the registration until submit
  // would strand the object in R2 if the admin navigates away.
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [photos, setPhotos] = useState<AdminPhoto[]>([])
  const [mediaBusy, setMediaBusy] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const serviceImageInputRef = useRef<HTMLInputElement>(null)
  const [imageTargetId, setImageTargetId] = useState<string | null>(null)

  const set = (key: keyof typeof form) => (v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }))

  const updateService = (i: number, patch: Partial<ServiceRow>) =>
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const removeService = (i: number) =>
    setServices((prev) => prev.filter((_, idx) => idx !== i))

  // A service row counts once it has a name and valid pricing. Duration is
  // optional — the server defaults it to one slot when left blank.
  const validServices = services.filter(
    (s) => s.name.trim() && rowPricingValid(s)
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const v = await getAdminVendor(id)
      setForm({
        ownerName: v.owner?.name ?? '',
        ownerPhone: v.owner?.phone ?? '',
        businessName: v.businessName,
        phone: v.phone,
        address: v.address,
        city: v.city,
        pincode: v.pincode,
        email: v.email ?? '',
        whatsapp: v.whatsapp ?? '',
        yearsInOperation: v.yearsInOperation ?? '',
        mapsUrl: v.mapsUrl ?? '',
        bays: v.bays != null ? String(v.bays) : '',
        jobsPerDay: v.jobsPerDay != null ? String(v.jobsPerDay) : '',
        pickupRadiusKm: v.pickupRadiusKm != null ? String(v.pickupRadiusKm) : '',
        openTime: '09:00',
        closeTime: '18:00',
        notes: v.notes ?? '',
      })
      setPickup(v.pickup ?? '')
      setDropinEnabled(v.dropinEnabled)
      setDoorstepEnabled(v.doorstepEnabled)
      setSlotIntervalMins((v.slotIntervalMins as 30 | 45 | 60) ?? 30)
      setVehicleTypes(v.vehicleTypes ?? [])
      setStatus(v.status as 'pending' | 'active' | 'suspended' | 'archived')
      setIsVerified(v.isVerified)
      setLogoUrl(v.logoUrl)
      setPhotos(v.photos ?? [])
      setServices(
        v.services.map((s) => ({
          id: s.id,
          images: s.images ?? [],
          name: s.name,
          description: s.description ?? '',
          category: s.category,
          pricingType: s.pricingType,
          price: s.pricingType === 'per_vehicle' ? '' : decToInput(s.price),
          priceHatchback: decToInput(s.priceHatchback),
          priceSedan: decToInput(s.priceSedan),
          priceSuv: decToInput(s.priceSuv),
          ...minsToDuration(s.durationMins),
        }))
      )

      // Derive the weekly schedule from stored working hours: open days and the
      // shared open/close time (falls back to defaults when none are stored).
      const openDays = v.workingHours.filter((h) => !h.isClosed)
      if (v.workingHours.length > 0) {
        setWorkingDays(openDays.map((h) => h.dayOfWeek).sort())
      }
      const sample = openDays[0]
      if (sample) {
        setForm((prev) => ({
          ...prev,
          openTime: sample.openTime.slice(0, 5),
          closeTime: sample.closeTime.slice(0, 5),
        }))
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/admin/login')
        return
      }
      setError('Failed to load vendor')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    void load()
  }, [load])

  // Every media action runs through here: one busy key, one error surface.
  const runMedia = async (key: string, action: () => Promise<void>) => {
    setMediaBusy(key)
    setError('')
    try {
      await action()
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/admin/login')
        return
      }
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setMediaBusy(null)
    }
  }

  const handleLogoFile = async (files: FileList | null) => {
    const file = files?.[0]
    if (logoInputRef.current) logoInputRef.current.value = ''
    if (!file) return

    const rejection = rejectFile(file)
    if (rejection) {
      setError(rejection)
      return
    }

    await runMedia('logo', async () => {
      const vendor = await uploadAdminVendorLogo(id, file)
      setLogoUrl(vendor.logoUrl)
    })
  }

  const handleRemoveLogo = () =>
    runMedia('logo', async () => {
      const vendor = await deleteAdminVendorLogo(id)
      setLogoUrl(vendor.logoUrl)
    })

  const handlePhotoFiles = async (files: FileList | null) => {
    const picked = files ? Array.from(files) : []
    if (photoInputRef.current) photoInputRef.current.value = ''
    if (picked.length === 0) return

    await runMedia('photos', async () => {
      for (const file of picked) {
        const rejection = rejectFile(file)
        if (rejection) {
          setError(`${file.name}: ${rejection}`)
          continue
        }
        const created = await uploadAdminVendorPhoto(id, file)
        setPhotos((prev) => [...prev, created])
      }
    })
  }

  const handleRemovePhoto = (photoId: string) =>
    runMedia(`photo-${photoId}`, async () => {
      await deleteAdminVendorPhoto(id, photoId)
      setPhotos((prev) => prev.filter((p) => p.id !== photoId))
    })

  const pickServiceImage = (serviceId: string) => {
    setImageTargetId(serviceId)
    serviceImageInputRef.current?.click()
  }

  const setServiceImages = (serviceId: string, images: AdminPhoto[]) =>
    setServices((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, images } : s))
    )

  const handleServiceImageFile = async (files: FileList | null) => {
    const file = files?.[0]
    const serviceId = imageTargetId
    if (serviceImageInputRef.current) serviceImageInputRef.current.value = ''
    if (!file || !serviceId) return

    const rejection = rejectFile(file)
    if (rejection) {
      setError(rejection)
      return
    }

    await runMedia(`service-${serviceId}`, async () => {
      setServiceImages(serviceId, await uploadAdminServiceImage(serviceId, file))
    })
  }

  const handleRemoveServiceImage = (serviceId: string, imageId: string) =>
    runMedia(`service-${serviceId}`, async () => {
      setServiceImages(
        serviceId,
        await deleteAdminServiceImage(serviceId, imageId)
      )
    })

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

  const num = (v: string) => (v.trim() === '' ? null : Number(v))

  const handleSubmit = async () => {
    if (!isValid) return
    setSaving(true)
    setError('')
    try {
      await updateAdminVendor(id, {
        ownerName: form.ownerName.trim(),
        ownerPhone: form.ownerPhone.trim(),
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        email: form.email.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        yearsInOperation: form.yearsInOperation.trim() || null,
        mapsUrl: form.mapsUrl.trim() || null,
        pickup: pickup || null,
        pickupRadiusKm: num(form.pickupRadiusKm),
        dropinEnabled,
        doorstepEnabled,
        slotIntervalMins,
        bays: num(form.bays),
        jobsPerDay: num(form.jobsPerDay),
        vehicleTypes,
        workingDays,
        openTime: form.openTime,
        closeTime: form.closeTime,
        status,
        isVerified,
        notes: form.notes.trim() || null,
        // Full desired set: keeps/edits rows with an id, adds new ones, and
        // the server soft-deletes any existing service dropped from this list.
        services: validServices.map((s) => {
          const pos = (v: string) => (Number(v) > 0 ? Number(v) : undefined)
          const durationMins = durationToMins(s.durationValue, s.durationUnit)
          return {
            ...(s.id && { id: s.id }),
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
        }),
      })
      router.replace('/admin/vendors')
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/admin/login')
        return
      }
      setError(err instanceof ApiError ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-5">
      <TopBar title="Edit vendor" showBack backHref="/admin/vendors" />

      <input
        ref={logoInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        hidden
        onChange={(e) => handleLogoFile(e.target.files)}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        multiple
        hidden
        onChange={(e) => handlePhotoFiles(e.target.files)}
      />
      <input
        ref={serviceImageInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        hidden
        onChange={(e) => handleServiceImageFile(e.target.files)}
      />

      {loading ? (
        <div className="flex flex-col gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="space-y-4">
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

          <VendorTeamSection vendorId={id} />

          <ScSection title="Logo & photos">
            <p className="text-[11px] text-text-muted">
              Saved immediately — these do not wait for “Save changes”. JPEG,
              PNG or WebP, up to 5 MB each.
            </p>

            <div className="flex items-center gap-4">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-surface">
                {logoUrl ? (
                  <Image src={logoUrl} alt="Logo" fill sizes="64px" className="object-cover" />
                ) : (
                  <IconBuildingStore size={26} className="text-text-muted" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <ScButton
                  fullWidth={false}
                  variant="secondary"
                  disabled={mediaBusy === 'logo'}
                  onClick={() => logoInputRef.current?.click()}
                  className="px-3 py-2 text-[12px]"
                >
                  {mediaBusy === 'logo'
                    ? 'Working…'
                    : logoUrl
                      ? 'Change logo'
                      : 'Add logo'}
                </ScButton>
                {logoUrl && (
                  <button
                    type="button"
                    disabled={mediaBusy === 'logo'}
                    onClick={handleRemoveLogo}
                    className="text-left text-[12px] text-brand-red disabled:opacity-50"
                  >
                    Remove logo
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative h-20 w-20 overflow-hidden rounded-[10px] bg-surface"
                >
                  <Image
                    src={photo.url}
                    alt="Garage photo"
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                  <button
                    type="button"
                    disabled={mediaBusy === `photo-${photo.id}`}
                    onClick={() => handleRemovePhoto(photo.id)}
                    title="Delete photo"
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white disabled:opacity-50"
                  >
                    <IconTrash size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={mediaBusy === 'photos'}
                onClick={() => photoInputRef.current?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border text-text-muted disabled:opacity-50"
              >
                <IconPhotoPlus size={18} />
                <span className="text-[10px]">
                  {mediaBusy === 'photos' ? 'Uploading…' : 'Add'}
                </span>
              </button>
            </div>
          </ScSection>

          <ScSection title="Location">
            <ScField label="Address" value={form.address} onChange={set('address')} />
            <div className="grid grid-cols-2 gap-3">
              <ScField label="City" value={form.city} onChange={set('city')} />
              <ScField label="Pincode" value={form.pincode} onChange={set('pincode')} placeholder="6 digits" />
            </div>
            <ScField label="Google Maps link (optional)" value={form.mapsUrl} onChange={set('mapsUrl')} placeholder="https://maps.app.goo.gl/…" />
          </ScSection>

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
              <ScField label="Opening time" value={form.openTime} onChange={set('openTime')} type="time" />
              <ScField label="Closing time" value={form.closeTime} onChange={set('closeTime')} type="time" />
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
            <p className="text-[11px] text-text-muted">
              These are the tiers a service prices against and a customer can
              book for.
            </p>

            {/* Values from an earlier, longer checklist that no service could
                ever price. Shown so they can be cleared, not offered again. */}
            {legacyVehicleTypes(vehicleTypes).length > 0 && (
              <>
                <p className="text-[11px] text-brand-red">
                  No longer offered — tap to remove:
                </p>
                <div className="flex flex-wrap gap-2">
                  {legacyVehicleTypes(vehicleTypes).map((v) => (
                    <Chip
                      key={v}
                      label={`${v} ✕`}
                      selected
                      onClick={() => setVehicleTypes((list) => toggle(list, v))}
                    />
                  ))}
                </div>
              </>
            )}
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

          <ScSection title="Services offered">
            {services.length === 0 ? (
              <p className="text-[12px] text-text-muted">No services added yet.</p>
            ) : (
              <div className="space-y-3">
                {services.map((s, i) => (
                  <div key={s.id ?? `new-${i}`} className="space-y-2 rounded-[10px] border border-border p-3">
                    <div className="flex items-end gap-2">
                      <ScInput
                        value={s.name}
                        placeholder="Service name (e.g. Foam wash)"
                        onChange={(e) => updateService(i, { name: e.target.value })}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeService(i)}
                        className="rounded-[8px] px-2 py-2.5 text-[12px] text-brand-red transition-colors hover:bg-accent-muted"
                      >
                        Remove
                      </button>
                    </div>
                    <ScTextarea
                      value={s.description}
                      placeholder="Description (optional)"
                      rows={2}
                      onChange={(e) => updateService(i, { description: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <ScSelect
                        value={s.category}
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
                        onChange={(e) => updateService(i, { pricingType: e.target.value as PricingType })}
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
                        onChange={(e) => updateService(i, { price: e.target.value })}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <ScInput
                        value={s.durationValue}
                        type="number"
                        min={0}
                        placeholder="Duration (optional)"
                        onChange={(e) => updateService(i, { durationValue: e.target.value })}
                      />
                      <ScSelect
                        value={s.durationUnit}
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
                          placeholder="Hatch ₹"
                          onChange={(e) => updateService(i, { priceHatchback: e.target.value })}
                        />
                        <ScInput
                          value={s.priceSedan}
                          type="number"
                          min={0}
                          placeholder="Sedan ₹"
                          onChange={(e) => updateService(i, { priceSedan: e.target.value })}
                        />
                        <ScInput
                          value={s.priceSuv}
                          type="number"
                          min={0}
                          placeholder="SUV ₹"
                          onChange={(e) => updateService(i, { priceSuv: e.target.value })}
                        />
                      </div>
                    )}

                    {/* Images attach to a saved service row, so a brand-new row
                        gets the hint instead of a picker. */}
                    {s.id ? (
                      <div className="flex items-center gap-2">
                        {s.images.map((image) => (
                          <div
                            key={image.id}
                            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] bg-surface"
                          >
                            <Image
                              src={image.url}
                              alt={s.name}
                              fill
                              sizes="56px"
                              className="object-cover"
                            />
                            <button
                              type="button"
                              disabled={mediaBusy === `service-${s.id}`}
                              onClick={() =>
                                handleRemoveServiceImage(s.id as string, image.id)
                              }
                              title="Remove image"
                              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-1 text-white disabled:opacity-50"
                            >
                              <IconTrash size={11} />
                            </button>
                          </div>
                        ))}

                        {s.images.length < MAX_IMAGES_PER_SERVICE && (
                          <button
                            type="button"
                            disabled={mediaBusy === `service-${s.id}`}
                            onClick={() => pickServiceImage(s.id as string)}
                            className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[8px] border border-dashed border-border text-text-muted disabled:opacity-50"
                          >
                            <IconPhotoPlus size={16} />
                            <span className="text-[9px]">
                              {mediaBusy === `service-${s.id}` ? '…' : 'Add'}
                            </span>
                          </button>
                        )}

                        <p className="text-[10px] text-text-muted">
                          {s.images.length}/{MAX_IMAGES_PER_SERVICE} images
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-text-muted">
                        Save this vendor to add images to the service.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <ScButton
              fullWidth={false}
              variant="secondary"
              onClick={() => setServices((prev) => [...prev, emptyService()])}
              className="px-3 py-2 text-[12px]"
            >
              + Add service
            </ScButton>
            <p className="text-[11px] text-text-muted">
              Each service needs a name and price. Duration is optional — leave it
              blank to use one booking slot. Removing a service hides it from
              customers; past bookings are preserved.
            </p>
          </ScSection>

          {error && <p className="text-[13px] text-brand-red">{error}</p>}

          <ScButton disabled={!isValid || saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Save changes'}
          </ScButton>
        </div>
      )}
    </div>
  )
}
