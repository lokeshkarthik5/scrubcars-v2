'use client'

import { use, useRef, useState } from 'react'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/sc/tabs'
import { useAdminDocumentsConfig } from '@repo/core/api/hooks/use-admin-documents'
import { cn } from '@repo/core/utils'
import { GarageDocumentsSection } from '@/components/garage-documents-section'
import { GarageCertificationSection } from '@/components/garage-certification-section'
import { GarageTierSection } from '@/components/garage-tier-section'
import { GarageReviewsSection } from '@/components/garage-reviews-section'
import { GarageStrikesCard } from '@/components/garage-strikes-card'
import { SaveBar } from '@/components/save-bar'
import { RestoreDialog } from '@/components/vendor-bin-dialogs'
import {
  PAGE_TABS,
  PAGE_TAB_LABELS,
  isEditTab,
  parsePageTab,
  safeBackHref,
  saveBarLine,
  type PageTab,
} from '@/lib/garage-edit'
import { tabDots } from '@/lib/garage-status'
import { BinBanner } from './bin-banner'
import { EditorHeader } from './editor-header'
import { HowCustomersBook } from './how-customers-book'
import { StatusPanel } from './status-panel'
import { DetailsTab } from './tabs/details-tab'
import { HoursBookingTab } from './tabs/hours-booking-tab'
import { LocationTab } from './tabs/location-tab'
import { ServicesTab } from './tabs/services-tab'
import { TeamPayoutTab } from './tabs/team-payout-tab'
import { ACCEPTED_IMAGE_TYPES, useGarageDraft } from './use-garage-draft'

/**
 * The garage editor (mockup 05): a header across the page — where you are,
 * the garage, View as customer — then two columns from a laptop up: the
 * garage's status, its marks and Go live on the left, the tabs on the right
 * with one save bar. One column on a phone, status first. Layout only: the
 * draft and every save are in useGarageDraft.
 */
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
  const g = useGarageDraft(id)
  const {
    markListStale,
    afterInstantSave,
    checklist,
    fields,
    saved,
    draft,
    bookingMode,
    pausedAt,
    bin,
    restoring,
    setRestoring,
    loading,
    saving,
    error,
    describing,
    logoInputRef,
    photoInputRef,
    toLogin,
    dirty,
    saveBlock,
    problemTab,
    load,
    handleLogoFile,
    handlePhotoFiles,
    serviceSwitching,
    handleSubmit,
    discard,
  } = g

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
  const tabsRef = useRef<HTMLDivElement>(null)

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

  /**
   * A checklist line: the tab that fixes it. In one column the tabs are
   * below the panel, so they are brought into view too.
   */
  const openFromPanel = (next: PageTab) => {
    changeTab(next)
    if (window.matchMedia('(max-width: 1023.98px)').matches) {
      tabsRef.current?.scrollIntoView({ block: 'start' })
    }
  }

  const showSaveBar = dirty.length > 0 || saving
  const readOnly = Boolean(bin)
  const dots = tabDots(checklist.readiness)
  const tabs = PAGE_TABS.filter((value) => value !== 'documents' || documentsOn)

  const fileInputs = (
    <>
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
    </>
  )

  if (loading || !draft || !saved || !bookingMode) {
    return (
      <div className="mx-auto w-full max-w-[640px] space-y-4">
        <PageHeader title="Edit garage" backHref={backHref} />
        {loading ? (
          <SkeletonList count={3} itemClassName="h-40" />
        ) : (
          <p role="alert" className="text-[13px] text-error">
            {error || 'Failed to load vendor'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-4 lg:gap-5',
        // Room under the last field for the bar fixed over it on a phone.
        showSaveBar && 'pb-36 lg:pb-0'
      )}
    >
      {fileInputs}

      <EditorHeader vendorId={id} backHref={backHref} saved={saved} />

      <div className="w-full lg:grid lg:grid-cols-[minmax(272px,320px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* Sticky, on its own scroll: the checklist and Go live stay in view
          however long the tab beside it is. */}
        <aside
          aria-label="Garage status"
          className="mb-4 lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-2 lg:[scrollbar-width:thin]"
        >
          <StatusPanel
            vendorId={id}
            g={g}
            saved={saved}
            draft={draft}
            documentsOn={documentsOn}
            onOpenTab={openFromPanel}
          />
        </aside>

        {/* A container, so the tabs lay their sections side by side by the
          room this column has, not by the screen. */}
        <div className="@container flex min-w-0 flex-col gap-4">
          {bin && <BinBanner bin={bin} onRestore={() => setRestoring(true)} />}

          {/* Bypass reports (0052): strikes and reports to look into. */}
          <GarageStrikesCard vendorId={id} />

          <Tabs
            ref={tabsRef}
            value={shownTab}
            onValueChange={(value) =>
              changeTab(parsePageTab(value, documentsOn))
            }
            className="scroll-mt-4"
          >
            {/* Seven tabs do not fit a phone word for word: the row scrolls
              sideways there rather than widening the page. */}
            <TabsList className="gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((value) => {
                const label = PAGE_TAB_LABELS[value]
                const changed = isEditTab(value) && dirty.includes(value)
                // Reviews (0065) is not one of the checklist's tabs.
                const dot = value === 'reviews' ? undefined : dots[value]
                return (
                  <TabsTrigger
                    key={value}
                    value={value}
                    // The name in full, rather than the label plus a hidden
                    // span: the trigger is a flex box, so browsers join the
                    // two with a space ("Details , unsaved changes").
                    aria-label={
                      changed ? `${label}, unsaved changes` : undefined
                    }
                    className="-mb-px min-h-11 flex-none whitespace-nowrap rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    {label}
                    {/* Red where something blocks booking, amber where
                      something should be fixed soon (the checklist). */}
                    {dot && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          dot === 'red' ? 'bg-tone-new-dot' : 'bg-warning'
                        )}
                      />
                    )}
                    {/* Unsaved here: a ring, amber when it holds the save. */}
                    {changed && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-2 shrink-0 rounded-full border-2',
                          problemTab === value
                            ? 'border-warning'
                            : 'border-text-primary'
                        )}
                      />
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>

            {/* How customers book, as tick tiles at the top of Location.
              They save on tap and read the garage once, so they stay
              mounted on every tab and are only hidden: a remount would
              show the values as first loaded. */}
            <fieldset
              disabled={readOnly}
              className={cn(
                'm-0 min-w-0 border-0 p-0',
                shownTab !== 'location' && 'hidden'
              )}
            >
              <HowCustomersBook
                vendorId={id}
                booking={bookingMode}
                // As saved: a pin dragged but not saved is not one yet.
                pinned={saved.pin != null}
                paused={pausedAt != null}
                // As saved, not as drafted: an unsaved Active is not live yet.
                live={saved.status === 'active' && saved.isVerified}
                onAuthError={toLogin}
                onSaved={afterInstantSave}
              />
            </fieldset>

            {/* The tabs themselves stay usable, to look around; what is in
              them is read-only while the garage is in the Bin. */}
            <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
              <TabsContent value="details">
                <DetailsTab g={g} draft={draft} />
              </TabsContent>
              <TabsContent value="location">
                <LocationTab g={g} draft={draft} />
              </TabsContent>
              <TabsContent value="operations">
                <HoursBookingTab g={g} draft={draft} />
              </TabsContent>
              <TabsContent value="services">
                <ServicesTab g={g} draft={draft} />
              </TabsContent>
              <TabsContent value="team">
                <TeamPayoutTab vendorId={id} onSaved={afterInstantSave} />
              </TabsContent>
            </fieldset>

            {/* Outside the read-only fieldset: in the Bin the files still
              open, and the section itself hides every change. */}
            {documentsOn && (
              <TabsContent value="documents">
                <GarageDocumentsSection
                  vendorId={id}
                  readOnly={readOnly}
                  onSaved={afterInstantSave}
                />
              </TabsContent>
            )}
            {/* Outside the read-only fieldset too: in the Bin it still shows,
              and the section itself hides every change. */}
            <TabsContent value="certification" className="flex flex-col gap-3">
              {/* The tier (0063): what it holds, what customers see, the
                  steps, the agreement and the hide switch; then Gold's own
                  checks, Award Gold and Revoke. */}
              <GarageTierSection vendorId={id} readOnly={readOnly} />
              <GarageCertificationSection vendorId={id} readOnly={readOnly} />
            </TabsContent>
            {/* Every review and whether it counts (0065), outside the
              read-only fieldset: in the Bin it still shows, unchanged. */}
            <TabsContent value="reviews">
              {shownTab === 'reviews' && (
                <GarageReviewsSection vendorId={id} readOnly={readOnly} />
              )}
            </TabsContent>
          </Tabs>

          {/* Amber, as errors are: red on this page is Save changes. The
            server's own words, e.g. why it would not show the garage to customers. */}
          {error && (
            <p role="alert" className="text-[13px] text-error">
              {error}
            </p>
          )}

          {showSaveBar && (
            <SaveBar
              count={fields.length}
              line={saveBarLine(fields)}
              block={saveBlock}
              saving={saving}
              disabled={saveBlock !== null || serviceSwitching}
              held={describing}
              onSave={() => void handleSubmit()}
              onDiscard={discard}
            />
          )}
        </div>
      </div>

      {restoring && (
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
    </div>
  )
}
