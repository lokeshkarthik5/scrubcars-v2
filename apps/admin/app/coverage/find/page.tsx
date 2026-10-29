'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconSearch } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { Notice } from '@repo/ui/sc/notice'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type {
  FoundPlace,
  PlacesSearchResult,
} from '@repo/core/api/admin-coverage'
import { ApiError } from '@repo/core/api/client'
import {
  useAddPlacesAsLeads,
  useCoverage,
  useSearchPlaces,
} from '@repo/core/api/hooks/use-admin-coverage'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminLogins } from '@repo/core/api/hooks/use-admin-logins'
import {
  formatLeadPhone,
  PLACE_KIND_LABELS,
  PLACE_KINDS,
  type PlaceKind,
} from '@repo/core/leads'
import { cn } from '@repo/core/utils'
import { CoverageMap, MapLegend } from '@/components/coverage/coverage-map'
import { AssignSelect } from '@/components/coverage/lead-dialogs'
import { coverageDots, rowsByZone, zoneStats } from '@/lib/coverage'
import {
  addLine,
  canTick,
  DEFAULT_FINDER_KINDS,
  FINDER_SORTS,
  finderSummary,
  knownDetail,
  knownLabel,
  sortPlaces,
  type FinderSort,
} from '@/lib/finder'

/**
 * Find businesses in a zone (mockup zone-finder): Google and Ola Maps
 * searched for the kinds ticked (or the team's own words) inside one zone,
 * merged into one list; places the team already has are greyed with their
 * status. Tick the new ones, assign them, and they become leads in the
 * zone. Nothing is saved until "Add N as leads". `?zone=<id>`, read in the
 * browser inside Suspense (the page is prerendered).
 */
export default function FindBusinessesPage() {
  return (
    <Suspense
      fallback={<SkeletonList count={3} itemClassName="h-24 rounded-[14px]" />}
    >
      <FindBusinesses />
    </Suspense>
  )
}

const SOURCE_TEXT = {
  off: 'not connected',
  partial: 'some searches failed',
  failed: 'did not answer',
} as const

function FindBusinesses() {
  const zoneId = useSearchParams().get('zone')
  const router = useRouter()
  const { data, isLoading } = useCoverage()
  const { data: loginList } = useAdminLogins()
  const search = useSearchPlaces()
  const add = useAddPlacesAsLeads()
  const [kinds, setKinds] = useState<PlaceKind[]>(DEFAULT_FINDER_KINDS)
  const [text, setText] = useState('')
  const [sort, setSort] = useState<FinderSort>('reviews')
  const [result, setResult] = useState<PlacesSearchResult | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [assignee, setAssignee] = useState('')
  const [error, setError] = useState('')

  const assignees = useMemo(
    () =>
      (loginList?.logins ?? [])
        .filter((login) => login.status === 'active')
        .map(({ id, name }) => ({ id, name })),
    [loginList]
  )
  const stats = useMemo(() => (data ? zoneStats(data) : []), [data])
  const zone = data?.zones.find((row) => row.id === zoneId) ?? null
  const dots = useMemo(() => {
    if (!data || !zone) return []
    const inZone = new Set(
      (rowsByZone(data).get(zone.id) ?? []).map((row) => row.id)
    )
    return coverageDots(data).filter((dot) => inZone.has(dot.id))
  }, [data, zone])
  const places = useMemo(
    () => (result ? sortPlaces(result.places, sort) : []),
    [result, sort]
  )
  const kindCounts = useMemo(() => {
    const counts = new Map<PlaceKind, number>()
    for (const place of result?.places ?? [])
      for (const kind of place.kinds)
        counts.set(kind, (counts.get(kind) ?? 0) + 1)
    return counts
  }, [result])
  const tickedPlaces = places.filter((place) => ticked.has(place.key))
  const back = zone ? `/coverage?zone=${zone.id}` : '/coverage'

  if (isLoading)
    return <SkeletonList count={3} itemClassName="h-24 rounded-[14px]" />
  if (!data?.available || !zone) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-[13px] text-tone-attention-text">
          {data?.available === false
            ? 'Zones arrive with the API from this release.'
            : 'That zone isn’t there any more.'}
        </p>
        <Link
          href="/coverage"
          className="text-[13px] underline underline-offset-4"
        >
          Back to Coverage
        </Link>
      </div>
    )
  }

  const run = () => {
    if (search.isPending || (kinds.length === 0 && text.trim().length < 2))
      return
    setError('')
    search.mutate(
      {
        zoneId: zone.id,
        kinds,
        // One letter is no search; words of two or more go with the kinds.
        ...(text.trim().length >= 2 && { text: text.trim() }),
      },
      {
        onSuccess: (found) => {
          setResult(found)
          setTicked(new Set())
        },
        onError: (err) =>
          setError(
            err instanceof ApiError && err.status === 429
              ? 'That’s the searches for this hour. Try again later.'
              : errorMessage(err, 'Couldn’t search. Try again.')
          ),
      }
    )
  }

  const toggleKind = (kind: PlaceKind) =>
    setKinds((current) =>
      current.includes(kind)
        ? current.filter((k) => k !== kind)
        : [...current, kind]
    )
  const toggle = (place: FoundPlace, on: boolean) =>
    setTicked((current) => {
      const next = new Set(current)
      if (on) next.add(place.key)
      else next.delete(place.key)
      return next
    })
  const tickable = places.filter(canTick)
  const allTicked =
    tickable.length > 0 && tickable.every((place) => ticked.has(place.key))

  const addTicked = () => {
    if (tickedPlaces.length === 0 || add.isPending) return
    setError('')
    add.mutate(
      {
        zoneId: zone.id,
        assignedLoginId: assignee || null,
        places: tickedPlaces.map((place) => ({
          google: place.google,
          ola: place.ola,
        })),
      },
      {
        onSuccess: ({ added, skipped }) => {
          const who = assignees.find((person) => person.id === assignee)?.name
          toast.success(
            `${added} ${added === 1 ? 'lead' : 'leads'} added to ${zone.name}${who ? `, assigned to ${who}` : ''}${
              skipped ? ` (${skipped} already leads)` : ''
            }`
          )
          router.push(back)
        },
        onError: (err) =>
          setError(errorMessage(err, 'Couldn’t add them. Try again.')),
      }
    )
  }

  const sources = result?.sources
  const googleOff = sources ? sources.google === 'off' : !data.finder.google
  const olaOff = sources ? sources.ola === 'off' : !data.finder.ola

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] text-text-secondary">
            <Link href="/coverage" className="hover:underline">
              Coverage
            </Link>{' '}
            ›{' '}
            <Link href={back} className="hover:underline">
              {zone.name}
            </Link>
          </p>
          <h1 className="text-[20px] font-semibold text-text-primary">
            Find businesses in {zone.name}
          </h1>
          <p className="text-[12.5px] text-text-secondary">
            Searches Google and Ola Maps inside the zone only. Nothing is added
            until you tick and press Add.
          </p>
        </div>
        <Link
          href={back}
          className="inline-flex min-h-10 items-center rounded-full border border-white/25 px-4 text-[13px] font-medium text-text-primary hover:bg-surface"
        >
          Close
        </Link>
      </header>

      {(googleOff || olaOff) && (
        <Notice
          tone="neutral"
          title={
            googleOff && olaOff
              ? 'No map search connected'
              : googleOff
                ? 'Google not connected'
                : 'Ola Maps not connected'
          }
        >
          {googleOff && !olaOff
            ? 'Searching Ola Maps only. Lokesh adds GOOGLE_PLACES_API_KEY on the server to search Google too.'
            : olaOff && !googleOff
              ? 'Searching Google only (OLA_MAPS_API_KEY is not set on the server).'
              : 'Neither GOOGLE_PLACES_API_KEY nor OLA_MAPS_API_KEY is set on the server.'}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <section
            aria-label={`Map of ${zone.name}`}
            className="h-[300px] lg:h-[520px]"
          >
            <CoverageMap
              className="h-full"
              stats={stats}
              onlyZoneId={zone.id}
              selectedZoneId={zone.id}
              focus={{ lat: zone.lat, lng: zone.lng, zoom: 12.4 }}
              dots={dots}
              rings={places.filter(canTick).map((place) => ({
                id: place.key,
                lat: place.lat,
                lng: place.lng,
                label: place.name,
                ticked: ticked.has(place.key),
              }))}
            />
          </section>
          <MapLegend finder />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              run()
            }}
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Your own words (optional)</span>
              <IconSearch
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={80}
                placeholder="car wash, detailing, ceramic coating…"
                className="min-h-11 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-[13px] text-text-primary outline-none focus:border-text-secondary"
              />
            </label>
            <ScButton
              type="submit"
              variant="main"
              disabled={
                search.isPending ||
                (kinds.length === 0 && text.trim().length < 2) ||
                (googleOff && olaOff)
              }
              fullWidth={false}
              className="h-11 shrink-0 px-5 text-[14px]"
            >
              {search.isPending ? 'Searching…' : 'Search zone'}
            </ScButton>
          </form>

          <div
            role="group"
            aria-label="Kinds"
            className="flex flex-wrap gap-1.5"
          >
            {PLACE_KINDS.map((kind) => {
              const on = kinds.includes(kind)
              const count = kindCounts.get(kind)
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleKind(kind)}
                  className={cn(
                    'tap-target inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-[12px] font-medium',
                    on
                      ? 'border-white/60 text-text-primary'
                      : 'border-border text-text-secondary'
                  )}
                >
                  {on && <span aria-hidden>✓</span>}
                  {PLACE_KIND_LABELS[kind]}
                  {count !== undefined && (
                    <span className="font-numeric text-text-muted">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {error && (
            <p role="alert" className="text-[12.5px] text-tone-attention-text">
              {error}
            </p>
          )}

          {result && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p
                  className="text-[12.5px] text-text-secondary"
                  aria-live="polite"
                >
                  {finderSummary(result.counts)}
                  {(['google', 'ola'] as const).map((source) =>
                    result.sources[source] !== 'ok' &&
                    result.sources[source] !== 'off' ? (
                      <span
                        key={source}
                        className="block text-tone-attention-text"
                      >
                        {source === 'google' ? 'Google' : 'Ola'}:{' '}
                        {
                          SOURCE_TEXT[
                            result.sources[source] as 'partial' | 'failed'
                          ]
                        }
                      </span>
                    ) : null
                  )}
                </p>
                <ScSegmented
                  size="sm"
                  aria-label="Sort"
                  value={sort}
                  onChange={setSort}
                  options={FINDER_SORTS}
                />
              </div>

              {places.length === 0 ? (
                <p className="rounded-[14px] border border-border px-4 py-6 text-[13px] text-text-secondary">
                  No businesses found in {zone.name}. Tick other kinds or try
                  other words.
                </p>
              ) : (
                <div className="overflow-hidden rounded-[14px] border border-border">
                  <label className="flex min-h-11 items-center gap-2.5 border-b border-border bg-surface px-3.5 text-[12px] text-text-secondary">
                    <input
                      type="checkbox"
                      checked={allTicked}
                      disabled={tickable.length === 0}
                      onChange={(event) =>
                        setTicked(
                          event.target.checked
                            ? new Set(tickable.map((place) => place.key))
                            : new Set()
                        )
                      }
                      className="size-4 accent-brand-white"
                    />
                    Tick every new one ({tickable.length})
                  </label>
                  <ul aria-label="Businesses found">
                    {places.map((place) => (
                      <PlaceRow
                        key={place.key}
                        place={place}
                        ticked={ticked.has(place.key)}
                        onTick={(on) => toggle(place, on)}
                      />
                    ))}
                  </ul>
                </div>
              )}

              <div className="sticky bottom-20 flex flex-wrap md:bottom-3 items-center justify-between gap-2 rounded-[14px] border border-border bg-brand-black/95 px-3.5 py-3 backdrop-blur">
                <p className="text-[12.5px] text-text-secondary">
                  {addLine(tickedPlaces.length, zone.name)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <AssignSelect
                    label=""
                    ariaLabel="Assign to"
                    value={assignee}
                    onChange={setAssignee}
                    assignees={assignees}
                    className="min-h-10 w-auto py-2 text-[12.5px]"
                  />
                  <ScButton
                    type="button"
                    variant="main"
                    onClick={addTicked}
                    disabled={tickedPlaces.length === 0 || add.isPending}
                    fullWidth={false}
                    className="h-10 px-5 text-[14px]"
                  >
                    {add.isPending
                      ? 'Adding…'
                      : `Add ${tickedPlaces.length} as ${tickedPlaces.length === 1 ? 'lead' : 'leads'}`}
                  </ScButton>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PlaceRow({
  place,
  ticked,
  onTick,
}: {
  place: FoundPlace
  ticked: boolean
  onTick: (on: boolean) => void
}) {
  const known = place.known
  return (
    <li
      className={cn(
        'border-b border-border px-3.5 py-3 last:border-b-0',
        known && 'opacity-60'
      )}
    >
      <label
        className={cn(
          'flex items-start gap-3',
          known ? 'cursor-default' : 'cursor-pointer'
        )}
      >
        <input
          type="checkbox"
          aria-label={`Tick ${place.name}`}
          checked={ticked}
          disabled={Boolean(known)}
          onChange={(event) => onTick(event.target.checked)}
          className="mt-1 size-4 shrink-0 accent-brand-white"
        />
        <span className="grid min-w-0 flex-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13.5px] font-medium text-text-primary">
                {place.name}
              </span>
              {place.kinds.slice(0, 2).map((kind) => (
                <span
                  key={kind}
                  className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-text-secondary"
                >
                  {PLACE_KIND_LABELS[kind].split(' / ')[0]}
                </span>
              ))}
              {place.google && (
                <span
                  title="Found on Google"
                  className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-text-secondary"
                >
                  G
                </span>
              )}
              {place.ola && (
                <span
                  title="Found on Ola Maps"
                  className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-text-secondary"
                >
                  Ola
                </span>
              )}
            </span>
            <span className="block truncate text-[11.5px] text-text-secondary">
              {known
                ? knownDetail(known)
                : `${place.address ?? 'No address'} · ${place.distanceKm} km from centre`}
            </span>
          </span>
          <span className="font-numeric text-[12.5px] text-text-primary">
            {place.rating !== null
              ? `★ ${place.rating.toFixed(1)}`
              : 'No rating'}
            {place.reviewCount !== null && (
              <span className="text-text-secondary">
                {' '}
                ({place.reviewCount})
              </span>
            )}
          </span>
          <span className="font-numeric text-[12.5px] text-text-secondary">
            {place.phone ? formatLeadPhone(place.phone) : 'No phone listed'}
          </span>
          <span
            className={cn(
              'w-fit rounded-full px-2.5 py-0.5 text-[11.5px] font-medium',
              !known
                ? 'bg-tone-progress-tint text-tone-progress-text'
                : known.status === 'live' || known.status === 'onboarded'
                  ? 'bg-tone-done-tint text-tone-done-text'
                  : known.status === 'not_interested'
                    ? 'bg-tone-late-tint text-tone-late-text'
                    : 'bg-tone-attention-tint text-tone-attention-text'
            )}
          >
            {known ? knownLabel(known) : 'New'}
          </span>
        </span>
      </label>
    </li>
  )
}
