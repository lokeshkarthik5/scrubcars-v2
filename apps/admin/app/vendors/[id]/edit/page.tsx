'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  IconBuildingStore,
  IconPhotoPlus,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import {
  LocationPicker,
  type PickedLocation,
} from '@repo/ui/features/location-picker'
import { Chip } from '@repo/ui/sc/chip'
import { ScField, ScInput, ScTextarea } from '@repo/ui/sc/input'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ScSection } from '@repo/ui/sc/section'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/sc/tabs'
import { ScSelect } from '@repo/ui/sc/select'
import { ApiError } from '@repo/core/api/client'
import {
  deleteAdminServiceImage,
  deleteAdminVendorLogo,
  deleteAdminVendorPhoto,
  getAdminVendor,
  pauseAdminVendor,
  resumeAdminVendor,
  updateAdminVendor,
  uploadAdminServiceImage,
  uploadAdminVendorLogo,
  uploadAdminVendorPhoto,
  type AdminPhoto,
  type AdminVendorDetail,
  type AdminWorkingDay,
} from '@repo/core/api/admin'
import { SERVICE_CATEGORY_OPTIONS } from '@repo/core/categories'
import { DOORSTEP_RADIUS_PLACEHOLDER } from '@repo/core/doorstep'
import {
  legacyVehicleTypes,
  VENDOR_VEHICLE_TYPE_OPTIONS,
} from '@repo/core/vehicles'
import type { ServiceCategory } from '@repo/core/types'
import { APP_TIMEZONE, cn } from '@repo/core/utils'
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

/**
 * The garage's week as the form edits it: all seven days, times as HH:MM. A
 * day with no stored row is shown closed — the slot generator reads it that
 * way too — with placeholder times for when someone opens it.
 */
function toWeekForm(rows: AdminWorkingDay[]): AdminWorkingDay[] {
  const byDay = new Map(rows.map((row) => [row.dayOfWeek, row]))
  return DAYS.map((_, dayOfWeek) => {
    const row = byDay.get(dayOfWeek)
    return row
      ? {
          dayOfWeek,
          openTime: row.openTime.slice(0, 5),
          closeTime: row.closeTime.slice(0, 5),
          isClosed: row.isClosed,
        }
      : { dayOfWeek, openTime: '09:00', closeTime: '18:00', isClosed: true }
  })
}

/** "2026-10-20" → "Tue 20 Oct" — a calendar day, so read in UTC. */
function formatDay(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
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
    doorstepRadiusKm: '',
    notes: '',
  })
  const [pickup, setPickup] = useState<'yes' | 'nearby' | 'no' | ''>('')
  const [pin, setPin] = useState<PickedLocation | null>(null)
  const [confirming, setConfirming] = useState(false)
  // Whether the garage arrived here already pinned, so the UI can say who put
  // it there and whether anyone has ever checked it.
  const [geoSource, setGeoSource] = useState<string>('unset')
  const [geoConfirmedAt, setGeoConfirmedAt] = useState<string | null>(null)
  const [dropinEnabled, setDropinEnabled] = useState(true)
  const [doorstepEnabled, setDoorstepEnabled] = useState(false)
  const [slotIntervalMins, setSlotIntervalMins] = useState<30 | 45 | 60>(30)
  // The real per-day schedule. Sent back only once the admin has changed a
  // day: saving any other field used to rewrite every day to one schedule,
  // which wiped a garage's shorter Saturday without anyone touching it.
  const [hours, setHours] = useState<AdminWorkingDay[]>(() => toWeekForm([]))
  const [hoursChanged, setHoursChanged] = useState(false)
  const [pausedAt, setPausedAt] = useState<string | null>(null)
  const [pausedReason, setPausedReason] = useState<string | null>(null)
  const [pauseReasonInput, setPauseReasonInput] = useState('')
  const [pausing, setPausing] = useState(false)
  const [closures, setClosures] = useState<AdminVendorDetail['closures']>([])
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

  // No setLoading/setError before the first await: this runs from an effect on
  // mount, where `loading` already starts true and `error` already starts
  // empty. Setting them here synchronously would be a cascading render for no
  // change in what the user sees. Nothing else calls load() — a route param
  // change remounts the page.
  const load = useCallback(async () => {
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
        doorstepRadiusKm:
          v.doorstepRadiusKm != null ? String(v.doorstepRadiusKm) : '',
        notes: v.notes ?? '',
      })
      setPickup(v.pickup ?? '')
      setGeoSource(v.geoSource)
      setGeoConfirmedAt(v.geoConfirmedAt)
      if (v.lat != null && v.lng != null) {
        setPin({
          lat: v.lat,
          lng: v.lng,
          address: v.address,
          city: v.city,
          pincode: v.pincode,
          // The picker only ever reports how the *user* placed a pin; an
          // already-stored one is described by geoSource instead.
          source: 'map_pin',
        })
      }
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

      setHours(toWeekForm(v.workingHours))
      setPausedAt(v.bookingsPausedAt ?? null)
      setPausedReason(v.bookingsPausedReason ?? null)
      setClosures(v.closures ?? [])
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/login')
        return
      }
      setError('Failed to load vendor')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  // load() hydrates 16 pieces of form state from the fetched vendor. The rule's
  // fix is to lift the fetch out and initialise a child form component from
  // props, which means splitting this 1000-line file — worth doing, but not as
  // a drive-by. Every setState in load() already runs after the await, so the
  // cascading render the rule warns about is one commit on load, not a loop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        router.replace('/login')
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

  const updateDay = (dayOfWeek: number, patch: Partial<AdminWorkingDay>) => {
    setHours((week) =>
      week.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day))
    )
    setHoursChanged(true)
  }

  /**
   * Pause or resume new bookings straight away, like confirming a pin: it
   * changes what customers can do the moment it lands, so it does not wait
   * for "Save changes" — and "Save changes" never touches it.
   */
  const setPaused = async (pause: boolean) => {
    setPausing(true)
    setError('')
    try {
      const updated = pause
        ? await pauseAdminVendor(id, pauseReasonInput.trim() || undefined)
        : await resumeAdminVendor(id)
      setPausedAt(updated.bookingsPausedAt ?? null)
      setPausedReason(pause ? pauseReasonInput.trim() || null : null)
      setPauseReasonInput('')
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/login')
        return
      }
      setError(err instanceof Error ? err.message : 'Could not change bookings')
    } finally {
      setPausing(false)
    }
  }

  const isValid =
    form.ownerName &&
    /^\d{10}$/.test(form.ownerPhone) &&
    form.businessName &&
    /^\d{10}$/.test(form.phone) &&
    form.address &&
    form.city &&
    /^\d{6}$/.test(form.pincode)

  const num = (v: string) => (v.trim() === '' ? null : Number(v))

  /**
   * Signs off the pin currently on the map.
   *
   * Sends the coordinates alongside the flag, because the pin may only exist in
   * this page's state — placed from a pasted link or dragged — and never saved.
   * Confirming without them asked the server to vouch for a location it did not
   * have, which it rightly refused.
   *
   * Still sent on its own rather than folded into "Save changes": the form
   * round-trips every field, so bundling it would mean any save silently
   * asserted the location had been checked.
   */
  const confirmLocation = async () => {
    if (!pin) return

    setConfirming(true)
    setError('')
    try {
      const updated = await updateAdminVendor(id, {
        lat: pin.lat,
        lng: pin.lng,
        confirmLocation: true,
      })
      setGeoConfirmedAt(updated.geoConfirmedAt)
      setGeoSource(updated.geoSource)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm location')
    } finally {
      setConfirming(false)
    }
  }

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
        doorstepRadiusKm: num(form.doorstepRadiusKm),
        lat: pin?.lat,
        lng: pin?.lng,
        dropinEnabled,
        doorstepEnabled,
        slotIntervalMins,
        bays: num(form.bays),
        jobsPerDay: num(form.jobsPerDay),
        vehicleTypes,
        // Only when a day was actually changed; see `hoursChanged`.
        ...(hoursChanged && {
          workingHours: hours.map((day) => ({
            ...day,
            openTime: `${day.openTime}:00`,
            closeTime: `${day.closeTime}:00`,
          })),
        }),
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
      router.replace('/vendors')
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/login')
        return
      }
      setError(err instanceof ApiError ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-5">
      <PageHeader title="Edit vendor" backHref="/vendors" />

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
        <SkeletonList count={3} itemClassName="h-40" />
      ) : (
        <div className="space-y-4">
          {/* Same four-tab shape as the vendor settings screen, so the admin
              editing a garage and the owner editing it see the same structure.
              Grouped by subject rather than by form length. */}
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

            {/* Team management came from main; it sits in Details, immediately
                before the media section, which is where main placed it. */}
            <VendorTeamSection vendorId={id} />

            <ScSection title="Logo & photos">
              <p className="text-[11px] text-text-muted">
                Saved immediately — these do not wait for “Save changes”. JPEG,
                PNG or WebP, up to 5 MB each.
              </p>

              <div className="flex items-center gap-4">
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-surface-elevated">
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
                    className="min-h-11 px-3.5 py-2 text-[12px]"
                  >
                    {mediaBusy === 'logo'
                      ? 'Working…'
                      : logoUrl
                        ? 'Change logo'
                        : 'Add logo'}
                  </ScButton>
                  {logoUrl && (
                    // A quiet text button: red on this page is Save changes.
                    <button
                      type="button"
                      disabled={mediaBusy === 'logo'}
                      onClick={handleRemoveLogo}
                      className="min-h-11 text-left text-[12px] font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline disabled:opacity-50"
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
                      aria-label="Delete photo"
                      title="Delete photo"
                      // A 44px target with the small disc drawn inside it, as
                      // on the garage's own Photos page: deleting is immediate.
                      className="absolute right-0 top-0 flex size-11 items-center justify-center text-white disabled:opacity-50"
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-black/60 transition-colors hover:bg-black/80">
                        <IconTrash size={13} aria-hidden="true" />
                      </span>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={mediaBusy === 'photos'}
                  onClick={() => photoInputRef.current?.click()}
                  aria-label="Add photos"
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border text-text-muted transition-colors hover:border-text-secondary hover:text-text-secondary disabled:opacity-50"
                >
                  <IconPhotoPlus size={18} />
                  <span className="text-[10px]">
                    {mediaBusy === 'photos' ? 'Uploading…' : 'Add'}
                  </span>
                </button>
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
                {/* Verification is the one moment a human already looks at this
                    garage, so it is the natural place to sanity-check the pin.
                    The Maps link above is the cross-check: does it land here? */}
                <p className="text-[11px] text-text-muted">
                  {geoConfirmedAt
                    ? `Confirmed ${new Date(geoConfirmedAt).toLocaleDateString('en-IN')}`
                    : geoSource === 'unset'
                      ? 'Not set — this garage cannot be found by distance until it is pinned.'
                      : 'Set by the vendor, never confirmed. Check it against the Maps link, then confirm.'}
                </p>
                <LocationPicker
                  value={pin ? { lat: pin.lat, lng: pin.lng } : null}
                  onChange={setPin}
                  expectedCity={form.city}
                />

                {/* Moving the pin confirms it implicitly — dragging a marker onto
                    a garage *is* the check. This is for the commoner case where
                    the pin is already right and only needs signing off. */}
                {!geoConfirmedAt && pin && (
                  <ScButton
                    variant="secondary"
                    disabled={confirming}
                    onClick={confirmLocation}
                  >
                    {confirming ? 'Confirming…' : 'Confirm this pin is correct'}
                  </ScButton>
                )}
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
                <ScField label="Doorstep travel radius km (optional)" value={form.doorstepRadiusKm} onChange={set('doorstepRadiusKm')} type="number" placeholder={DOORSTEP_RADIUS_PLACEHOLDER} />
                <div className="flex items-end gap-4 pb-1">
                  <ScCheckbox label="Drop-in" checked={dropinEnabled} onChange={setDropinEnabled} />
                  <ScCheckbox label="Doorstep" checked={doorstepEnabled} onChange={setDoorstepEnabled} />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-text-secondary">Working hours</span>
                {/* The garage's own week, day by day — the same rows the owner
                    edits in their Settings. Left alone unless changed here. */}
                <div className="flex flex-col gap-2">
                  {hours.map((day) => (
                    <div key={day.dayOfWeek} className="flex items-center gap-2">
                      <span
                        className={cn(
                          'w-9 shrink-0 text-[13px] font-medium',
                          day.isClosed ? 'text-text-muted' : 'text-text-primary'
                        )}
                      >
                        {DAYS[day.dayOfWeek]}
                      </span>
                      <input
                        type="time"
                        aria-label={`${DAYS[day.dayOfWeek]} opening time`}
                        value={day.openTime}
                        disabled={day.isClosed}
                        onChange={(e) => updateDay(day.dayOfWeek, { openTime: e.target.value })}
                        className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-2 font-numeric text-[13px] text-text-primary outline-none transition-colors focus:border-text-secondary disabled:opacity-40"
                      />
                      <input
                        type="time"
                        aria-label={`${DAYS[day.dayOfWeek]} closing time`}
                        value={day.closeTime}
                        disabled={day.isClosed}
                        onChange={(e) => updateDay(day.dayOfWeek, { closeTime: e.target.value })}
                        className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-2 font-numeric text-[13px] text-text-primary outline-none transition-colors focus:border-text-secondary disabled:opacity-40"
                      />
                      {/* The same pressed pill as the garage's own Settings: a
                          closed day is raised onto graphite. */}
                      <button
                        type="button"
                        aria-label={`${DAYS[day.dayOfWeek]} closed all day`}
                        aria-pressed={day.isClosed}
                        onClick={() => updateDay(day.dayOfWeek, { isClosed: !day.isClosed })}
                        className={cn(
                          'min-h-11 w-[68px] shrink-0 rounded-[10px] border text-[12px] font-medium transition-colors',
                          day.isClosed
                            ? 'border-text-secondary bg-surface-elevated text-text-primary'
                            : 'border-border text-text-secondary hover:text-text-primary'
                        )}
                      >
                        {day.isClosed ? 'Closed' : 'Open'}
                      </button>
                    </div>
                  ))}
                </div>
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

            <ScSection title="Bookings">
              {/* Pausing works the moment it is pressed — see setPaused. */}
              {pausedAt ? (
                <>
                  <p className="text-[12px] text-text-primary">
                    Paused since{' '}
                    <span className="font-numeric font-medium">
                      {new Date(pausedAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: APP_TIMEZONE,
                      })}
                    </span>
                    . Hidden from customers; existing bookings carry on.
                  </p>
                  {pausedReason && (
                    <p className="text-[12px] text-text-secondary">
                      Customers see: “{pausedReason}”
                    </p>
                  )}
                  <ScButton
                    variant="secondary"
                    disabled={pausing}
                    onClick={() => setPaused(false)}
                  >
                    {pausing ? 'Working…' : 'Resume bookings'}
                  </ScButton>
                </>
              ) : (
                <>
                  <p className="text-[12px] text-text-secondary">
                    Taking bookings. Pausing hides the garage from customers and
                    refuses checkout; bookings it already has are not touched.
                  </p>
                  <ScField
                    label="Reason (optional, customers see this)"
                    value={pauseReasonInput}
                    onChange={setPauseReasonInput}
                    maxLength={200}
                  />
                  <ScButton
                    variant="secondary"
                    disabled={pausing}
                    onClick={() => setPaused(true)}
                  >
                    {pausing ? 'Working…' : 'Pause new bookings'}
                  </ScButton>
                </>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-text-secondary">
                  Upcoming holidays
                </span>
                {closures.length === 0 ? (
                  <p className="text-[12px] text-text-muted">None set.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-[12px] text-text-primary">
                    {closures.map((closure) => (
                      <li key={closure.id}>
                        <span className="font-numeric font-medium">{formatDay(closure.date)}</span>
                        {closure.reason && (
                          <span className="text-text-secondary"> · {closure.reason}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-text-muted">
                  The garage sets these in its own Settings.
                </p>
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
                  <p className="text-[11px] text-warning">
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
            </TabsContent>

            <TabsContent value="services">
            <ScSection title="Services offered">
              {services.length === 0 ? (
                <p className="text-[12px] text-text-muted">No services added yet.</p>
              ) : (
                <div className="space-y-3">
                  {services.map((s, i) => (
                    <div key={s.id ?? `new-${i}`} className="space-y-2 rounded-[12px] border border-border p-3">
                      <div className="flex items-end gap-2">
                        {/* The wrapper takes the row's width: ScInput's className
                            styles the field inside, not the box around it. */}
                        <div className="min-w-0 flex-1">
                          <ScInput
                            value={s.name}
                            aria-label={`Service ${i + 1} name`}
                            placeholder="Service name (e.g. Foam wash)"
                            onChange={(e) => updateService(i, { name: e.target.value })}
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
                          aria-label={`Service ${i + 1} price in rupees`}
                          className="font-numeric"
                          onChange={(e) => updateService(i, { price: e.target.value })}
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
                            className="font-numeric"
                            placeholder="Hatch ₹"
                            onChange={(e) => updateService(i, { priceHatchback: e.target.value })}
                          />
                          <ScInput
                            value={s.priceSedan}
                            type="number"
                            min={0}
                            aria-label={`Service ${i + 1} sedan price in rupees`}
                            className="font-numeric"
                            placeholder="Sedan ₹"
                            onChange={(e) => updateService(i, { priceSedan: e.target.value })}
                          />
                          <ScInput
                            value={s.priceSuv}
                            type="number"
                            min={0}
                            aria-label={`Service ${i + 1} SUV price in rupees`}
                            className="font-numeric"
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
                            <div key={image.id} className="relative h-14 w-14 shrink-0">
                              <div className="absolute inset-0 overflow-hidden rounded-[8px] bg-surface">
                                <Image
                                  src={image.url}
                                  alt={s.name}
                                  fill
                                  sizes="56px"
                                  className="object-cover"
                                />
                              </div>
                              {/* A full 44px target hanging off the corner, as
                                  on the garage's Services page, so it covers
                                  less of a thumbnail this small. */}
                              <button
                                type="button"
                                disabled={mediaBusy === `service-${s.id}`}
                                onClick={() =>
                                  handleRemoveServiceImage(s.id as string, image.id)
                                }
                                aria-label={`Remove image of ${s.name}`}
                                title="Remove image"
                                className="absolute -right-2.5 -top-2.5 flex size-11 items-center justify-center text-white disabled:opacity-50"
                              >
                                <span className="flex size-6 items-center justify-center rounded-full bg-black/70 transition-colors hover:bg-black/85">
                                  <IconTrash size={12} aria-hidden="true" />
                                </span>
                              </button>
                            </div>
                          ))}

                          {s.images.length < MAX_IMAGES_PER_SERVICE && (
                            <button
                              type="button"
                              disabled={mediaBusy === `service-${s.id}`}
                              onClick={() => pickServiceImage(s.id as string)}
                              aria-label={`Add an image of ${s.name}`}
                              className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[8px] border border-dashed border-border text-text-muted disabled:opacity-50"
                            >
                              <IconPhotoPlus size={16} />
                              <span className="text-[9px]">
                                {mediaBusy === `service-${s.id}` ? '…' : 'Add'}
                              </span>
                            </button>
                          )}

                          <p className="text-[11px] text-text-muted">
                            <span className="font-numeric">
                              {s.images.length}/{MAX_IMAGES_PER_SERVICE}
                            </span>{' '}
                            images
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-text-muted">
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
                className="flex min-h-11 items-center gap-1.5 px-3.5 py-2 text-[12px]"
              >
                <IconPlus size={14} aria-hidden="true" /> Add service
              </ScButton>
              <p className="text-[11px] text-text-muted">
                Each service needs a name and price. Duration is optional — leave it
                blank to use one booking slot. Removing a service hides it from
                customers; past bookings are preserved.
              </p>
            </ScSection>
            </TabsContent>
          </Tabs>

          {/* Amber, as errors are: red on this page is Save changes. */}
          {error && (
            <p role="alert" className="text-[13px] text-error">
              {error}
            </p>
          )}

          <ScButton disabled={!isValid || saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Save changes'}
          </ScButton>
        </div>
      )}
    </div>
  )
}
