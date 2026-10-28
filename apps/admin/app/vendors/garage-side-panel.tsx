'use client'

import Link from 'next/link'
import {
  IconAlertCircle,
  IconCamera,
  IconCheck,
  IconChevronRight,
  IconCircle,
  IconCircleDashed,
  IconFileCertificate,
  IconFlag,
  IconRefresh,
  IconRosetteDiscountCheck,
  IconRosetteDiscountCheckFilled,
} from '@tabler/icons-react'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { Figures } from '@repo/ui/sc/figures'
import { StatusChip } from '@repo/ui/sc/status-chip'
import type { AdminVendor, ReadinessItem } from '@repo/core/api/admin'
import { strikesHighlighted, strikesLabel } from '@repo/core/bypass-reports'
import { cn } from '@repo/core/utils'
import { SidePanelMarks } from '@/components/marks/side-panel-marks'
import { ColourCell } from '@/components/garages/colour-tags'
import { colourSetLine } from '@/lib/garage-colours'
import { WithTeamCell } from '@/components/collection/with-team-cell'
import { SidePanel, SidePanelFacts, SidePanelSection } from '@/components/table'
import { PAGE_TAB_LABELS } from '@/lib/garage-edit'
import {
  bookingParts,
  editHref,
  garageArea,
  garageNextStep,
  hasDocumentsToReview,
  onboardedBy,
  readinessGroups,
  readinessSummary,
  stageCell,
} from '@/lib/vendor-list'
import { STEP_TONE } from './garage-columns'

// Each checklist group's mark: amber for what needs doing, grey for optional.
const GROUP_ICON: Record<ReadinessItem['severity'], React.ReactNode> = {
  blocking: (
    <IconAlertCircle
      size={14}
      stroke={1.8}
      className="text-warning"
      aria-hidden="true"
    />
  ),
  fix: (
    <IconCircle
      size={14}
      stroke={1.7}
      className="text-warning"
      aria-hidden="true"
    />
  ),
  optional: (
    <IconCircleDashed
      size={14}
      stroke={1.7}
      className="text-text-muted"
      aria-hidden="true"
    />
  ),
}

/**
 * A garage opened beside the list (mockup 06): its stage and next step, the
 * readiness checklist (each row straight to the editor tab where it is
 * fixed, and Back returns to this list as it was), the team's marks and
 * collection list, and the facts that used to crowd its card.
 */
export function GarageSidePanel({
  vendor: v,
  back,
  now,
  verifying,
  onVerify,
  onClose,
}: {
  vendor: AdminVendor | null
  back: string
  now: number
  verifying: boolean
  onVerify: (v: AdminVendor) => void
  onClose: () => void
}) {
  if (!v) return null

  const stage = stageCell(v)
  const step = garageNextStep(v, now)
  const modes = bookingParts(v)
    .map((part) => [part.text, part.quiet].filter(Boolean).join(' '))
    .join(' · ')
  const facts: Array<[string, React.ReactNode]> = [
    ['Area', garageArea(v)],
    ['Modes', modes ? <Figures text={modes} /> : 'None on'],
    ...(v.owner
      ? ([
          [
            'Owner',
            `${v.owner.name}${v.owner.phone ? ` · ${v.owner.phone}` : ''}`,
          ],
        ] as Array<[string, React.ReactNode]>)
      : []),
    ...(v.onboardedByName !== undefined
      ? ([['Onboarded by', onboardedBy(v) ?? 'Not set']] as Array<
          [string, React.ReactNode]
        >)
      : []),
    ...(v.bookingCount !== undefined
      ? ([
          [
            'Bookings',
            <span key="n" className="font-numeric">
              {v.bookingCount}
            </span>,
          ],
        ] as Array<[string, React.ReactNode]>)
      : []),
  ]

  return (
    <SidePanel
      open
      label="Garage details"
      onClose={onClose}
      title={
        <>
          <StatusChip tone={stage.tone}>{stage.label}</StatusChip>
          <h2 className="mt-1.5 truncate text-[16px] font-semibold tracking-[-0.01em] text-text-primary">
            {v.businessName}
          </h2>
          <p className="truncate text-[12px] text-text-secondary">
            {[v.owner?.name, garageArea(v)].filter(Boolean).join(' · ')}
          </p>
        </>
      }
      actions={
        <>
          {!v.isVerified && v.lat !== null && (
            <button
              type="button"
              disabled={verifying}
              onClick={() => onVerify(v)}
              className="inline-flex min-h-11 items-center rounded-[10px] border border-border px-4 text-[13px] font-medium text-text-primary hover:bg-surface-elevated disabled:opacity-50"
            >
              {verifying ? 'Verifying…' : 'Verify garage'}
            </button>
          )}
          <ScButtonLink
            href={editHref(v.id, back)}
            variant="secondary"
            className="flex min-h-11 items-center px-4 text-[13px]"
          >
            Open editor
          </ScButtonLink>
        </>
      }
    >
      {step && (
        <SidePanelSection title="Next step">
          <p className={cn('text-[13.5px] font-medium', STEP_TONE[step.tone])}>
            <Figures text={step.text} />
          </p>
          {step.detail && (
            <p className="text-[12px] text-text-muted">
              <Figures text={step.detail} />
            </p>
          )}
        </SidePanelSection>
      )}

      {v.readiness && (
        <SidePanelSection title="Checklist">
          <Checklist vendorId={v.id} items={v.readiness} back={back} />
        </SidePanelSection>
      )}

      {/* The team's colour for it (0061): set here too, on a phone. */}
      {v.colourTag !== undefined && (
        <SidePanelSection title="Colour">
          <div className="flex flex-col items-start gap-0.5">
            <ColourCell vendor={v} now={now} />
            {colourSetLine(v, now) && (
              <p className="text-[12px] text-text-muted">
                {colourSetLine(v, now)}
              </p>
            )}
          </div>
        </SidePanelSection>
      )}

      {/* The team's marks (W4) and the collection list it is on (W5). */}
      <SidePanelMarks vendor={v} />
      {v.openCollection && (
        <SidePanelSection title="With the team">
          <WithTeamCell vendor={v} />
        </SidePanelSection>
      )}

      <SidePanelSection title="Garage">
        <SidePanelFacts rows={facts} />
        <Signals v={v} back={back} />
      </SidePanelSection>
    </SidePanel>
  )
}

/**
 * The readiness line — "Ready", "1 blocking · 3 optional" — and the
 * checklist under it, grouped Blocking / Fix / Optional. Moved here from
 * the old card's expand.
 */
function Checklist({
  vendorId,
  items,
  back,
}: {
  vendorId: string
  items: ReadinessItem[]
  back: string
}) {
  const summary = readinessSummary(items)
  const listId = `vendor-${vendorId}-checklist`
  return (
    <div className="flex flex-col gap-3">
      <p
        className={cn(
          'flex items-center gap-2 text-[13px]',
          summary.needsFixing ? 'text-warning' : 'text-text-secondary'
        )}
      >
        {summary.needsFixing ? (
          <IconAlertCircle
            size={15}
            stroke={1.6}
            className="shrink-0"
            aria-hidden="true"
          />
        ) : (
          <IconCheck
            size={15}
            stroke={1.8}
            className="shrink-0 text-text-muted"
            aria-hidden="true"
          />
        )}
        <span id={`vendor-${vendorId}-readiness`}>
          <Figures text={summary.main} />
          {summary.optional && (
            <span className="text-text-muted">
              {' · '}
              <Figures text={summary.optional} />
            </span>
          )}
        </span>
      </p>
      {readinessGroups(items).map((group) => {
        const titleId = `${listId}-${group.severity}`
        return (
          <section key={group.severity} aria-labelledby={titleId}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p
                id={titleId}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-secondary"
              >
                {GROUP_ICON[group.severity]}
                {group.title}
              </p>
              <span className="text-[12px] text-text-muted">{group.note}</span>
            </div>
            <ul className="overflow-hidden rounded-xl border border-border bg-brand-black">
              {group.items.map((item) => (
                <li
                  key={item.key}
                  className="border-t border-border first:border-t-0"
                >
                  <Link
                    href={editHref(vendorId, back, item.tab)}
                    className="flex min-h-11 items-center gap-2.5 py-2 pl-3 pr-2 transition-colors hover:bg-surface"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-[18px] text-text-primary">
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
                      <IconChevronRight size={15} aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/**
 * What the old card listed under the name: Detlio Certified, photo
 * compliance, bypass reports and redo claims. Each only when it says
 * something.
 */
function Signals({ v, back }: { v: AdminVendor; back: string }) {
  const line = 'mt-2 flex min-w-0 items-center gap-1.5 text-[12.5px]'
  return (
    <>
      {/* Garage documents waiting for Detlio (0043): its Documents tab. */}
      {hasDocumentsToReview(v) && v.documents && (
        <Link
          href={editHref(v.id, back, 'documents')}
          className={cn(
            line,
            'font-medium text-text-primary underline-offset-2 hover:underline'
          )}
        >
          <IconFileCertificate
            size={15}
            aria-hidden="true"
            className="shrink-0 text-text-secondary"
          />
          <Figures
            text={`${v.documents.toReview} ${v.documents.toReview === 1 ? 'document' : 'documents'} to review`}
          />
        </Link>
      )}
      {v.certification &&
        (v.certification.certified || v.certification.eligible) && (
          <Link
            href={editHref(v.id, back, 'certification')}
            className={cn(
              line,
              'font-medium text-text-primary underline-offset-2 hover:underline'
            )}
          >
            {v.certification.certified ? (
              <IconRosetteDiscountCheckFilled
                size={15}
                aria-hidden="true"
                className="shrink-0"
              />
            ) : (
              <IconRosetteDiscountCheck
                size={15}
                aria-hidden="true"
                className="shrink-0 text-text-secondary"
              />
            )}
            {v.certification.certified ? (
              v.certification.keepsUntil ? (
                <span className="text-warning">
                  Certified, falling short · keeps it until{' '}
                  <span className="font-numeric">
                    {v.certification.keepsUntil}
                  </span>
                </span>
              ) : (
                'Detlio Certified'
              )
            ) : (
              'Eligible for Detlio Certified · record a check'
            )}
          </Link>
        )}
      {v.photoCompliance && v.photoCompliance.percent !== null && (
        <p className={cn(line, 'text-text-secondary')}>
          <IconCamera
            size={14}
            aria-hidden="true"
            className="shrink-0 text-text-muted"
          />
          <span>
            Photos on{' '}
            <span
              className={cn(
                'font-numeric',
                v.photoCompliance.percent < 80 && 'text-warning'
              )}
            >
              {v.photoCompliance.percent}%
            </span>{' '}
            of jobs{' '}
            <span className="text-text-muted">
              (
              <Figures
                text={`${v.photoCompliance.compliant} of ${v.photoCompliance.jobs}, last 90 days`}
              />
              )
            </span>
          </span>
        </p>
      )}
      {(v.bypassStrikes ?? 0) > 0 && (
        <Link
          href="/bypass-reports?show=confirmed"
          className={cn(
            line,
            'font-medium underline-offset-2 hover:underline',
            strikesHighlighted(v.bypassStrikes ?? 0)
              ? 'text-error'
              : 'text-text-primary'
          )}
        >
          <IconFlag size={15} aria-hidden="true" className="shrink-0" />
          <span className="font-numeric">
            {strikesLabel(v.bypassStrikes ?? 0)}
          </span>
          <span className="text-text-muted">
            · bypass reports, last 180 days
          </span>
        </Link>
      )}
      {typeof v.redoClaims90d === 'number' && v.redoClaims90d > 0 && (
        <p className={cn(line, 'text-text-secondary')}>
          <IconRefresh
            size={14}
            aria-hidden="true"
            className="shrink-0 text-text-muted"
          />
          <span>
            <span
              className={cn(
                'font-numeric',
                v.redoClaims90d >= 3 && 'text-warning'
              )}
            >
              {v.redoClaims90d}
            </span>{' '}
            redo claim{v.redoClaims90d === 1 ? '' : 's'} in 90 days
          </span>
        </p>
      )}
    </>
  )
}
