'use client'

import { Fragment, Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconBell,
  IconCar,
  IconClock,
  IconFileCertificate,
  IconFileText,
  IconLanguage,
  IconLock,
  IconLogout,
  IconMapPin,
  IconSteeringWheel,
  IconPhoto,
  IconStack2,
  IconSun,
  IconTruck,
  IconUser,
  IconUsers,
} from '@tabler/icons-react'
import { LANGUAGE_NAMES, fill, useLang, useT, useTn } from '@repo/core/i18n'
import { msg, t } from '@repo/core/i18n/translate'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
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
import { LanguageSheet } from '@repo/ui/features/language-sheet'
import {
  getMyClosures,
  getMyPhotos,
  getMyVendor,
  getWorkingHours,
  setVendorWorkingHours,
  updateSlotInterval,
  updateVendorJobTypes,
  updateVendorSettings,
  type ApiVendorPhoto,
} from '@repo/core/api/vendors'
import type {
  ApiVendorClosure,
  ApiVendorProfile,
  ApiWorkingHours,
} from '@repo/core/api/types'
import {
  DEFAULT_DOORSTEP_RADIUS_KM,
  MAX_DOORSTEP_RADIUS_KM,
} from '@repo/core/doorstep'
import { TravelChoiceField } from '@repo/ui/features/travel-choice'
import { toast } from 'react-toastify'
import { getGarageDocumentsConfig } from '@repo/core/api/documents'
import { getPushConfig } from '@repo/core/api/push'
import { isDoorstepOnly } from '@repo/core/vendor-documents'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useGarageLuxury } from '@repo/core/api/hooks/use-luxury'
import { useGarageTier } from '@repo/core/api/hooks/use-tiers'
import { TIER_LABELS, type Tier } from '@repo/core/tiers'
import { luxuryRowLine } from '@repo/core/luxury-form'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { useVendorOnboardingStore } from '@repo/core/stores/vendor-onboarding-store'
import { cn } from '@repo/core/utils'
import { AccountActions } from '@/components/account-actions'
import { ActiveGarage } from '@/components/active-garage'
import {
  HubList,
  HubPill,
  HubRow,
  HubSectionHead,
  HubTag,
} from '@/components/hub/parts'
import { PickupSection } from './pickup-section'
import { HolidaysSection, PauseSection } from './time-off-section'

/** Said from an effect, so it reads the language in use without being one of the effect's dependencies. */
const loadFailed = () => t('Failed to load settings')

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// The sections a menu row opens in place (?section=). The rest of the menu
// opens pages of their own (/photos, /settings/documents…).
const SECTIONS = ['profile', 'location', 'hours', 'time-off', 'capacity', 'job-types', 'pickup'] as const
type SettingsSection = (typeof SECTIONS)[number]

// English, shown as `t(…)`: each section's title over its Back.
const SECTION_TITLES: Record<SettingsSection, string> = {
  profile: msg('Profile'),
  location: msg('Location'),
  hours: msg('Hours'),
  'time-off': msg('Time off'),
  capacity: msg('Capacity'),
  'job-types': msg('Job types'),
  pickup: msg('Pickup & drop'),
}

/** A ?section= (or an old ?tab=) as a section, or null for the menu ("account" was the menu's last tab). */
function sectionFrom(value: string | null): SettingsSection | null {
  return SECTIONS.includes(value as SettingsSection) ? (value as SettingsSection) : null
}

/** "9 am", "9:30 pm": an HH:MM from the hours form, as the menu row says it. */
function hourLabel(time: string): string {
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h)) return time
  const suffix = h < 12 ? 'am' : 'pm'
  const hour = h % 12 || 12
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`
}

/**
 * The Hours row's value: "9 am – 8 pm" when every open day keeps the same
 * hours, "Varies by day" when they differ, "Closed" when no day is open.
 */
function hoursSummary(days: WorkingHoursForm[]): string {
  const open = days.filter((day) => !day.isClosed)
  if (open.length === 0) return t('Closed')
  const first = open[0]
  const same = open.every((day) => day.openTime === first.openTime && day.closeTime === first.closeTime)
  return same ? `${hourLabel(first.openTime)} – ${hourLabel(first.closeTime)}` : t('Varies by day')
}
const SLOT_INTERVALS = [30, 45, 60] as const
// The server's bounds for bays; jobs per day is 1–500 or blank.
const MAX_BAYS = 20
const MAX_JOBS_PER_DAY = 500

/**
 * What is wrong with the capacity form, in the owner's words (and language),
 * or null. Bays must be a whole number from 1 to 20; the daily limit is blank
 * (no limit) or a whole number from 1 up.
 */
function capacityProblem(bays: string, jobsPerDay: string): string | null {
  const bayCount = Number(bays)
  if (!/^\d+$/.test(bays) || bayCount < 1 || bayCount > MAX_BAYS) {
    return t('Cars at the same time must be between 1 and {max}.', { max: MAX_BAYS })
  }
  if (jobsPerDay.trim() === '') return null
  const jobs = Number(jobsPerDay)
  if (!/^\d+$/.test(jobsPerDay) || jobs < 1 || jobs > MAX_JOBS_PER_DAY) {
    return t('Jobs in a day must be between 1 and {max}, or left blank.', {
      max: MAX_JOBS_PER_DAY,
    })
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
 * Luxury car specialist (0083): where a Silver or Gold garage applies for
 * the badge. The owner seat only, like the API. Locked (with "Reach Silver
 * to apply") below Silver; its line follows the application after that.
 */
function LuxuryRow() {
  const t = useT()
  const vendorId = useAuthStore((s) => s.activeVendorId) ?? undefined
  const { data } = useGarageLuxury(vendorId)
  const { line, locked } = luxuryRowLine(data)
  return (
    <HubRow
      href="/settings/luxury"
      icon={locked ? IconLock : IconSteeringWheel}
      label={t('Luxury car specialist')}
      sub={t(line)}
    />
  )
}

/**
 * English or தமிழ் (Tamil), for this browser, as a row of the Account card:
 * the choice in its own language on the right, opening the Language sheet.
 * Your account keeps LanguageRow, the same choice as a card.
 */
function LanguageHubRow() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [open, setOpen] = useState(false)
  return (
    <>
      <HubRow
        icon={IconLanguage}
        label={t('Language')}
        value={<span lang={lang}>{LANGUAGE_NAMES[lang]}</span>}
        onClick={() => setOpen(true)}
        ariaHaspopup="dialog"
      />
      <LanguageSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * The garage itself, on top of the menu (mockup garage-hub 5): its cover
 * photo (the first garage photo) if any, the name, the address, whether
 * customers can see it, and its tier when known.
 */
function GarageCard({
  vendor,
  cover,
  tier,
}: {
  vendor: ApiVendorProfile
  cover: string | null
  tier: Tier | null
}) {
  const t = useT()
  const address = [vendor.address, vendor.city].filter(Boolean).join(', ')
  return (
    <section aria-label={vendor.businessName} className="hub-card overflow-hidden">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- R2 photos at many sizes
        <img src={cover} alt="" className="h-[120px] w-full object-cover" />
      ) : (
        <div aria-hidden className="h-[88px] bg-[linear-gradient(135deg,#2c2c33,#121215)]" />
      )}
      <div className="px-5 pt-4 pb-[18px]">
        <p className="text-[24px] leading-tight font-light tracking-[-0.02em] break-words text-text-primary">
          {vendor.businessName}
        </p>
        {(address || vendor.pincode) && (
          <p className="mt-1 text-t4 text-dim">
            {address}
            {vendor.pincode && (
              <>
                {address ? ' · ' : ''}
                <span className="font-numeric">{vendor.pincode}</span>
              </>
            )}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <HubTag tone={vendor.isVerified ? 'green' : 'amber'}>
            {vendor.isVerified ? t('Shown to customers') : t('Not shown to customers yet')}
          </HubTag>
          {tier && <HubTag>{t(TIER_LABELS[tier])}</HubTag>}
        </div>
      </div>
    </section>
  )
}

// The time fields of the hours editor: full-height, figures in the numeric
// face, and the same edge and focus as every other field.
const TIME_INPUT =
  // No picker icon: it took the room "am" and "pm" need ("08:00 a"); a tap still opens the picker.
  'min-h-12 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-2 font-numeric text-[15px] text-text-primary outline-none transition-colors focus:border-text-secondary disabled:opacity-40 [&::-webkit-calendar-picker-indicator]:hidden'

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
  const t = useT()
  const tn = useTn()
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
  // The section a link asked for: /settings?section=hours from a menu row,
  // or the old /settings?tab=time-off (Home's "paused" banner, links sent
  // before the menu). Read from the router on every render, so Back to the
  // menu and a row's link both follow the address.
  const section = sectionFrom(searchParams.get('section') ?? searchParams.get('tab'))
  const [photos, setPhotos] = useState<ApiVendorPhoto[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const logout = useAuthStore((s) => s.logout)
  const resetUser = useUserStore((s) => s.reset)
  const resetBookings = useBookingsStore((s) => s.reset)
  const resetOnboarding = useVendorOnboardingStore((s) => s.reset)
  const isVendorAdmin = useIsVendorAdmin()
  const activeVendorId = useAuthStore((s) => s.activeVendorId)
  const router = useRouter()
  // The garage card's medal, when the tier is known (Home's Your tier reads the same).
  const tier = useGarageTier(activeVendorId ?? undefined, isVendorAdmin).data?.tier ?? null
  // Documents shows only once the server has its private bucket for them.
  const [documentsOn, setDocumentsOn] = useState(false)
  // Notifications shows only once the API has them set up (0044).
  const [pushOn, setPushOn] = useState(false)
  useEffect(() => {
    let cancelled = false
    getPushConfig('garage')
      .then((config) => {
        if (!cancelled) setPushOn(config.enabled)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [activeVendorId])
  useEffect(() => {
    if (!isVendorAdmin) return
    let cancelled = false
    getGarageDocumentsConfig()
      .then((config) => {
        if (!cancelled) setDocumentsOn(config.enabled)
      })
      .catch(() => {
        if (!cancelled) setDocumentsOn(false)
      })
    return () => {
      cancelled = true
    }
  }, [isVendorAdmin, activeVendorId])

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
          bays: String(
            vendorData.bays && vendorData.bays > 0 ? vendorData.bays : 1
          ),
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
        toast.error(
          err instanceof Error ? err.message : loadFailed()
        )
      } finally {
        setLoading(false)
      }
    }

    void loadSettings()
    void loadClosures()
    // The garage card's cover and the photos row's count: nice to have, so a
    // failure costs only those.
    getMyPhotos()
      .then(setPhotos)
      .catch(() => setPhotos(null))
    // Reloads on a company switch: this form edits whichever company is
    // active, and leaving the previous one's values in it would let an admin
    // save the wrong garage's details.
  }, [activeVendorId])

  const runAction = async (key: string, action: () => Promise<void>) => {
    setSaving(key)
    try {
      await action()
      toast.success(t('Saved successfully'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Something went wrong'))
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
        // Empty sends null, which clears a saved radius: the hint promises
        // "Leave empty to use 10 km", and leaving the old number in place
        // would keep refusing customers between it and the default.
        doorstepRadiusKm: doorstepRadiusKm.trim()
          ? Number(doorstepRadiusKm)
          : null,
      })
      setVendor(updated)
      // Show what the server kept, so the field never claims a radius (or
      // an empty one) that is not on file.
      setDoorstepRadiusKm(
        updated.doorstepRadiusKm != null ? String(updated.doorstepRadiusKm) : ''
      )
    })

  const capacityError = capacityProblem(capacity.bays, capacity.jobsPerDay)

  const saveCapacity = () =>
    !capacityError &&
    runAction('capacity', async () => {
      const updated = await updateVendorSettings({
        bays: Number(capacity.bays),
        // Blank clears the cap rather than leaving the old one in place.
        jobsPerDay: capacity.jobsPerDay.trim()
          ? Number(capacity.jobsPerDay)
          : null,
      })
      setVendor(updated)
    })

  const saveSlotInterval = (slotIntervalMins: 30 | 45 | 60) =>
    runAction('slot-interval', async () => {
      const updated = await updateSlotInterval(slotIntervalMins)
      setVendor(updated)
    })

  // "All over <city>" for doorstep (0069) applies only while the pin is in
  // a city; the server refuses it otherwise ("Pin the garage inside a city
  // first"), which the toast then says.
  const doorstepWholeCity = vendor?.doorstepWholeCity === true && vendor.garageCity != null
  const saveDoorstepWholeCity = async (on: boolean) => {
    setSaving('doorstep-whole-city')
    try {
      const updated = await updateVendorJobTypes({ doorstepWholeCity: on })
      setVendor(updated)
      toast.success(t('Saved successfully'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Something went wrong'))
    } finally {
      setSaving(null)
    }
  }

  // Doorstep turns on without asking how far first: the radius is optional,
  // and a garage that leaves it empty covers the default 10 km from its pin
  // (set or changed under Location).
  const saveJobType = async (
    field: 'dropinEnabled' | 'doorstepEnabled',
    value: boolean
  ) => {
    const key = `job-type-${field}`
    setSaving(key)
    try {
      const updated = await updateVendorJobTypes({ [field]: value })
      setVendor(updated)
      toast.success(t('Saved successfully'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Something went wrong'))
    } finally {
      setSaving(null)
    }
  }

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

  // What each menu row says, where it is known without another call.
  const cover = photos && photos.length > 0
    ? [...photos].sort((a, b) => a.sortOrder - b.sortOrder)[0].url
    : null
  const photoCount = photos ? String(photos.length) : null
  const locationValue = !vendor
    ? undefined
    : vendor.lat === null
      ? t('Not set')
      : vendor.doorstepEnabled
        ? doorstepWholeCity
          ? t('All over {city}', { city: vendor.garageCity?.name ?? '' })
          : t('Pinned · {km} km doorstep', {
              km: vendor.doorstepRadiusKm ?? DEFAULT_DOORSTEP_RADIUS_KM,
            })
        : t('Pinned')
  const timeOffValue = vendor?.bookingsPausedAt
    ? t('Paused')
    : closures.length > 0
      ? tn(closures.length, '{count} holiday', '{count} holidays')
      : t('None')
  const jobTypesValue = vendor
    ? [vendor.dropinEnabled && t('Drop In'), vendor.doorstepEnabled && t('Doorstep')]
        .filter(Boolean)
        .join(' · ') || t('None')
    : undefined

  // The menu, or one section of it with a Back to the menu (?section=).
  const sectionTitle = section ? t(SECTION_TITLES[section]) : null

  if (loading) {
    return (
      <AppShell
        showNav
        navType="vendor"
        showBrand
        brandRight={<ActiveGarage />}
        className="gap-3 py-4"
      >
        <TopBar
          title={sectionTitle ?? t('Settings')}
          large={!section}
          showBack={Boolean(section)}
          backHref="/settings"
        />
        {/* The garage card, then a list card's worth. */}
        <div role="status" aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">{t('Loading')}</span>
          <Skeleton className="h-44 rounded-[28px]" />
          <Skeleton className="h-64 rounded-[28px]" />
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
      className="gap-3 py-4"
    >
      <TopBar
        title={sectionTitle ?? t('Settings')}
        large={!section}
        showBack={Boolean(section)}
        backHref="/settings"
      />

      {section === 'profile' ? (
        <>
        <section className="flex flex-col gap-3">
          <SectionHeader
            title={t('Profile')}
            action={
              vendor && (
                <ScBadge variant={vendor.isVerified ? 'success' : 'pending'}>
                  {vendor.isVerified
                    ? t('Shown to customers')
                    : t('Not shown to customers yet')}
                </ScBadge>
              )
            }
          />
          <ScCard className="flex flex-col gap-3">
            <ScInput
              id="settings-business-name"
              label={t('Business name')}
              value={profileForm.businessName}
              onChange={(e) =>
                setProfileForm({
                  ...profileForm,
                  businessName: e.target.value,
                })
              }
            />
            <ScInput
              id="settings-phone"
              label={t('Phone')}
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
              label={t('Address')}
              value={profileForm.address}
              onChange={(e) =>
                setProfileForm({ ...profileForm, address: e.target.value })
              }
            />
            <ScInput
              id="settings-city"
              label={t('City')}
              value={profileForm.city}
              onChange={(e) =>
                setProfileForm({ ...profileForm, city: e.target.value })
              }
            />
            <ScInput
              id="settings-pincode"
              label={t('Pincode')}
              inputMode="numeric"
              maxLength={6}
              placeholder="600001"
              className="font-numeric"
              value={profileForm.pincode}
              onChange={(e) =>
                setProfileForm({
                  ...profileForm,
                  pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                })
              }
            />
            <ScButton
              variant="main"
              size="lg"
              disabled={saving === 'profile'}
              onClick={saveProfile}
            >
              {saving === 'profile' ? t('Saving...') : t('Save profile')}
            </ScButton>
          </ScCard>
        </section>
        </>
      ) : section === 'location' ? (
        <>
        <section className="flex flex-col gap-3">
          <SectionHeader
            title={t('Garage location')}
            action={
              vendor &&
              vendor.lat === null && (
                <ScBadge variant="danger">{t('Not set')}</ScBadge>
              )
            }
          />
          <ScCard className="flex flex-col gap-3">
            {vendor?.lat === null && (
              <p role="status" className="text-[12px] text-warning">
                {t(
                  "Customers can't find you until your garage is pinned on the map, and we can't verify you without it."
                )}
              </p>
            )}
            <LocationPicker
              value={pin ? { lat: pin.lat, lng: pin.lng } : null}
              onChange={setPin}
              expectedCity={profileForm.city}
            />
            {/* "Up to N km" or "All over <city>" (0069): saved the moment it
                is picked, as the job type switches are. */}
            {vendor?.doorstepEnabled && (
              <TravelChoiceField
                label={t('How far you travel for doorstep jobs')}
                wholeCity={doorstepWholeCity}
                onChange={(on) => void saveDoorstepWholeCity(on)}
                cityName={vendor.garageCity?.name ?? null}
                radiusKm={vendor.doorstepRadiusKm}
                defaultKm={DEFAULT_DOORSTEP_RADIUS_KM}
                disabled={saving === 'doorstep-whole-city'}
                wholeCityNote={(city) => t('You go to any address in {city}.', { city })}
              />
            )}
            {!doorstepWholeCity && (
            <ScInput
              label={t('Doorstep travel radius (km)')}
              inputMode="decimal"
              placeholder={t('Default {km} km', { km: DEFAULT_DOORSTEP_RADIUS_KM })}
              className="font-numeric"
              value={doorstepRadiusKm}
              onChange={(e) =>
                setDoorstepRadiusKm(e.target.value.replace(/[^\d.]/g, ''))
              }
            />
            )}
            {/* This is the garage's own number, not a radius the customer picks:
                a doorstep search asks "who will come to me", so only the garage
                can answer it. Optional: left empty, doorstep jobs reach the
                default (the server's lib/doorstep.ts), and whether the
                garage travels at all is the Doorstep switch under Hours. */}
            {!doorstepWholeCity && (
            <p className="text-[11px] text-text-muted">
              {fill(
                t(
                  "How far you'll travel for doorstep jobs, up to {max} km. Leave empty to use {km} km."
                ),
                {
                  max: (
                    <span className="font-numeric">{MAX_DOORSTEP_RADIUS_KM}</span>
                  ),
                  km: (
                    <span className="font-numeric">
                      {DEFAULT_DOORSTEP_RADIUS_KM}
                    </span>
                  ),
                }
              )}
            </p>
            )}
            {/* The same line as under the Doorstep switch: the radius is
                measured from the pin, so it does nothing until there is one. */}
            {vendor?.doorstepEnabled && vendor.lat === null && (
              <p className="text-[12px] text-warning">
                {t("Customers can't find you for doorstep jobs until your garage is pinned.")}
              </p>
            )}
            <ScButton
              variant="main"
              size="lg"
              disabled={!pin || saving === 'location'}
              onClick={saveLocation}
            >
              {saving === 'location' ? t('Saving...') : t('Save location')}
            </ScButton>
          </ScCard>
        </section>

        {/* Only offered once the garage has a pin — an area drawn around nowhere
            in particular is not useful, and the map would open on a default city
            centre rather than on the garage. */}
        {vendor?.lat != null && (
          <section className="flex flex-col gap-3">
            <SectionHeader title={t('Doorstep coverage area')} />
            <ScCard className="flex flex-col gap-3">
              <p className="text-[12px] text-text-secondary">
                {t(
                  "Optional. Draw the exact area you'll travel to — useful when a river, highway or city boundary means a plain radius gets it wrong."
                )}
              </p>
              <CoverageEditor
                center={{ lat: vendor.lat, lng: vendor.lng as number }}
                fallbackRadiusKm={vendor.doorstepRadiusKm}
              />
            </ScCard>
          </section>
        )}
        </>
      ) : section === 'hours' ? (
        <>
        <section className="flex flex-col gap-3">
          <SectionHeader title={t('Working hours')} />
          <div className="flex flex-col gap-2">
            {workingHours.map((day) => (
              <ScCard
                key={day.dayOfWeek}
                className="flex items-center gap-2 py-2 [&:lang(ta)]:gap-1.5"
              >
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
                  aria-label={t('{day} opening time', { day: DAYS[day.dayOfWeek] })}
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
                  aria-label={t('{day} closing time', { day: DAYS[day.dayOfWeek] })}
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
                  aria-label={t('{day} closed all day', { day: DAYS[day.dayOfWeek] })}
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
                    // At least 64px, and wider for Tamil's longer words, which
                    // are a size down so the times keep room for "am" and "pm".
                    'min-h-12 min-w-[64px] shrink-0 rounded-[10px] border px-2 text-[14px] font-medium transition-colors [&:lang(ta)]:px-1.5 [&:lang(ta)]:text-[12px]',
                    day.isClosed
                      ? 'border-text-secondary bg-surface-elevated text-text-primary'
                      : 'border-border text-text-secondary hover:text-text-primary'
                  )}
                >
                  {day.isClosed ? t('Closed') : t('Open')}
                </button>
              </ScCard>
            ))}
            <ScButton
              variant="main"
              size="lg"
              disabled={saving === 'working-hours'}
              onClick={saveWorkingHours}
            >
              {saving === 'working-hours'
                ? t('Saving...')
                : t('Save working hours')}
            </ScButton>
          </div>
        </section>

        {vendor && (
          <section className="flex flex-col gap-3">
            <SectionHeader
              title={t('Slot interval')}
              subtitle={t('How far apart the start times customers can pick are.')}
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
        </>
      ) : section === 'capacity' ? (
        <>
        {vendor && (
          <section className="flex flex-col gap-3">
            <ScCard className="flex flex-col gap-3">
              <ScInput
                id="settings-bays"
                label={t('How many cars can you work on at the same time?')}
                inputMode="numeric"
                className="font-numeric"
                value={capacity.bays}
                onChange={(e) =>
                  setCapacity({
                    ...capacity,
                    bays: e.target.value.replace(/\D/g, '').slice(0, 2),
                  })
                }
              />
              <ScInput
                id="settings-jobs-per-day"
                label={t('Most jobs in a day (optional)')}
                inputMode="numeric"
                placeholder={t('No limit')}
                className="font-numeric"
                value={capacity.jobsPerDay}
                onChange={(e) =>
                  setCapacity({
                    ...capacity,
                    jobsPerDay: e.target.value.replace(/\D/g, '').slice(0, 3),
                  })
                }
              />
              {/* What the numbers do, in one line: customers are only offered
                  a time when a car can actually go in. */}
              <p className="text-[11px] text-text-muted">
                {t(
                  'Customers are only offered times when you have room for one more car. Leave the daily limit blank for no limit.'
                )}
              </p>
              {capacityError && (
                <p role="alert" className="text-[12px] text-warning">
                  {capacityError}
                </p>
              )}
              {/* Secondary: "Save working hours" above is this tab's main
                  action, and red is kept for one per screen. */}
              <ScButton
                variant="outline"
                size="md"
                disabled={!!capacityError || saving === 'capacity'}
                onClick={saveCapacity}
              >
                {saving === 'capacity' ? t('Saving...') : t('Save capacity')}
              </ScButton>
            </ScCard>
          </section>
        )}
        </>
      ) : section === 'job-types' ? (
        <>
        {vendor && (
          <section className="flex flex-col gap-3">
            <ScCard className="flex flex-col gap-3">
              {(
                [
                  {
                    field: 'dropinEnabled',
                    label: t('Drop In'),
                    description: t('Customers visit your garage'),
                  },
                  {
                    field: 'doorstepEnabled',
                    label: t('Doorstep'),
                    description: t('You travel to the customer'),
                  },
                ] as const
              ).map(({ field, label, description }) => {
                const enabled = vendor[field]
                const key = `job-type-${field}`
                return (
                  <Fragment key={field}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium text-text-primary">
                          {label}
                        </p>
                        <p className="text-[11px] text-text-secondary">
                          {description}
                        </p>
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
                    {/* Doorstep is measured from the garage's pin, so an
                        unpinned garage is left off the Doorstep list and
                        cannot be booked there. Saying so here stops the
                        switch reading as "you take doorstep jobs now". */}
                    {field === 'doorstepEnabled' &&
                      enabled &&
                      vendor.lat === null && (
                        <div className="flex flex-col items-start">
                          <p
                            role="status"
                            className="text-[12px] text-warning"
                          >
                            {t(
                              "Customers can't find you for doorstep jobs until your garage is pinned."
                            )}
                          </p>
                          <button
                            type="button"
                            className="min-h-11 text-[12px] font-medium text-text-primary underline underline-offset-2"
                            onClick={() => router.push('/settings?section=location')}
                          >
                            {t('Pin it under Location')}
                          </button>
                        </div>
                      )}
                  </Fragment>
                )
              })}
            </ScCard>
          </section>
        )}
        </>
      ) : section === 'pickup' ? (
        <>
        {vendor && (
          <PickupSection
            key={vendor.id}
            vendor={vendor}
            onChange={setVendor}
          />
        )}
        </>
      ) : section === 'time-off' ? (
        <>
        {vendor && <PauseSection vendor={vendor} onChange={setVendor} />}
        <HolidaysSection
          closures={closures}
          loadFailed={closuresFailed}
          onChange={setClosures}
        />
        </>
      ) : (
        // The menu (mockup garage-hub 5): the garage itself, then three list
        // cards. Each row says its current answer where it is known, and
        // opens its section here or its own page.
        <>
          {vendor && (
            <GarageCard
              vendor={vendor}
              cover={cover}
              tier={tier}
            />
          )}

          <HubSectionHead title={t('Your garage')} />
          <HubList>
            <HubRow
              href="/settings?section=profile"
              icon={IconUser}
              label={t('Profile')}
              value={t('Name, phone, address')}
            />
            <HubRow
              href="/photos"
              icon={IconPhoto}
              label={t('Garage photos')}
              value={photoCount ?? undefined}
            />
            <HubRow
              href="/settings?section=location"
              icon={IconMapPin}
              label={t('Location')}
              value={locationValue}
            />
            <HubRow
              href="/settings?section=hours"
              icon={IconClock}
              label={t('Hours')}
              value={hoursSummary(workingHours)}
            />
            <HubRow
              href="/settings?section=time-off"
              icon={IconSun}
              label={t('Time off')}
              value={timeOffValue}
            />
          </HubList>

          <HubSectionHead title={t('Jobs')} />
          <HubList>
            <HubRow
              href="/settings?section=capacity"
              icon={IconStack2}
              label={t('Capacity')}
              value={
                vendor
                  ? tn(Number(capacity.bays) || 1, '{count} car at a time', '{count} cars at a time')
                  : undefined
              }
            />
            <HubRow
              href="/settings?section=job-types"
              icon={IconCar}
              label={t('Job types')}
              value={jobTypesValue}
            />
            <HubRow
              href="/settings?section=pickup"
              icon={IconTruck}
              label={t('Pickup & drop')}
              value={vendor ? (vendor.pickupEnabled ? t('On') : t('Off')) : undefined}
            />
            {isVendorAdmin && <LuxuryRow />}
          </HubList>

          <HubSectionHead title={t('Account')} />
          <HubList>
            {documentsOn && (
              <HubRow
                href="/settings/documents"
                icon={IconFileCertificate}
                label={t('Documents')}
                sub={
                  // A doorstep-only garage (no pickup either) has no shop, so no shop photo is asked for.
                  vendor &&
                  isDoorstepOnly({
                    doorstepEnabled: vendor.doorstepEnabled,
                    dropinEnabled: vendor.dropinEnabled,
                    pickupOffered: vendor.pickupEnabled === true,
                  })
                    ? t('Your ID and bank proof, one of the steps to Silver')
                    : t('Your ID, bank proof and shop photo, one of the steps to Silver')
                }
              />
            )}
            <HubRow
              href="/agreement"
              icon={IconFileText}
              label={t('Garage agreement')}
              sub={t('Read and accept the Detlio garage agreement, for Bronze')}
            />
            <HubRow
              href="/settings/members"
              icon={IconUsers}
              label={t('Team members')}
              sub={t('Add admins and operators, and set what they can do')}
            />
            {pushOn && (
              <HubRow
                href="/settings/notifications"
                icon={IconBell}
                label={t('Notifications')}
                sub={t('New-booking alerts on this phone or computer')}
              />
            )}
            {/* English or தமிழ் (Tamil), on this browser. */}
            <LanguageHubRow />
          </HubList>

          {/* Close my garage (the owner), or leave it and delete the login
              (any other seat) (0066). */}
          <AccountActions />

          <section className="flex flex-col gap-3">
            <HubSectionHead title={t('Support')} />
            <SupportCard />
          </section>

          <HubPill onClick={handleLogout} className="mb-4 min-h-12">
            <IconLogout size={18} aria-hidden="true" />
            {t('Log out')}
          </HubPill>
        </>
      )}
    </AppShell>
  )
}
