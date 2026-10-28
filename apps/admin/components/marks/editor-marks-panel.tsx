'use client'

import { useMemo, useState } from 'react'
import { IconPhone, IconPlus } from '@tabler/icons-react'
import { ApiError } from '@repo/core/api/client'
import type { OnboardingMark } from '@repo/core/api/admin-marks'
import { useAdminVendor } from '@repo/core/api/hooks/use-admin-vendors'
import { useVendorMarks } from '@repo/core/api/hooks/use-admin-marks'
import {
  MARK_STATUS_LABELS,
  MISSING_KEYS,
  MISSING_LABELS,
  MISSING_TONES,
  markLabel,
  type MissingKey,
} from '@repo/core/onboarding-marks'
import { checklistStatusWord, progressText } from '@repo/core/mark-checklist'
import { cn } from '@repo/core/utils'
import {
  markDate,
  markForKey,
  markNeedsChase,
  markStatusText,
  type AskVendor,
} from '@/lib/onboarding-marks'
import { CallSheet, ChecklistItems, ChecklistProgress } from './mark-checklist'
import { AskWhatsAppButton } from './ask-whatsapp-button'
import { MarkDot } from './marks-cell'
import { MarkPopover } from './mark-popover'

const HEADING = 'text-[12px] font-semibold text-text-primary'
const LINK =
  'inline-flex min-h-8 items-center gap-1 border-0 px-0 text-[12px] font-medium text-text-secondary hover:bg-transparent hover:text-text-primary'

/**
 * The garage editor's left column, under the status checklist: "To collect
 * from the garage" (each optional thing it misses, with its mark's status or
 * "To ask"), then the team's other marks with their notes, "Add mark" and
 * "Ask on WhatsApp". Read-only in the Bin. Renders nothing from an API with
 * no marks route (404).
 */
export function GarageMarksPanel({
  vendorId,
  missing,
  readOnly = false,
}: {
  vendorId: string
  missing?: MissingKey[]
  readOnly?: boolean
}) {
  const marksQuery = useVendorMarks(vendorId)
  // The editor has already loaded the garage: this reads the same cache.
  const { data: detail } = useAdminVendor(vendorId)
  const [open, setOpen] = useState<OnboardingMark | 'new' | null>(null)
  // The mark whose call sheet is open (0061).
  const [calling, setCalling] = useState<string | null>(null)

  const all = useMemo(() => marksQuery.data ?? [], [marksQuery.data])
  const openMarks = useMemo(
    () => all.filter((mark) => mark.status !== 'received'),
    [all]
  )
  const received = all.length - openMarks.length
  const gaps = missing ?? detail?.missing ?? []
  // The red ones are the status checklist's ("Customers can't book it yet").
  const toCollect = MISSING_KEYS.filter(
    (key) => gaps.includes(key) && MISSING_TONES[key] === 'amber'
  )
  const others = openMarks.filter(
    (mark) => mark.kind === 'custom' || !toCollect.includes(mark.kind)
  )

  if (marksQuery.error instanceof ApiError && marksQuery.error.status === 404)
    return null
  if (marksQuery.isPending) return null

  const vendor = detail
    ? {
        id: vendorId,
        businessName: detail.businessName,
        openMarks,
      }
    : null
  const askVendor: AskVendor | null =
    detail && vendor
      ? {
          ...vendor,
          owner: detail.owner,
          whatsapp: detail.whatsapp,
          phone: detail.phone,
          missing: gaps,
        }
      : null

  return (
    <section aria-label="Marks" className="flex flex-col gap-4">
      {toCollect.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className={HEADING}>To collect from the garage</h3>
            {!readOnly && askVendor && (
              <AskWhatsAppButton vendors={[askVendor]} className={LINK} />
            )}
          </div>
          <ul className="flex flex-col">
            {toCollect.map((key) => {
              const mark = markForKey(openMarks, key)
              const chase = mark ? markNeedsChase(mark) : false
              return (
                <li
                  key={key}
                  className="flex min-h-9 items-center gap-2 text-[13px]"
                >
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-tone-attention-dot"
                  />
                  <span className="min-w-0 flex-1 truncate text-text-primary">
                    {MISSING_LABELS[key]}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-[12px]',
                      mark?.status === 'asked'
                        ? chase
                          ? 'text-tone-attention-text'
                          : 'text-tone-progress-text'
                        : 'text-text-muted'
                    )}
                  >
                    {mark ? markStatusText(mark) : 'To ask'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className={HEADING}>Marks</h3>
          {!readOnly && vendor && (
            <button
              type="button"
              onClick={() => setOpen('new')}
              className={LINK}
            >
              <IconPlus size={13} aria-hidden />
              Add mark
            </button>
          )}
        </div>
        {marksQuery.error ? (
          <p className="text-[12px] text-tone-attention-text">
            Couldn’t load the marks.
          </p>
        ) : others.length === 0 ? (
          <p className="text-[12px] text-text-muted">No marks yet</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {others.map((mark) => {
              if ((mark.items ?? []).length > 0) {
                return (
                  <ChecklistMark
                    key={mark.id}
                    vendorId={vendorId}
                    mark={mark}
                    readOnly={readOnly || !vendor}
                    onEdit={() => setOpen(mark)}
                    onCall={() => setCalling(mark.id)}
                  />
                )
              }
              const chase = markNeedsChase(mark)
              const body = (
                <>
                  <span className="flex w-full items-center gap-2">
                    <MarkDot status={mark.status} chase={chase} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                      {markLabel(mark.kind, mark.label)}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[12px]',
                        mark.status === 'asked'
                          ? chase
                            ? 'text-tone-attention-text'
                            : 'text-tone-progress-text'
                          : 'text-text-muted'
                      )}
                    >
                      {markStatusText(mark)}
                    </span>
                  </span>
                  {mark.note && (
                    <span className="line-clamp-2 pl-4 text-[12px] text-text-secondary">
                      {mark.note}
                    </span>
                  )}
                </>
              )
              const box =
                'flex w-full flex-col items-start gap-0.5 rounded-[10px] border border-border bg-surface px-3 py-2 text-left'
              return (
                <li key={mark.id}>
                  {readOnly || !vendor ? (
                    <div className={box}>{body}</div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpen(mark)}
                      aria-label={`Edit mark ${markLabel(mark.kind, mark.label)}`}
                      className={cn(box, 'hover:border-white/25')}
                    >
                      {body}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {received > 0 && (
          <p className="text-[12px] text-text-muted">{received} received</p>
        )}
      </div>

      {open && vendor && !readOnly && (
        <MarkPopover
          vendor={vendor}
          mark={open === 'new' ? undefined : open}
          onClose={() => setOpen(null)}
        />
      )}

      {calling && detail && !readOnly && (
        <CallSheet
          open
          vendorId={vendorId}
          markId={calling}
          garageName={detail.businessName}
          contact={
            detail.owner
              ? { name: detail.owner.name, phone: detail.owner.phone }
              : { name: detail.businessName, phone: detail.phone }
          }
          onClose={() => setCalling(null)}
        />
      )}
    </section>
  )
}

/**
 * A mark with a checklist (0061, mockup marks-checklist A): its name and
 * where it stands ("1 of 4 checked · Ravi, today"), a bar, its note in full,
 * each item with its tick and answer, and "Start call".
 */
function ChecklistMark({
  vendorId,
  mark,
  readOnly,
  onEdit,
  onCall,
}: {
  vendorId: string
  mark: OnboardingMark
  readOnly: boolean
  onEdit: () => void
  onCall: () => void
}) {
  const items = mark.items ?? []
  const name = markLabel(mark.kind, mark.label)
  const latest = items
    .filter((item) => item.answeredBy && item.answeredAt)
    .sort((a, b) => (b.answeredAt ?? '').localeCompare(a.answeredAt ?? ''))[0]
  const word = checklistStatusWord(items) ?? MARK_STATUS_LABELS[mark.status]
  return (
    <li className="flex flex-col gap-2 rounded-[12px] border border-border bg-surface px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {readOnly ? (
            <p className="text-[13px] font-medium text-text-primary">{name}</p>
          ) : (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit mark ${name}`}
              className="text-left text-[13px] font-medium text-text-primary underline-offset-2 hover:underline"
            >
              {name}
            </button>
          )}
          <p className="text-[12px] text-text-secondary">
            {progressText(items)}
            {latest?.answeredBy && latest.answeredAt
              ? ` · ${latest.answeredBy}, ${markDate(latest.answeredAt)}`
              : ''}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
            word === 'In progress' || mark.status === 'asked'
              ? 'bg-tone-attention-tint text-tone-attention-text'
              : 'bg-white/[0.06] text-text-secondary'
          )}
        >
          {word}
        </span>
      </div>
      <ChecklistProgress items={items} />
      {mark.note && (
        <p className="whitespace-pre-line text-[12px] text-text-secondary">
          {mark.note}
        </p>
      )}
      <ChecklistItems vendorId={vendorId} mark={mark} readOnly={readOnly} />
      {!readOnly && items.some((item) => !item.done) && (
        <button
          type="button"
          onClick={onCall}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 self-start rounded-full bg-brand-white px-4 text-[13px] font-semibold text-brand-black"
        >
          <IconPhone size={15} aria-hidden />
          Start call
        </button>
      )}
    </li>
  )
}
