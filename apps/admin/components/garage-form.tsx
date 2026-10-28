'use client'

import { useId, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { IconAlertTriangle, IconUserCheck } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import {
  LocationPicker,
  type PickedLocation,
} from '@repo/ui/features/location-picker'
import { Chip } from '@repo/ui/sc/chip'
import { ScField, ScTextarea } from '@repo/ui/sc/input'
import { ScSelect } from '@repo/ui/sc/select'
import { Notice } from '@repo/ui/sc/notice'
import { ScSection } from '@repo/ui/sc/section'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/sc/tabs'
import { ApiError } from '@repo/core/api/client'
import {
  createAdminVendor,
  getOwnerAccount,
  type ImportFieldNote,
} from '@repo/core/api/admin'
import { useInvalidateAdminVendors } from '@repo/core/api/hooks/use-admin-vendors'
import { useAdminLogins } from '@repo/core/api/hooks/use-admin-logins'
import { VENDOR_VEHICLE_TYPE_OPTIONS } from '@repo/core/vehicles'
import { parsePickupRadius } from '@repo/core/pickup'
import { cn } from '@repo/core/utils'
import { BookingModeCard } from '@/components/booking-mode-card'
import { PickupFields } from '@/components/pickup-card'
import { ImportNote, MARKED_FIELD } from '@/components/import-note'
import { ServicesEditor } from '@/components/services-editor'
import {
  bookingModeFlags,
  garageFieldsProblem,
  onboardedByInput,
  onboardedBySelectValue,
  parseRadiusInput,
  ONBOARDED_BY_MAX,
  ONBOARDED_BY_NOT_SET,
  ONBOARDED_BY_OTHER,
  type BookingMode,
} from '@/lib/garage-edit'
import {
  DEFAULT_WORKING_DAYS,
  EMPTY_GARAGE_TEXT,
  missingForCreate,
  missingLine,
  type GarageFormInitial,
  type GarageTextField,
} from '@/lib/garage-form'
import {
  visibleMark,
  type ImportMark,
  type ServiceRowNote,
} from '@/lib/garage-import'
import { toServicePayload, type ServiceRow } from '@/lib/service-editor'
import { rowsToSave, servicesSaveBlock } from '@/lib/service-rows'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SLOT_INTERVALS = [30, 45, 60] as const
const STATUS_OPTIONS = [
  { value: 'pending' as const, label: 'Pending' },
  { value: 'active' as const, label: 'Active (live)' },
  { value: 'suspended' as const, label: 'Suspended' },
]

interface GarageFormProps {
  /**
   * Tabs for a garage typed in by hand, like the edit page. Stacked for the
   * import's review, so every "Check this" is on one page rather than
   * behind a tab.
   */
  layout: 'tabs' | 'stacked'
  initial?: GarageFormInitial
  /** The import's notes on garage-level fields, by field. */
  marks?: Record<string, ImportFieldNote>
  /** The import's notes under service rows, by row key. */
  rowNotes?: Record<string, ServiceRowNote[]>
  /** A line under the services (the import's "no times given"). */
  servicesHelp?: string | null
  /**
   * An import: always saved as Pending and not verified. The data came from
   * a photo or a form someone else filled in, so going live is a separate,
   * deliberate step (Verify on Vendors). The stage controls give way to a
   * note saying so.
   */
  pendingOnly?: boolean
  /** Where to go once the garage is created. */
  afterCreate: string
}

/**
 * Add garage's form, typed in by hand or filled in by an import. The same
 * fields, rules and Create either way: the one write is POST /admin/vendors.
 */
export function GarageForm({
  layout,
  initial,
  marks = {},
  rowNotes,
  servicesHelp,
  pendingOnly = false,
  afterCreate,
}: GarageFormProps) {
  const router = useRouter()
  const markListStale = useInvalidateAdminVendors()
  const [form, setForm] = useState({ ...EMPTY_GARAGE_TEXT, ...initial?.text })
  // Pickup & drop: off unless the garage signed the agreement to be
  // responsible for the car, which the admin ticks here.
  const [pickupOn, setPickupOn] = useState(false)
  const [pickupAgreed, setPickupAgreed] = useState(false)
  // Optional here, unlike the vendor's own onboarding: staff often create a
  // garage from a phone call and pin it later. The consequence lands at
  // verification, which the server refuses without coordinates.
  const [pin, setPin] = useState<PickedLocation | null>(null)
  // How customers book: the same card as the edit page, held here and sent
  // with Create rather than saved on tap — there is no garage to save to yet.
  const [bookingMode, setBookingMode] = useState<BookingMode>(
    initial?.bookingMode ?? 'garage'
  )
  const [doorstepRadius, setDoorstepRadius] = useState(
    initial?.doorstepRadius ?? ''
  )
  const [slotIntervalMins, setSlotIntervalMins] = useState<30 | 45 | 60>(30)
  const [workingDays, setWorkingDays] = useState<number[]>(
    initial?.workingDays ?? DEFAULT_WORKING_DAYS
  )
  const [vehicleTypes, setVehicleTypes] = useState<string[]>(
    initial?.vehicleTypes ?? []
  )
  const [status, setStatus] = useState<'pending' | 'active' | 'suspended'>(
    'pending'
  )
  const [isVerified, setIsVerified] = useState(false)
  // Who on the team brought the garage in: picked by hand, never filled in,
  // as whoever adds a garage may not be who onboarded it (0059).
  const [onboardedBy, setOnboardedBy] = useState('')
  const [services, setServices] = useState<ServiceRow[]>(
    initial?.services ?? []
  )
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // AI text still arriving in the services editor: Create waits for it, or
  // the garage would be created without the text the admin is watching land.
  const [describing, setDescribing] = useState(false)

  const set = (key: GarageTextField) => (v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }))

  // Every row typed into is sent, as on the edit screen: a service left out
  // here for a missing price would simply not exist, with nothing said. A row
  // that is not ready says so and holds Create instead.
  const servicesBlock = servicesSaveBlock(services)
  const servicesToSave = rowsToSave(services)
  // Only read while doorstep is on: an "At the garage" garage travels nowhere.
  const travels = bookingMode !== 'garage'
  const radius = parseRadiusInput(doorstepRadius)
  const radiusBlock = travels && !radius.ok ? radius.message : null
  const pickupRadiusParsed = parsePickupRadius(form.pickupRadiusKm)
  const pickupBlock = !pickupOn
    ? null
    : !pickupRadiusParsed.ok
      ? pickupRadiusParsed.message
      : !pickupAgreed
        ? 'Tick that the garage signed the pickup & drop agreement, or turn pickup off.'
        : null
  // A doorstep-only garage needs no address or pincode (0061).
  const atGarage = bookingMode !== 'doorstep'
  const fieldsProblem = garageFieldsProblem(form, atGarage)
  const missing = missingForCreate(form, services, atGarage)

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

  const canCreate =
    !fieldsProblem &&
    !servicesBlock &&
    !radiusBlock &&
    !pickupBlock &&
    !describing &&
    !loading

  const handleSubmit = async () => {
    if (!canCreate) return
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
        ...(pickupOn &&
          pickupRadiusParsed.ok && {
            pickupEnabled: true,
            pickupAgreementSigned: pickupAgreed,
            pickupRadiusKm: pickupRadiusParsed.km ?? undefined,
          }),
        // Empty means the default distance, so nothing is sent for it.
        doorstepRadiusKm:
          travels && radius.ok ? (radius.km ?? undefined) : undefined,
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
        status: pendingOnly ? 'pending' : status,
        isVerified: pendingOnly ? false : isVerified,
        notes: form.notes.trim() || undefined,
        // Left out when not set, so an API from before 0059 never sees it.
        ...(onboardedByInput(onboardedBy) && {
          onboardedByName: onboardedByInput(onboardedBy),
        }),
        services: servicesToSave.length
          ? servicesToSave.map(toServicePayload)
          : undefined,
      })
      markListStale()
      router.replace(afterCreate)
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        router.replace('/login')
        return
      }
      setError(
        err instanceof ApiError
          ? err.message
          : 'Couldn’t create the garage. Try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  /** The import's note on a field, while it has one to show. */
  const markOf = (key: string): ImportMark | null =>
    visibleMark(key, marks[key], form)

  /** A text field with the import's note under it, when it has one. */
  const field = (
    key: GarageTextField,
    label: string,
    props: {
      placeholder?: string
      type?: string
      className?: string
      inputMode?: 'numeric' | 'tel' | 'email'
    } = {},
    after?: ReactNode
  ) => (
    <MarkedField
      label={label}
      value={form[key]}
      onChange={set(key)}
      mark={markOf(key)}
      {...props}
    >
      {after}
    </MarkedField>
  )

  const hoursMark =
    marks.workingHours?.confidence === 'check'
      ? ({ kind: 'check', reason: marks.workingHours.reason } as const)
      : marks.workingHours?.confidence === 'missing'
        ? ({
            kind: 'missing',
            reason:
              'No hours given, so Mon–Sat 09:00–18:00 is set. Change it to the garage’s hours.',
          } as const)
        : null
  const bookingMark =
    marks.bookingTypes?.confidence === 'check'
      ? ({ kind: 'check', reason: marks.bookingTypes.reason } as const)
      : marks.bookingTypes?.confidence === 'missing'
        ? ({
            kind: 'missing',
            reason:
              'Not said, so At the garage is set. Change it if the garage goes to customers.',
          } as const)
        : null
  const markLine = (key: string) => {
    const mark =
      marks[key]?.confidence === 'check'
        ? ({ kind: 'check', reason: marks[key].reason } as const)
        : null
    return mark && <ImportNote mark={mark} />
  }

  const bookingCard = (
    <div className="flex flex-col gap-2">
      <BookingModeCard
        mode={bookingMode}
        onModeChange={setBookingMode}
        radius={doorstepRadius}
        onRadiusChange={setDoorstepRadius}
        reachKm={radius.ok ? radius.km : null}
        radiusError={radiusBlock}
        live={!pendingOnly && status === 'active' && isVerified}
      />
      {bookingMark && <ImportNote mark={bookingMark} />}
      {markLine('doorstepRadiusKm')}
      <section
        aria-label="Pickup & drop"
        className="rounded-[16px] border border-border bg-surface p-4"
      >
        <PickupFields
          on={pickupOn}
          onSwitch={(next) => {
            setPickupOn(next)
            if (!next) setPickupAgreed(false)
          }}
          radius={form.pickupRadiusKm}
          onRadiusChange={(value) =>
            setForm((f) => ({ ...f, pickupRadiusKm: value }))
          }
          radiusError={
            pickupOn && !pickupRadiusParsed.ok
              ? pickupRadiusParsed.message
              : null
          }
          askAgreement={pickupOn}
          agreed={pickupAgreed}
          onAgreedChange={setPickupAgreed}
          pinned={pin != null}
        />
      </section>
      {markLine('pickupRadiusKm')}
    </div>
  )

  const detailsSection = (
    <ScSection title="Business & contact">
      {field('businessName', 'Business name')}
      {/* One above the other on the review, where each can carry a note. */}
      <div className={cn('grid gap-3', layout === 'tabs' && 'grid-cols-2')}>
        {field('ownerName', 'Owner name', { placeholder: 'Owner’s full name' })}
        {field(
          'ownerPhone',
          'Owner phone',
          {
            placeholder: '10 digits',
            inputMode: 'numeric',
            className: 'font-numeric',
          },
          <OwnerAccountLine phone={form.ownerPhone.trim()} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('phone', 'Business phone', {
          placeholder: '10 digits',
          inputMode: 'numeric',
          className: 'font-numeric',
        })}
        {field('whatsapp', 'WhatsApp (optional)', {
          placeholder: '10 digits',
          inputMode: 'numeric',
          className: 'font-numeric',
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('email', 'Email (optional)', {
          type: 'email',
          inputMode: 'email',
        })}
        {field('yearsInOperation', 'Years in operation (optional)', {
          placeholder: 'e.g. 5–10 years',
        })}
      </div>
      <OnboardedByField value={onboardedBy} onChange={setOnboardedBy} />
    </ScSection>
  )

  const statusSection = pendingOnly ? (
    <ScSection title="Notes">
      <ScTextarea
        label="Notes (optional)"
        value={form.notes}
        onChange={(e) => set('notes')(e.target.value)}
        rows={3}
      />
    </ScSection>
  ) : (
    <ScSection title="Onboarding status">
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-text-secondary">
          Stage
        </label>
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
      <ScCheckbox
        label="Mark as verified"
        checked={isVerified}
        onChange={setIsVerified}
      />
      <p className="text-[12px] text-text-muted">
        A vendor is visible to customers only when stage is <b>Active</b> and it
        is <b>verified</b>.
      </p>
      <ScTextarea
        label="Notes (optional)"
        value={form.notes}
        onChange={(e) => set('notes')(e.target.value)}
        rows={3}
      />
    </ScSection>
  )

  const locationSection = (
    <ScSection title="Location">
      {field('address', atGarage ? 'Address' : 'Address (optional)')}
      <div className="grid grid-cols-2 gap-3">
        {field('city', 'City')}
        {field('pincode', atGarage ? 'Pincode' : 'Pincode (optional)', {
          placeholder: '6 digits',
          inputMode: 'numeric',
          className: 'font-numeric',
        })}
      </div>
      {!atGarage && (
        <p className="text-[12px] text-text-secondary">
          Doorstep only: the map pin is enough. Add the address if customers
          will ever come to the garage.
        </p>
      )}
      {field('mapsUrl', 'Google Maps link (optional)', {
        placeholder: 'https://maps.app.goo.gl/…',
      })}
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-text-secondary">
          Garage location
        </span>
        <p className="text-[12px] text-text-muted">
          Optional now, required before this garage can be verified.
        </p>
        <LocationPicker
          value={pin ? { lat: pin.lat, lng: pin.lng } : null}
          onChange={setPin}
          expectedCity={form.city}
        />
      </div>
    </ScSection>
  )

  const operationsSection = (
    <ScSection title="Operations">
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-text-secondary">
          Working days
        </label>
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
        <ScField
          label="Opening time"
          value={form.openTime}
          onChange={set('openTime')}
          type="time"
          className={cn('font-numeric', hoursMark && MARKED_FIELD)}
        />
        <ScField
          label="Closing time"
          value={form.closeTime}
          onChange={set('closeTime')}
          type="time"
          className={cn('font-numeric', hoursMark && MARKED_FIELD)}
        />
      </div>
      {hoursMark && <ImportNote mark={hoursMark} />}

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-text-secondary">
          Slot interval
        </label>
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
        <ScField
          label="Bays (optional)"
          value={form.bays}
          onChange={set('bays')}
          type="number"
          placeholder="e.g. 10"
        />
        <ScField
          label="Jobs per day (optional)"
          value={form.jobsPerDay}
          onChange={set('jobsPerDay')}
          type="number"
          placeholder="e.g. 15"
        />
      </div>
    </ScSection>
  )

  const vehiclesSection = (
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
      {markLine('vehicleTypes')}
    </ScSection>
  )

  const servicesSection = (
    <div className="flex flex-col gap-2">
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
        rowNotes={rowNotes}
        footnote={
          servicesHelp ?? (
            <>
              Each service needs a name and a price. Leave the duration on
              “Duration” to use one booking slot. Photos can be added once the
              garage is created.
            </>
          )
        }
      />
      {markLine('services')}
    </div>
  )

  // Why Create is off, beside it: the admin may be anywhere on the form when
  // they reach for it. The review counts what is left; by hand, the first
  // thing to fix is named with its tab, as on the edit page.
  const blockLine =
    layout === 'stacked'
      ? (missingLine(missing) ??
        (radiusBlock
          ? 'Check the doorstep distance above.'
          : pickupBlock
            ? `${pickupBlock} (Pickup & drop, above)`
            : null))
      : fieldsProblem
        ? fieldsProblem
        : servicesBlock
          ? `${servicesBlock} — see the Services tab.`
          : radiusBlock
            ? 'Check the doorstep distance above.'
            : pickupBlock
              ? `${pickupBlock} (Pickup & drop, above)`
              : null

  return (
    <div className="space-y-4">
      {bookingCard}

      {layout === 'tabs' ? (
        // Mirrors the edit screen's tabs, which mirror the vendor settings
        // screen — one shape for "a garage's details", wherever you edit it.
        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="location">Location</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
          </TabsList>
          <TabsContent value="details">
            {detailsSection}
            {statusSection}
          </TabsContent>
          <TabsContent value="location">{locationSection}</TabsContent>
          <TabsContent value="operations">
            {operationsSection}
            {vehiclesSection}
          </TabsContent>
          <TabsContent value="services">{servicesSection}</TabsContent>
        </Tabs>
      ) : (
        <>
          {detailsSection}
          {locationSection}
          {operationsSection}
          {vehiclesSection}
          {servicesSection}
          {statusSection}
        </>
      )}

      {pendingOnly && (
        <Notice
          tone="neutral"
          title="Saved as Pending — nothing goes live until you verify"
        >
          Customers can’t see or book it yet. Verify it from Vendors once it’s
          right.
        </Notice>
      )}

      {/* Amber, as errors are: red on this page is Create garage. */}
      {error && (
        <p role="alert" className="text-[13px] text-error">
          {error}
        </p>
      )}

      {blockLine && (
        <p
          id="create-block"
          className="flex items-center justify-center gap-1.5 text-center text-[13px] text-text-secondary"
        >
          <IconAlertTriangle
            size={15}
            stroke={1.8}
            aria-hidden="true"
            className="shrink-0 text-warning"
          />
          {blockLine}
        </p>
      )}

      <ScButton
        disabled={!canCreate}
        aria-describedby={blockLine ? 'create-block' : undefined}
        onClick={handleSubmit}
      >
        {loading ? 'Creating…' : 'Create garage'}
      </ScButton>
    </div>
  )
}

/** ScField with the import's note under it, tied to the input for a screen reader. */
function MarkedField({
  label,
  value,
  onChange,
  mark,
  placeholder,
  type,
  inputMode,
  className,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  mark: ImportMark | null
  placeholder?: string
  type?: string
  inputMode?: 'numeric' | 'tel' | 'email'
  className?: string
  children?: ReactNode
}) {
  const noteId = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <ScField
        label={label}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        aria-describedby={mark ? noteId : undefined}
        className={cn(className, mark && MARKED_FIELD)}
      />
      {mark && <ImportNote id={noteId} mark={mark} />}
      {children}
    </div>
  )
}

/**
 * Who the owner phone already belongs to. Create attaches the garage to
 * that account and gives it the garage's admin seat, so a misread digit
 * would hand the garage to a stranger: it is said before Create, not after.
 */
function OwnerAccountLine({ phone }: { phone: string }) {
  const valid = /^\d{10}$/.test(phone)
  const { data } = useQuery({
    queryKey: ['admin', 'owner-account', phone],
    queryFn: () => getOwnerAccount(phone),
    enabled: valid,
    staleTime: 30_000,
    retry: false,
  })
  const account = valid ? data?.account : undefined

  let line: ReactNode = null
  if (account === null) {
    line = (
      <span className="text-text-muted">
        No Detlio account has this number yet. Create sets one up for the owner.
      </span>
    )
  } else if (account) {
    const what = [
      account.isCustomer ? 'customer' : null,
      account.garages.length === 1
        ? `owns ${account.garages[0].businessName}`
        : account.garages.length > 1
          ? `owns ${account.garages.length} garages`
          : null,
    ]
      .filter(Boolean)
      .join(' · ')
    line = (
      <span className="flex items-start gap-1.5 text-text-secondary">
        <IconUserCheck
          size={14}
          stroke={1.8}
          aria-hidden="true"
          className="mt-[1.5px] shrink-0 text-warning"
        />
        <span>
          Already a Detlio account:{' '}
          <span className="font-medium text-text-primary">{account.name}</span>
          {what && <> ({what})</>}. Create adds this garage to that account.
        </span>
      </span>
    )
  }

  // Always mounted, so what it says is announced when it changes.
  return (
    <div role="status" className="text-[12px] leading-[17px]">
      {line}
    </div>
  )
}

/**
 * "Onboarded by": who on the team brought the garage in (0059), shared by
 * Add garage, the import's review and the garage editor. One of the team's
 * logins, "Someone else…" with a name typed (up to 100 characters), or Not
 * set. Optional, and set by hand only.
 *
 * Logins that are off are not offered, but a garage already credited to one
 * keeps showing that name. Before the logins load, a stored name is offered
 * as itself, so it does not flash up as "Someone else…".
 */
export function OnboardedByField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const logins = useAdminLogins()
  const [typingOther, setTypingOther] = useState(false)
  const current = value.trim()
  const names = logins.data
    ? logins.data.logins
        .filter((login) => login.status === 'active' || login.name === current)
        .map((login) => login.name)
    : current
      ? [current]
      : []
  const selected = onboardedBySelectValue(value, names, typingOther)

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ScSelect
        label="Onboarded by (optional)"
        value={selected}
        disabled={disabled}
        className="min-h-11"
        onChange={(e) => {
          const next = e.target.value
          if (next === ONBOARDED_BY_OTHER) {
            setTypingOther(true)
            // A login's name is not what is being typed: start empty.
            if (names.includes(current)) onChange('')
            return
          }
          setTypingOther(false)
          onChange(next)
        }}
      >
        <option value={ONBOARDED_BY_NOT_SET}>Not set</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        <option value={ONBOARDED_BY_OTHER}>Someone else…</option>
      </ScSelect>
      {selected === ONBOARDED_BY_OTHER && (
        <ScField
          label="Their name"
          value={value}
          onChange={onChange}
          maxLength={ONBOARDED_BY_MAX}
          disabled={disabled}
          placeholder="Who brought the garage in"
          autoComplete="off"
        />
      )}
    </div>
  )
}
