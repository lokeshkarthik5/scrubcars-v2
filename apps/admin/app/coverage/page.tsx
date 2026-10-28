'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconAlertCircle } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { Notice } from '@repo/ui/sc/notice'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { useCoverage } from '@repo/core/api/hooks/use-admin-coverage'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminLogins } from '@repo/core/api/hooks/use-admin-logins'
import { CoverageMap, MapLegend } from '@/components/coverage/coverage-map'
import { DemandView } from '@/components/coverage/demand-view'
import {
  AddLeadDialog,
  EditLeadDialog,
  NoteDialog,
  NotInterestedDialog,
  type Assignee,
} from '@/components/coverage/lead-dialogs'
import { PasteLeadsDialog } from '@/components/coverage/paste-leads-dialog'
import { ZoneDrawer, type LeadDialog } from '@/components/coverage/zone-drawer'
import { ZoneEditor, type PickTarget } from '@/components/coverage/zone-editor'
import {
  CoverageTotals,
  DemandKey,
  ZoneList,
} from '@/components/coverage/zone-list'
import {
  coverageDots,
  coverageTotals,
  demandByZone,
  listedZones,
  newRecommendations,
  outsideRows,
  recommendationsByLead,
  sortByDemand,
  zoneStats,
} from '@/lib/coverage'

/** `?zone=` for the places in no zone. */
const OUTSIDE = 'none'

/**
 * Coverage (owner, 28 Oct 2026; mockup coverage-zones): Chennai in zones.
 * Each zone is drawn and listed with how far the team has got against its
 * target; every garage and lead is a dot; a zone opens its call list
 * (`?zone=<id>`), with its customers' recommendations and its demand;
 * zones with the most demand list first, Hot by the API's rule. Edit
 * zones, add a lead, paste a list, and find businesses in a zone
 * (/coverage/find). The old doorstep demand map is the second view
 * (`?view=demand`).
 *
 * Reads the address in the browser (useSearchParams inside Suspense): the
 * page is prerendered, so the searchParams prop would be the build's empty
 * one.
 */
export default function CoveragePage() {
  return (
    <Suspense
      fallback={<SkeletonList count={3} itemClassName="h-24 rounded-[14px]" />}
    >
      <Coverage />
    </Suspense>
  )
}

function Coverage() {
  const params = useSearchParams()
  const router = useRouter()
  const view = params.get('view') === 'demand' ? 'demand' : 'zones'
  const zoneParam = params.get('zone')

  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const query = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(next)) {
        if (value === null) query.delete(key)
        else query.set(key, value)
      }
      const text = query.toString()
      router.replace(text ? `/coverage?${text}` : '/coverage', {
        scroll: false,
      })
    },
    [params, router]
  )

  const { data, isLoading, error } = useCoverage()
  const { data: loginList } = useAdminLogins()
  const assignees: Assignee[] = useMemo(
    () =>
      (loginList?.logins ?? [])
        .filter((login) => login.status === 'active')
        .map(({ id, name }) => ({ id, name })),
    [loginList]
  )

  const [filter, setFilter] = useState<'priority' | 'all'>('priority')
  const [editing, setEditing] = useState(false)
  const [pick, setPick] = useState<PickTarget>(null)
  const [picked, setPicked] = useState<{
    target: string
    lat: number
    lng: number
    at: number
  } | null>(null)
  const [adding, setAdding] = useState<{ zoneId: string | null } | null>(null)
  const [pasting, setPasting] = useState<{ zoneId: string | null } | null>(null)
  const [leadDialog, setLeadDialog] = useState<LeadDialog | null>(null)

  const stats = useMemo(() => (data ? zoneStats(data) : []), [data])
  const outside = useMemo(() => (data ? outsideRows(data) : []), [data])
  const totals = useMemo(() => (data ? coverageTotals(data) : null), [data])
  const dots = useMemo(() => (data ? coverageDots(data) : []), [data])
  const zones = useMemo(() => data?.zones ?? [], [data])
  const demand = useMemo(() => (data ? demandByZone(data) : new Map()), [data])
  const recommendations = useMemo(() => data?.recommendations ?? [], [data])
  const recommendedByLead = useMemo(
    () => recommendationsByLead(recommendations),
    [recommendations]
  )

  const openStats =
    zoneParam && zoneParam !== OUTSIDE
      ? stats.find((s) => s.zone.id === zoneParam)
      : undefined
  const drawerOpen =
    data !== undefined && (zoneParam === OUTSIDE || openStats !== undefined)
  // A lead dialog shown above the drawer reads the lead fresh from the list.
  const dialogLead = leadDialog
    ? (data?.leads.find((lead) => lead.id === leadDialog.lead.id) ??
      leadDialog.lead)
    : null
  const covered = Boolean(adding || pasting || leadDialog)

  const onPick = useCallback(
    (point: { lat: number; lng: number }) => {
      if (!pick) return
      setPicked({ target: pick.zoneId, ...point, at: Date.now() })
      setPick(null)
    },
    [pick]
  )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Coverage"
        subtitle={
          view === 'zones'
            ? 'Priority zones first. Zone colour is progress against its target; each dot is a garage or a lead.'
            : 'Where doorstep bookings outrun garages.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ScSegmented
              size="sm"
              aria-label="View"
              value={view}
              onChange={(next) =>
                setParams({
                  view: next === 'demand' ? 'demand' : null,
                  zone: null,
                })
              }
              options={[
                { value: 'zones', label: 'Zones' },
                { value: 'demand', label: 'Doorstep demand' },
              ]}
            />
            {view === 'zones' && data?.available && (
              <>
                <ScButton
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing((on) => !on)
                    setPick(null)
                  }}
                  aria-pressed={editing}
                  fullWidth={false}
                  className="h-10 px-4 text-[13px]"
                >
                  {editing ? 'Done editing' : 'Edit zones'}
                </ScButton>
                <ScButton
                  type="button"
                  variant="main"
                  onClick={() => setAdding({ zoneId: null })}
                  fullWidth={false}
                  className="h-10 px-4 text-[13px]"
                >
                  + Add lead
                </ScButton>
              </>
            )}
          </div>
        }
      />

      {view === 'demand' ? (
        <DemandView />
      ) : isLoading ? (
        <SkeletonList count={3} itemClassName="h-24 rounded-[14px]" />
      ) : error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[13px] text-tone-attention-text"
        >
          <IconAlertCircle size={16} className="mt-px shrink-0" aria-hidden />
          {errorMessage(error, 'Couldn’t load coverage. Reload the page.')}
        </p>
      ) : data && !data.available ? (
        <Notice
          tone="neutral"
          title="Zones and leads arrive with the API from this release"
        >
          Doorstep demand still works meanwhile.
        </Notice>
      ) : data && totals ? (
        <>
          <CoverageTotals totals={totals} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-2">
              {pick && (
                <p
                  role="status"
                  className="rounded-[10px] bg-tone-progress-tint px-3 py-2 text-[12.5px] text-tone-progress-text"
                >
                  Click the map to place{' '}
                  {pick.zoneId === 'new' ? 'the new zone' : pick.name}’s centre.{' '}
                  <button
                    type="button"
                    onClick={() => setPick(null)}
                    className="underline underline-offset-4"
                  >
                    Stop
                  </button>
                </p>
              )}
              <section
                aria-label="Map of the zones"
                className="h-[360px] lg:h-[560px]"
              >
                <CoverageMap
                  className="h-full"
                  stats={stats}
                  dots={dots}
                  selectedZoneId={openStats?.zone.id ?? null}
                  onZoneClick={(id) => setParams({ zone: id })}
                  onPick={pick ? onPick : null}
                />
              </section>
              <MapLegend />
            </div>
            {editing ? (
              <ZoneEditor
                zones={zones}
                pick={pick}
                picked={picked}
                onPick={setPick}
                onDone={() => setEditing(false)}
              />
            ) : (
              <div className="flex min-w-0 flex-col gap-3">
                <ZoneList
                  stats={listedZones(sortByDemand(stats, demand), filter)}
                  demand={demand}
                  filter={filter}
                  onFilter={setFilter}
                  onOpen={(id) => setParams({ zone: id ?? OUTSIDE })}
                  outsideCount={
                    outside.length +
                    newRecommendations(recommendations, null).length
                  }
                  selectedZoneId={
                    zoneParam === OUTSIDE
                      ? null
                      : (openStats?.zone.id ?? undefined)
                  }
                />
                <DemandKey hotRule={data.hotRule} />
              </div>
            )}
          </div>

          {drawerOpen && (
            <ZoneDrawer
              key={zoneParam}
              zone={openStats?.zone ?? null}
              rows={openStats ? openStats.rows : outside}
              demand={openStats ? demand.get(openStats.zone.id) : undefined}
              hotRule={data.hotRule}
              recommendations={newRecommendations(
                recommendations,
                openStats?.zone.id ?? null
              )}
              recommendedByLead={recommendedByLead}
              assignees={assignees}
              covered={covered}
              onClose={() => setParams({ zone: null })}
              onAddLead={() =>
                setAdding({ zoneId: openStats?.zone.id ?? null })
              }
              onPaste={() => setPasting({ zoneId: openStats?.zone.id ?? null })}
              onDialog={setLeadDialog}
            />
          )}
          {adding && (
            <AddLeadDialog
              zones={zones}
              defaultZoneId={adding.zoneId}
              assignees={assignees}
              onClose={() => setAdding(null)}
            />
          )}
          {pasting && (
            <PasteLeadsDialog
              zones={zones}
              defaultZoneId={pasting.zoneId}
              assignees={assignees}
              onClose={() => setPasting(null)}
            />
          )}
          {dialogLead && leadDialog?.kind === 'edit' && (
            <EditLeadDialog
              lead={dialogLead}
              zones={zones}
              garages={data.garages}
              onClose={() => setLeadDialog(null)}
            />
          )}
          {dialogLead && leadDialog?.kind === 'note' && (
            <NoteDialog lead={dialogLead} onClose={() => setLeadDialog(null)} />
          )}
          {dialogLead && leadDialog?.kind === 'not_interested' && (
            <NotInterestedDialog
              lead={dialogLead}
              onClose={() => setLeadDialog(null)}
            />
          )}
        </>
      ) : null}
    </div>
  )
}
