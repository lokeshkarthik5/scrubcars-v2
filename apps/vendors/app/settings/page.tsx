'use client'

import { Fragment, Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconLogout, IconPhoto, IconChevronRight, IconUsers } from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/sc/tabs'
import {
  LocationPicker,
  type PickedLocation,
} from '@repo/ui/features/location-picker'
import { CoverageEditor } from '@repo/ui/features/coverage-editor'
import { ScInput } from '@repo/ui/sc/input'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { Skeleton } from '@repo/ui/sc/skeleton'
import { ScSwitch } from '@repo/ui/sc/switch'
import { TopBar } from '@repo/ui/sc/top-bar'
import { Chip } from '@repo/ui/sc/chip'
import { SupportCard } from '@repo/ui/features/support-card'
import {
  getMyClosures,
  getMyVendor,
  getWorkingHours,
  setVendorWorkingHours,
  updateSlotInterval,
  updateVendorJobTypes,
  updateVendorSettings,
} from '@repo/core/api/vendors'
import type {
  ApiVendorClosure,
  ApiVendorProfile,
  ApiWorkingHours,
} from '@repo/core/api/types'
import { ApiError } from '@repo/core/api/client'
import { toast } from 'react-toastify'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { useVendorOnboardingStore } from '@repo/core/stores/vendor-onboarding-store'
import { cn } from '@repo/core/utils'
import { ActiveGarage } from '@/components/active-garage'
import { PickupSection } from './pickup-section'
import { HolidaysSection, PauseSection } from './time-off-section'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// The tabs a ?tab= link can open on. Anything else lands on Profile.
const TABS = ['profile', 'location', 'hours', 'time-off', 'account'] as const
type SettingsTab = (typeof TABS)[number]
// The radius the server accepts for doorstep jobs, as onboarding asks it.
const MIN_DOORSTEP_KM = 1
const MAX_DOORSTEP_KM = 30
const SLOT_INTERVALS = [30, 45, 60] as const
// The server's bounds for bays; jobs per day is 1–500 or blank.
const MAX_BAYS = 20
const MAX_JOBS_PER_DAY = 500

/**
 * What is wrong with the capacity form, in the owner's words, or null. Bays
 * must be a whole number from 1 to 20; the daily limit is blank (no limit) or
 * a whole number from 1 up.
 */
function capacityProblem(bays: string, jobsPerDay: string): string | null {
  const bayCount = Number(bays)
  if (!/^\d+$/.test(bays) || bayCount < 1 || bayCount > MAX_BAYS) {
    return `Cars at the same time must be between 1 and ${MAX_BAYS}.`
  }
  if (jobsPerDay.trim() === '') return null
  const jobs = Number(jobsPerDay)
  if (!/^\d+$/.test(jobsPerDay) || jobs < 1 || jobs > MAX_JOBS_PER_DAY) {
    return `Jobs in a day must be between 1 and ${MAX_JOBS_PER_DAY}, or left blank.`
  }
  return null
}

type WorkingHoursForm = {
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

/**
 * A row that opens another screen — Garage photos, Team — drawn as the
 * customer's profile draws its rows: a graphite icon tile, a title and a line
 * under it, and a chevron. The tiles were red, which on a settings screen put
 * a red square beside every link and none of them was the thing to press.
 */
function LinkRow({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link href={href} className="press block">
      <ScCard className="flex items-center gap-3 transition-colors hover:border-text-muted">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-text-primary">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text-primary">{title}</p>
          <p className="text-[11px] text-text-secondary">{description}</p>
        </div>
        <IconChevronRight size={18} aria-hidden="true" className="shrink-0 text-text-muted" />
      </ScCard>
    </Link>
  )
}

// The time fields of the hours editor: full-height, figures in the numeric
// face, and the same edge and focus as every other field.
const TIME_INPUT =
  'min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-2 font-numeric text-[13px] text-text-primary outline-none transition-colors focus:border-text-secondary disabled:opacity-40'

function normalizeTimeForInput(time: string) {
  return time.slice(0, 5)
}

function normalizeTimeForApi(time: string) {
  return time.length === 5 ? `${time}:00` : time
}

function defaultWorkingHours(): WorkingHoursForm[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: '09:00',
    closeTime: '18:00',
    isClosed: false,
  }))
}

function mapWorkingHours(hours: ApiWorkingHours[]): WorkingHoursForm[] {
  const byDay = new Map(hours.map((day) => [day.dayOfWeek, day]))
  return defaultWorkingHours().map((fallback) => {
    const day = byDay.get(fallback.dayOfWeek)
    return day
      ? {
          dayOfWeek: day.dayOfWeek,
          openTime: normalizeTimeForInput(day.openTime),
          closeTime: normalizeTimeForInput(day.closeTime),
          isClosed: day.isClosed,
        }
      : fallback
  })
}

// useSearchParams needs a Suspense boundary for the page to prerender.
export default function VendorSettingsPage() {
  return (
    <Suspense fallback={null}>
      <VendorSettings />
    </Suspense>
  )
}

function VendorSettings() {
  const searchParams = useSearchParams()
  const [vendor, setVendor] = useState<ApiVendorProfile | null>(null)
  const [profileForm, setProfileForm] = useState({
    businessName: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
  })
  const [workingHours, setWorkingHours] = useState<WorkingHoursForm[]>(
    defaultWorkingHours()
  )
  const [pin, setPin] = useState<PickedLocation | null>(null)
  const [doorstepRadiusKm, setDoorstepRadiusKm] = useState('')
  const [capacity, setCapacity] = useState({ bays: '1', jobsPerDay: '' })
  const [closures, setClosures] = useState<ApiVendorClosure[]>([])
  const [closuresFailed, setClosuresFailed] = useState(false)
  // The tab a link asked for, e.g. /settings?tab=time-off from Home's
  // "paused" banner. From the router rather than window.location: on a
  // client-side navigation the page first renders before the address bar
  // has changed, so window.location still showed /home and the link always
  // landed on Profile.
  const [tab, setTab] = useState<SettingsTab>(() => {
    const requested = searchParams.get('tab')
    return TABS.includes(requested as SettingsTab) ? (requested as SettingsTab) : 'profile'
  })
  // Shown under the doorstep switch when turning it on needs a radius first,
  // so the owner can give one here instead of hunting for the Location tab.
  const [doorstepPrompt, setDoorstepPrompt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const logout = useAuthStore((s) => s.logout)
  const resetUser = useUserStore((s) => s.reset)
  const resetBookings = useBookingsStore((s) => s.reset)
  const resetOnboarding = useVendorOnboardingStore((s) => s.reset)
  const isVendorAdmin = useIsVendorAdmin()
  const activeVendorId = useAuthStore((s) => s.activeVendorId)
  const router = useRouter()

  // Every screen behind Settings is vendor_admin-only per the permission
  // matrix, and the operator nav has no Settings tab, so this is only reachable
  // by typing the URL.
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home')
  }, [isVendorAdmin, router])

  useEffect(() => {
    // Holidays load on their own: a failure there (or a server that does not
    // have them yet) should cost the Holidays list, not every tab.
    async function loadClosures() {
      try {
        setClosures(await getMyClosures())
        setClosuresFailed(false)
      } catch {
        setClosuresFailed(true)
      }
    }

    async function loadSettings() {
      setLoading(true)
      try {
        const [vendorData, hoursData] = await Promise.all([
          getMyVendor(),
          getWorkingHours(),
        ])

        setVendor(vendorData)
        setProfileForm({
          businessName: vendorData.businessName,
          phone: vendorData.phone,
          address: vendorData.address,
          city: vendorData.city,
          pincode: vendorData.pincode,
        })
        setWorkingHours(mapWorkingHours(hoursData))
        setCapacity({
          // Unset reads as one bay, which is also what the slot list assumes.
          bays: String(vendorData.bays && vendorData.bays > 0 ? vendorData.bays : 1),
          jobsPerDay:
            vendorData.jobsPerDay != null ? String(vendorData.jobsPerDay) : '',
        })
        setDoorstepRadiusKm(
          vendorData.doorstepRadiusKm != null
            ? String(vendorData.doorstepRadiusKm)
            : ''
        )
        if (vendorData.lat != null && vendorData.lng != null) {
          setPin({
            lat: vendorData.lat,
            lng: vendorData.lng,
            address: vendorData.address,
            city: vendorData.city,
            pincode: vendorData.pincode,
            source: 'map_pin',
          })
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    void loadSettings()
    void loadClosures()
    // Reloads on a company switch: this form edits whichever company is
    // active, and leaving the previous one's values in it would let an admin
    // save the wrong garage's details.
  }, [activeVendorId])

  const runAction = async (key: string, action: () => Promise<void>) => {
    setSaving(key)
    try {
      await action()
      toast.success('Saved successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  const saveProfile = () =>
    vendor &&
    runAction('profile', async () => {
      const updated = await updateVendorSettings({
        businessName: profileForm.businessName,
        phone: profileForm.phone,
        address: profileForm.address,
        city: profileForm.city,
        pincode: profileForm.pincode,
        lat: pin?.lat ?? vendor.lat ?? undefined,
        lng: pin?.lng ?? vendor.lng ?? undefined,
        geoSource: pin?.source,
      })
      setVendor(updated)
    })

  const saveLocation = () =>
    vendor &&
    runAction('location', async () => {
      if (!pin) return
      const updated = await updateVendorSettings({
        lat: pin.lat,
        lng: pin.lng,
        geoSource: pin.source,
        doorstepRadiusKm: doorstepRadiusKm
          ? Number(doorstepRadiusKm)
          : undefined,
      })
      setVendor(updated)
    })

  const capacityError = capacityProblem(capacity.bays, capacity.jobsPerDay)

  const saveCapacity = () =>
    !capacityError &&
    runAction('capacity', async () => {
      const updated = await updateVendorSettings({
        bays: Number(capacity.bays),
        // Blank clears the cap rather than leaving the old one in place.
        jobsPerDay: capacity.jobsPerDay.trim() ? Number(capacity.jobsPerDay) : null,
      })
      setVendor(updated)
    })

  const saveSlotInterval = (slotIntervalMins: 30 | 45 | 60) =>
    runAction('slot-interval', async () => {
      const updated = await updateSlotInterval(slotIntervalMins)
      setVendor(updated)
    })

  const saveJobType = async (
    field: 'dropinEnabled' | 'doorstepEnabled',
    value: boolean,
    doorstepRadius?: number
  ) => {
    const key = `job-type-${field}`
    setSaving(key)
    try {
      const updated = await updateVendorJobTypes({
        [field]: value,
        ...(doorstepRadius !== undefined && { doorstepRadiusKm: doorstepRadius }),
      })
      setVendor(updated)
      if (updated.doorstepRadiusKm != null) {
        setDoorstepRadiusKm(String(updated.doorstepRadiusKm))
      }
      setDoorstepPrompt(null)
      toast.success('Saved successfully')
    } catch (err) {
      // Doorstep needs a "how far" first. Ask for it right here, next to the
      // switch, rather than leave the owner to find the Location tab.
      if (err instanceof ApiError && err.code === 'DOORSTEP_RADIUS_REQUIRED') {
        setDoorstepPrompt('')
        return
      }
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  const promptRadius = Number(doorstepPrompt)
  const promptRadiusValid =
    doorstepPrompt !== null &&
    doorstepPrompt.trim() !== '' &&
    promptRadius >= MIN_DOORSTEP_KM &&
    promptRadius <= MAX_DOORSTEP_KM

  const saveWorkingHours = () =>
    runAction('working-hours', async () => {
      const updated = await setVendorWorkingHours(
        workingHours.map((day) => ({
          ...day,
          openTime: normalizeTimeForApi(day.openTime),
          closeTime: normalizeTimeForApi(day.closeTime),
        }))
      )
      setWorkingHours(mapWorkingHours(updated))
    })

  const handleLogout = async () => {
    await logout()
    resetUser()
    resetBookings()
    resetOnboarding()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <AppShell
        showNav
        navType="vendor"
        showBrand
        brandRight={<ActiveGarage />}
        className="gap-5 py-4"
      >
        <TopBar title="Settings" />
        {/* The tab strip, then a form's worth of card. */}
        <div role="status" aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">Loading</span>
          <Skeleton className="h-11 rounded-[12px]" />
          <Skeleton className="h-80" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      showNav
      navType="vendor"
      showBrand
      brandRight={<ActiveGarage />}
      className="gap-5 py-4"
    >
      <TopBar title="Settings" />

      {/* Tabs rather than one long scroll. Grouped by the question being
          answered — who you are, where you are, when you work, when you are
          not working, everything else — so each panel is a similar size and
          nothing important sits below three screens of other settings. */}
      <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="hours">Hours</TabsTrigger>
          <TabsTrigger value="time-off">Time off</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Profile"
              action={
                vendor && (
                  <ScBadge variant={vendor.isVerified ? 'success' : 'pending'}>
                    {vendor.isVerified ? 'Verified' : 'Under review'}
                  </ScBadge>
                )
              }
            />
            <ScCard className="flex flex-col gap-3">
              <ScInput
                id="settings-business-name"
                label="Business name"
                value={profileForm.businessName}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, businessName: e.target.value })
                }
              />
              <ScInput
                id="settings-phone"
                label="Phone"
                inputMode="numeric"
                className="font-numeric"
                value={profileForm.phone}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    phone: e.target.value.replace(/\D/g, '').slice(0, 10),
                  })
                }
              />
              <ScInput
                id="settings-address"
                label="Address"
                value={profileForm.address}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, address: e.target.value })
                }
              />
              <ScInput
                id="settings-city"
                label="City"
                value={profileForm.city}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, city: e.target.value })
                }
              />
              <ScInput
                id="settings-pincode"
                label="Pincode"
                inputMode="numeric"
                maxLength={6}
                placeholder="600001"
                className="font-numeric"
                value={profileForm.pincode}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })
                }
              />
              <ScButton disabled={saving === 'profile'} onClick={saveProfile}>
                {saving === 'profile' ? 'Saving...' : 'Save profile'}
              </ScButton>
            </ScCard>
          </section>

          <LinkRow
            href="/photos"
            icon={<IconPhoto size={18} aria-hidden="true" />}
            title="Garage photos"
            description="Add photos customers see on your listing"
          />
        </TabsContent>

        <TabsContent value="location">
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Garage location"
              action={
                vendor &&
                vendor.lat === null && <ScBadge variant="danger">Not set</ScBadge>
              }
            />
            <ScCard className="flex flex-col gap-3">
              {vendor?.lat === null && (
                <p role="status" className="text-[12px] text-warning">
                  Customers can&apos;t find you until your garage is pinned on the
                  map, and we can&apos;t verify you without it.
                </p>
              )}
              <LocationPicker
                value={pin ? { lat: pin.lat, lng: pin.lng } : null}
                onChange={setPin}
                expectedCity={profileForm.city}
              />
              <ScInput
                label="Doorstep travel radius (km)"
                inputMode="decimal"
                placeholder="e.g. 8"
                className="font-numeric"
                value={doorstepRadiusKm}
                onChange={(e) =>
                  setDoorstepRadiusKm(e.target.value.replace(/[^\d.]/g, ''))
                }
              />
              {/* This is the garage's own number, not a radius the customer picks:
                  a doorstep search asks "who will come to me", so only the garage
                  can answer it. Leaving it empty means doorstep jobs are declined. */}
              <p className="text-[11px] text-text-muted">
                How far you&apos;ll travel for doorstep jobs. Leave empty if you
                don&apos;t travel.
              </p>
              <ScButton
                disabled={!pin || saving === 'location'}
                onClick={saveLocation}
              >
                {saving === 'location' ? 'Saving...' : 'Save location'}
              </ScButton>
            </ScCard>
          </section>

          {/* Only offered once the garage has a pin — an area drawn around nowhere
              in particular is not useful, and the map would open on a default city
              centre rather than on the garage. */}
          {vendor?.lat != null && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Doorstep coverage area" />
              <ScCard className="flex flex-col gap-3">
                <p className="text-[12px] text-text-secondary">
                  Optional. Draw the exact area you&apos;ll travel to — useful when a
                  river, highway or city boundary means a plain radius gets it wrong.
                </p>
                <CoverageEditor
                  center={{ lat: vendor.lat, lng: vendor.lng as number }}
                  fallbackRadiusKm={vendor.doorstepRadiusKm}
                />
              </ScCard>
            </section>
          )}
        </TabsContent>

        <TabsContent value="hours">

          <section className="flex flex-col gap-3">
            <SectionHeader title="Working hours" />
            <div className="flex flex-col gap-2">
              {workingHours.map((day) => (
                <ScCard key={day.dayOfWeek} className="flex items-center gap-2 py-2">
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
                    onChange={(e) =>
                      setWorkingHours((current) =>
                        current.map((item) =>
                          item.dayOfWeek === day.dayOfWeek
                            ? { ...item, openTime: e.target.value }
                            : item
                        )
                      )
                    }
                    className={TIME_INPUT}
                    disabled={day.isClosed}
                  />
                  <input
                    type="time"
                    aria-label={`${DAYS[day.dayOfWeek]} closing time`}
                    value={day.closeTime}
                    onChange={(e) =>
                      setWorkingHours((current) =>
                        current.map((item) =>
                          item.dayOfWeek === day.dayOfWeek
                            ? { ...item, closeTime: e.target.value }
                            : item
                        )
                      )
                    }
                    className={TIME_INPUT}
                    disabled={day.isClosed}
                  />
                  {/* Says what the day is, and is pressed when it is closed.
                      A closed day is raised onto graphite, as a chosen option
                      is — it used to turn red, the colour of the Save below. */}
                  <button
                    type="button"
                    aria-label={`${DAYS[day.dayOfWeek]} closed all day`}
                    aria-pressed={day.isClosed}
                    onClick={() =>
                      setWorkingHours((current) =>
                        current.map((item) =>
                          item.dayOfWeek === day.dayOfWeek
                            ? { ...item, isClosed: !item.isClosed }
                            : item
                        )
                      )
                    }
                    className={cn(
                      'min-h-11 w-[68px] shrink-0 rounded-[10px] border text-[12px] font-medium transition-colors',
                      day.isClosed
                        ? 'border-text-secondary bg-surface-elevated text-text-primary'
                        : 'border-border text-text-secondary hover:text-text-primary'
                    )}
                  >
                    {day.isClosed ? 'Closed' : 'Open'}
                  </button>
                </ScCard>
              ))}
              <ScButton
                disabled={saving === 'working-hours'}
                onClick={saveWorkingHours}
              >
                {saving === 'working-hours' ? 'Saving...' : 'Save working hours'}
              </ScButton>
            </div>
          </section>

          {vendor && (
            <section className="flex flex-col gap-3">
              <SectionHeader
                title="Slot interval"
                subtitle="How far apart the start times customers can pick are."
              />
              <ScCard>
                <div className="flex gap-2">
                  {SLOT_INTERVALS.map((interval) => (
                    <Chip
                      key={interval}
                      label={`${interval} min`}
                      selected={vendor.slotIntervalMins === interval}
                      onClick={() => saveSlotInterval(interval)}
                      disabled={saving === 'slot-interval'}
                    />
                  ))}
                </div>
              </ScCard>
            </section>
          )}

          {vendor && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Capacity" />
              <ScCard className="flex flex-col gap-3">
                <ScInput
                  id="settings-bays"
                  label="How many cars can you work on at the same time?"
                  inputMode="numeric"
                  className="font-numeric"
                  value={capacity.bays}
                  onChange={(e) =>
                    setCapacity({ ...capacity, bays: e.target.value.replace(/\D/g, '').slice(0, 2) })
                  }
                />
                <ScInput
                  id="settings-jobs-per-day"
                  label="Most jobs in a day (optional)"
                  inputMode="numeric"
                  placeholder="No limit"
                  className="font-numeric"
                  value={capacity.jobsPerDay}
                  onChange={(e) =>
                    setCapacity({ ...capacity, jobsPerDay: e.target.value.replace(/\D/g, '').slice(0, 3) })
                  }
                />
                {/* What the numbers do, in one line: customers are only offered
                    a time when a car can actually go in. */}
                <p className="text-[11px] text-text-muted">
                  Customers are only offered times when you have room for one
                  more car. Leave the daily limit blank for no limit.
                </p>
                {capacityError && (
                  <p role="alert" className="text-[12px] text-warning">{capacityError}</p>
                )}
                {/* Secondary: "Save working hours" above is this tab's main
                    action, and red is kept for one per screen. */}
                <ScButton
                  variant="secondary"
                  disabled={!!capacityError || saving === 'capacity'}
                  onClick={saveCapacity}
                >
                  {saving === 'capacity' ? 'Saving...' : 'Save capacity'}
                </ScButton>
              </ScCard>
            </section>
          )}

          {vendor && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Job types" />
              <ScCard className="flex flex-col gap-3">
                {(
                  [
                    { field: 'dropinEnabled', label: 'Drop In', description: 'Customers visit your garage' },
                    { field: 'doorstepEnabled', label: 'Doorstep', description: 'You travel to the customer' },
                  ] as const
                ).map(({ field, label, description }) => {
                  const enabled = vendor[field]
                  const key = `job-type-${field}`
                  return (
                    <Fragment key={field}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-text-primary">{label}</p>
                          <p className="text-[11px] text-text-secondary">{description}</p>
                        </div>
                        {/* Saves the moment it is tapped, as it always has.
                            Now a named switch, so it is read out as "Drop In,
                            on" rather than as an unlabelled button. */}
                        <ScSwitch
                          label={label}
                          checked={enabled}
                          disabled={saving === key}
                          onChange={(next) => saveJobType(field, next)}
                        />
                      </div>
                      {field === 'doorstepEnabled' && doorstepPrompt !== null && (
                        <div className="flex flex-col gap-2">
                          <ScInput
                            id="settings-doorstep-radius-inline"
                            label="How far will you travel? (km)"
                            inputMode="numeric"
                            className="font-numeric"
                            placeholder="e.g. 8"
                            value={doorstepPrompt}
                            onChange={(e) =>
                              setDoorstepPrompt(e.target.value.replace(/\D/g, '').slice(0, 2))
                            }
                          />
                          <p className="text-[11px] text-text-muted">
                            Doorstep needs a distance from {MIN_DOORSTEP_KM} to{' '}
                            {MAX_DOORSTEP_KM} km, so customers within it can book you.
                            You can change it later under Location.
                          </p>
                          <div className="flex gap-2">
                            <ScButton
                              variant="secondary"
                              className="flex-1"
                              onClick={() => setDoorstepPrompt(null)}
                            >
                              Not now
                            </ScButton>
                            <ScButton
                              variant="secondary"
                              className="flex-1"
                              disabled={!promptRadiusValid || saving === key}
                              onClick={() => saveJobType('doorstepEnabled', true, promptRadius)}
                            >
                              {saving === key ? 'Saving...' : 'Turn on doorstep'}
                            </ScButton>
                          </div>
                        </div>
                      )}
                    </Fragment>
                  )
                })}
              </ScCard>
            </section>
          )}

          {vendor && <PickupSection key={vendor.id} vendor={vendor} onChange={setVendor} />}
        </TabsContent>

        <TabsContent value="time-off">
          {vendor && <PauseSection vendor={vendor} onChange={setVendor} />}
          <HolidaysSection
            closures={closures}
            loadFailed={closuresFailed}
            onChange={setClosures}
          />
        </TabsContent>

        <TabsContent value="account">

          {/* Team management arrived on main while this branch was tabbing the
              screen. It lives under Account rather than Profile: it is about who
              can act on the garage, not about the garage itself. */}
          <LinkRow
            href="/settings/members"
            icon={<IconUsers size={18} aria-hidden="true" />}
            title="Team"
            description="Add admins and operators, and set what they can do"
          />

          <section className="flex flex-col gap-3">
            <SectionHeader title="Support" />
            <SupportCard />
          </section>

          <ScButton variant="secondary" onClick={handleLogout} className="mb-4">
            <span className="flex items-center justify-center gap-2">
              <IconLogout size={18} aria-hidden="true" />
              Log out
            </span>
          </ScButton>
        </TabsContent>
      </Tabs>
    </AppShell>
  )
}
