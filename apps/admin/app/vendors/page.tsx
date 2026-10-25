'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArchive,
  IconArchiveOff,
  IconBuildingStore,
  IconCamera,
  IconFlag,
  IconRefresh,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCircle,
  IconCircleDashed,
  IconDots,
  IconFileCertificate,
  IconPencil,
  IconPlus,
  IconRestore,
  IconRosetteDiscountCheck,
  IconRosetteDiscountCheckFilled,
  IconTrash,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { Figures } from '@repo/ui/sc/figures'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { OutsideCityChip } from '@repo/ui/features/outside-city'
import {
  DeleteForeverSheet,
  MoveToBinDialog,
  RestoreDialog,
} from '@/components/vendor-bin-dialogs'
import { formatWhen } from '@/lib/bookings'
import { PAGE_TAB_LABELS } from '@/lib/garage-edit'
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
  binDeleteLine,
  bookingParts,
  bookingsLine,
  certificationCounts,
  documentsToReviewCount,
  editHref,
  hasDocumentsToReview,
  isInBin,
  isLive,
  listHref,
  matchesShow,
  parseShow,
  readinessGroups,
  readinessSummary,
  showCounts,
  showHints,
  stateWord,
  type ListFilter,
} from '@/lib/vendor-list'
import { type AdminVendor, type ReadinessItem } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminVendorDeletePreview,
  useAdminVendors,
  useArchiveAdminVendor,
  useVerifyAdminVendor,
} from '@repo/core/api/hooks/use-admin-vendors'
import { strikesHighlighted, strikesLabel } from '@repo/core/bypass-reports'
import { cn } from '@repo/core/utils'

// The small actions on a garage's card: outline, 44px tall, never red.
const ROW_ACTION = 'flex min-h-11 items-center gap-1 px-3 py-1.5 text-[12px]'

// Each checklist group's mark: amber for what needs doing, grey for optional.
const GROUP_ICON: Record<ReadinessItem['severity'], React.ReactNode> = {
  blocking: <IconAlertCircle size={14} stroke={1.8} className="text-warning" aria-hidden="true" />,
  fix: <IconCircle size={14} stroke={1.7} className="text-warning" aria-hidden="true" />,
  optional: <IconCircleDashed size={14} stroke={1.7} className="text-text-muted" aria-hidden="true" />,
}

export default function AdminVendorsPage() {
  // useSearchParams needs a Suspense boundary, or Next.js refuses to
  // prerender the page.
  return (
    <Suspense fallback={<SkeletonList count={3} itemClassName="h-40" />}>
      <VendorsList />
    </Suspense>
  )
}

function VendorsList() {
  const router = useRouter()
  const params = useSearchParams()

  // The chosen chip lives in the URL, so Back from a garage returns to it.
  const show = parseShow(params.get('show'))
  // What a card's links carry as `back`: this list, as it is now.
  const back = listHref(show)

  const { data, isPending, error: loadError, refetch } = useAdminVendors()
  const vendors = data ?? []
  const loading = isPending

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

  const error = loadError ? errorMessage(loadError, 'Failed to load vendors') : ''

  // Counted over the full list the page already has: the API returns every
  // garage, and other screens' garage pickers need it that way.
  const counts = showCounts(vendors)
  const toReview = documentsToReviewCount(vendors)
  const certification = certificationCounts(vendors)
  const shown = vendors.filter((v) => matchesShow(v, show))

  // Checklists open, by garage. A tap on the readiness line toggles one.
  const [openChecklists, setOpenChecklists] = useState<ReadonlySet<string>>(new Set())
  const toggleChecklist = (id: string) =>
    setOpenChecklists((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // A row action's failure is shown on the card it was pressed on. It used to
  // be one line above the first card, so on an older garage — the list is
  // newest first — a refused delete printed its reason off-screen and the
  // button seemed to do nothing.
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
    // Replaced, not pushed: a chip is a view of this page, not somewhere
    // Back should step through.
    router.replace(listHref(next), { scroll: false })
  }

  const verifyingId = verify.isPending ? verify.variables : null
  const busyId = archive.isPending ? archive.variables?.id : null

  const handleVerify = (id: string) => {
    clearRowError(id)
    verify.mutate(id, {
      onError: () => showRowError(id, 'Failed to verify vendor'),
    })
  }

  const handleArchiveToggle = (v: AdminVendor) => {
    const archiving = v.status !== 'archived'
    clearRowError(v.id)
    archive.mutate(
      { id: v.id, archiving },
      {
        onError: () =>
          showRowError(v.id, `Failed to ${archiving ? 'archive' : 'restore'} vendor`),
      }
    )
  }

  const openDialog = (kind: 'bin' | 'restore' | 'delete', v: AdminVendor) => {
    clearRowError(v.id)
    setNotice('')
    setDialog({ kind, vendor: v })
  }

  return (
    <>
      <PageHeader
        title="Garages"
        subtitle={
          !loading && !error && vendors.length > 0 ? (
            <>
              <span className="font-numeric">{vendors.length}</span> garage
              {vendors.length === 1 ? '' : 's'}
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
            {/* One row that scrolls sideways on a phone, to the screen's
                edge, rather than wrapping into a block of buttons. */}
            <div
              role="group"
              aria-label="Show"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {SHOW_FILTERS.map((s) => (
                <FilterChip
                  key={s}
                  label={SHOW_LABELS[s]}
                  count={counts[s]}
                  active={show === s}
                  onClick={() => chooseShow(s)}
                  className="min-h-11 rounded-[10px] text-[13px]"
                />
              ))}
              {/* Garage documents waiting for Detlio (0043). Apart from the
                  stages, after a rule, and only while any wait (or it is the
                  one chosen). */}
              {(toReview > 0 || show === REVIEW_FILTER) && (
                <>
                  <span aria-hidden="true" className="my-2 w-px shrink-0 bg-border" />
                  <FilterChip
                    label={REVIEW_LABEL}
                    count={toReview}
                    active={show === REVIEW_FILTER}
                    onClick={() => chooseShow(REVIEW_FILTER)}
                    className="min-h-11 shrink-0 rounded-[10px] text-[13px]"
                  />
                </>
              )}
              {/* Detlio Certified (0048): who has the seal, and who met
                  every standard last night and waits for a quality check.
                  Apart from the stages, after a rule; Eligible only while
                  any are (or it is the one chosen). */}
              <span aria-hidden="true" className="my-2 w-px shrink-0 bg-border" />
              <FilterChip
                label={CERTIFIED_LABEL}
                count={certification.certified}
                active={show === CERTIFIED_FILTER}
                onClick={() => chooseShow(CERTIFIED_FILTER)}
                className="min-h-11 shrink-0 rounded-[10px] text-[13px]"
              />
              {(certification.eligible > 0 || show === ELIGIBLE_FILTER) && (
                <FilterChip
                  label={ELIGIBLE_LABEL}
                  count={certification.eligible}
                  active={show === ELIGIBLE_FILTER}
                  onClick={() => chooseShow(ELIGIBLE_FILTER)}
                  className="min-h-11 shrink-0 rounded-[10px] text-[13px]"
                />
              )}
            </div>
            <div className="mt-2.5 text-[12px] leading-[1.45] text-text-muted">
              {showHints(show).map((hint) => (
                <p key={hint.term}>
                  <span className="font-medium text-text-secondary">{hint.term}</span> ={' '}
                  {hint.meaning}
                </p>
              ))}
            </div>
          </div>

          {/* A failed refetch, with the last list still on screen. */}
          {error && <p role="alert" className="text-[12px] text-error">{error}</p>}
          {notice && (
            <p role="status" className="text-[13px] text-text-primary">
              <Figures text={notice} />
            </p>
          )}

          {shown.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text-muted">
              {show === 'bin'
                ? 'Nothing in the Bin.'
                : show === REVIEW_FILTER
                  ? 'No documents to review.'
                  : show === CERTIFIED_FILTER
                    ? 'No Detlio Certified garages yet.'
                    : show === ELIGIBLE_FILTER
                      ? 'No garage is waiting to be certified.'
                      : `No ${SHOW_LABELS[show].toLowerCase()} garages.`}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {shown.map((v, i) => (
                <Reveal key={v.id} index={i}>
                  {isInBin(v) ? (
                    <BinCard
                      v={v}
                      onRestore={() => openDialog('restore', v)}
                      onDelete={() => openDialog('delete', v)}
                    />
                  ) : (
                    <GarageCard
                      v={v}
                      back={back}
                      checklistOpen={openChecklists.has(v.id)}
                      onToggleChecklist={() => toggleChecklist(v.id)}
                      verifying={verifyingId === v.id}
                      busy={busyId === v.id}
                      rowError={rowErrors[v.id]}
                      onVerify={() => handleVerify(v.id)}
                      onArchiveToggle={() => handleArchiveToggle(v)}
                      onMoveToBin={() => openDialog('bin', v)}
                    />
                  )}
                </Reveal>
              ))}
            </div>
          )}
          {show === 'bin' && (
            <p className="pt-4 text-center text-[13px] text-text-muted">
              Nothing in the Bin is deleted on its own.
            </p>
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
            setNotice(`${dialog.vendor.businessName} is back, as it was before the Bin.`)
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

/**
 * A garage in the Bin, as in the approved mockup: when it went there, who
 * moved it and why, how many bookings would be deleted with it (in amber,
 * from the same preview Delete forever shows), and its two ways out.
 */
function BinCard({
  v,
  onRestore,
  onDelete,
}: {
  v: AdminVendor
  onRestore: () => void
  onDelete: () => void
}) {
  const preview = useAdminVendorDeletePreview(v.id)
  const deleteLine = preview.data ? binDeleteLine(preview.data.bookings.deleted) : null
  const meta = [{ text: v.city }, ...bookingParts(v)]
  const rows: Array<[string, string]> = [
    ['Binned', v.deletedAt ? formatWhen(v.deletedAt) : ''],
    ...(v.deletedByName ? ([['By', v.deletedByName]] as Array<[string, string]>) : []),
    ...(v.deletedReason ? ([['Reason', v.deletedReason]] as Array<[string, string]>) : []),
  ]

  return (
    <ScCard
      role="group"
      aria-labelledby={`vendor-${v.id}-name`}
      className="flex flex-col px-4 pb-0 pt-3.5"
    >
      <p
        id={`vendor-${v.id}-name`}
        className="truncate text-[15px] font-semibold tracking-[-0.01em] text-text-primary"
      >
        {v.businessName}
      </p>
      <p className="mt-0.5 truncate text-[12px] leading-[17px] text-text-secondary">
        {meta.map((part, i) => (
          <span key={i}>
            {i > 0 && (
              <span aria-hidden="true" className="mx-1.5 text-text-muted/60">
                ·
              </span>
            )}
            {part.text && <Figures text={part.text} />}
            {part.text && part.quiet && ' '}
            {part.quiet && <span className="text-text-muted">{part.quiet}</span>}
          </span>
        ))}
      </p>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-border bg-brand-black px-3.5 py-3 text-[13px]">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-text-muted">{term}</dt>
            <dd className="min-w-0 break-words text-text-primary">
              <Figures text={value} />
            </dd>
          </div>
        ))}
      </dl>

      {deleteLine && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-warning">
          <IconAlertTriangle size={16} stroke={1.7} aria-hidden="true" className="shrink-0" />
          <Figures text={deleteLine} />
        </p>
      )}

      <div className="-mx-4 mt-3 grid grid-cols-2 gap-2 border-t border-border px-4 py-3">
        <ScButton
          variant="secondary"
          onClick={onRestore}
          aria-label={`Restore ${v.businessName}`}
          className="flex min-h-11 items-center justify-center gap-1.5 text-[13px]"
        >
          <IconRestore size={16} aria-hidden="true" /> Restore
        </ScButton>
        <ScButton
          variant="secondary"
          onClick={onDelete}
          aria-label={`Delete ${v.businessName} forever`}
          className="flex min-h-11 items-center justify-center gap-1.5 text-[13px]"
        >
          <IconTrash size={16} aria-hidden="true" /> Delete forever
        </ScButton>
      </div>
    </ScCard>
  )
}

/**
 * One garage, calmly: its name, its bookings (or, when customers can't find
 * it, why not), where it is and how it books, and one readiness line that
 * opens its checklist. Each checklist row goes straight to the tab where it
 * is fixed, and Back from there returns to this list as it was.
 */
function GarageCard({
  v,
  back,
  checklistOpen,
  onToggleChecklist,
  verifying,
  busy,
  rowError,
  onVerify,
  onArchiveToggle,
  onMoveToBin,
}: {
  v: AdminVendor
  back: string
  checklistOpen: boolean
  onToggleChecklist: () => void
  verifying: boolean
  busy: boolean
  rowError?: string
  onVerify: () => void
  onArchiveToggle: () => void
  onMoveToBin: () => void
}) {
  const state = stateWord(v)
  const live = isLive(v)
  const bookingCount = v.bookingCount ?? 0
  const bookingsId = `vendor-${v.id}-bookings`
  const checklistId = `vendor-${v.id}-checklist`
  const meta = [{ text: v.city }, ...bookingParts(v)]

  return (
    // Named by the garage, so the card is one findable region: its
    // checklist, its actions and any refusal they get sit inside it.
    <ScCard
      role="group"
      aria-labelledby={`vendor-${v.id}-name`}
      className="flex flex-col px-4 pb-0 pt-3.5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p
          id={`vendor-${v.id}-name`}
          className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] text-text-primary"
        >
          {v.businessName}
        </p>
        {state ? (
          // A word, not a pill: what keeps it from customers.
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] text-text-secondary">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full border-[1.5px] border-text-secondary"
            />
            {state}
          </span>
        ) : (
          // Absent from an older server, which doesn't send the count.
          v.bookingCount !== undefined && (
            <span id={bookingsId} className="shrink-0 whitespace-nowrap text-[12px] text-text-muted">
              <Figures text={bookingsLine(bookingCount)} />
            </span>
          )
        )}
      </div>

      <p className="mt-0.5 truncate text-[12px] leading-[17px] text-text-secondary">
        {meta.map((part, i) => (
          <span key={i}>
            {i > 0 && (
              <span aria-hidden="true" className="mx-1.5 text-text-muted/60">
                ·
              </span>
            )}
            {part.text && <Figures text={part.text} />}
            {part.text && part.quiet && ' '}
            {part.quiet && (
              <span className="text-text-muted">
                <Figures text={part.quiet} />
              </span>
            )}
          </span>
        ))}
      </p>

      {/* The sign customers see on this garage, with how far out it is: a
          garage whose city says Chennai but shows this is usually pinned in
          the wrong place. No km on an unpinned garage, signed from its city
          field alone. */}
      {v.outsideServiceCity && (
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
          <OutsideCityChip outside={v.outsideServiceCity} className="min-w-0" />
          {v.outsideServiceCity.km !== null && (
            <span className="shrink-0">
              <span className="font-numeric">{v.outsideServiceCity.km.toLocaleString('en-IN')}</span> km out
            </span>
          )}
        </p>
      )}

      {/* Garage documents waiting for Detlio (0043): straight to its
          Documents tab, where each file opens and is approved or rejected. */}
      {hasDocumentsToReview(v) && v.documents && (
        <Link
          href={editHref(v.id, back, 'documents')}
          className="mt-1.5 flex min-h-11 items-center gap-1.5 self-start text-[12px] font-medium text-text-primary underline-offset-2 hover:underline"
        >
          <IconFileCertificate size={15} aria-hidden="true" className="shrink-0 text-text-secondary" />
          <Figures
            text={`${v.documents.toReview} ${v.documents.toReview === 1 ? 'document' : 'documents'} to review`}
          />
          <IconChevronRight size={15} aria-hidden="true" className="text-text-muted" />
        </Link>
      )}

      {/* Detlio Certified (0048): the seal, the days a certified garage has
          left to put a shortfall right, or that it met every standard and
          waits for a quality check. Straight to the Certification tab. */}
      {v.certification && (v.certification.certified || v.certification.eligible) && (
        <Link
          href={editHref(v.id, back, 'certification')}
          className="mt-1.5 flex min-h-11 items-center gap-1.5 self-start text-[12px] font-medium text-text-primary underline-offset-2 hover:underline"
        >
          {v.certification.certified ? (
            <IconRosetteDiscountCheckFilled size={15} aria-hidden="true" className="shrink-0" />
          ) : (
            <IconRosetteDiscountCheck size={15} aria-hidden="true" className="shrink-0 text-text-secondary" />
          )}
          {v.certification.certified ? (
            v.certification.keepsUntil ? (
              <span className="text-warning">
                Certified, falling short · keeps it until <span className="font-numeric">{v.certification.keepsUntil}</span>
              </span>
            ) : (
              'Detlio Certified'
            )
          ) : (
            'Eligible for Detlio Certified · record a check'
          )}
          <IconChevronRight size={15} aria-hidden="true" className="text-text-muted" />
        </Link>
      )}

      {/* Photo compliance (0045): how many of its jobs completed in the last
          90 days had 2 before and 2 after photos. Only once it has some. */}
      {v.photoCompliance && v.photoCompliance.percent !== null && (
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-text-secondary">
          <IconCamera size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
          <span className="truncate">
            Photos on{' '}
            <span className={cn('font-numeric', v.photoCompliance.percent < 80 && 'text-warning')}>
              {v.photoCompliance.percent}%
            </span>{' '}
            of jobs{' '}
            <span className="text-text-muted">
              (<Figures text={`${v.photoCompliance.compliant} of ${v.photoCompliance.jobs}, last 90 days`} />)
            </span>
          </span>
        </p>
      )}

      {/* Bypass reports (0052): confirmed reports of taking customers off
          Detlio in the last 180 days. 2 or more in red. Straight to the
          confirmed list. */}
      {(v.bypassStrikes ?? 0) > 0 && (
        <Link
          href="/bypass-reports?show=confirmed"
          className={cn(
            'mt-1 flex min-h-11 items-center gap-1.5 self-start text-[12px] font-medium underline-offset-2 hover:underline',
            strikesHighlighted(v.bypassStrikes ?? 0) ? 'text-error' : 'text-text-primary'
          )}
        >
          <IconFlag size={15} aria-hidden="true" className="shrink-0" />
          <span className="font-numeric">{strikesLabel(v.bypassStrikes ?? 0)}</span>
          <span className="text-text-muted">· bypass reports, last 180 days</span>
          <IconChevronRight size={15} aria-hidden="true" className="text-text-muted" />
        </Link>
      )}

      {/* Detlio Guarantee (0051): approved free redo claims against it in
          the last 90 days. Only while the guarantee is on, and only when
          there are some. */}
      {typeof v.redoClaims90d === 'number' && v.redoClaims90d > 0 && (
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-text-secondary">
          <IconRefresh size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
          <span className="truncate">
            <span className={cn('font-numeric', v.redoClaims90d >= 3 && 'text-warning')}>{v.redoClaims90d}</span>{' '}
            redo claim{v.redoClaims90d === 1 ? '' : 's'} in 90 days
          </span>
        </p>
      )}

      {v.readiness && (
        <Readiness
          vendorId={v.id}
          items={v.readiness}
          back={back}
          open={checklistOpen}
          onToggle={onToggleChecklist}
          checklistId={checklistId}
        />
      )}

      <div className="-mx-4 mt-3 flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
        {v.isVerified ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-text-muted">
            <IconCheck size={14} aria-hidden="true" /> Verified
          </span>
        ) : v.lat === null ? (
          // The server refuses to verify a garage with no pin, since
          // listings gate on is_verified and an unpinned garage cannot be
          // distance-sorted or checked against a doorstep radius. Surfaced
          // here so the block is visible before the click, and it opens the
          // map, where the pin is placed.
          <Link
            href={editHref(v.id, back, 'location')}
            className="flex min-h-11 items-center text-[12px] font-medium text-warning underline-offset-2 hover:underline"
          >
            Set location before verifying →
          </Link>
        ) : (
          <ScButton
            fullWidth={false}
            variant="secondary"
            disabled={verifying}
            aria-label={`Verify ${v.businessName}`}
            onClick={onVerify}
            className={ROW_ACTION}
          >
            {verifying ? 'Verifying…' : 'Verify'}
          </ScButton>
        )}
        <ScButtonLink
          href={editHref(v.id, back)}
          variant="secondary"
          aria-label={`Edit ${v.businessName}`}
          className={ROW_ACTION}
        >
          <IconPencil size={14} aria-hidden="true" /> Edit
        </ScButtonLink>
        {/* The count and the ⋯ wrap as one, right-aligned. A live garage
            says its bookings by its name already; one customers can't find
            has its state there, so it says them here. */}
        <div className="ml-auto flex items-center gap-2">
          {!live && bookingCount > 0 && (
            <span id={bookingsId} className="text-[12px] text-text-muted">
              <Figures text={bookingsLine(bookingCount)} />
            </span>
          )}
          <CardMenu
            name={v.businessName}
            menuId={`vendor-${v.id}-menu`}
            busy={busy}
            archived={v.status === 'archived'}
            onArchiveToggle={onArchiveToggle}
            onMoveToBin={onMoveToBin}
          />
        </div>
      </div>

      {/* Amber, as errors are; announced, and on the card that was pressed. */}
      {rowError && (
        <p id={`vendor-${v.id}-error`} role="alert" className="pb-3 text-[12px] text-error">
          {rowError}
        </p>
      )}
    </ScCard>
  )
}

/**
 * The card's ⋯: Archive (or take it out of the archive) and Move to bin.
 * A disclosure, not an ARIA menu: two plain buttons that open under it,
 * closed by Escape, by a tap outside or by choosing one. Move to bin asks
 * first, in its own sheet; nothing here deletes.
 */
function CardMenu({
  name,
  menuId,
  busy,
  archived,
  onArchiveToggle,
  onMoveToBin,
}: {
  name: string
  menuId: string
  busy: boolean
  archived: boolean
  onArchiveToggle: () => void
  onMoveToBin: () => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (action: () => void) => {
    setOpen(false)
    action()
  }
  const item =
    'flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-[14px] text-text-primary transition-colors hover:bg-surface disabled:opacity-50'

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`More for ${name}`}
        onClick={() => setOpen((value) => !value)}
        className="flex size-11 items-center justify-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
      >
        <IconDots size={19} stroke={1.5} aria-hidden="true" />
      </button>
      {/* Opens upward: each card animates in on its own layer (Reveal), so
          a panel hanging below would sit under the next card. */}
      {open && (
        <div
          id={menuId}
          className="absolute bottom-full right-0 z-20 mb-1 w-48 overflow-hidden rounded-xl border border-border bg-surface-elevated py-1 shadow-lg"
        >
          <button
            type="button"
            disabled={busy}
            aria-label={archived ? `Restore ${name} from the archive` : `Archive ${name}`}
            onClick={() => choose(onArchiveToggle)}
            className={item}
          >
            {archived ? (
              <IconArchiveOff size={17} stroke={1.6} aria-hidden="true" className="text-text-secondary" />
            ) : (
              <IconArchive size={17} stroke={1.6} aria-hidden="true" className="text-text-secondary" />
            )}
            {archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            type="button"
            aria-label={`Move ${name} to the Bin`}
            onClick={() => choose(onMoveToBin)}
            className={cn(item, 'border-t border-border')}
          >
            <IconTrash size={17} stroke={1.6} aria-hidden="true" className="text-text-secondary" />
            Move to Bin
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The card's one readiness line — "Ready", "Ready · 2 optional: logo,
 * photos" in grey, or "1 blocking · 2 to fix" in amber — and, once tapped,
 * the checklist under it, grouped Blocking / Fix / Optional.
 */
function Readiness({
  vendorId,
  items,
  back,
  open,
  onToggle,
  checklistId,
}: {
  vendorId: string
  items: ReadinessItem[]
  back: string
  open: boolean
  onToggle: () => void
  checklistId: string
}) {
  const summary = readinessSummary(items)

  const line = (
    <>
      {summary.needsFixing ? (
        <IconAlertCircle size={15} stroke={1.6} className="shrink-0 text-warning" aria-hidden="true" />
      ) : (
        <IconCheck size={15} stroke={1.8} className="shrink-0 text-text-muted" aria-hidden="true" />
      )}
      <span className="min-w-0 truncate">
        <Figures text={summary.main} />
        {summary.optional && (
          <span className="text-text-muted">
            {' · '}
            <Figures text={summary.optional} />
          </span>
        )}
      </span>
    </>
  )

  const tone = summary.needsFixing ? 'text-warning' : 'text-text-secondary'

  // Nothing at all to show: a quiet tick, nothing to open.
  if (items.length === 0) {
    return <p className={cn('mt-2.5 flex min-h-5 items-center gap-2 text-[12.5px]', tone)}>{line}</p>
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={checklistId}
        onClick={onToggle}
        className={cn('mt-2 flex min-h-11 w-full items-center gap-2 text-left text-[12.5px]', tone)}
      >
        {line}
        <IconChevronDown
          size={16}
          aria-hidden="true"
          className={cn(
            'ml-auto shrink-0 transition-transform',
            summary.needsFixing ? 'text-warning' : 'text-text-muted',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div id={checklistId} className="flex flex-col gap-4 pb-1 pt-2">
          {readinessGroups(items).map((group) => {
            const titleId = `${checklistId}-${group.severity}`
            return (
              <section key={group.severity} aria-labelledby={titleId}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p
                    id={titleId}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary"
                  >
                    {GROUP_ICON[group.severity]}
                    {group.title}
                  </p>
                  <span className="text-[12px] text-text-muted">{group.note}</span>
                </div>
                <ul className="overflow-hidden rounded-xl border border-border bg-brand-black">
                  {group.items.map((item) => (
                    <li key={item.key} className="border-t border-border first:border-t-0">
                      <Link
                        href={editHref(vendorId, back, item.tab)}
                        className="flex min-h-12 items-center gap-2.5 py-2 pl-3.5 pr-2 transition-colors hover:bg-surface"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] leading-[18px] text-text-primary">
                            <Figures text={item.label} />
                          </span>
                          {item.detail && (
                            <span className="mt-0.5 block text-[12px] leading-4 text-text-muted">
                              <Figures text={item.detail} />
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center text-[12px] text-text-muted">
                          {PAGE_TAB_LABELS[item.tab]}
                          <IconChevronRight size={16} aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
