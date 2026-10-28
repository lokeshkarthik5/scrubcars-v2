'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  IconBrandWhatsapp,
  IconChevronRight,
  IconNote,
  IconPencil,
  IconPhone,
  IconStarFilled,
  IconX,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { FilterChip } from '@repo/ui/sc/chip'
import { ScSheet } from '@repo/ui/sc/modal'
import type {
  CoverageGarage,
  CoverageZone,
  Lead,
} from '@repo/core/api/admin-coverage'
import { useUpdateLead } from '@repo/core/api/hooks/use-admin-coverage'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { telHref, whatsAppHref } from '@repo/core/contact-links'
import {
  formatLeadPhone,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
} from '@repo/core/leads'
import { cn } from '@repo/core/utils'
import {
  filterCounts,
  filterRows,
  rowStatus,
  zoneSummaryLine,
  type CallFilter,
  type CallRow,
} from '@/lib/coverage'
import { DemandPlaceholder, ZoneBar } from './zone-list'
import { AssignSelect, type Assignee } from './lead-dialogs'

const FILTERS: Array<{ value: CallFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'to_target', label: 'To target' },
  { value: 'onboarded', label: 'Onboarded' },
  { value: 'not_interested', label: 'Not interested' },
]

const STAGE_TEXT: Record<CoverageGarage['stage'], string> = {
  live: 'live',
  pending: 'not live yet · pending',
  not_shown: 'not live yet · not shown to customers',
  paused: 'not live yet · paused',
  suspended: 'not live yet · suspended',
  archived: 'not live yet · archived',
}

const STATUS_CHIP: Record<string, string> = {
  to_target: 'bg-tone-attention-tint text-tone-attention-text',
  onboarded: 'bg-tone-done-tint text-tone-done-text',
  not_interested: 'bg-tone-late-tint text-tone-late-text',
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })

const ICON_BUTTON =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-white/[0.05] hover:text-text-primary'

function ContactButtons({
  phone,
  name,
}: {
  phone: string | null
  name: string
}) {
  const tel = telHref(phone)
  const wa = whatsAppHref(phone)
  return (
    <>
      {tel && (
        <a href={tel} aria-label={`Call ${name}`} className={ICON_BUTTON}>
          <IconPhone size={15} aria-hidden />
        </a>
      )}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp ${name}`}
          className={ICON_BUTTON}
        >
          <IconBrandWhatsapp size={15} aria-hidden />
        </a>
      )}
    </>
  )
}

/** The line under a lead: its note with who wrote it, or why it is not interested. */
function leadNoteLine(lead: Lead): string {
  if (lead.status === 'not_interested') {
    const again = lead.retryAfter
      ? ` · try again after ${dayLabel(lead.retryAfter)}`
      : ''
    return `“${lead.notInterestedReason ?? ''}” · ${lead.notInterestedOn ? dayLabel(lead.notInterestedOn) : ''}${again}`
  }
  const who = lead.assignedName ? `${lead.assignedName} · ` : ''
  return `${who}${lead.lastNote ?? 'Not called yet'}`
}

function LeadRow({
  lead,
  assignees,
  onEdit,
  onNote,
  onNotInterested,
}: {
  lead: Lead
  assignees: Assignee[]
  onEdit: () => void
  onNote: () => void
  onNotInterested: () => void
}) {
  const update = useUpdateLead()
  const change = (input: Parameters<typeof update.mutate>[0], done: string) =>
    update.mutate(input, {
      onSuccess: () => toast.success(done),
      onError: (err) =>
        toast.error(errorMessage(err, 'Couldn’t save. Try again.')),
    })

  const sub = [
    lead.google && !lead.ownName
      ? 'From map search'
      : LEAD_SOURCE_LABELS[lead.source],
    lead.address,
    lead.phone ? formatLeadPhone(lead.phone) : 'No phone',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="flex gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11.5px] font-semibold text-text-secondary"
      >
        {initials(lead.name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-text-primary">
              {lead.name}
            </p>
            <p className="truncate text-[11.5px] text-text-secondary">
              Lead · {sub}
              {lead.google?.rating != null &&
                ` · ★ ${lead.google.rating} (${lead.google.reviewCount ?? 0})`}
            </p>
          </div>
          <select
            aria-label={`Status of ${lead.name}`}
            value={lead.status}
            disabled={update.isPending}
            onChange={(event) => {
              const next = event.target.value
              if (next === 'not_interested') onNotInterested()
              else if (next === 'to_target')
                change(
                  { id: lead.id, status: 'to_target' },
                  `${lead.name}: to target`
                )
            }}
            className={cn(
              'min-h-8 shrink-0 rounded-full border-0 px-2.5 text-[11.5px] font-medium outline-none',
              STATUS_CHIP[lead.status]
            )}
          >
            <option value="to_target">{LEAD_STATUS_LABELS.to_target}</option>
            <option value="not_interested">
              {LEAD_STATUS_LABELS.not_interested}
            </option>
            {lead.status === 'onboarded' && (
              <option value="onboarded">{LEAD_STATUS_LABELS.onboarded}</option>
            )}
          </select>
        </div>
        <p className="w-fit max-w-full truncate rounded-md bg-white/[0.05] px-2 py-1 text-[11.5px] text-text-secondary">
          {leadNoteLine(lead)}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <ContactButtons phone={lead.phone} name={lead.name} />
          <button
            type="button"
            onClick={onNote}
            aria-label={`Note for ${lead.name}`}
            className={ICON_BUTTON}
          >
            <IconNote size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${lead.name}`}
            className={ICON_BUTTON}
          >
            <IconPencil size={15} aria-hidden />
          </button>
          <AssignSelect
            label=""
            ariaLabel={`Assign ${lead.name}`}
            value={lead.assignedLoginId ?? ''}
            onChange={(value) =>
              change(
                { id: lead.id, assignedLoginId: value || null },
                value
                  ? `${lead.name} assigned to ${assignees.find((a) => a.id === value)?.name ?? 'them'}`
                  : `${lead.name}: nobody assigned`
              )
            }
            assignees={assignees}
            className="min-h-9 w-auto py-1.5 text-[12px]"
          />
          {lead.status !== 'onboarded' && (
            <Link
              href={`/vendors/new?by=hand&lead=${lead.id}`}
              aria-label={`Onboard ${lead.name}`}
              className="ml-auto inline-flex min-h-9 items-center rounded-full border border-white/25 px-3 text-[12px] font-medium text-text-primary hover:bg-surface"
            >
              Onboard
            </Link>
          )}
        </div>
      </div>
    </li>
  )
}

function GarageRow({
  garage,
  lead,
}: {
  garage: CoverageGarage
  lead: Lead | null
}) {
  const status = garage.live ? 'onboarded' : 'to_target'
  return (
    <li className="flex gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11.5px] font-semibold text-text-secondary"
      >
        {initials(garage.name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-text-primary">
              {garage.name}
            </p>
            <p className="truncate text-[11.5px] text-text-secondary">
              Garage · {STAGE_TEXT[garage.stage]} ·{' '}
              {formatLeadPhone(garage.phone)}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium',
              STATUS_CHIP[status]
            )}
          >
            {LEAD_STATUS_LABELS[status]}
          </span>
        </div>
        {lead && (lead.lastNote || lead.assignedName) && (
          <p className="w-fit max-w-full truncate rounded-md bg-white/[0.05] px-2 py-1 text-[11.5px] text-text-secondary">
            {leadNoteLine(lead)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <ContactButtons phone={garage.phone} name={garage.name} />
          <Link
            href={`/vendors/${garage.id}/edit`}
            aria-label={`Open ${garage.name}`}
            className={cn(ICON_BUTTON, 'ml-auto')}
          >
            <IconChevronRight size={15} aria-hidden />
          </Link>
        </div>
      </div>
    </li>
  )
}

/** A dialog a row opens; the page shows it above the drawer. */
export type LeadDialog = {
  kind: 'edit' | 'note' | 'not_interested'
  lead: Lead
}

/**
 * A zone's call list (mockup coverage-zones B): everyone the team knows in
 * the zone — leads, and garages (not live yet ones are still to target) —
 * filtered by status, each with call, WhatsApp, status, assign and note.
 * Demand per zone keeps its place at the bottom (customer reach part 2).
 */
export function ZoneDrawer({
  zone,
  rows,
  assignees,
  covered,
  onClose,
  onAddLead,
  onPaste,
  onDialog,
}: {
  /** null: the places in no zone. */
  zone: CoverageZone | null
  rows: CallRow[]
  assignees: Assignee[]
  /** A dialog is open above the drawer: Escape and the backdrop are the dialog's. */
  covered: boolean
  onClose: () => void
  onAddLead: () => void
  onPaste: () => void
  onDialog: (dialog: LeadDialog) => void
}) {
  const [filter, setFilter] = useState<CallFilter>('all')
  const counts = filterCounts(rows)
  const shown = filterRows(rows, filter)
  const title = zone ? zone.name : 'Not in a zone'
  const live = rows.filter(
    (row) => row.kind === 'garage' && rowStatus(row) === 'onboarded'
  ).length

  return (
    <ScSheet
      open
      onClose={onClose}
      dismissible={!covered}
      aria-label={title}
      className="max-w-[560px]"
      showHandle={false}
    >
      {/* Room at the end for the phone's bottom bar. */}
      <div className="flex flex-col pb-20 md:pb-0">
        <header className="flex flex-col gap-2 border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-semibold text-text-primary">
                {title}
              </h2>
              <p className="text-[12px] text-text-secondary">
                {zoneSummaryLine(rows)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {zone && (
                <span className="inline-flex items-center gap-1 rounded-full bg-tone-attention-tint px-2.5 py-1 text-[11.5px] text-tone-attention-text">
                  {zone.priority && <IconStarFilled size={10} aria-hidden />}
                  {zone.priority ? 'Priority · ' : ''}
                  {live} / {zone.target} live
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={ICON_BUTTON}
              >
                <IconX size={15} aria-hidden />
              </button>
            </div>
          </div>
          {rows.length > 0 && (
            <ZoneBar
              stats={{
                live,
                toTarget: counts.to_target,
                notInterested: counts.not_interested,
                rows,
              }}
            />
          )}
          <div
            role="group"
            aria-label="Show"
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pt-1"
          >
            {FILTERS.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                count={counts[option.value]}
                active={filter === option.value}
                onClick={() => setFilter(option.value)}
              />
            ))}
          </div>
        </header>

        {shown.length === 0 ? (
          <p className="px-4 py-6 text-[12.5px] text-text-secondary">
            {rows.length === 0
              ? 'Nobody here yet. Add a lead, paste a list, or find businesses in this zone.'
              : 'Nothing with this status.'}
          </p>
        ) : (
          <ul aria-label={`Call list for ${title}`} className="flex flex-col">
            {shown.map((row) =>
              row.kind === 'garage' ? (
                <GarageRow key={row.id} garage={row.garage} lead={row.lead} />
              ) : (
                <LeadRow
                  key={row.id}
                  lead={row.lead}
                  assignees={assignees}
                  onEdit={() => onDialog({ kind: 'edit', lead: row.lead })}
                  onNote={() => onDialog({ kind: 'note', lead: row.lead })}
                  onNotInterested={() =>
                    onDialog({ kind: 'not_interested', lead: row.lead })
                  }
                />
              )
            )}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border px-4 pt-3">
          <button
            type="button"
            onClick={onAddLead}
            className="min-h-10 rounded-full border border-white/25 px-4 text-[13px] font-medium text-text-primary hover:bg-surface"
          >
            + Add lead{zone ? ' here' : ''}
          </button>
          <button
            type="button"
            onClick={onPaste}
            className="min-h-10 rounded-full border border-white/25 px-4 text-[13px] font-medium text-text-primary hover:bg-surface"
          >
            Paste a list
          </button>
          {zone && (
            <Link
              href={`/coverage/find?zone=${zone.id}`}
              className="inline-flex min-h-10 items-center rounded-full border border-white/25 px-4 text-[13px] font-medium text-text-primary hover:bg-surface"
            >
              Find businesses
            </Link>
          )}
        </div>
        {zone && (
          <div className="px-4 pt-3">
            <DemandPlaceholder zoneName={zone.name} />
          </div>
        )}
      </div>
    </ScSheet>
  )
}
