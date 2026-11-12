'use client'

import { useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconChevronLeft } from '@tabler/icons-react'
import type { BookJob } from '@repo/core/api/garage-book'
import {
  carName,
  detlioJobStatus,
  initials,
  jobTime,
  ownJobStatus,
  type StatusTone,
} from '@repo/core/garage-book'
import { useT } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { RedLight } from '@repo/ui/finish/red-light'
import { AppShell } from '@repo/ui/sc/app-shell'
import { useGarageBookOn } from '@/lib/garage-book'

/**
 * The parts every Garage Book screen of the portal is built from, drawn as
 * the approved mockup draws them (SPEC.md; the finish of PR #120). The
 * native app's components/book/parts.tsx draws the same parts.
 */

/**
 * A Garage Book screen: the portal's shell with the finish switched on for
 * this page alone. With the book off it is never shown: Home instead.
 */
export function BookScreen({
  children,
  className,
  brand,
  nav = true,
}: {
  children: ReactNode
  className?: string
  /** Home's row: the wordmark and the open pill. */
  brand?: ReactNode
  /** Off on Add a walk-in, which has its own bar with Save job. */
  nav?: boolean
}) {
  const { on, known } = useGarageBookOn()
  const router = useRouter()
  useEffect(() => {
    if (known && !on) router.replace('/home')
  }, [known, on, router])
  if (!on) return null
  return (
    <AppShell showNav={nav} navType="vendor" showBrand={Boolean(brand)} brandRight={brand} className={cn('finish gap-4 pt-5', className)}>
      {children}
    </AppShell>
  )
}

export const raised = 'fx-raised fx-press'

export function Overline({ children, className, tone }: { children: ReactNode; className?: string; tone?: 'red' }) {
  return (
    <span className={cn('block text-over font-semibold uppercase', tone === 'red' ? 'text-[#FF8A95]' : 'text-[#8E8E98]', className)}>
      {children}
    </span>
  )
}

/** A page title with a raised Back (or Close) button, and a quiet line under it. */
export function BackHeader({
  title,
  back,
  sub,
  right,
  close = false,
}: {
  title: ReactNode
  back: string
  sub?: ReactNode
  right?: ReactNode
  close?: boolean
}) {
  const t = useT()
  return (
    // Wraps: a control on the right drops under a title too long to share
    // its line (a long Tamil title is one word, which cannot break).
    <div className="flex flex-wrap items-center gap-2.5">
      <Link href={back} aria-label={close ? t('Close') : t('Back')} className={cn(raised, 'grid size-10 shrink-0 place-items-center rounded-small')}>
        {close ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6l-12 12" />
          </svg>
        ) : (
          <IconChevronLeft size={20} aria-hidden />
        )}
      </Link>
      <div className="min-w-min flex-1">
        <h1 className="text-title font-semibold text-text-primary">{title}</h1>
        {sub && <p className="text-t4 text-[#A8A8B2]">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/**
 * All / Detlio / My own, and the other recessed switches (When, Payment).
 * The label and each option's label are English (msg), translated here.
 */
export function Seg<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: V
  options: ReadonlyArray<{ value: V; label: string; count?: number }>
  onChange: (value: V) => void
}) {
  const t = useT()
  return (
    <div role="group" aria-label={t(label)} className="gb-seg fx-recessed">
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {t(option.label)}
          {option.count !== undefined && <span className="gb-n font-numeric font-semibold">{option.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Tag({ detlio, children }: { detlio?: boolean; children?: ReactNode }) {
  return detlio ? <span className="gb-tag-d">DETLIO</span> : <span className="gb-tag-o">{children}</span>
}

const TONE: Record<StatusTone, string> = {
  done: 'text-[#4ADE80]',
  working: 'text-[#8DB8FF]',
  owed: 'text-[#FF8A95]',
  quiet: 'text-[#A8A8B2]',
}

export function StatusLine({ text, tone }: { text: string; tone: StatusTone }) {
  return <p className={cn('mt-1 text-[12px] font-semibold', TONE[tone])}>{text}</p>
}

/** What a job is, in one line: "Interior clean · Creta". */
export function jobLine(job: BookJob): string {
  const labels = job.lines.map((line) => ('qty' in line && line.qty > 1 ? `${line.label} ×${line.qty}` : line.label)).join(', ')
  return [labels, job.car?.model || carName(job.car)].filter(Boolean).join(' · ')
}

export function jobStatus(job: BookJob) {
  return job.source === 'own'
    ? ownJobStatus({ status: job.status, payment: job.payment, visitNumber: job.visitNumber, totalPaise: job.totalPaise })
    : detlioJobStatus({ status: job.status, paymentMethod: job.paymentMethod, amount: job.amount, noFeeInspection: job.noFeeInspection })
}

/** One job on Today and on Jobs: its time, who, the DETLIO tag or Walk-in, what, and how it stands. */
export function JobCard({
  job,
  href,
  onOpen,
  drop = false,
}: {
  job: BookJob
  /** A Detlio job opens its booking page. */
  href?: string
  /** A walk-in opens its sheet. */
  onOpen?: () => void
  drop?: boolean
}) {
  const t = useT()
  const status = job.source === 'own' && job.pending ? { text: t('Waiting to send · no signal'), tone: 'owed' as const } : jobStatus(job)
  const body = (
    <>
      <span className="w-12 shrink-0 font-numeric text-[17px] font-semibold leading-[22px] text-text-primary">{jobTime(job.scheduledAt)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-t3 font-semibold text-text-primary">
          <span className="truncate">{job.name}</span>
          {job.source === 'detlio' ? <Tag detlio /> : <Tag>{t('Walk-in')}</Tag>}
        </span>
        <span className="mt-0.5 block truncate text-t4 text-[#A8A8B2]">{jobLine(job)}</span>
        {status && <StatusLine {...status} />}
      </span>
    </>
  )
  const className = cn('fx-edge fx-press flex w-full gap-3 rounded-control px-3.5 py-3 text-left', drop && 'gb-drop')
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} className={className}>
      {body}
    </button>
  )
}

export function Tile({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn('fx-edge rounded-surface px-3.5 py-3', className)}>
      <Overline>{label}</Overline>
      <div className="mt-1 font-numeric text-[24px] font-semibold leading-[30px] text-text-primary">{value}</div>
      {sub && <div className="text-[12px] text-[#A8A8B2]">{sub}</div>}
    </div>
  )
}

/** A two-line pick (a service from the price list), with its red light waiting or on. */
export function PickTile({ title, sub, on, onClick }: { title: string; sub: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn(raised, 'flex min-w-0 flex-col gap-0.5 rounded-control px-3 pt-2.5 pb-2 text-left')}>
      <span className="truncate text-[14px] font-semibold text-text-primary">{title}</span>
      <span className="truncate text-[12px] text-[#A8A8B2]">{sub}</span>
      <RedLight state={on ? 'on' : 'dim'} className="mt-1.5 w-full" />
    </button>
  )
}

/** `label` is already translated. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className="gb-switch fx-recessed">
      <RedLight className="gb-switch__light" />
      <span className="gb-switch__knob fx-pearl" />
    </button>
  )
}

/** A customer's round disc with their initials. */
export function Disc({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full text-[13px] font-semibold text-[#D4D4DA] shadow-[inset_0_1px_0_rgb(255_255_255/0.07),inset_0_-4px_8px_rgb(0_0_0/0.45),0_0_0_1px_rgb(255_255_255/0.05)]"
      style={{ width: size, height: size, background: 'radial-gradient(circle at 50% 30%, #26262b 0%, #18181b 60%, #121214 100%)' }}
    >
      {initials(name)}
    </span>
  )
}

/** The round icon well of Business's tools and the due card. */
export function IconWell({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/0.07),inset_0_-4px_8px_rgb(0_0_0/0.45),0_0_0_1px_rgb(255_255_255/0.05)]"
      style={{ background: 'radial-gradient(circle at 50% 30%, #26262b 0%, #18181b 60%, #121214 100%)' }}
    >
      {children}
    </span>
  )
}

/** A quiet note under a list, in the mockup's small grey. */
export function Footnote({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-[17px] text-[#A8A8B2]">{children}</p>
}

/** A failed load said plainly, with Try again. `what` is already translated. */
export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  const t = useT()
  return (
    <div className="fx-edge flex items-center justify-between gap-3 rounded-control px-4 py-3 text-t4 text-[#A8A8B2]">
      <span>{t("Couldn't load {what}.", { what })}</span>
      <button type="button" onClick={onRetry} className={cn(raised, 'h-10 rounded-small px-3 text-t4 font-semibold text-text-primary')}>
        {t('Try again')}
      </button>
    </div>
  )
}
