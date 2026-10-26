'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import {
  IconAdjustmentsHorizontal,
  IconBuildingStore,
  IconPlus,
} from '@tabler/icons-react'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { showUndoToast } from '@repo/ui/sc/undo-toast'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { Figures } from '@repo/ui/sc/figures'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { type AdminVendor } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminVendors,
  useArchiveAdminVendor,
  useVerifyAdminVendor,
} from '@repo/core/api/hooks/use-admin-vendors'
import { useAdminLogins } from '@repo/core/api/hooks/use-admin-logins'
import { useCollectionLists } from '@repo/core/api/hooks/use-admin-collection'
import { useDebounced } from '@repo/core/hooks/use-debounced'
import { useNow } from '@repo/core/hooks/use-now'
import type { MissingKey } from '@repo/core/onboarding-marks'
import { cn } from '@repo/core/utils'
import {
  DeleteForeverSheet,
  MoveToBinDialog,
  RestoreDialog,
} from '@/components/vendor-bin-dialogs'
import {
  AdminTable,
  BulkBar,
  ColumnsButton,
  FilterBar,
  SavedViews,
  useHiddenColumns,
  type SortState,
} from '@/components/table'
import { AddMarkButton } from '@/components/marks/add-mark-button'
import { AskWhatsAppButton } from '@/components/marks/ask-whatsapp-button'
import { MissingChips } from '@/components/marks/missing-chips'
import { CollectorProgressCards } from '@/components/collection/collector-progress-cards'
import { SendToTeamButton } from '@/components/collection/send-to-team-button'
import { keepKnown, splitSelection } from '@/lib/admin-table'
import { binDoneMessage, deleteDoneMessage } from '@/lib/vendor-bin'
import {
  CERTIFIED_FILTER,
  CERTIFIED_LABEL,
  ELIGIBLE_FILTER,
  ELIGIBLE_LABEL,
  REVIEW_FILTER,
  REVIEW_LABEL,
  SHOW_FILTERS,
  SHOW_LABELS,
  certificationCounts,
  documentsToReviewCount,
  garageListHref,
  isInBin,
  isMissing,
  isMoreFilter,
  isStageFilter,
  matchesOnboardedBy,
  matchesSearch,
  matchesShow,
  matchesTeam,
  onboardedByOptions,
  parseGarageList,
  showCounts,
  showHints,
  type ListFilter,
  type TeamFilter,
} from '@/lib/vendor-list'
import { binColumns } from './bin-columns'
import { GARAGE_OPTIONAL_COLUMNS, garageColumns } from './garage-columns'
import { GarageSidePanel } from './garage-side-panel'

export default function AdminVendorsPage() {
  // useSearchParams needs a Suspense boundary, or Next.js refuses to
  // prerender the page.
  return (
    <Suspense fallback={<SkeletonList count={3} itemClassName="h-40" />}>
      <VendorsList />
    </Suspense>
  )
}

const FILTER_SELECT =
  'min-h-11 rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-text-secondary md:min-h-9'

function VendorsList() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Everything the list shows lives in the URL, so Back from a garage
  // returns to it: the chip, the search, Missing, Onboarded by and the team.
  const state = parseGarageList(params)
  const { show, q, missing, onboardedBy: onboardedFilter, team } = state
  // What a row's links carry as `back`: this list, as it is now.
  const back = garageListHref(state)

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      const query = next.toString()
      // Replaced, not pushed: a filter is a view of this page, not
      // somewhere Back should step through.
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
    },
    [params, pathname, router]
  )

  const { data, isPending, error: loadError, refetch } = useAdminVendors()
  const vendors = useMemo(() => data ?? [], [data])
  const loading = isPending
  const now = useNow(60_000)

  // Fields an API older than 0059 doesn't send: their columns and filters
  // stay hidden until it does.
  const hasMissing = vendors.some((v) => v.missing !== undefined)
  const hasMarks = vendors.some(
    (v) => v.openMarks !== undefined || v.openCollection !== undefined
  )
  const hasOnboarded = vendors.some((v) => v.onboardedByName !== undefined)
  const hasTeam = vendors.some((v) => v.openCollection !== undefined)

  // Team logins, for the Onboarded by choices.
  const logins = useAdminLogins()
  const loginNames = useMemo(
    () =>
      (logins.data?.logins ?? [])
        .filter((login) => login.status === 'active')
        .map((login) => login.name),
    [logins.data]
  )

  // My open collection lists: the garages "Assigned to me" holds. None for
  // the shared login, and unknown (no chip) on an API older than the lists.
  const mineLists = useCollectionLists('mine', true, hasTeam)
  const mine = useMemo(() => {
    if (!mineLists.data) return null
    const ids = new Set<string>()
    for (const list of mineLists.data.lists) {
      for (const garage of list.garages) ids.add(garage.id)
      for (const item of list.items) ids.add(item.vendorId)
    }
    return ids
  }, [mineLists.data])

  const verify = useVerifyAdminVendor()
  const archive = useArchiveAdminVendor()
  // The Bin's dialog that is open, and for which garage. Mounted only while
  // open, so each reads its preview at that moment.
  const [dialog, setDialog] = useState<{
    kind: 'bin' | 'restore' | 'delete'
    vendor: AdminVendor
  } | null>(null)
  // What the last Bin action did, read out politely above the list.
  const [notice, setNotice] = useState('')

  const error = loadError
    ? errorMessage(loadError, 'Failed to load vendors')
    : ''

  // Counted over the full list the page already has: the API returns every
  // garage, and other screens' garage pickers need it that way.
  const counts = showCounts(vendors)
  const toReview = documentsToReviewCount(vendors)
  const certification = certificationCounts(vendors)

  // Every filter but Missing, which counts its chips over these.
  const filtered = vendors.filter(
    (v) =>
      matchesShow(v, show) &&
      matchesSearch(v, q) &&
      matchesOnboardedBy(v, onboardedFilter) &&
      matchesTeam(v, team, mine)
  )
  // Every garage that matches: no paging, the list is the whole set.
  const shown = filtered.filter((v) => isMissing(v, missing))
  const inBin = show === 'bin'

  const teamCounts = {
    with: vendors.filter((v) => !isInBin(v) && Boolean(v.openCollection))
      .length,
    mine: mine
      ? vendors.filter((v) => !isInBin(v) && mine.has(v.id)).length
      : null,
  }
  const onboardedChoices = useMemo(
    () =>
      onboardedByOptions(
        vendors.filter((v) => !isInBin(v)),
        loginNames
      ),
    [vendors, loginNames]
  )

  // More filters is open while one of its filters is chosen, or on request.
  const [moreOpen, setMoreOpen] = useState(false)
  const moreShown = moreOpen || isMoreFilter(show)

  // The search box is typed into freely; only the settled text reaches the
  // URL. A search that arrives in the address ("Find anything", Back) fills
  // the box too, adjusted during render as React advises.
  const [search, setSearch] = useState(q)
  const settled = useDebounced(search.trim(), 300)
  const [seenQ, setSeenQ] = useState(q)
  if (q !== seenQ) {
    setSeenQ(q)
    if (q !== settled) setSearch(q)
  }
  const syncedQ = useRef(settled)
  useEffect(() => {
    if (syncedQ.current === settled) return
    syncedQ.current = settled
    setParams({ q: settled })
  }, [settled, setParams])

  // Sorted by a heading, or the API's own order (newest first).
  const [sort, setSort] = useState<SortState | null>(null)

  // Ticked garages, for the bulk actions. A garage that left the list
  // (deleted, moved to the Bin) drops out. One a filter hides stays ticked
  // but is left out of the actions, and the bar says how many are hidden,
  // so nobody messages a garage they can't see (review finding 11b).
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const liveIds = useMemo(
    () => vendors.filter((v) => !isInBin(v)).map((v) => v.id),
    [vendors]
  )
  const selected = keepKnown(ticked, liveIds)
  const ticks = splitSelection(
    selected,
    shown.map((v) => v.id)
  )
  const selectedVendors = shown.filter((v) => selected.has(v.id))

  // The columns this browser turned off. Onboarded by shows while it is
  // filtered on, so the rows say why they match.
  const optionalColumns = GARAGE_OPTIONAL_COLUMNS.filter(
    (c) => c.id !== 'onboardedBy' || hasOnboarded
  )
  const [hiddenChoice, toggleColumn] = useHiddenColumns(
    'detlio.admin.garages.columns',
    GARAGE_OPTIONAL_COLUMNS
  )
  const hiddenColumns = new Set(hiddenChoice)
  if (onboardedFilter) hiddenColumns.delete('onboardedBy')

  // The garage open in the side panel, while it is still in the list.
  const [openId, setOpenId] = useState<string | null>(null)
  const openVendor = inBin ? null : (shown.find((v) => v.id === openId) ?? null)

  // A row action's failure is shown on the row it was pressed on.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  // The garage whose error should be brought into view once it renders. A
  // fresh object per failure, so the same garage failing twice scrolls twice.
  const [reveal, setReveal] = useState<{ id: string } | null>(null)

  const clearRowError = (id: string) =>
    setRowErrors((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  const showRowError = (id: string, message: string) => {
    setRowErrors((prev) => ({ ...prev, [id]: message }))
    setReveal({ id })
  }

  useEffect(() => {
    if (!reveal) return
    // `nearest`: no jump at all when the message is already on screen.
    document
      .getElementById(`vendor-${reveal.id}-error`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [reveal])

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(loadError)) router.replace('/login')
  }, [loadError, router])

  const chooseShow = (next: ListFilter) => {
    setOpenId(null)
    setParams({ show: next === 'live' ? null : next })
  }

  const verifyingId = verify.isPending ? (verify.variables ?? null) : null
  const busyId = archive.isPending ? (archive.variables?.id ?? null) : null

  const handleVerify = (v: AdminVendor) => {
    clearRowError(v.id)
    verify.mutate(v.id, {
      onError: () => showRowError(v.id, 'Failed to verify vendor'),
    })
  }

  // Archive is easy to take back for an Active garage, so it happens at
  // once with an Undo (safe actions, level 1): Unarchive puts it back to
  // Active, exactly as it was. Any other stage would come back as Active,
  // not as it was, so those are confirmed first and offer no Undo.
  const [confirmArchive, setConfirmArchive] = useState<AdminVendor | null>(null)
  // Apart from the garage, so the sheet keeps its words while it slides away.
  const [archiveOpen, setArchiveOpen] = useState(false)
  // Why the confirmed archive failed, said inside its sheet.
  const [archiveError, setArchiveError] = useState('')

  /**
   * Archives or unarchives, from this call's own promise rather than the
   * shared mutation's callbacks (which a second press would replace), so each
   * garage gets its own toast or its own error. True when it worked.
   */
  const runArchive = async (
    v: AdminVendor,
    archiving: boolean
  ): Promise<boolean> => {
    try {
      await archive.mutateAsync({ id: v.id, archiving })
      return true
    } catch {
      showRowError(
        v.id,
        `Failed to ${archiving ? 'archive' : 'restore'} vendor`
      )
      return false
    }
  }

  const archiveWithUndo = async (v: AdminVendor) => {
    if (!(await runArchive(v, true))) return
    let undone = false
    showUndoToast(`${v.businessName} archived. Customers can't find it.`, {
      onUndo: () => {
        // Once, however many times the toast's button is pressed.
        if (undone) return
        undone = true
        void runArchive(v, false).then((ok) => {
          if (!ok)
            toast.error(`Couldn't undo: ${v.businessName} is still archived.`)
        })
      },
    })
  }

  const handleArchiveToggle = (v: AdminVendor) => {
    const archiving = v.status !== 'archived'
    clearRowError(v.id)
    if (archiving && v.status !== 'active') {
      setConfirmArchive(v)
      setArchiveError('')
      setArchiveOpen(true)
      return
    }
    void (archiving ? archiveWithUndo(v) : runArchive(v, false))
  }

  const openDialog = (kind: 'bin' | 'restore' | 'delete', v: AdminVendor) => {
    clearRowError(v.id)
    setNotice('')
    setDialog({ kind, vendor: v })
  }

  const closePanel = useCallback(() => setOpenId(null), [])

  const columns = inBin
    ? binColumns({
        onRestore: (v) => openDialog('restore', v),
        onDelete: (v) => openDialog('delete', v),
      })
    : garageColumns({
        back,
        now,
        showMissing: hasMissing,
        showMarks: hasMarks,
        showOnboardedBy: hasOnboarded,
        openId,
        onOpen: (v) => setOpenId((id) => (id === v.id ? null : v.id)),
        verifyingId,
        busyId,
        rowErrors,
        onVerify: handleVerify,
        onArchiveToggle: handleArchiveToggle,
        onMoveToBin: (v) => openDialog('bin', v),
      })

  // The Show row: five states and All (quick win 3), plus an old link's
  // stage (Pending, Active, Suspended) as one more while it is chosen.
  const views = [
    ...SHOW_FILTERS.map((s) => ({
      value: s as ListFilter,
      label: SHOW_LABELS[s],
      count: counts[s],
    })),
    ...(isStageFilter(show)
      ? [
          {
            value: show as ListFilter,
            label: SHOW_LABELS[show],
            count: counts[show],
          },
        ]
      : []),
  ]

  const filtersOn = [onboardedFilter, team].filter(Boolean).length
  const anyFilter = Boolean(q || missing || onboardedFilter || team)

  return (
    <>
      <PageHeader
        title="Garages"
        subtitle={
          // The same number as the All chip: the Bin is not counted.
          !loading && !error && vendors.length > 0 ? (
            <>
              <span className="font-numeric">{counts.all}</span> garage
              {counts.all === 1 ? '' : 's'}
              {counts.bin > 0 && (
                <>
                  {' '}
                  · <span className="font-numeric">{counts.bin}</span> in the
                  Bin
                </>
              )}
            </>
          ) : undefined
        }
        // The page's one red: adding a garage is what it is for.
        actions={
          <ScButtonLink href="/vendors/new">
            <IconPlus size={16} aria-hidden="true" /> Add garage
          </ScButtonLink>
        }
      />

      <ConfirmSheet
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          if (!confirmArchive) return
          setArchiveError('')
          try {
            await archive.mutateAsync({
              id: confirmArchive.id,
              archiving: true,
            })
            setArchiveOpen(false)
          } catch (err) {
            // Kept open, with the reason where the button was pressed.
            setArchiveError(
              errorMessage(err, 'Failed to archive the garage. Try again.')
            )
          }
        }}
        error={archiveError || undefined}
        level="light"
        title={`Archive ${confirmArchive?.businessName ?? 'this garage'}?`}
        body={
          <>
            It is put away and customers can&apos;t find it; its bookings are
            kept. Unarchiving it later makes it{' '}
            <span className="font-medium text-text-primary">Active</span>, not{' '}
            {confirmArchive
              ? confirmArchive.status.charAt(0).toUpperCase() +
                confirmArchive.status.slice(1)
              : ''}{' '}
            as it is now.
          </>
        }
        confirmLabel="Archive"
        busy={archive.isPending}
      />

      {loading ? (
        <SkeletonList count={3} itemClassName="h-40" />
      ) : error && vendors.length === 0 ? (
        <ErrorState message={error} onRetry={() => void refetch()} />
      ) : vendors.length === 0 ? (
        <EmptyState
          icon={<IconBuildingStore size={32} stroke={1.5} />}
          title="No garages yet"
          subtitle="Add your first garage to start taking bookings."
          actionLabel="Add garage"
          onAction={() => router.push('/vendors/new')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <SavedViews
              label="Show"
              views={views}
              value={show}
              onChange={chooseShow}
              trailing={
                <button
                  type="button"
                  onClick={() => setMoreOpen((open) => !open)}
                  aria-expanded={moreShown}
                  aria-controls="garage-more-filters"
                  className={cn(
                    'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] font-medium transition-colors',
                    isMoreFilter(show)
                      ? 'border-text-primary text-text-primary'
                      : 'border-border text-text-secondary hover:text-text-primary'
                  )}
                >
                  <IconAdjustmentsHorizontal size={15} aria-hidden="true" />
                  More filters
                  {toReview > 0 && !isMoreFilter(show) && (
                    <span className="font-numeric text-tone-attention-text">
                      · {toReview} to review
                    </span>
                  )}
                </button>
              }
            />
            {moreShown && (
              <div
                id="garage-more-filters"
                role="group"
                aria-label="More filters"
                className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
              >
                {/* Garage documents waiting for Detlio (0043), and Detlio
                    Certified (0048): who has the seal, and who met every
                    standard last night and waits for a quality check. */}
                <FilterChip
                  label={REVIEW_LABEL}
                  count={toReview}
                  active={show === REVIEW_FILTER}
                  onClick={() => chooseShow(REVIEW_FILTER)}
                  className="min-h-11 shrink-0 rounded-[8px] text-[13px]"
                />
                <FilterChip
                  label={CERTIFIED_LABEL}
                  count={certification.certified}
                  active={show === CERTIFIED_FILTER}
                  onClick={() => chooseShow(CERTIFIED_FILTER)}
                  className="min-h-11 shrink-0 rounded-[8px] text-[13px]"
                />
                <FilterChip
                  label={ELIGIBLE_LABEL}
                  count={certification.eligible}
                  active={show === ELIGIBLE_FILTER}
                  onClick={() => chooseShow(ELIGIBLE_FILTER)}
                  className="min-h-11 shrink-0 rounded-[8px] text-[13px]"
                />
              </div>
            )}
            <div className="mt-2.5 text-[12px] leading-[1.45] text-text-muted">
              {showHints(show).map((hint) => (
                <p key={hint.term}>
                  <span className="font-medium text-text-secondary">
                    {hint.term}
                  </span>{' '}
                  = {hint.meaning}
                </p>
              ))}
            </div>
          </div>

          <FilterBar
            search={{
              id: 'garage-search',
              label: 'Search garages',
              placeholder: 'Garage, owner, phone or area',
              value: search,
              onChange: setSearch,
            }}
            activeCount={filtersOn}
            trailing={
              <>
                {q && (
                  <span>
                    Matching <span className="text-text-primary">“{q}”</span>
                  </span>
                )}
                {!inBin && (
                  <ColumnsButton
                    columns={optionalColumns}
                    hidden={hiddenChoice}
                    onToggle={toggleColumn}
                  />
                )}
              </>
            }
          >
            {hasTeam && !inBin && (
              <>
                {teamCounts.mine !== null && (
                  <FilterChip
                    label="Assigned to me"
                    count={teamCounts.mine}
                    active={team === 'mine'}
                    onClick={() =>
                      setParams({ team: team === 'mine' ? null : 'mine' })
                    }
                    className="min-h-11 rounded-[8px] text-[12.5px] md:min-h-9"
                  />
                )}
                <FilterChip
                  label="With team"
                  count={teamCounts.with}
                  active={team === 'with'}
                  onClick={() =>
                    setParams({
                      team: team === 'with' ? null : ('with' as TeamFilter),
                    })
                  }
                  className="min-h-11 rounded-[8px] text-[12.5px] md:min-h-9"
                />
              </>
            )}
            {hasOnboarded && !inBin && (
              <select
                aria-label="Onboarded by"
                value={onboardedFilter ?? ''}
                onChange={(event) =>
                  setParams({ onboardedBy: event.target.value || null })
                }
                className={cn(
                  FILTER_SELECT,
                  onboardedFilter && 'border-text-primary text-text-primary'
                )}
              >
                <option value="">Onboarded by: anyone</option>
                {onboardedChoices.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.count})
                  </option>
                ))}
                {/* A name from a link that no garage holds any more. */}
                {onboardedFilter &&
                  !onboardedChoices.some(
                    (o) => o.value === onboardedFilter
                  ) && (
                    <option value={onboardedFilter}>
                      {onboardedFilter} (0)
                    </option>
                  )}
              </select>
            )}
          </FilterBar>

          {/* What each garage still owes us (0059), as its own group so the
              Show row keeps its six chips. */}
          {/* One line on a phone, scrolled sideways; wrapped on a laptop. */}
          {hasMissing && !inBin && (
            <div className="-mx-4 min-w-0 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
              <MissingChips
                vendors={filtered}
                value={missing}
                onChange={(key: MissingKey | null) =>
                  setParams({ missing: key })
                }
              />
            </div>
          )}

          {team === 'with' && !inBin && <CollectorProgressCards />}

          {/* A failed refetch, with the last list still on screen. */}
          {error && (
            <p role="alert" className="text-[12px] text-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-[13px] text-text-primary">
              <Figures text={notice} />
            </p>
          )}

          <div className="flex items-start gap-4">
            <AdminTable
              caption={inBin ? 'Garages in the Bin' : 'Garages'}
              className="min-w-0 flex-1"
              rows={shown}
              columns={columns}
              hiddenColumns={inBin ? undefined : hiddenColumns}
              rowKey={(v) => v.id}
              rowLabelId={(v) => `vendor-${v.id}-name`}
              sort={sort}
              onSortChange={setSort}
              openKey={inBin ? null : openId}
              onOpen={inBin ? undefined : (v) => setOpenId(v ? v.id : null)}
              selection={
                inBin
                  ? undefined
                  : {
                      selected,
                      onChange: setTicked,
                      rowName: (v) => v.businessName,
                    }
              }
              empty={emptyText(show, q, anyFilter)}
              footer={
                <span>
                  Showing <span className="font-numeric">{shown.length}</span>{' '}
                  {shown.length === 1 ? 'garage' : 'garages'}
                  {sort ? ' · sorted' : ' · newest first'}
                </span>
              }
            />
            <GarageSidePanel
              vendor={openVendor}
              back={back}
              now={now}
              verifying={verifyingId === openVendor?.id}
              onVerify={handleVerify}
              onClose={closePanel}
            />
          </div>

          {inBin && (
            <p className="pt-2 text-center text-[13px] text-text-muted">
              Nothing in the Bin is deleted on its own.
            </p>
          )}

          {!inBin && (
            <BulkBar
              count={ticks.visible.length}
              hidden={ticks.hidden}
              names={selectedVendors.map((v) => v.businessName)}
              label="Selected garages"
              onClear={() => setTicked(new Set())}
            >
              {/* The secondary actions (outline), then the one red. */}
              <AddMarkButton vendors={selectedVendors} />
              <AskWhatsAppButton vendors={selectedVendors} />
              <SendToTeamButton
                vendors={selectedVendors}
                // Only the garages sent: ones hidden by a filter stay ticked.
                onSent={() =>
                  setTicked((prev) => {
                    const next = new Set(prev)
                    for (const id of ticks.visible) next.delete(id)
                    return next
                  })
                }
              />
            </BulkBar>
          )}
        </div>
      )}

      {dialog?.kind === 'bin' && (
        <MoveToBinDialog
          vendor={dialog.vendor}
          onClose={() => setDialog(null)}
          onDone={(result) => {
            setDialog(null)
            setNotice(binDoneMessage(result))
          }}
        />
      )}
      {dialog?.kind === 'restore' && (
        <RestoreDialog
          vendor={dialog.vendor}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            setNotice(
              `${dialog.vendor.businessName} is back, as it was before the Bin.`
            )
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteForeverSheet
          vendor={dialog.vendor}
          onClose={() => setDialog(null)}
          onDone={(result) => {
            setDialog(null)
            setNotice(deleteDoneMessage(result))
          }}
        />
      )}
    </>
  )
}

/** What an empty table says, for the chip and filters that emptied it. */
function emptyText(show: ListFilter, q: string, anyFilter: boolean): string {
  if (show === 'bin') return 'Nothing in the Bin.'
  if (q) return `No garages match “${q}” here.`
  if (anyFilter) return 'No garages match these filters.'
  if (show === REVIEW_FILTER) return 'No documents to review.'
  if (show === CERTIFIED_FILTER) return 'No Detlio Certified garages yet.'
  if (show === ELIGIBLE_FILTER) return 'No garage is waiting to be certified.'
  return `No garages are ${SHOW_LABELS[show].toLowerCase()}.`
}
