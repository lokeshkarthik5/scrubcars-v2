'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconBrandWhatsapp, IconMapPin, IconPhone } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import type {
  CoverageRecommendation,
  CoverageZone,
  DuplicateMatch,
  HotRule,
  ZoneDemand,
} from '@repo/core/api/admin-coverage'
import {
  useDismissRecommendation,
  useRestoreRecommendation,
  useMakeLeadFromRecommendation,
  useRecommendationDuplicates,
} from '@repo/core/api/hooks/use-admin-coverage'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { telHref, whatsAppHref } from '@repo/core/contact-links'
import { formatLeadPhone, MATCH_REASON_TEXT } from '@repo/core/leads'
import { duplicateLine } from '@/lib/lead-form'
import { hotRuleText } from '@/lib/coverage'
import { HotBadge } from './zone-list'

const PILL =
  'inline-flex min-h-9 items-center rounded-full border border-white/25 px-3 text-[12px] font-medium text-text-primary hover:bg-surface disabled:opacity-50'
const ICON_BUTTON =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-white/[0.05] hover:text-text-primary'

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded-[10px] bg-white/[0.04] px-2.5 py-2">
      <span className="font-numeric text-[16px] font-semibold text-text-primary">
        {value}
      </span>
      <span className="text-[11px] text-text-secondary">{label}</span>
    </div>
  )
}

/**
 * A zone's demand, in its call list: people waiting (and how many hold a
 * free wash), requests sent from it and how many failed, and customer
 * recommendations, with the way to that zone's requests. From an API
 * before part 3 (no demand), it says so.
 */
export function ZoneDemandCard({
  zone,
  demand,
  hotRule,
}: {
  zone: CoverageZone
  demand: ZoneDemand | undefined
  hotRule: HotRule | undefined
}) {
  return (
    <section
      aria-label="Demand"
      className="rounded-[12px] border border-border px-3.5 py-3 text-[12px] text-text-secondary"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-medium text-text-primary">
          Demand in {zone.name}
        </h3>
        {demand?.hot && <HotBadge />}
      </div>
      {demand && hotRule ? (
        <>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <Figure label="Waiting" value={demand.waiting} />
            <Figure label="Hold a free wash" value={demand.unusedFreeWashes} />
            <Figure
              label={`Requests (${hotRule.requestDays} days)`}
              value={demand.requests}
            />
            <Figure label="Failed requests" value={demand.failedRequests} />
          </div>
          <p className="mt-2">
            {demand.signups > demand.waiting &&
              `${demand.signups} signed up in all (the zone is live). `}
            {demand.openRequests > 0 &&
              `${demand.openRequests} ${demand.openRequests === 1 ? 'request is' : 'requests are'} open now. `}
            {demand.recommendations > 0
              ? `${demand.recommendations} customer ${demand.recommendations === 1 ? 'recommendation' : 'recommendations'}, ${demand.newRecommendations} to act on.`
              : 'No customer recommendations yet.'}
          </p>
          {demand.hot && <p className="mt-1">{hotRuleText(hotRule)}</p>}
          <Link
            href={`/requests?filter=all&zone=${zone.slug}`}
            className="mt-1.5 inline-flex min-h-9 items-center text-[12px] font-medium text-text-primary underline underline-offset-4"
          >
            See {zone.name}’s requests
          </Link>
        </>
      ) : (
        <p className="mt-0.5">
          Demand per zone arrives with the API from this release.
        </p>
      )}
    </section>
  )
}

/** The lookalikes a recommendation has, with what can be done about them. */
function RecommendationMatches({
  rec,
  matches,
  busy,
  onLink,
  onAnyway,
  onBack,
}: {
  rec: CoverageRecommendation
  matches: DuplicateMatch[]
  busy: boolean
  onLink: (leadId: string) => void
  onAnyway: () => void
  onBack: () => void
}) {
  return (
    <div
      role="alert"
      className="rounded-[12px] border border-tone-attention-dot/40 bg-tone-attention-tint px-3 py-2.5 text-[12.5px]"
    >
      <p className="font-medium text-text-primary">
        This may be a place you already have:
      </p>
      <ul className="mt-1 flex flex-col gap-1.5 text-text-secondary">
        {matches.map((match) => (
          <li
            key={`${match.kind}:${match.id}`}
            className="flex flex-wrap items-center gap-2"
          >
            <span>
              {duplicateLine(match)}{' '}
              <span className="text-text-muted">
                ({MATCH_REASON_TEXT[match.reason]})
              </span>
            </span>
            {/* A lead still to sign up takes the recommendation; one that is
                a garage already, or a garage, can't. */}
            {match.kind === 'lead' && match.status !== 'onboarded' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onLink(match.id)}
                className={PILL}
              >
                Link to {match.name}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onAnyway}
          aria-label={`Make ${rec.name} a lead anyway`}
          className={PILL}
        >
          Make lead anyway
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onBack}
          className="min-h-9 text-[12px] text-text-secondary underline underline-offset-4"
        >
          Not now
        </button>
      </div>
    </div>
  )
}

function RecommendationRow({ rec }: { rec: CoverageRecommendation }) {
  const duplicates = useRecommendationDuplicates()
  const make = useMakeLeadFromRecommendation()
  const dismiss = useDismissRecommendation()
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null)
  const busy = duplicates.isPending || make.isPending || dismiss.isPending
  const tel = telHref(rec.phone)
  const wa = whatsAppHref(rec.phone)

  const makeLead = (input: { leadId?: string; allowDuplicate?: boolean }) =>
    make.mutate(
      { id: rec.id, ...input },
      {
        onSuccess: ({ lead }) => {
          setMatches(null)
          toast.success(
            input.leadId
              ? `${rec.name} linked to ${lead.name}`
              : `${rec.name} is a lead now`
          )
        },
        onError: (err) =>
          toast.error(errorMessage(err, 'Couldn’t make the lead. Try again.')),
      }
    )

  const onMake = () =>
    duplicates.mutate(rec.id, {
      onSuccess: ({ matches: found }) => {
        if (found.length > 0) setMatches(found)
        else makeLead({})
      },
      onError: (err) =>
        toast.error(
          errorMessage(err, 'Couldn’t check for duplicates. Try again.')
        ),
    })

  return (
    <li className="flex flex-col gap-1.5 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-medium text-text-primary">
          {rec.name}
        </p>
        <p className="text-[11.5px] text-text-secondary">
          Recommended by a customer
          {rec.why ? ` · “${rec.why}”` : ''}
        </p>
        <p className="text-[11.5px] text-text-muted">
          {rec.phone ? formatLeadPhone(rec.phone) : 'No phone'} ·{' '}
          {new Date(rec.createdAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            timeZone: 'Asia/Kolkata',
          })}
        </p>
      </div>
      {matches && (
        <RecommendationMatches
          rec={rec}
          matches={matches}
          busy={busy}
          onLink={(leadId) => makeLead({ leadId })}
          onAnyway={() => makeLead({ allowDuplicate: true })}
          onBack={() => setMatches(null)}
        />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {tel && (
          <a href={tel} aria-label={`Call ${rec.name}`} className={ICON_BUTTON}>
            <IconPhone size={15} aria-hidden />
          </a>
        )}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp ${rec.name}`}
            className={ICON_BUTTON}
          >
            <IconBrandWhatsapp size={15} aria-hidden />
          </a>
        )}
        {rec.mapsLink && (
          <a
            href={rec.mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${rec.name} on Google Maps`}
            className={ICON_BUTTON}
          >
            <IconMapPin size={15} aria-hidden />
          </a>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            dismiss.mutate(rec.id, {
              onSuccess: () => toast.success(`${rec.name} dismissed`),
              onError: (err) =>
                toast.error(
                  errorMessage(err, 'Couldn’t dismiss it. Try again.')
                ),
            })
          }
          aria-label={`Dismiss ${rec.name}`}
          className="ml-auto min-h-9 px-2 text-[12px] text-text-secondary underline underline-offset-4"
        >
          Dismiss
        </button>
        {!matches && (
          <button
            type="button"
            disabled={busy}
            onClick={onMake}
            aria-label={`Make ${rec.name} a lead`}
            className={PILL}
          >
            {busy ? 'Working…' : 'Make lead'}
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * Customers' recommendations in a zone (or in none) still to act on: Make
 * lead (a lead the team calls; when that lead becomes a garage, the
 * customer's referral credit follows), or Dismiss.
 */
export function RecommendationList({
  title,
  recommendations,
}: {
  title: string
  recommendations: CoverageRecommendation[]
}) {
  if (recommendations.length === 0) return null
  return (
    <section
      aria-label={`Recommended by customers in ${title}`}
      className="border-t border-border"
    >
      <h3 className="px-4 pb-1 pt-3 text-[12px] font-medium text-text-primary">
        Recommended by customers ·{' '}
        <span className="font-numeric">{recommendations.length}</span>
      </h3>
      <ul aria-label={`Recommendations for ${title}`} className="flex flex-col">
        {recommendations.map((rec) => (
          <RecommendationRow key={rec.id} rec={rec} />
        ))}
      </ul>
    </section>
  )
}

/**
 * The Dismissed filter (0065): recommendations the team dismissed in this
 * zone (or in none), shown on request, each with Restore, which puts it back
 * in the list to act on.
 */
export function DismissedRecommendations({
  title,
  recommendations,
}: {
  title: string
  recommendations: CoverageRecommendation[]
}) {
  const [shown, setShown] = useState(false)
  const restore = useRestoreRecommendation()
  if (recommendations.length === 0) return null
  return (
    <section aria-label={`Dismissed in ${title}`} className="border-t border-border px-4 py-3">
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => setShown((on) => !on)}
        className="min-h-9 text-[12px] font-medium text-text-secondary underline underline-offset-4"
      >
        {shown ? 'Hide dismissed' : 'Dismissed'} ·{' '}
        <span className="font-numeric">{recommendations.length}</span>
      </button>
      {shown && (
        <ul aria-label={`Dismissed recommendations for ${title}`} className="mt-1 flex flex-col">
          {recommendations.map((rec) => (
            <li key={rec.id} className="flex items-center gap-2 border-b border-border py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-text-primary">{rec.name}</p>
                <p className="text-[11.5px] text-text-muted">
                  Dismissed{rec.handledBy ? ` by ${rec.handledBy}` : ''}
                  {rec.why ? ` · “${rec.why}”` : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={restore.isPending}
                onClick={() =>
                  restore.mutate(rec.id, {
                    onSuccess: () => toast.success(`${rec.name} is back to act on`),
                    onError: (err) => toast.error(errorMessage(err, 'Couldn’t restore it. Try again.')),
                  })
                }
                aria-label={`Restore ${rec.name}`}
                className={PILL}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
