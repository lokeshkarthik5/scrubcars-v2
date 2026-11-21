'use client'

import { useState } from 'react'
import { IconSteeringWheel } from '@tabler/icons-react'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { TierMedalIcon } from '@repo/ui/features/tier-medal'
import type { AdminVendor } from '@repo/core/api/admin'
import type { AdminLuxury, LuxuryApplication } from '@repo/core/api/luxury'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminLuxury, useDecideLuxury, useEditLuxuryBrands } from '@repo/core/api/hooks/use-luxury'
import { useAdminTier } from '@repo/core/api/hooks/use-tiers'
import { LUXURY_BRANDS, LUXURY_LIMITS, type LuxuryBrand } from '@repo/core/luxury'
import { TIER_LABELS } from '@repo/core/tiers'
import { cn } from '@repo/core/utils'
import { SidePanelFacts, SidePanelSection } from '@/components/table'
import { SignedAs } from '@/components/signed-as'
import { istDayMonth, istDayMonthTime } from '@/lib/vendor-list'

const BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-[10px] border border-border px-4 text-[13px] font-medium text-text-primary hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY =
  'inline-flex min-h-11 items-center justify-center rounded-[10px] bg-brand-red-fill px-4 text-[13px] font-medium text-brand-white hover:bg-brand-red-fill-hover disabled:cursor-not-allowed disabled:opacity-50'
const TEXTAREA =
  'min-h-[76px] w-full resize-y rounded-[10px] border border-border bg-brand-black px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-text-secondary focus:outline-none'
// The amber dashed outline the mockup draws round the new part.
const BOX = 'rounded-xl border border-border bg-brand-black/40 p-3'

function BrandChips({ brands }: { brands: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Brands">
      {brands.map((brand) => (
        <li key={brand} className="rounded-md border border-border px-2 py-1 text-[12.5px] text-text-primary">
          {brand}
        </li>
      ))}
    </ul>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">{children}</h4>
}

/**
 * Luxury car specialists (0083, mockup E1/E2) in the Garages side panel:
 * a waiting application with its evidence and the garage's own record, and
 * Approve / Ask for more / Decline; an approved garage's badge with Edit
 * brands and Remove badge; or the last answer, read only. Shown only for a
 * garage the list says applied or holds the badge (`row.luxury`), so an
 * older API and a garage that never applied show nothing.
 */
export function GarageLuxurySection({ vendor }: { vendor: AdminVendor }) {
  const enabled = vendor.luxury != null
  const { data, isLoading, error } = useAdminLuxury(vendor.id, enabled)
  if (!enabled) return null

  if (isLoading) {
    return (
      <SidePanelSection title="Luxury specialist">
        <SkeletonList count={2} itemClassName="h-14 rounded-[10px]" />
      </SidePanelSection>
    )
  }
  if (error || !data) {
    return (
      <SidePanelSection title="Luxury specialist">
        <p role="alert" className="text-[12px] text-error">
          {errorMessage(error, "Couldn't load the luxury application.")}
        </p>
      </SidePanelSection>
    )
  }

  if (data.badge) return <BadgeSection vendor={vendor} data={data} />
  const app = data.application
  if (!app) return null
  if (app.status === 'review' || app.status === 'more') {
    return <ApplicationSection vendor={vendor} data={data} app={app} />
  }
  return <AnsweredSection app={app} />
}

// ─── A waiting application ───────────────────────────────────────────────────

function ApplicationSection({ vendor, data, app }: { vendor: AdminVendor; data: AdminLuxury; app: LuxuryApplication }) {
  const decide = useDecideLuxury(vendor.id)
  const [note, setNote] = useState('')
  const [fullSize, setFullSize] = useState(false)
  const readOnly = data.garage.inBin
  const noteReady = note.trim().length > 0

  const sentLine = `Sent ${istDayMonthTime(app.sentAt)} · ${
    app.timesSent <= 1 ? 'first time' : `sent ${app.timesSent} times`
  }`

  const facts: Array<[string, React.ReactNode]> = [
    ['Covered bay', app.coveredBay ? 'Yes' : 'No'],
    ['Products', app.products ?? <span className="text-text-muted">Not given</span>],
    ['Staff', app.staff ?? <span className="text-text-muted">Not given</span>],
  ]

  const run = (action: 'approve' | 'ask-more' | 'decline') =>
    decide.mutate(
      { action, note: action === 'approve' ? undefined : note.trim() },
      { onSuccess: () => setNote('') }
    )

  return (
    <>
      <SidePanelSection title="Luxury specialist application">
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-text-secondary">
            {sentLine}
            {app.status === 'more' && (
              <span className="text-warning"> · asked for more{app.decidedBy ? ` by ${app.decidedBy}` : ''}</span>
            )}
          </p>
          {app.status === 'more' && app.teamNote && (
            <p className="rounded-[10px] border border-border px-3 py-2 text-[12.5px] text-text-secondary">
              “{app.teamNote}”
            </p>
          )}
          {!data.silverOrGold && (
            <p className="text-[12.5px] text-warning">
              Below Silver now: it cannot be approved until it is Silver again.
            </p>
          )}
          <div>
            <SubHeading>Brands</SubHeading>
            <BrandChips brands={app.brands} />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <SubHeading>
                Photos of past jobs · <span className="font-numeric">{app.photos.length}</span>
              </SubHeading>
              <button
                type="button"
                onClick={() => setFullSize((open) => !open)}
                aria-expanded={fullSize}
                className="text-[12px] font-medium text-text-primary underline underline-offset-2"
              >
                {fullSize ? 'Show small' : 'Open full size'}
              </button>
            </div>
            <ul className={cn('grid gap-1.5', fullSize ? 'grid-cols-1' : 'grid-cols-4')}>
              {app.photos.map((photo, index) => (
                <li key={photo.url}>
                  <a
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="relative block overflow-hidden rounded-[8px] border border-border bg-surface"
                    aria-label={`Photo ${index + 1}${photo.caption ? `: ${photo.caption}` : ''}, opens full size`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- R2 photos, any size */}
                    <img
                      src={photo.url}
                      alt=""
                      loading="lazy"
                      className={cn('w-full object-cover', fullSize ? 'max-h-[420px]' : 'aspect-square')}
                    />
                    {photo.caption && (
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-3 text-[10.5px] text-white">
                        {photo.caption}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <SidePanelFacts rows={facts} />
        </div>
      </SidePanelSection>

      <RecordSection vendor={vendor} />

      {!readOnly && (
        <SidePanelSection title="Note to the garage">
          <div className="flex flex-col gap-2">
            <label htmlFor={`luxury-note-${vendor.id}`} className="sr-only">
              Note to the garage
            </label>
            <textarea
              id={`luxury-note-${vendor.id}`}
              value={note}
              maxLength={LUXURY_LIMITS.noteMax}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Needed for Ask for more or Decline. The garage sees it word for word."
              className={TEXTAREA}
            />
            <SignedAs />
            {decide.error && (
              <p role="alert" className="text-[12px] text-error">
                {errorMessage(decide.error, "Couldn't save. Try again.")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={PRIMARY}
                disabled={decide.isPending || !data.silverOrGold}
                onClick={() => run('approve')}
              >
                {decide.isPending && decide.variables?.action === 'approve' ? 'Approving…' : '✓ Approve'}
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={decide.isPending || !noteReady}
                onClick={() => run('ask-more')}
              >
                Ask for more
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={decide.isPending || !noteReady}
                onClick={() => run('decline')}
              >
                Decline
              </button>
            </div>
          </div>
        </SidePanelSection>
      )}
    </>
  )
}

/** "1 complaint" out of a step's value ("3% (1 complaint)"), or the value itself. */
function complaintsOf(value: string | undefined): string | null {
  if (!value) return null
  const match = /(\d+ complaints?)/.exec(value)
  return match ? match[1]! : value
}

/**
 * "Their record on Detlio": the tier and since when, the rating, the last
 * 90 days and photos on jobs, from the tier's own measurement (the Tier
 * tab's figures) and the list row. Only what is known.
 */
function RecordSection({ vendor }: { vendor: AdminVendor }) {
  const { data: tier } = useAdminTier(vendor.id)
  const step = (t: 'silver' | 'gold', key: string) => tier?.steps[t]?.find((s) => s.key === key)?.value
  const since =
    vendor.tier === 'gold'
      ? (vendor.certification?.certifiedAt ?? null)
      : vendor.tier === 'silver'
        ? (tier?.silver.since ?? null)
        : null
  const completed = step('silver', 'completed')
  const noShows = step('silver', 'no_shows')
  const complaints = complaintsOf(step('gold', 'complaints'))
  const last90 = [
    completed !== undefined ? `${completed} jobs` : null,
    noShows !== undefined ? `${noShows === 'None' ? '0' : noShows} missed` : null,
    complaints,
  ].filter(Boolean)

  const rows: Array<[string, React.ReactNode]> = [
    [
      'Tier',
      vendor.tier ? (
        <span className="inline-flex items-center gap-1.5">
          <TierMedalIcon tier={vendor.tier} size={13} />
          {TIER_LABELS[vendor.tier]}
          {since && <span className="text-text-muted">since {istDayMonth(since)}</span>}
        </span>
      ) : (
        'No tier'
      ),
    ],
  ]
  const rating = step('silver', 'rating')
  if (rating) rows.push(['Rating', <span key="r" className="font-numeric">{rating}</span>])
  if (last90.length > 0) rows.push(['Last 90 days', <span key="l" className="font-numeric">{last90.join(' · ')}</span>])
  if (vendor.photoCompliance && vendor.photoCompliance.percent !== null) {
    rows.push(['Photos on jobs', <span key="p" className="font-numeric">{vendor.photoCompliance.percent}%</span>])
  }

  return (
    <SidePanelSection title="Their record on Detlio">
      <SidePanelFacts rows={rows} />
    </SidePanelSection>
  )
}

// ─── The badge ───────────────────────────────────────────────────────────────

function BadgeSection({ vendor, data }: { vendor: AdminVendor; data: AdminLuxury }) {
  const badge = data.badge!
  const editBrands = useEditLuxuryBrands(vendor.id)
  const decide = useDecideLuxury(vendor.id)
  const [editing, setEditing] = useState(false)
  const [chosen, setChosen] = useState<LuxuryBrand[]>(badge.brands)
  const [removing, setRemoving] = useState(false)
  const [reason, setReason] = useState('')
  const readOnly = data.garage.inBin

  const toggle = (brand: LuxuryBrand) =>
    setChosen((now) => (now.includes(brand) ? now.filter((b) => b !== brand) : [...now, brand]))

  return (
    <SidePanelSection title="Luxury specialist">
      <div className={cn(BOX, 'flex flex-col gap-2.5')}>
        <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-text-primary">
          <IconSteeringWheel size={15} aria-hidden="true" className="text-text-secondary" />
          Luxury specialist
          <span className={cn('font-normal', badge.shown ? 'text-text-secondary' : 'text-warning')}>
            · {badge.shown ? 'shown to customers' : 'hidden: below Silver'}
          </span>
        </p>
        <p className="text-[12px] text-text-muted">
          Approved {istDayMonth(badge.approvedAt)}
          {badge.approvedBy ? ` by ${badge.approvedBy}` : ''} · application and photos kept
        </p>

        {editing ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Brands customers see">
              {LUXURY_BRANDS.map((brand) => {
                const on = chosen.includes(brand)
                return (
                  <button
                    key={brand}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(brand)}
                    className={cn(
                      'min-h-9 rounded-md border px-2 text-[12.5px]',
                      on ? 'border-text-primary bg-text-primary text-brand-black' : 'border-border text-text-secondary'
                    )}
                  >
                    {brand}
                  </button>
                )
              })}
            </div>
            {editBrands.error && (
              <p role="alert" className="text-[12px] text-error">
                {errorMessage(editBrands.error, "Couldn't save the brands.")}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className={PRIMARY}
                disabled={chosen.length === 0 || editBrands.isPending}
                onClick={() => editBrands.mutate(chosen, { onSuccess: () => setEditing(false) })}
              >
                {editBrands.isPending ? 'Saving…' : 'Save brands'}
              </button>
              <button
                type="button"
                className={BUTTON}
                onClick={() => {
                  setChosen(badge.brands)
                  setEditing(false)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <BrandChips brands={badge.brands} />
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  setChosen(badge.brands)
                  setEditing(true)
                }}
                className="text-[12.5px] font-medium text-text-primary underline underline-offset-2"
              >
                Edit brands
              </button>
            )}
          </div>
        )}

        {!readOnly &&
          (removing ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={`luxury-remove-${vendor.id}`} className="text-[12.5px] text-text-secondary">
                Why is the badge removed? The garage reads this word for word.
              </label>
              <textarea
                id={`luxury-remove-${vendor.id}`}
                value={reason}
                maxLength={LUXURY_LIMITS.noteMax}
                onChange={(event) => setReason(event.target.value)}
                className={TEXTAREA}
              />
              <SignedAs />
              {decide.error && (
                <p role="alert" className="text-[12px] text-error">
                  {errorMessage(decide.error, "Couldn't remove the badge.")}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className={BUTTON}
                  disabled={!reason.trim() || decide.isPending}
                  onClick={() =>
                    decide.mutate(
                      { action: 'remove', note: reason.trim() },
                      {
                        onSuccess: () => {
                          setRemoving(false)
                          setReason('')
                        },
                      }
                    )
                  }
                >
                  {decide.isPending ? 'Removing…' : 'Remove badge'}
                </button>
                <button type="button" className={BUTTON} onClick={() => setRemoving(false)}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button type="button" className={BUTTON} onClick={() => setRemoving(true)}>
                Remove badge
              </button>
              <p className="text-[12px] text-text-muted">
                Customers stop seeing it at once. You write the garage a reason.
              </p>
            </div>
          ))}
      </div>
    </SidePanelSection>
  )
}

// ─── Declined or removed ─────────────────────────────────────────────────────

function AnsweredSection({ app }: { app: LuxuryApplication }) {
  const word = app.status === 'declined' ? 'Declined' : 'Badge removed'
  return (
    <SidePanelSection title="Luxury specialist">
      <p className="text-[13px] text-text-primary">
        {word}
        {app.decidedAt && <> {istDayMonth(app.decidedAt)}</>}
        {app.decidedBy && <span className="text-text-secondary"> by {app.decidedBy}</span>}
      </p>
      {app.teamNote && <p className="mt-1 text-[12.5px] text-text-secondary">“{app.teamNote}”</p>}
    </SidePanelSection>
  )
}
