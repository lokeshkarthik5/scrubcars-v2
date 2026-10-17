'use client'

import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import {
  IconBuildingStore,
  IconChevronDown,
  IconEyeOff,
  IconPhotoPlus,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import {
  LocationPicker,
  type PickedLocation,
} from '@repo/ui/features/location-picker'
import { Chip } from '@repo/ui/sc/chip'
import { ScField, ScTextarea } from '@repo/ui/sc/input'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ScSection } from '@repo/ui/sc/section'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/sc/tabs'
import { ApiError } from '@repo/core/api/client'
import {
  deleteAdminVendorLogo,
  deleteAdminVendorPhoto,
  getAdminVendor,
  listAdminHiddenServices,
  pauseAdminVendor,
  resumeAdminVendor,
  setAdminServiceActive,
  updateAdminVendor,
  uploadAdminVendorLogo,
  uploadAdminVendorPhoto,
  type AdminPhoto,
  type AdminService,
  type AdminVendorDetail,
  type AdminWorkingDay,
} from '@repo/core/api/admin'
import { useInvalidateAdminVendors } from '@repo/core/api/hooks/use-admin-vendors'
import {
  legacyVehicleTypes,
  VENDOR_VEHICLE_TYPE_OPTIONS,
} from '@repo/core/vehicles'
import type { ServiceMedia } from '@repo/core/types'
import { APP_TIMEZONE, cn } from '@repo/core/utils'
import { LiveBookingModeCard } from '@/components/booking-mode-card'
import { PayoutAccountSection } from '@/components/payout-account-section'
import { SaveBar } from '@/components/save-bar'
import { RestoreDialog } from '@/components/vendor-bin-dialogs'
import { formatWhen } from '@/lib/bookings'
import { ServicesEditor } from '@/components/services-editor'
import { useWarnBeforeLeaving } from '@/hooks/use-warn-before-leaving'
import {
  EDIT_TABS,
  EDIT_TAB_LABELS,
  dirtyTabs,
  garageFieldsProblem,
  parseEditTab,
  safeBackHref,
  unsavedChangesLine,
  type EditTab,
  type TabValues,
} from '@/lib/garage-edit'
import {
  toServicePayload,
  toServiceRow,
  type ServiceRow,
} from '@/lib/service-editor'
import {
  rowsToSave,
  servicesSaveBlock,
  showAgainWarning,
  storedPriceSummary,
} from '@/lib/service-rows'
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

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

// Shared guard for every media picker on this page.
function rejectFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'Unsupported type (use JPEG, PNG or WebP)'
  }
  if (file.size > MAX_IMAGE_BYTES) return 'Image too large (max 5 MB)'
  return null
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

type VendorStatus = 'pending' | 'active' | 'suspended' | 'archived'

/**
 * Everything "Save changes" saves, as the page holds it. Kept twice: as
 * loaded (or last saved) and as edited, and the difference is what the save
 * bar reports and Discard puts back. How customers book, the pin's
 * confirmation, Pause, team, media and Hide all save the moment they change,
 * so none of them is in here.
 */
interface GarageDraft {
  form: {
    ownerName: string
    ownerPhone: string
    businessName: string
    phone: string
    address: string
    city: string
    pincode: string
    email: string
    whatsapp: string
    yearsInOperation: string
    mapsUrl: string
    bays: string
    jobsPerDay: string
    pickupRadiusKm: string
    notes: string
  }
  pickup: 'yes' | 'nearby' | 'no' | ''
  pin: PickedLocation | null
  slotIntervalMins: 30 | 45 | 60
  // The real per-day schedule. Sent back only when a day differs from what
  // was loaded: saving any other field used to rewrite every day to one
  // schedule, which wiped a garage's shorter Saturday without anyone
  // touching it.
  hours: AdminWorkingDay[]
  vehicleTypes: string[]
  status: VendorStatus
  isVerified: boolean
  services: ServiceRow[]
}

function toDraft(v: AdminVendorDetail): GarageDraft {
  return {
    form: {
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
      notes: v.notes ?? '',
    },
    pickup: v.pickup ?? '',
    pin:
      v.lat != null && v.lng != null
        ? {
            lat: v.lat,
            lng: v.lng,
            address: v.address,
            city: v.city,
            pincode: v.pincode,
            // The picker only ever reports how the *user* placed a pin; an
            // already-stored one is described by geoSource instead.
            source: 'map_pin',
          }
        : null,
    slotIntervalMins: (v.slotIntervalMins as 30 | 45 | 60) ?? 30,
    hours: toWeekForm(v.workingHours),
    vehicleTypes: v.vehicleTypes ?? [],
    status: v.status as VendorStatus,
    isVerified: v.isVerified,
    services: v.services.map(toServiceRow),
  }
}

const trimmed = (value: string) => value.trim()

/**
 * Each tab's values as a save would send them, so a change that sends
 * nothing new (a space typed and deleted, a price switched to Per vehicle
 * and back) is not reported as unsaved.
 */
function tabValues(draft: GarageDraft): TabValues {
  const { form } = draft
  return {
    details: {
      ownerName: trimmed(form.ownerName),
      ownerPhone: trimmed(form.ownerPhone),
      businessName: trimmed(form.businessName),
      phone: trimmed(form.phone),
      whatsapp: trimmed(form.whatsapp),
      email: trimmed(form.email),
      yearsInOperation: trimmed(form.yearsInOperation),
      status: draft.status,
      isVerified: draft.isVerified,
      notes: trimmed(form.notes),
    },
    location: {
      address: trimmed(form.address),
      city: trimmed(form.city),
      pincode: trimmed(form.pincode),
      mapsUrl: trimmed(form.mapsUrl),
      lat: draft.pin?.lat ?? null,
      lng: draft.pin?.lng ?? null,
    },
    operations: {
      pickup: draft.pickup,
      pickupRadiusKm: trimmed(form.pickupRadiusKm),
      hours: draft.hours,
      slotIntervalMins: draft.slotIntervalMins,
      bays: trimmed(form.bays),
      jobsPerDay: trimmed(form.jobsPerDay),
      vehicleTypes: draft.vehicleTypes,
    },
    services: rowsToSave(draft.services).map(toServicePayload),
  }
}

/** Where focus goes after a hide or a show: see focusAfterSwitch. */
type FocusAfterSwitch = { to: 'hidden-toggle' } | { to: 'row'; id: string }

export default function EditVendorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = use(params)
  // ?tab= opens a tab (a link to "add the missing prices" can land on
  // Services), and ?back= is where the header's arrow returns to. Both are
  // checked against an allow-list before use; see lib/garage-edit.ts.
  const query = use(searchParams)
  const backHref = safeBackHref(query.back)
  const router = useRouter()
  // Every change saved from here — the form, the pin, media, pause, a
  // service hidden or shown, how customers book — marks the garage list
  // stale, so Back lands on a list whose checklist and Live count already
  // show it.
  const markListStale = useInvalidateAdminVendors()

  const [tab, setTab] = useState<EditTab>(() => parseEditTab(query.tab))
  // As loaded or last saved, and as edited. Null until the first load.
  const [saved, setSaved] = useState<GarageDraft | null>(null)
  const [draft, setDraft] = useState<GarageDraft | null>(null)
  // How customers book, as loaded: the card above the tabs saves it on its
  // own (LiveBookingModeCard) and reads these once.
  const [bookingMode, setBookingMode] = useState<
    Pick<
      AdminVendorDetail,
      'dropinEnabled' | 'doorstepEnabled' | 'doorstepRadiusKm' | 'hasDoorstepArea'
    > | null
  >(null)
  const [confirming, setConfirming] = useState(false)
  // Whether the garage arrived here already pinned, so the UI can say who put
  // it there and whether anyone has ever checked it.
  const [geoSource, setGeoSource] = useState<string>('unset')
  const [geoConfirmedAt, setGeoConfirmedAt] = useState<string | null>(null)
  const [pausedAt, setPausedAt] = useState<string | null>(null)
  const [pausedReason, setPausedReason] = useState<string | null>(null)
  const [pauseReasonInput, setPauseReasonInput] = useState('')
  const [pausing, setPausing] = useState(false)
  const [closures, setClosures] = useState<AdminVendorDetail['closures']>([])
  // In the Bin: the page opens read-only with a banner and Restore, since the
  // server refuses every other change to it (409 VENDOR_IN_BIN).
  const [bin, setBin] = useState<Pick<
    AdminVendorDetail,
    'deletedAt' | 'deletedByName' | 'deletedReason'
  > | null>(null)
  const [restoring, setRestoring] = useState(false)
  // Rows with their ⋯ open, by key. Held here so Show again can open the
  // row it brings back.
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set())
  // Hidden services, and hiding or showing one, save immediately like Pause:
  // they are the garage's switch, not part of the form "Save changes" sends.
  const [hiddenServices, setHiddenServices] = useState<AdminService[]>([])
  const [hiddenLoadFailed, setHiddenLoadFailed] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [serviceBusyId, setServiceBusyId] = useState<string | null>(null)
  // Keyed by service id, so a refusal sits on the row it is about.
  const [serviceErrors, setServiceErrors] = useState<Record<string, string>>({})
  // What the last Hide or Show again did, read out politely: the row the
  // focused button was on has gone, so without it a keyboard or screen-reader
  // admin is left on <body> with no word that anything happened.
  const [serviceNotice, setServiceNotice] = useState('')
  // Where focus goes once a hide or show has rendered. A fresh object each
  // time, so the same target twice still moves focus twice.
  const [focusAfterSwitch, setFocusAfterSwitch] = useState<FocusAfterSwitch | null>(null)
  const hiddenToggleRef = useRef<HTMLButtonElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // A save landed but the reload after it failed, so new services have no id
  // here yet: saving again would add them a second time. Held until a reload.
  const [mustReload, setMustReload] = useState(false)
  // "Write with AI" or "Fill all" is running in the services editor. Save and
  // Discard wait for it: either would swap the rows out from under the text
  // still arriving, which would then land on the wrong draft or nowhere.
  const [describing, setDescribing] = useState(false)
  // Bumped by Discard and by a reload after Save, to remount what holds its
  // own copy of a saved value: the map (it reads its pin once) and the
  // services editor (its notes about the rows it filled).
  const [resetCount, setResetCount] = useState(0)

  // Media is saved the moment it is picked, not on "Save changes" — an upload
  // has already happened by then, and holding the registration until submit
  // would strand the object in R2 if the admin navigates away.
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [photos, setPhotos] = useState<AdminPhoto[]>([])
  const [mediaBusy, setMediaBusy] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const toLogin = useCallback(() => router.replace('/login'), [router])

  const dirty = saved && draft ? dirtyTabs(tabValues(saved), tabValues(draft)) : []
  useWarnBeforeLeaving(dirty.length > 0)

  /** A change to the draft. Before the first load there is nothing to change. */
  const patch = (change: Partial<GarageDraft>) =>
    setDraft((prev) => (prev ? { ...prev, ...change } : prev))

  const set = (key: keyof GarageDraft['form']) => (v: string) =>
    setDraft((prev) => (prev ? { ...prev, form: { ...prev.form, [key]: v } } : prev))

  const setServices: Dispatch<SetStateAction<ServiceRow[]>> = useCallback(
    (action) =>
      setDraft((prev) =>
        prev
          ? { ...prev, services: typeof action === 'function' ? action(prev.services) : action }
          : prev
      ),
    []
  )

  /**
   * A change the server already has (a hide, a show, a photo), made to the
   * saved copy and the draft alike, so it neither shows as unsaved nor comes
   * back on Discard.
   */
  const applyToBoth = (change: (rows: ServiceRow[]) => ServiceRow[]) => {
    setServices(change)
    setSaved((prev) => (prev ? { ...prev, services: change(prev.services) } : prev))
  }

  // Every row is sent; none is filtered out. The save is the garage's full
  // list and the server hides any live service missing from it, so a row
  // dropped here for an incomplete price used to vanish from customers with
  // no message. A row that is not ready says so and holds the save.
  const servicesBlock = draft ? servicesSaveBlock(draft.services) : null
  const fieldsProblem = draft ? garageFieldsProblem(draft.form) : null
  const saveBlock = mustReload
    ? 'Saved. Reload the page to keep editing.'
    : (fieldsProblem ?? (servicesBlock ? `${servicesBlock} (Services)` : null))
  // Which tab each problem is on, for the amber dot on its trigger.
  const problemTab: EditTab | null = fieldsProblem
    ? fieldsProblem.endsWith('(Location)')
      ? 'location'
      : 'details'
    : servicesBlock
      ? 'services'
      : null

  // No setLoading/setError before the first await: this runs from an effect
  // on mount, where `loading` already starts true and `error` already starts
  // empty. It runs again after each save, to pick up new service ids (their
  // photos need one) and the server's own ordering. Says whether it worked.
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const [v, hidden] = await Promise.all([
        getAdminVendor(id),
        // On its own catch: a garage whose hidden list fails to load can still
        // be edited, and the Services tab says the list is missing.
        listAdminHiddenServices(id).catch(() => null),
      ])
      const loaded = toDraft(v)
      setSaved(loaded)
      setDraft(loaded)
      setBookingMode((prev) =>
        prev ?? {
          dropinEnabled: v.dropinEnabled,
          doorstepEnabled: v.doorstepEnabled,
          doorstepRadiusKm: v.doorstepRadiusKm,
          hasDoorstepArea: v.hasDoorstepArea,
        }
      )
      setGeoSource(v.geoSource)
      setGeoConfirmedAt(v.geoConfirmedAt)
      setLogoUrl(v.logoUrl)
      setPhotos(v.photos ?? [])
      if (hidden) {
        setHiddenServices(hidden)
        setHiddenLoadFailed(false)
        // Every service hidden — the state the old save bug could leave a
        // garage in — so the list that matters is open, not behind a toggle.
        setShowHidden((open) => open || (v.services.length === 0 && hidden.length > 0))
      } else {
        setHiddenLoadFailed(true)
      }
      setPausedAt(v.bookingsPausedAt ?? null)
      setPausedReason(v.bookingsPausedReason ?? null)
      setClosures(v.closures ?? [])
      setBin(
        v.deletedAt
          ? { deletedAt: v.deletedAt, deletedByName: v.deletedByName ?? null, deletedReason: v.deletedReason ?? null }
          : null
      )
      return true
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/login')
        return false
      }
      setError('Failed to load vendor')
      return false
    } finally {
      setLoading(false)
    }
  }, [id, router])

  // load() hydrates the page from the fetched vendor. Every setState in it
  // runs after the await, so the cascading render the rule warns about is
  // one commit on load, not a loop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  useEffect(() => {
    if (!focusAfterSwitch) return
    if (focusAfterSwitch.to === 'hidden-toggle') {
      hiddenToggleRef.current?.focus()
      return
    }
    // A service shown again is added at the end of its group, which on a
    // phone is off-screen. Land on what it still needs (a missing size
    // price), or else on its Hide button, so the admin is where the service
    // now is.
    const row = document.getElementById(`service-row-${focusAfterSwitch.id}`)
    if (!row) return
    row.scrollIntoView({ block: 'center' })
    const target =
      row.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      row.querySelector<HTMLElement>('[data-service-hide]')
    target?.focus({ preventScroll: true })
  }, [focusAfterSwitch])

  /**
   * The open tab, in the address too, so a reload or a shared link lands on
   * it. Replaced rather than pushed: switching tabs is not somewhere Back
   * should step through.
   */
  const changeTab = (next: EditTab) => {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

  // Every media action runs through here: one busy key, one error surface.
  const runMedia = async (key: string, action: () => Promise<void>) => {
    setMediaBusy(key)
    setError('')
    try {
      await action()
      markListStale()
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

  // "Photos and video" in a service's ⋯ (ServiceMediaPanel) saves as it
  // goes and hands back the service's new list.
  const setServiceMedia = (serviceId: string, media: ServiceMedia[]) => {
    applyToBoth((rows) => rows.map((s) => (s.id === serviceId ? { ...s, media } : s)))
    markListStale()
  }

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

  const updateDay = (dayOfWeek: number, change: Partial<AdminWorkingDay>) =>
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            hours: prev.hours.map((day) =>
              day.dayOfWeek === dayOfWeek ? { ...day, ...change } : day
            ),
          }
        : prev
    )

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
      markListStale()
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

  const runServiceSwitch = async (
    serviceId: string,
    action: () => Promise<FocusAfterSwitch>
  ) => {
    setServiceBusyId(serviceId)
    setServiceNotice('')
    setServiceErrors((prev) => {
      const next = { ...prev }
      delete next[serviceId]
      return next
    })
    try {
      // Set in the same breath as the busy flag clears (the finally below),
      // so focus never lands on a button that is still disabled.
      setFocusAfterSwitch(await action())
      markListStale()
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/login')
        return
      }
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setServiceErrors((prev) => ({ ...prev, [serviceId]: message }))
    } finally {
      setServiceBusyId(null)
    }
  }

  /**
   * Takes a saved service off the garage page, straight away. Hidden, never
   * deleted: its bookings keep it, and it waits under Hidden services.
   */
  const hideService = (row: ServiceRow) => {
    const serviceId = row.id
    if (!serviceId) return
    if (
      !window.confirm(
        `Hide "${row.name.trim() || 'this service'}"?\n\nCustomers won't see it; you can show it again from Hidden services.`
      )
    ) {
      return
    }
    void runServiceSwitch(serviceId, async () => {
      const hidden = await setAdminServiceActive(id, serviceId, false)
      applyToBoth((rows) => rows.filter((s) => s.id !== serviceId))
      setHiddenServices((prev) =>
        [...prev, hidden].sort((a, b) => a.name.localeCompare(b.name))
      )
      setServiceNotice(`Hidden “${hidden.name}”. It’s under Hidden services.`)
      return { to: 'hidden-toggle' }
    })
  }

  const showServiceAgain = (service: AdminService) =>
    runServiceSwitch(service.id, async () => {
      const shown = await setAdminServiceActive(id, service.id, true)
      setHiddenServices((prev) => prev.filter((s) => s.id !== service.id))
      // Into the editor as well, not only back on the garage page: "Save
      // changes" sends the full list, and the server hides any live service
      // the list leaves out — it would be hidden again by the next save.
      applyToBoth((rows) => [...rows, toServiceRow(shown)])
      // Open, so what it may still need (a size's price) and its Hide are
      // there to land on.
      setOpenRows((prev) => new Set(prev).add(shown.id))
      const warning = showAgainWarning(shown)
      setServiceNotice(
        `“${shown.name}” is back on the garage page.${warning ? ` ${warning}` : ''}`
      )
      return { to: 'row', id: shown.id }
    })

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
    const pin = draft?.pin
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
      markListStale()
      // The pin is saved now, so it is no longer an unsaved change.
      setSaved((prev) => (prev ? { ...prev, pin } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm location')
    } finally {
      setConfirming(false)
    }
  }

  // Hide and Show again save on their own, and the editor's list only changes
  // once that lands. A save sent in between carries the old list: the server
  // would insert a fresh copy of a service just hidden, or hide one just shown
  // again. So each waits for the other.
  const serviceSwitching = serviceBusyId !== null

  const handleSubmit = async () => {
    if (!draft || !saved || saveBlock || serviceSwitching || describing) return
    const { form } = draft
    const hoursChanged = dirty.includes('operations') &&
      JSON.stringify(draft.hours) !== JSON.stringify(saved.hours)
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
        pickup: draft.pickup || null,
        pickupRadiusKm: num(form.pickupRadiusKm),
        lat: draft.pin?.lat,
        lng: draft.pin?.lng,
        slotIntervalMins: draft.slotIntervalMins,
        bays: num(form.bays),
        jobsPerDay: num(form.jobsPerDay),
        vehicleTypes: draft.vehicleTypes,
        // Only when a day was actually changed; see GarageDraft.hours.
        ...(hoursChanged && {
          workingHours: draft.hours.map((day) => ({
            ...day,
            openTime: `${day.openTime}:00`,
            closeTime: `${day.closeTime}:00`,
          })),
        }),
        status: draft.status,
        isVerified: draft.isVerified,
        notes: form.notes.trim() || null,
        // Only when the list changed. It is the full desired set: rows with
        // an id are edited, rows without are added, and the server hides any
        // live service the list leaves out — which is why only empty,
        // never-typed rows are left out (rowsToSave).
        ...(dirty.includes('services') && {
          services: rowsToSave(draft.services).map(toServicePayload),
        }),
      })
      markListStale()
      // Stay on the garage: the admin is usually mid-way through setting it
      // up, and new services need saving before they can take photos.
      toast.success('Saved')
      // What was sent is what the garage has now, whatever the reload does.
      setSaved(draft)
      if (await load()) {
        setResetCount((n) => n + 1)
      } else {
        // The new services' ids come only from the reload. Without them the
        // next save would send those rows as new again, and the server would
        // add each a second time, so Save waits for a reload.
        setMustReload(true)
        setError('Saved, but the page couldn’t reload. Reload it to keep editing.')
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/login')
        return
      }
      const message = err instanceof ApiError ? err.message : 'Failed to save changes'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    if (saved) setDraft(saved)
    setResetCount((n) => n + 1)
    if (!mustReload) setError('')
  }

  const showSaveBar = dirty.length > 0 || saving

  return (
    <div className={cn('mx-auto w-full max-w-[640px] space-y-4', showSaveBar && 'pb-36')}>
      <PageHeader
        title={saved?.form.businessName || 'Edit garage'}
        subtitle={saved ? 'Edit garage' : undefined}
        backHref={backHref}
      />

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

      {loading || !draft || !bookingMode ? (
        loading ? (
          <SkeletonList count={3} itemClassName="h-40" />
        ) : (
          <p role="alert" className="text-[13px] text-error">
            {error || 'Failed to load vendor'}
          </p>
        )
      ) : (
        <div className="space-y-4">
          {bin && (
            <BinBanner
              bin={bin}
              onRestore={() => setRestoring(true)}
            />
          )}

          {/* Disabled as a whole while the garage is in the Bin: every field
              and button under it, the tabs' contents included, is read-only
              until it is restored. */}
          <fieldset disabled={Boolean(bin)} className="m-0 min-w-0 border-0 p-0">
          {/* Above the tabs, so it is the first thing on every one of them:
              the switch the owner could not find on the third tab. */}
          <LiveBookingModeCard
            vendorId={id}
            dropinEnabled={bookingMode.dropinEnabled}
            doorstepEnabled={bookingMode.doorstepEnabled}
            doorstepRadiusKm={bookingMode.doorstepRadiusKm}
            drawnArea={bookingMode.hasDoorstepArea}
            paused={pausedAt != null}
            // As saved, not as drafted: an unsaved Active is not live yet.
            live={saved?.status === 'active' && saved.isVerified}
            onAuthError={toLogin}
            onSaved={markListStale}
          />
          </fieldset>

          {/* Same four-tab shape as the vendor settings screen, so the admin
              editing a garage and the owner editing it see the same structure.
              Grouped by subject rather than by form length. */}
          <Tabs value={tab} onValueChange={(value) => changeTab(parseEditTab(value))}>
            <TabsList>
              {EDIT_TABS.map((value) => {
                const changed = dirty.includes(value)
                return (
                  <TabsTrigger
                    key={value}
                    value={value}
                    // The name in full, rather than the label plus a hidden
                    // span: the trigger is a flex box, so browsers join the
                    // two with a space ("Details , unsaved changes").
                    aria-label={changed ? `${EDIT_TAB_LABELS[value]}, unsaved changes` : undefined}
                    className="min-h-11 px-1"
                  >
                    {EDIT_TAB_LABELS[value]}
                    {/* Amber when this tab is what holds the save. */}
                    {changed && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          problemTab === value ? 'bg-warning' : 'bg-text-primary'
                        )}
                      />
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>

            {/* The tabs themselves stay usable, to look around; what is in
                them is read-only while the garage is in the Bin. */}
            <fieldset disabled={Boolean(bin)} className="m-0 min-w-0 border-0 p-0">

            <TabsContent value="details">
            <ScSection title="Business & contact">
              <div className="grid grid-cols-2 gap-3">
                <ScField label="Owner name" value={draft.form.ownerName} onChange={set('ownerName')} />
                <ScField label="Owner phone" value={draft.form.ownerPhone} onChange={set('ownerPhone')} placeholder="10 digits" />
              </div>
              <ScField label="Business name" value={draft.form.businessName} onChange={set('businessName')} />
              <div className="grid grid-cols-2 gap-3">
                <ScField label="Business phone" value={draft.form.phone} onChange={set('phone')} placeholder="10 digits" />
                <ScField label="WhatsApp (optional)" value={draft.form.whatsapp} onChange={set('whatsapp')} placeholder="10 digits" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ScField label="Email (optional)" value={draft.form.email} onChange={set('email')} type="email" />
                <ScField label="Years in operation (optional)" value={draft.form.yearsInOperation} onChange={set('yearsInOperation')} placeholder="e.g. 5–10 years" />
              </div>
            </ScSection>

            {/* Team management came from main; it sits in Details, immediately
                before the media section, which is where main placed it. */}
            <VendorTeamSection vendorId={id} />

            {/* Where Detlio pays the garage (Payouts). Saved on its own, like
                the team. */}
            <PayoutAccountSection vendorId={id} />

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
                      selected={draft.status === o.value}
                      onClick={() => patch({ status: o.value })}
                    />
                  ))}
                </div>
              </div>
              <ScCheckbox
                label="Mark as verified"
                checked={draft.isVerified}
                onChange={(isVerified) => patch({ isVerified })}
              />
              <p className="text-[11px] text-text-muted">
                A vendor is visible to customers only when stage is <b>Active</b> and it is <b>verified</b>.
              </p>
              <ScTextarea
                label="Notes (optional)"
                value={draft.form.notes}
                onChange={(e) => set('notes')(e.target.value)}
                rows={3}
              />
            </ScSection>
            </TabsContent>

            <TabsContent value="location">
            <ScSection title="Location">
              <ScField label="Address" value={draft.form.address} onChange={set('address')} />
              <div className="grid grid-cols-2 gap-3">
                <ScField label="City" value={draft.form.city} onChange={set('city')} />
                <ScField label="Pincode" value={draft.form.pincode} onChange={set('pincode')} placeholder="6 digits" />
              </div>
              <ScField label="Google Maps link (optional)" value={draft.form.mapsUrl} onChange={set('mapsUrl')} placeholder="https://maps.app.goo.gl/…" />
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
                {/* Keyed so Discard remounts it: it reads its pin once, and
                    would otherwise keep showing a dragged pin that Discard
                    took out of the draft — and "Confirm this pin" would then
                    sign off a spot the map isn't showing. */}
                <LocationPicker
                  key={resetCount}
                  value={draft.pin ? { lat: draft.pin.lat, lng: draft.pin.lng } : null}
                  onChange={(pin) => patch({ pin })}
                  expectedCity={draft.form.city}
                />

                {/* Moving the pin confirms it implicitly — dragging a marker onto
                    a garage *is* the check. This is for the commoner case where
                    the pin is already right and only needs signing off. */}
                {!geoConfirmedAt && draft.pin && (
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
              {/* Drop-in and doorstep are not here any more: they are "How
                  customers book", above the tabs, and save on their own. */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-text-secondary">
                  Pickup &amp; drop (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {PICKUP_OPTIONS.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      selected={draft.pickup === o.value}
                      onClick={() => patch({ pickup: draft.pickup === o.value ? '' : o.value })}
                    />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ScField label="Pickup radius km (optional)" value={draft.form.pickupRadiusKm} onChange={set('pickupRadiusKm')} type="number" placeholder="e.g. 5" className="font-numeric" />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-text-secondary">Working hours</span>
                {/* The garage's own week, day by day — the same rows the owner
                    edits in their Settings. Left alone unless changed here. */}
                <div className="flex flex-col gap-2">
                  {draft.hours.map((day) => (
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
                      selected={draft.slotIntervalMins === mins}
                      onClick={() => patch({ slotIntervalMins: mins })}
                    />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ScField label="Bays (optional)" value={draft.form.bays} onChange={set('bays')} type="number" placeholder="e.g. 10" className="font-numeric" />
                <ScField label="Jobs per day (optional)" value={draft.form.jobsPerDay} onChange={set('jobsPerDay')} type="number" placeholder="e.g. 15" className="font-numeric" />
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
                    selected={draft.vehicleTypes.includes(v)}
                    onClick={() => patch({ vehicleTypes: toggle(draft.vehicleTypes, v) })}
                  />
                ))}
              </div>
              <p className="text-[11px] text-text-muted">
                These are the tiers a service prices against and a customer can
                book for.
              </p>

              {/* Values from an earlier, longer checklist that no service could
                  ever price. Shown so they can be cleared, not offered again. */}
              {legacyVehicleTypes(draft.vehicleTypes).length > 0 && (
                <>
                  <p className="text-[11px] text-warning">
                    No longer offered — tap to remove:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {legacyVehicleTypes(draft.vehicleTypes).map((v) => (
                      <Chip
                        key={v}
                        label={`${v} ✕`}
                        selected
                        onClick={() => patch({ vehicleTypes: toggle(draft.vehicleTypes, v) })}
                      />
                    ))}
                  </div>
                </>
              )}
            </ScSection>
            </TabsContent>

            <TabsContent value="services">
              <ServicesEditor
                key={resetCount}
                onAiBusyChange={setDescribing}
                rows={draft.services}
                setRows={setServices}
                openRows={openRows}
                setOpenRows={setOpenRows}
                garageName={draft.form.businessName}
                otherNames={hiddenServices.map((s) => s.name)}
                emptyText={
                  hiddenServices.length > 0
                    ? 'No services on the garage page. Hidden ones are listed below; show them again or add a new one.'
                    : 'No services yet. Add one, or start from a template above.'
                }
                saving={saving}
                media={{ onChange: setServiceMedia }}
                hide={{
                  onHide: hideService,
                  busyId: serviceBusyId,
                  disabled: serviceSwitching,
                }}
                rowErrors={serviceErrors}
                onAuthError={toLogin}
                footnote={
                  <>
                    Each service needs a name and a price. Leave the duration on
                    “Duration” to use one booking slot. Hide takes a service off
                    the garage page straight away; past bookings keep it, and
                    you can show it again from Hidden services.
                  </>
                }
              />

              {/* Always mounted, so the message is announced when it lands. */}
              <p
                role="status"
                className={serviceNotice ? 'text-[12px] text-text-secondary' : 'sr-only'}
              >
                {serviceNotice}
              </p>

              {hiddenLoadFailed ? (
                <p className="text-[12px] text-error">
                  Couldn’t load the hidden services. Reload the page to see them.
                </p>
              ) : (
                hiddenServices.length > 0 && (
                  <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
                    {/* Collapsed: these are off the garage page, and the
                        services that are on it are what this tab is for. */}
                    <button
                      ref={hiddenToggleRef}
                      type="button"
                      aria-expanded={showHidden}
                      aria-controls="hidden-services"
                      onClick={() => setShowHidden((open) => !open)}
                      className="flex min-h-11 w-full items-center gap-3 py-3.5 pl-4 pr-3.5 text-left"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-text-secondary"
                      >
                        <IconEyeOff size={18} stroke={1.5} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium tracking-[-0.01em] text-text-primary">
                          Hidden services (
                          <span className="font-numeric">{hiddenServices.length}</span>)
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-text-muted">
                          Customers don’t see these. Past bookings keep them.
                        </span>
                      </span>
                      <IconChevronDown
                        size={20}
                        aria-hidden="true"
                        className={cn(
                          'shrink-0 text-text-muted transition-transform',
                          showHidden && 'rotate-180'
                        )}
                      />
                    </button>
                    {showHidden && (
                      <div id="hidden-services" className="border-t border-border">
                        <p className="px-4 pt-3 text-[12px] text-text-muted">
                          Showing one again puts it back on the garage page
                          straight away, with the price it had.
                        </p>
                        <ul className="divide-y divide-line">
                          {hiddenServices.map((hidden) => {
                            const warning = showAgainWarning(hidden)
                            const warningId = `hidden-${hidden.id}-warning`
                            return (
                            <li
                              key={hidden.id}
                              className="flex flex-wrap items-center gap-2 px-4 py-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[14px] text-text-primary">
                                  {hidden.name}
                                </p>
                                <p className="font-numeric text-[12px] text-text-muted">
                                  {storedPriceSummary(hidden)}
                                </p>
                                {/* Before the tap, not after a customer finds
                                    out: shown again as it is, a size with no
                                    price can't be booked. */}
                                {warning && (
                                  <p id={warningId} className="text-[12px] text-warning">
                                    {warning}
                                  </p>
                                )}
                                {serviceErrors[hidden.id] && (
                                  <p role="alert" className="text-[12px] text-error">
                                    {serviceErrors[hidden.id]}
                                  </p>
                                )}
                              </div>
                              <ScButton
                                fullWidth={false}
                                variant="secondary"
                                disabled={serviceSwitching || saving}
                                aria-label={`Show ${hidden.name} again`}
                                aria-describedby={warning ? warningId : undefined}
                                onClick={() => void showServiceAgain(hidden)}
                                className="min-h-11 rounded-full px-3.5 py-2 text-[12.5px] font-medium"
                              >
                                {serviceBusyId === hidden.id ? 'Working…' : 'Show again'}
                              </ScButton>
                            </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              )}
            </TabsContent>
            </fieldset>
          </Tabs>

          {/* Amber, as errors are: red on this page is Save changes. */}
          {error && (
            <p role="alert" className="text-[13px] text-error">
              {error}
            </p>
          )}
        </div>
      )}

      {restoring && saved && (
        <RestoreDialog
          vendor={{ id, businessName: saved.form.businessName }}
          onClose={() => setRestoring(false)}
          onDone={() => {
            setRestoring(false)
            markListStale()
            void load()
          }}
        />
      )}

      {showSaveBar && (
        <SaveBar
          line={unsavedChangesLine(dirty)}
          block={saveBlock}
          saving={saving}
          disabled={saveBlock !== null || serviceSwitching}
          held={describing}
          onSave={() => void handleSubmit()}
          onDiscard={discard}
        />
      )}
    </div>
  )
}

/**
 * What a garage in the Bin's edit page says first: since when, who moved it
 * and why, that it is off the app, and the one thing to do here, Restore.
 */
function BinBanner({
  bin,
  onRestore,
}: {
  bin: Pick<AdminVendorDetail, 'deletedAt' | 'deletedByName' | 'deletedReason'>
  onRestore: () => void
}) {
  return (
    <section
      aria-labelledby="bin-banner-title"
      className="flex flex-col gap-3 rounded-[14px] border border-warning/40 bg-warning-muted px-4 py-3.5"
    >
      <div>
        <p id="bin-banner-title" className="text-[14px] font-semibold text-text-primary">
          In the Bin, read-only
        </p>
        <p className="mt-1 text-[12.5px] leading-[18px] text-text-secondary">
          Moved there{' '}
          {bin.deletedAt && <span className="font-numeric">{formatWhen(bin.deletedAt)}</span>}
          {bin.deletedByName && <> by {bin.deletedByName}</>}.
          {bin.deletedReason && <> Reason: {bin.deletedReason}.</>} Customers and its team
          can&apos;t see it. Restore it to make changes.
        </p>
      </div>
      <ScButton
        variant="secondary"
        fullWidth={false}
        onClick={onRestore}
        className="flex min-h-11 items-center justify-center gap-1.5 self-start px-4 text-[13px]"
      >
        <IconRestore size={16} aria-hidden="true" /> Restore
      </ScButton>
    </section>
  )
}
