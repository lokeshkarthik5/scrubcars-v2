'use client'

import { useEffect, useState } from 'react'
import { IconCircleCheck, IconCircleX, IconRosetteDiscountCheckFilled } from '@tabler/icons-react'
import { ScCard } from '@repo/ui/sc/card'
import { getGarageCertification, type GarageCertification } from '@repo/core/api/certification'
import { CERTIFIED_LABEL, dateKeyLabel, garageCheckLine } from '@repo/core/certification'
import { cn } from '@repo/core/utils'

/**
 * "Detlio Certified" on the portal's Home (0048), for the owner seat: the
 * garage's own standing, so it can work towards the seal or keep it.
 * Certified: since when, and, while it falls short, the day it must be put
 * right by. Not yet: how many standards it meets, each with its own figure
 * against the target (folded away until asked), and Detlio's in-person
 * check. Never a checker's name or notes; the server never sends them.
 *
 * Shows nothing until loaded, and nothing if the read fails: it is
 * information, and Home's jobs come first.
 */
export function CertifiedCard() {
  const [data, setData] = useState<GarageCertification | null>(null)

  useEffect(() => {
    let cancelled = false
    getGarageCertification()
      .then((answer) => {
        if (!cancelled) setData(answer)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!data) return null

  const met = data.rules.filter((rule) => rule.met).length
  const total = data.rules.length
  const missing = data.rules.filter((rule) => !rule.met)

  return (
    <ScCard className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2.5">
        <IconRosetteDiscountCheckFilled
          size={22}
          aria-hidden="true"
          className={cn('mt-px shrink-0', data.certified ? 'text-text-primary' : 'text-text-muted')}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-text-primary">
            {data.certified ? `You're ${CERTIFIED_LABEL}` : CERTIFIED_LABEL}
          </h2>
          <p className="text-[12px] text-text-secondary">
            {data.certified
              ? 'Customers see the seal on your garage and can find you with “Certified only”.'
              : data.eligible
                ? 'You meet every standard. Detlio will visit to check in person, then certify you.'
                : (
                  <>
                    You meet <span className="font-numeric">{met}</span> of{' '}
                    <span className="font-numeric">{total}</span> standards. Meet them all to earn the seal
                    customers look for.
                  </>
                )}
          </p>
        </div>
      </div>

      {data.atRisk && (
        <p role="status" className="rounded-[10px] bg-warning-muted px-3 py-2 text-[12px] text-warning">
          You no longer meet{' '}
          {missing.length > 0 ? missing.map((rule) => rule.label.toLowerCase()).join(', ') : 'every standard'}
          {data.qualityCheck.status !== 'passed' && ' (Detlio’s check is due)'}. Put it right by{' '}
          <span className="font-numeric">{dateKeyLabel(data.atRisk.keepsUntil)}</span> to keep the seal.
        </p>
      )}

      {!data.certified && data.ended && (
        <p className="text-[12px] text-text-muted">
          {data.ended.kind === 'lapsed'
            ? `Your seal lapsed after ${data.graceDays} days below the standards. Meet them again to earn it back.`
            : 'Detlio removed your seal. Contact Detlio to talk about earning it back.'}
        </p>
      )}

      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-[13px] font-medium text-text-secondary hover:text-text-primary">
          {data.certified ? 'Your standards' : missing.length > 0 ? 'See what’s missing' : 'See your standards'}
          <span aria-hidden="true" className="ml-1 transition-transform group-open:rotate-90">›</span>
        </summary>
        <ul className="flex flex-col gap-2 pt-1">
          {data.rules.map((rule) => (
            <li key={rule.key} className="flex items-start gap-2">
              {rule.met ? (
                <IconCircleCheck size={16} aria-label="Met" className="mt-px shrink-0 text-success" />
              ) : (
                <IconCircleX size={16} aria-label="Not met" className="mt-px shrink-0 text-warning" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-text-primary">{rule.label}</p>
                <p className="text-[11px] text-text-muted">
                  <span className="font-numeric text-text-secondary">{rule.value}</span> · needs {rule.target.toLowerCase()}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-border pt-2 text-[12px] text-text-secondary">
          {garageCheckLine(data.qualityCheck)}
        </p>
        <p className="mt-1 text-[11px] text-text-muted">
          Counted over the last <span className="font-numeric">{data.windowDays}</span> days. Checked every day; a
          certified garage that falls short has <span className="font-numeric">{data.graceDays}</span> days to put it
          right.
        </p>
      </details>
    </ScCard>
  )
}
