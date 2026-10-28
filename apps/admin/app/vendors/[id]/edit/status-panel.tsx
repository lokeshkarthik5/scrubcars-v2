'use client'

import {
  IconAlertTriangle,
  IconChevronRight,
  IconCircleCheck,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScField } from '@repo/ui/sc/input'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScSwitch } from '@repo/ui/sc/switch'
import { formatDay as formatDayOf } from '@repo/core/format'
import { cn } from '@repo/core/utils'
import { GarageMarksPanel } from '@/components/marks/editor-marks-panel'
import { SavedNote } from '@/components/save-bar'
import { PAGE_TAB_LABELS, parsePageTab, type PageTab } from '@/lib/garage-edit'
import {
  STAGE_LABELS,
  statusHeadline,
  statusLines,
  type StatusLine,
} from '@/lib/garage-status'
import type {
  GarageDraft,
  GarageDraftState,
  VendorStatus,
} from './use-garage-draft'

const STAGES: VendorStatus[] = ['pending', 'active', 'suspended', 'archived']

const TONE_DOT: Record<StatusLine['tone'], string> = {
  blocking: 'bg-tone-new-dot',
  fix: 'bg-warning',
  optional: 'border border-text-muted',
  done: 'bg-tone-done-dot',
}

/**
 * The editor's left column: whether customers can book the garage and
 * what stands in the way (each line opens the tab that fixes it, never
 * another page), the team's marks (W4), and Go live: the stage and Show to customers
 * (saved with Save changes, like the tabs) and Pause (saved at once).
 *
 * As saved, not as drafted: an unsaved Active is not live yet.
 */
export function StatusPanel({
  vendorId,
  g,
  saved,
  draft,
  documentsOn,
  onOpenTab,
}: {
  vendorId: string
  g: GarageDraftState
  saved: GarageDraft
  draft: GarageDraft
  documentsOn: boolean
  onOpenTab: (tab: PageTab) => void
}) {
  const { checklist, bin, pausedAt } = g
  const inBin = Boolean(bin)
  const headline = statusHeadline(
    {
      status: saved.status,
      isVerified: saved.isVerified,
      paused: pausedAt != null,
      inBin,
    },
    checklist.readiness
  )
  const lines = statusLines(checklist.readiness)

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="garage-status-title"
        className="overflow-hidden rounded-[16px] border border-border bg-surface"
      >
        <div
          className={cn(
            'm-3 flex items-start gap-2.5 rounded-[12px] border px-3.5 py-3',
            headline.live
              ? 'border-success/30 bg-tone-done-tint'
              : 'border-brand-red/40 bg-tone-new-tint'
          )}
        >
          {headline.live ? (
            <IconCircleCheck
              size={18}
              className="mt-0.5 shrink-0 text-success"
              aria-hidden="true"
            />
          ) : (
            <IconAlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-accent-text"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <h2
              id="garage-status-title"
              className="text-[14.5px] font-semibold text-text-primary"
            >
              {headline.title}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-text-secondary">
              {headline.summary}
            </p>
          </div>
        </div>

        {checklist.readiness ? (
          <ul className="flex flex-col pb-2">
            {lines.map((line) => (
              <li key={line.key}>
                <ChecklistLine
                  line={line}
                  onOpen={() => onOpenTab(parsePageTab(line.tab, documentsOn))}
                />
              </li>
            ))}
          </ul>
        ) : (
          // An API from before 0059 sends no checklist with the garage.
          <p className="px-4 pb-4 text-[12.5px] text-text-muted">
            Status unavailable. The garage list still shows what is missing.
          </p>
        )}
      </section>

      {/* W4: what to collect from the garage, and the team's marks. */}
      <GarageMarksPanel
        vendorId={vendorId}
        missing={checklist.missing}
        readOnly={inBin}
      />

      <GoLive g={g} saved={saved} draft={draft} onOpenTab={onOpenTab} />
    </div>
  )
}

function ChecklistLine({
  line,
  onOpen,
}: {
  line: StatusLine
  onOpen: () => void
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'mt-[5px] size-2 shrink-0 rounded-full',
          TONE_DOT[line.tone]
        )}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-[13px]',
            line.tone === 'optional'
              ? 'text-text-secondary'
              : 'text-text-primary'
          )}
        >
          {line.label}
        </span>
        {line.detail && (
          <span className="mt-px block text-[12px] text-text-muted">
            {line.detail}
          </span>
        )}
      </span>
    </>
  )

  if (line.tone === 'done') {
    return (
      <div className="flex items-start gap-2.5 px-4 py-2">
        {body}
        <span className="text-[12px] text-success">Done</span>
      </div>
    )
  }
  return (
    // Opens the tab, never another page: a draft is never lost to it.
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 w-full items-start gap-2.5 px-4 py-2 text-left transition-colors hover:bg-white/[0.03]"
    >
      {body}
      <span className="flex shrink-0 items-center gap-0.5 text-[12px] text-text-secondary">
        {line.tone === 'optional' ? 'Optional' : PAGE_TAB_LABELS[line.tab]}
        <IconChevronRight size={14} aria-hidden="true" />
      </span>
    </button>
  )
}

/**
 * Go live: the stage and Show to customers (`isVerified`), in the draft (Save changes sends them),
 * and Taking bookings, which saves the moment it is pressed. The whole of it
 * is read-only in the Bin.
 */
function GoLive({
  g,
  saved,
  draft,
  onOpenTab,
}: {
  g: GarageDraftState
  saved: GarageDraft
  draft: GarageDraft
  onOpenTab: (tab: PageTab) => void
}) {
  const {
    bin,
    dirty,
    patch,
    pausedAt,
    pausedReason,
    pauseReasonInput,
    setPauseReasonInput,
    pausing,
    setPaused,
    pauseNote,
  } = g
  const changed = dirty.includes('golive')
  // The server refuses to show a garage with no pin to customers; say so before Save.
  const needsPin = draft.isVerified && !saved.isVerified && !draft.pin

  return (
    <fieldset disabled={Boolean(bin)} className="m-0 min-w-0 border-0 p-0">
      <section
        aria-labelledby="go-live-title"
        className="flex flex-col gap-3.5 rounded-[16px] border border-border bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id="go-live-title"
            className="text-[15px] font-medium tracking-[-0.01em] text-text-primary"
          >
            Go live
          </h2>
          {changed && (
            <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-text-primary"
              />
              Not saved yet
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-text-secondary">
            Stage
          </span>
          <ScSegmented<VendorStatus>
            aria-label="Stage"
            value={draft.status}
            onChange={(status) => patch({ status })}
            options={STAGES.map((value) => ({
              value,
              label: STAGE_LABELS[value],
            }))}
            className="border border-border bg-brand-black p-[3px] [&>button]:min-h-10 [&>button]:text-[12px]"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[13.5px] text-text-primary">
            Show to customers
          </span>
          <ScSwitch
            label="Show to customers"
            checked={draft.isVerified}
            onChange={(isVerified) => patch({ isVerified })}
          />
        </div>
        {needsPin && (
          <p className="text-[12.5px] text-error">
            Showing it to customers needs a map pin.{' '}
            <button
              type="button"
              onClick={() => onOpenTab('location')}
              className="min-h-11 font-medium underline underline-offset-2"
            >
              Add it on Location
            </button>
          </p>
        )}

        <div className="flex flex-col gap-2.5 border-t border-border pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] text-text-primary">
              Taking bookings
            </span>
            <SavedNote state={pauseNote.state} />
          </div>
          {/* Pausing works the moment it is pressed, not with Save changes. */}
          {pausedAt ? (
            <>
              <p className="text-[12.5px] text-text-primary">
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
                className="min-h-11"
              >
                {pausing ? 'Working…' : 'Resume bookings'}
              </ScButton>
            </>
          ) : (
            <>
              <p className="text-[12px] text-text-secondary">
                Yes. Pausing hides the garage from customers and refuses
                checkout; bookings it already has are not touched.
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
                className="min-h-11"
              >
                {pausing ? 'Working…' : 'Pause new bookings'}
              </ScButton>
            </>
          )}
        </div>

        <p className="text-[12px] text-text-muted">
          Live needs Active, shown to customers and nothing blocking. Stage and
          Show to customers save with Save changes.
        </p>
      </section>
    </fieldset>
  )
}
