'use client'

import { use, useState } from 'react'
import Image from 'next/image'
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
import { LocationPicker } from '@repo/ui/features/location-picker'
import { Chip } from '@repo/ui/sc/chip'
import { ScField, ScTextarea } from '@repo/ui/sc/input'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ScSection } from '@repo/ui/sc/section'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/sc/tabs'
import { formatDay as formatDayOf } from '@repo/core/format'
import { type AdminVendorDetail } from '@repo/core/api/admin'
import { useAdminDocumentsConfig } from '@repo/core/api/hooks/use-admin-documents'
import {
  legacyVehicleTypes,
  VENDOR_VEHICLE_TYPE_OPTIONS,
} from '@repo/core/vehicles'
import { cn } from '@repo/core/utils'
import { LiveBookingModeCard } from '@/components/booking-mode-card'
import { GarageDocumentsSection } from '@/components/garage-documents-section'
import { GarageCertificationSection } from '@/components/garage-certification-section'
import { GarageStrikesCard } from '@/components/garage-strikes-card'
import { PayoutAccountSection } from '@/components/payout-account-section'
import { LivePickupCard } from '@/components/pickup-card'
import { SaveBar } from '@/components/save-bar'
import { RestoreDialog } from '@/components/vendor-bin-dialogs'
import { formatWhen } from '@/lib/bookings'
import { ServicesEditor } from '@/components/services-editor'
import {
  EDIT_TABS,
  EDIT_TAB_LABELS,
  PAGE_TAB_LABELS,
  parsePageTab,
  safeBackHref,
  unsavedChangesLine,
  type PageTab,
} from '@/lib/garage-edit'
import { showAgainWarning, storedPriceSummary } from '@/lib/service-rows'
import { VendorTeamSection } from './team-section'
import {
  ACCEPTED_IMAGE_TYPES,
  DAYS,
  SLOT_INTERVALS,
  STATUS_OPTIONS,
  formatDay,
  useGarageDraft,
} from './use-garage-draft'

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
  const {
    markListStale,
    saved,
    draft,
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
    confirmLocation,
    serviceSwitching,
    handleSubmit,
    discard,
  } = useGarageDraft(id)

  const [tab, setTab] = useState<PageTab>(() => parsePageTab(query.tab))
  // Garage documents (0043) have their own tab, shown only while they are
  // on (R2_DOCS_BUCKET on the server). A ?tab=documents link while they are
  // off lands on Details.
  const documentsConfig = useAdminDocumentsConfig()
  const documentsOn = documentsConfig.data?.enabled === true
  const shownTab: PageTab =
    tab === 'documents' && documentsConfig.data && !documentsOn
      ? 'details'
      : tab

  /**
   * The open tab, in the address too, so a reload or a shared link lands on
   * it. Replaced rather than pushed: switching tabs is not somewhere Back
   * should step through.
   */
  const changeTab = (next: PageTab) => {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`
    )
  }

  const showSaveBar = dirty.length > 0 || saving

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[640px] space-y-4',
        showSaveBar && 'pb-36'
      )}
    >
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
          {bin && <BinBanner bin={bin} onRestore={() => setRestoring(true)} />}

          {/* Bypass reports (0052): strikes and reports to look into. */}
          <GarageStrikesCard vendorId={id} />

          {/* Disabled as a whole while the garage is in the Bin: every field
              and button under it, the tabs' contents included, is read-only
              until it is restored. */}
          <fieldset
            disabled={Boolean(bin)}
            className="m-0 min-w-0 border-0 p-0"
          >
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
            {/* Its own card, saved on its own: turning it on records the
              garage's signed agreement to be responsible for the car. */}
            <div className="mt-3">
              <LivePickupCard
                vendorId={id}
                enabled={bookingMode.pickupEnabled}
                pickup={bookingMode.pickup}
                pickupRadiusKm={bookingMode.pickupRadiusKm}
                termsAcceptedAt={bookingMode.pickupTermsAcceptedAt}
                termsAcceptedBy={bookingMode.pickupTermsAcceptedBy}
                // As saved: a pin dragged but not saved is not one yet.
                pinned={saved?.pin != null}
                readOnly={Boolean(bin)}
                onAuthError={toLogin}
                onSaved={markListStale}
              />
            </div>
          </fieldset>

          {/* Same four-tab shape as the vendor settings screen, so the admin
              editing a garage and the owner editing it see the same structure.
              Grouped by subject rather than by form length. */}
          <Tabs
            value={shownTab}
            onValueChange={(value) =>
              changeTab(parsePageTab(value, documentsOn))
            }
          >
            {/* Six tabs do not fit a 360px phone word for word: the row
                scrolls sideways there rather than widening the page. */}
            <TabsList className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {EDIT_TABS.map((value) => {
                const changed = dirty.includes(value)
                return (
                  <TabsTrigger
                    key={value}
                    value={value}
                    // The name in full, rather than the label plus a hidden
                    // span: the trigger is a flex box, so browsers join the
                    // two with a space ("Details , unsaved changes").
                    aria-label={
                      changed
                        ? `${EDIT_TAB_LABELS[value]}, unsaved changes`
                        : undefined
                    }
                    className="min-h-11 px-1"
                  >
                    {EDIT_TAB_LABELS[value]}
                    {/* Amber when this tab is what holds the save. */}
                    {changed && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          problemTab === value
                            ? 'bg-warning'
                            : 'bg-text-primary'
                        )}
                      />
                    )}
                  </TabsTrigger>
                )
              })}
              {/* Saves each action on its own, so it never holds unsaved
                  changes and is not one of Save changes' tabs. */}
              {documentsOn && (
                <TabsTrigger value="documents" className="min-h-11 px-1">
                  {PAGE_TAB_LABELS.documents}
                </TabsTrigger>
              )}
              {/* Detlio Certified (0048): saves each action on its own too. */}
              <TabsTrigger value="certification" className="min-h-11 px-1">
                {PAGE_TAB_LABELS.certification}
              </TabsTrigger>
            </TabsList>

            {/* The tabs themselves stay usable, to look around; what is in
                them is read-only while the garage is in the Bin. */}
            <fieldset
              disabled={Boolean(bin)}
              className="m-0 min-w-0 border-0 p-0"
            >
              <TabsContent value="details">
                <ScSection title="Business & contact">
                  <div className="grid grid-cols-2 gap-3">
                    <ScField
                      label="Owner name"
                      value={draft.form.ownerName}
                      onChange={set('ownerName')}
                    />
                    <ScField
                      label="Owner phone"
                      value={draft.form.ownerPhone}
                      onChange={set('ownerPhone')}
                      placeholder="10 digits"
                    />
                  </div>
                  <ScField
                    label="Business name"
                    value={draft.form.businessName}
                    onChange={set('businessName')}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <ScField
                      label="Business phone"
                      value={draft.form.phone}
                      onChange={set('phone')}
                      placeholder="10 digits"
                    />
                    <ScField
                      label="WhatsApp (optional)"
                      value={draft.form.whatsapp}
                      onChange={set('whatsapp')}
                      placeholder="10 digits"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <ScField
                      label="Email (optional)"
                      value={draft.form.email}
                      onChange={set('email')}
                      type="email"
                    />
                    <ScField
                      label="Years in operation (optional)"
                      value={draft.form.yearsInOperation}
                      onChange={set('yearsInOperation')}
                      placeholder="e.g. 5–10 years"
                    />
                  </div>
                </ScSection>

                {/* Team management came from main; it sits in Details, immediately
                before the media section, which is where main placed it. */}
                <VendorTeamSection vendorId={id} />

                {/* Where Detlio pays the garage (Payouts). Saved on its own, like
                the team. */}
                <PayoutAccountSection vendorId={id} />

                <ScSection title="Logo & photos">
                  <p className="text-[12px] text-text-muted">
                    Saved immediately — these do not wait for “Save changes”.
                    JPEG, PNG or WebP, up to 5 MB each.
                  </p>

                  <div className="flex items-center gap-4">
                    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-surface-elevated">
                      {logoUrl ? (
                        <Image
                          src={logoUrl}
                          alt="Logo"
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <IconBuildingStore
                          size={26}
                          className="text-text-muted"
                        />
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
                      <span className="text-[12px]">
                        {mediaBusy === 'photos' ? 'Uploading…' : 'Add'}
                      </span>
                    </button>
                  </div>
                </ScSection>

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
                  <p className="text-[12px] text-text-muted">
                    A vendor is visible to customers only when stage is{' '}
                    <b>Active</b> and it is <b>verified</b>.
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
                  <ScField
                    label="Address"
                    value={draft.form.address}
                    onChange={set('address')}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <ScField
                      label="City"
                      value={draft.form.city}
                      onChange={set('city')}
                    />
                    <ScField
                      label="Pincode"
                      value={draft.form.pincode}
                      onChange={set('pincode')}
                      placeholder="6 digits"
                    />
                  </div>
                  <ScField
                    label="Google Maps link (optional)"
                    value={draft.form.mapsUrl}
                    onChange={set('mapsUrl')}
                    placeholder="https://maps.app.goo.gl/…"
                  />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-medium text-text-secondary">
                      Garage location
                    </span>
                    {/* Verification is the one moment a human already looks at this
                    garage, so it is the natural place to sanity-check the pin.
                    The Maps link above is the cross-check: does it land here? */}
                    <p className="text-[12px] text-text-muted">
                      {geoConfirmedAt
                        ? `Confirmed ${formatDayOf(geoConfirmedAt)}`
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
                      value={
                        draft.pin
                          ? { lat: draft.pin.lat, lng: draft.pin.lng }
                          : null
                      }
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
                        {confirming
                          ? 'Confirming…'
                          : 'Confirm this pin is correct'}
                      </ScButton>
                    )}
                  </div>
                </ScSection>
              </TabsContent>

              <TabsContent value="operations">
                <ScSection title="Operations">
                  {/* Drop-in, doorstep and pickup & drop are not here any more:
                  they are "How customers book" and "Pickup & drop", above the
                  tabs, and save on their own. */}

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-medium text-text-secondary">
                      Working hours
                    </span>
                    {/* The garage's own week, day by day — the same rows the owner
                    edits in their Settings. Left alone unless changed here. */}
                    <div className="flex flex-col gap-2">
                      {draft.hours.map((day) => (
                        <div
                          key={day.dayOfWeek}
                          className="flex items-center gap-2"
                        >
                          <span
                            className={cn(
                              'w-9 shrink-0 text-[13px] font-medium',
                              day.isClosed
                                ? 'text-text-muted'
                                : 'text-text-primary'
                            )}
                          >
                            {DAYS[day.dayOfWeek]}
                          </span>
                          <input
                            type="time"
                            aria-label={`${DAYS[day.dayOfWeek]} opening time`}
                            value={day.openTime}
                            disabled={day.isClosed}
                            onChange={(e) =>
                              updateDay(day.dayOfWeek, {
                                openTime: e.target.value,
                              })
                            }
                            className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-2 font-numeric text-[13px] text-text-primary outline-none transition-colors focus:border-text-secondary disabled:opacity-40"
                          />
                          <input
                            type="time"
                            aria-label={`${DAYS[day.dayOfWeek]} closing time`}
                            value={day.closeTime}
                            disabled={day.isClosed}
                            onChange={(e) =>
                              updateDay(day.dayOfWeek, {
                                closeTime: e.target.value,
                              })
                            }
                            className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-2 font-numeric text-[13px] text-text-primary outline-none transition-colors focus:border-text-secondary disabled:opacity-40"
                          />
                          {/* The same pressed pill as the garage's own Settings: a
                          closed day is raised onto graphite. */}
                          <button
                            type="button"
                            aria-label={`${DAYS[day.dayOfWeek]} closed all day`}
                            aria-pressed={day.isClosed}
                            onClick={() =>
                              updateDay(day.dayOfWeek, {
                                isClosed: !day.isClosed,
                              })
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
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-text-secondary">
                      Slot interval
                    </label>
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
                    <ScField
                      label="Bays (optional)"
                      value={draft.form.bays}
                      onChange={set('bays')}
                      type="number"
                      placeholder="e.g. 10"
                      className="font-numeric"
                    />
                    <ScField
                      label="Jobs per day (optional)"
                      value={draft.form.jobsPerDay}
                      onChange={set('jobsPerDay')}
                      type="number"
                      placeholder="e.g. 15"
                      className="font-numeric"
                    />
                  </div>
                </ScSection>

                <ScSection title="Bookings">
                  {/* Pausing works the moment it is pressed — see setPaused. */}
                  {pausedAt ? (
                    <>
                      <p className="text-[12px] text-text-primary">
                        Paused since{' '}
                        <span className="font-numeric font-medium">
                          {formatDayOf(pausedAt)}
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
                        Taking bookings. Pausing hides the garage from customers
                        and refuses checkout; bookings it already has are not
                        touched.
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
                    <span className="text-[12px] font-medium text-text-secondary">
                      Upcoming holidays
                    </span>
                    {closures.length === 0 ? (
                      <p className="text-[12px] text-text-muted">None set.</p>
                    ) : (
                      <ul className="flex flex-col gap-1 text-[12px] text-text-primary">
                        {closures.map((closure) => (
                          <li key={closure.id}>
                            <span className="font-numeric font-medium">
                              {formatDay(closure.date)}
                            </span>
                            {closure.reason && (
                              <span className="text-text-secondary">
                                {' '}
                                · {closure.reason}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[12px] text-text-muted">
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
                        onClick={() =>
                          patch({ vehicleTypes: toggle(draft.vehicleTypes, v) })
                        }
                      />
                    ))}
                  </div>
                  <p className="text-[12px] text-text-muted">
                    These are the tiers a service prices against and a customer
                    can book for.
                  </p>

                  {/* Values from an earlier, longer checklist that no service could
                  ever price. Shown so they can be cleared, not offered again. */}
                  {legacyVehicleTypes(draft.vehicleTypes).length > 0 && (
                    <>
                      <p className="text-[12px] text-warning">
                        No longer offered — tap to remove:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {legacyVehicleTypes(draft.vehicleTypes).map((v) => (
                          <Chip
                            key={v}
                            label={`${v} ✕`}
                            selected
                            onClick={() =>
                              patch({
                                vehicleTypes: toggle(draft.vehicleTypes, v),
                              })
                            }
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
                      Each service needs a name and a price. Leave the duration
                      on “Duration” to use one booking slot. Hide takes a
                      service off the garage page straight away; past bookings
                      keep it, and you can show it again from Hidden services.
                    </>
                  }
                />

                {/* Always mounted, so the message is announced when it lands. */}
                <p
                  role="status"
                  className={
                    serviceNotice
                      ? 'text-[12px] text-text-secondary'
                      : 'sr-only'
                  }
                >
                  {serviceNotice}
                </p>

                {hiddenLoadFailed ? (
                  <p className="text-[12px] text-error">
                    Couldn’t load the hidden services. Reload the page to see
                    them.
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
                            <span className="font-numeric">
                              {hiddenServices.length}
                            </span>
                            )
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
                        <div
                          id="hidden-services"
                          className="border-t border-border"
                        >
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
                                      <p
                                        id={warningId}
                                        className="text-[12px] text-warning"
                                      >
                                        {warning}
                                      </p>
                                    )}
                                    {serviceErrors[hidden.id] && (
                                      <p
                                        role="alert"
                                        className="text-[12px] text-error"
                                      >
                                        {serviceErrors[hidden.id]}
                                      </p>
                                    )}
                                  </div>
                                  <ScButton
                                    fullWidth={false}
                                    variant="secondary"
                                    disabled={serviceSwitching || saving}
                                    aria-label={`Show ${hidden.name} again`}
                                    aria-describedby={
                                      warning ? warningId : undefined
                                    }
                                    onClick={() =>
                                      void showServiceAgain(hidden)
                                    }
                                    className="min-h-11 rounded-full px-3.5 py-2 text-[12.5px] font-medium"
                                  >
                                    {serviceBusyId === hidden.id
                                      ? 'Working…'
                                      : 'Show again'}
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

            {/* Outside the read-only fieldset: in the Bin the files still
                open, and the section itself hides every change. */}
            {documentsOn && (
              <TabsContent value="documents">
                <GarageDocumentsSection vendorId={id} readOnly={Boolean(bin)} />
              </TabsContent>
            )}
            {/* Outside the read-only fieldset too: in the Bin it still shows,
                and the section itself hides every change. */}
            <TabsContent value="certification">
              <GarageCertificationSection
                vendorId={id}
                readOnly={Boolean(bin)}
              />
            </TabsContent>
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
        <p
          id="bin-banner-title"
          className="text-[14px] font-semibold text-text-primary"
        >
          In the Bin, read-only
        </p>
        <p className="mt-1 text-[12.5px] leading-[18px] text-text-secondary">
          Moved there{' '}
          {bin.deletedAt && (
            <span className="font-numeric">{formatWhen(bin.deletedAt)}</span>
          )}
          {bin.deletedByName && <> by {bin.deletedByName}</>}.{' '}
          {/* Each sentence carries its own space, so a reason never runs
              into the next one ("demo.Customers"). */}
          {bin.deletedReason && (
            <>Reason: {bin.deletedReason.replace(/\.\s*$/, '')}. </>
          )}
          Customers and its team can&apos;t see it. Restore it to make changes.
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
