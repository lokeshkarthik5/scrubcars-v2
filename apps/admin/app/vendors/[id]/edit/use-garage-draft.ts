'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import type { PickedLocation } from '@repo/ui/features/location-picker'
import { showUndoToast } from '@repo/ui/sc/undo-toast'
import { ApiError } from '@repo/core/api/client'
import {
  deleteAdminVendorLogo,
  deleteAdminVendorPhoto,
  getAdminVendor,
  listAdminHiddenServices,
  pauseAdminVendor,
  resumeAdminVendor,
  setAdminServiceActive,
  deleteAdminService,
  updateAdminVendor,
  uploadAdminVendorLogo,
  uploadAdminVendorPhoto,
  type AdminPhoto,
  type AdminService,
  type AdminVendorDetail,
  type AdminWorkingDay,
} from '@repo/core/api/admin'
import type { ServiceMedia } from '@repo/core/types'
import { useSavedNote } from '@/components/save-bar'
import { useMarkGaragesStale } from '@/hooks/use-admin-today'
import { useWarnBeforeLeaving } from '@/hooks/use-warn-before-leaving'
import {
  dirtyFields,
  dirtyTabs,
  garageFieldsProblem,
  onboardedByInput,
  type EditTab,
  type TabValues,
} from '@/lib/garage-edit'
import { mergeChecklist, type EditorChecklist } from '@/lib/garage-status'
import {
  restoreRow,
  rowBefore,
  rowHasUnsavedChanges,
  toServicePayload,
  toServiceRow,
  type ServiceRow,
} from '@/lib/service-editor'
import {
  rowsToSave,
  servicesSaveBlock,
  showAgainWarning,
} from '@/lib/service-rows'

/**
 * The garage editor's state and every save it makes, out of the page so the
 * page is layout only. The draft lives here, at page level, because the tabs
 * unmount their panels: a field typed on one tab must survive opening
 * another. Each save that lands marks the garage list stale.
 */

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const SLOT_INTERVALS = [30, 45, 60] as const
export const STATUS_OPTIONS = [
  { value: 'pending' as const, label: 'Pending' },
  { value: 'active' as const, label: 'Active (live)' },
  { value: 'suspended' as const, label: 'Suspended' },
  { value: 'archived' as const, label: 'Archived' },
]

export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp'
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
export function formatDay(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

export type VendorStatus = 'pending' | 'active' | 'suspended' | 'archived'

/**
 * Everything "Save changes" saves, as the page holds it. Kept twice: as
 * loaded (or last saved) and as edited, and the difference is what the save
 * bar reports and Discard puts back. How customers book, the pin's
 * confirmation, Pause, team, media and Hide all save the moment they change,
 * so none of them is in here.
 */
export interface GarageDraft {
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
    notes: string
    /** Who on the team brought it in (0059); empty is Not set. */
    onboardedByName: string
  }
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

export function toDraft(v: AdminVendorDetail): GarageDraft {
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
      notes: v.notes ?? '',
      onboardedByName: v.onboardedByName ?? '',
    },
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
export function tabValues(draft: GarageDraft): TabValues {
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
      notes: trimmed(form.notes),
      onboardedByName: onboardedByInput(form.onboardedByName),
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
      hours: draft.hours,
      slotIntervalMins: draft.slotIntervalMins,
      bays: trimmed(form.bays),
      jobsPerDay: trimmed(form.jobsPerDay),
      vehicleTypes: draft.vehicleTypes,
    },
    services: rowsToSave(draft.services).map(toServicePayload),
    // The stage and Verified: in the status panel beside the tabs, saved
    // with Save changes like the tabs.
    golive: { status: draft.status, isVerified: draft.isVerified },
  }
}

/** Where focus goes after a hide or a show: see focusAfterSwitch. */
export type FocusAfterSwitch =
  { to: 'hidden-toggle' } | { to: 'row'; id: string }

export function useGarageDraft(id: string) {
  const router = useRouter()
  // Every change saved from here — the form, the pin, media, pause, a
  // service hidden or shown, how customers book — marks the garage list
  // stale, so Back lands on a list whose checklist and Live count already
  // show it.
  // The garage list and the menu's counts (documents, blocked garages).
  const markListStale = useMarkGaragesStale()
  // As loaded or last saved, and as edited. Null until the first load.
  const [saved, setSaved] = useState<GarageDraft | null>(null)
  const [draft, setDraft] = useState<GarageDraft | null>(null)
  // How customers book and Pickup & drop, as loaded: the tiles on Location
  // save them on their own (HowCustomersBook) and read these once.
  const [bookingMode, setBookingMode] = useState<
    | (Pick<
        AdminVendorDetail,
        | 'dropinEnabled'
        | 'doorstepEnabled'
        | 'doorstepRadiusKm'
        | 'hasDoorstepArea'
        | 'pickup'
        | 'pickupRadiusKm'
      > & {
        pickupEnabled: boolean
        pickupTermsAcceptedAt: string | null
        pickupTermsAcceptedBy: string | null
      })
    | null
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
  // The server's checklist and what the garage still owes us (0059), for the
  // status panel. Both absent from an older API.
  const [checklist, setChecklist] = useState<EditorChecklist>({})
  // Each read of the checklist, numbered: only the latest one may land, so
  // an older answer arriving late never puts back a line just fixed.
  const checklistRead = useRef(0)
  // The small "Saved" each part that saves on its own shows.
  const pauseNote = useSavedNote()
  const pinNote = useSavedNote()
  const mediaNote = useSavedNote()
  const switchNote = useSavedNote()
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
  // The service the Delete confirm is open for, live or hidden.
  const [deletingService, setDeletingService] = useState<{
    id: string
    name: string
  } | null>(null)
  // Where focus goes once a hide or show has rendered. A fresh object each
  // time, so the same target twice still moves focus twice.
  const [focusAfterSwitch, setFocusAfterSwitch] =
    useState<FocusAfterSwitch | null>(null)
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

  const dirty =
    saved && draft ? dirtyTabs(tabValues(saved), tabValues(draft)) : []
  // The same, field by field, for the save bar's line.
  const fields =
    saved && draft ? dirtyFields(tabValues(saved), tabValues(draft)) : []
  useWarnBeforeLeaving(dirty.length > 0)

  /** A change to the draft. Before the first load there is nothing to change. */
  const patch = (change: Partial<GarageDraft>) =>
    setDraft((prev) => (prev ? { ...prev, ...change } : prev))

  const set = (key: keyof GarageDraft['form']) => (v: string) =>
    setDraft((prev) =>
      prev ? { ...prev, form: { ...prev.form, [key]: v } } : prev
    )

  const setServices: Dispatch<SetStateAction<ServiceRow[]>> = useCallback(
    (action) =>
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              services:
                typeof action === 'function' ? action(prev.services) : action,
            }
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
    setSaved((prev) =>
      prev ? { ...prev, services: change(prev.services) } : prev
    )
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
    const read = ++checklistRead.current
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
      setBookingMode(
        (prev) =>
          prev ?? {
            dropinEnabled: v.dropinEnabled,
            doorstepEnabled: v.doorstepEnabled,
            doorstepRadiusKm: v.doorstepRadiusKm,
            hasDoorstepArea: v.hasDoorstepArea,
            pickupEnabled: v.pickupEnabled === true,
            pickup: v.pickup,
            pickupRadiusKm: v.pickupRadiusKm,
            pickupTermsAcceptedAt: v.pickupTermsAcceptedAt ?? null,
            pickupTermsAcceptedBy: v.pickupTermsAcceptedBy ?? null,
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
        setShowHidden(
          (open) => open || (v.services.length === 0 && hidden.length > 0)
        )
      } else {
        setHiddenLoadFailed(true)
      }
      setPausedAt(v.bookingsPausedAt ?? null)
      setPausedReason(v.bookingsPausedReason ?? null)
      setClosures(v.closures ?? [])
      if (read === checklistRead.current) {
        setChecklist((prev) => mergeChecklist(prev, v))
      }
      setBin(
        v.deletedAt
          ? {
              deletedAt: v.deletedAt,
              deletedByName: v.deletedByName ?? null,
              deletedReason: v.deletedReason ?? null,
            }
          : null
      )
      return true
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        router.replace('/login')
        return false
      }
      setError('Failed to load vendor')
      return false
    } finally {
      setLoading(false)
    }
  }, [id, router])

  /**
   * After something saves on its own (a photo or the logo, the pin, Pause,
   * a service hidden or shown, how customers book, payout, a document), the
   * server's checklist may have changed: read the garage again and take only
   * the checklist from it (mergeChecklist). Never load(): that resets the
   * draft, and the admin may be half-way through other edits.
   */
  const refreshChecklist = useCallback(async () => {
    const read = ++checklistRead.current
    try {
      const v = await getAdminVendor(id)
      if (read !== checklistRead.current) return
      setChecklist((prev) => mergeChecklist(prev, v))
    } catch {
      // The change itself landed; the panel catches up on the next save
      // or reload.
    }
  }, [id])

  /** Every save that does not wait for Save changes ends here. */
  const afterInstantSave = useCallback(() => {
    markListStale()
    void refreshChecklist()
  }, [markListStale, refreshChecklist])

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

  // Every media action runs through here: one busy key, one error surface.
  const runMedia = async (key: string, action: () => Promise<void>) => {
    setMediaBusy(key)
    setError('')
    mediaNote.saving()
    try {
      await action()
      afterInstantSave()
      mediaNote.saved()
    } catch (err) {
      mediaNote.reset()
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 403)
      ) {
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
    applyToBoth((rows) =>
      rows.map((s) => (s.id === serviceId ? { ...s, media } : s))
    )
    markListStale()
  }

  const toggle = <T>(list: T[], item: T): T[] =>
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
    pauseNote.saving()
    try {
      const updated = pause
        ? await pauseAdminVendor(id, pauseReasonInput.trim() || undefined)
        : await resumeAdminVendor(id)
      setPausedAt(updated.bookingsPausedAt ?? null)
      setPausedReason(pause ? pauseReasonInput.trim() || null : null)
      setPauseReasonInput('')
      afterInstantSave()
      pauseNote.saved()
    } catch (err) {
      pauseNote.reset()
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        router.replace('/login')
        return
      }
      setError(err instanceof Error ? err.message : 'Could not change bookings')
    } finally {
      setPausing(false)
    }
  }

  // Resolves true once the action is saved, false when it failed (the error
  // is then on serviceErrors[serviceId]), so a confirm sheet can stay open.
  const runServiceSwitch = async (
    serviceId: string,
    action: () => Promise<FocusAfterSwitch>
  ): Promise<boolean> => {
    setServiceBusyId(serviceId)
    setServiceNotice('')
    setServiceErrors((prev) => {
      const next = { ...prev }
      delete next[serviceId]
      return next
    })
    switchNote.saving()
    try {
      // Set in the same breath as the busy flag clears (the finally below),
      // so focus never lands on a button that is still disabled.
      setFocusAfterSwitch(await action())
      afterInstantSave()
      switchNote.saved()
      return true
    } catch (err) {
      switchNote.reset()
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        router.replace('/login')
        return false
      }
      const message =
        err instanceof Error ? err.message : 'Something went wrong'
      setServiceErrors((prev) => ({ ...prev, [serviceId]: message }))
      return false
    } finally {
      setServiceBusyId(null)
    }
  }

  // Read by an Undo, which runs from a toast long after the render that
  // made it: the page as it is now, not as it was when the row was hidden.
  const serviceBusyRef = useRef<string | null>(null)
  const savingRef = useRef(false)
  const describingRef = useRef(false)
  const hiddenRef = useRef<AdminService[]>([])
  useEffect(() => {
    serviceBusyRef.current = serviceBusyId
    savingRef.current = saving
    describingRef.current = describing
    hiddenRef.current = hiddenServices
  }, [serviceBusyId, saving, describing, hiddenServices])

  /**
   * Takes a saved service off the garage page, straight away. Hidden, never
   * deleted: its bookings keep it, and it waits under Hidden services. Easy
   * to take back, so there is no question first: the toast offers Undo,
   * which is Show again (safe actions, level 1; never the browser pop-up).
   * A row with edits not saved yet is not hidden: they would be lost.
   */
  const hideService = (row: ServiceRow) => {
    const serviceId = row.id
    if (!serviceId) return
    if (
      saved &&
      draft &&
      rowHasUnsavedChanges(saved.services, draft.services, serviceId)
    ) {
      setServiceErrors((prev) => ({
        ...prev,
        [serviceId]:
          'This service has changes that are not saved. Save or discard them before hiding it.',
      }))
      return
    }
    // Where it stood, so Undo puts it back there rather than at the end.
    const after = saved ? rowBefore(saved.services, serviceId) : null
    void runServiceSwitch(serviceId, async () => {
      const hidden = await setAdminServiceActive(id, serviceId, false)
      applyToBoth((rows) => rows.filter((s) => s.id !== serviceId))
      setHiddenServices((prev) =>
        [...prev.filter((s) => s.id !== hidden.id), hidden].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      )
      setServiceNotice(`Hidden “${hidden.name}”. It’s under Hidden services.`)
      let undone = false
      showUndoToast(`“${hidden.name}” is off the garage page.`, {
        onUndo: () => {
          // Once, whatever the toast does with a second press.
          if (undone) return
          undone = true
          // Not while anything else is changing the list: a Save in flight
          // would hide it again, and another switch shares the busy flag.
          if (
            serviceBusyRef.current !== null ||
            savingRef.current ||
            describingRef.current
          ) {
            toast.error(
              `Couldn’t undo while the page is saving. “${hidden.name}” is under Hidden services: use Show again.`
            )
            return
          }
          // Shown again some other way already: nothing to undo.
          if (!hiddenRef.current.some((s) => s.id === hidden.id)) return
          void showServiceAgain(hidden, after)
        },
      })
      return { to: 'hidden-toggle' }
    })
  }

  const showServiceAgain = (service: AdminService, after?: string | null) =>
    runServiceSwitch(service.id, async () => {
      const shown = await setAdminServiceActive(id, service.id, true)
      setHiddenServices((prev) => prev.filter((s) => s.id !== service.id))
      // Into the editor as well, not only back on the garage page: "Save
      // changes" sends the full list, and the server hides any live service
      // the list leaves out — it would be hidden again by the next save.
      // Where it stood (an Undo), or at the end; never a second copy.
      applyToBoth((rows) => restoreRow(rows, toServiceRow(shown), after))
      // Open, so what it may still need (a size's price) and its Hide are
      // there to land on.
      setOpenRows((prev) => new Set(prev).add(shown.id))
      const warning = showAgainWarning(shown)
      setServiceNotice(
        `“${shown.name}” is back on the garage page.${warning ? ` ${warning}` : ''}`
      )
      return { to: 'row', id: shown.id }
    })

  /**
   * Deletes a saved service, live or hidden, once the confirm sheet says so.
   * Saved straight away and not undoable, so unlike Hide it asks first. One
   * nobody booked is gone for good; one that bookings name stays only for
   * them, listed nowhere. Edits to it not saved yet go with it.
   */
  const deleteService = (target: { id: string; name: string }) =>
    runServiceSwitch(target.id, async () => {
      await deleteAdminService(id, target.id)
      applyToBoth((rows) => rows.filter((s) => s.id !== target.id))
      setHiddenServices((prev) => prev.filter((s) => s.id !== target.id))
      setServiceNotice(`Deleted “${target.name}”.`)
      return { to: 'hidden-toggle' }
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
    pinNote.saving()
    try {
      const updated = await updateAdminVendor(id, {
        lat: pin.lat,
        lng: pin.lng,
        confirmLocation: true,
      })
      setGeoConfirmedAt(updated.geoConfirmedAt)
      setGeoSource(updated.geoSource)
      afterInstantSave()
      // The pin is saved now, so it is no longer an unsaved change.
      setSaved((prev) => (prev ? { ...prev, pin } : prev))
      pinNote.saved()
    } catch (err) {
      pinNote.reset()
      setError(
        err instanceof Error ? err.message : 'Could not confirm location'
      )
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
    const hoursChanged =
      dirty.includes('operations') &&
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
        // Only when changed: an older API without the field never sees it,
        // and a garage nobody touched keeps whatever it has.
        ...(fields.some((field) => field.label === 'onboarded by') && {
          onboardedByName: onboardedByInput(form.onboardedByName),
        }),
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
        setError(
          'Saved, but the page couldn’t reload. Reload it to keep editing.'
        )
      }
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        router.replace('/login')
        return
      }
      const message =
        err instanceof ApiError ? err.message : 'Failed to save changes'
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

  return {
    router,
    markListStale,
    afterInstantSave,
    checklist,
    pauseNote,
    pinNote,
    mediaNote,
    switchNote,
    fields,
    saved,
    draft,
    setSaved,
    bookingMode,
    confirming,
    geoSource,
    geoConfirmedAt,
    pausedAt,
    pausedReason,
    pauseReasonInput,
    setPauseReasonInput,
    pausing,
    closures,
    bin,
    restoring,
    setRestoring,
    openRows,
    setOpenRows,
    hiddenServices,
    hiddenLoadFailed,
    showHidden,
    setShowHidden,
    serviceBusyId,
    serviceErrors,
    serviceNotice,
    hiddenToggleRef,
    loading,
    saving,
    error,
    describing,
    setDescribing,
    resetCount,
    logoUrl,
    photos,
    mediaBusy,
    logoInputRef,
    photoInputRef,
    toLogin,
    dirty,
    patch,
    set,
    setServices,
    saveBlock,
    problemTab,
    load,
    handleLogoFile,
    handleRemoveLogo,
    handlePhotoFiles,
    handleRemovePhoto,
    setServiceMedia,
    toggle,
    updateDay,
    setPaused,
    hideService,
    showServiceAgain,
    deleteService,
    deletingService,
    setDeletingService,
    confirmLocation,
    serviceSwitching,
    handleSubmit,
    discard,
  }
}

export type GarageDraftState = ReturnType<typeof useGarageDraft>
