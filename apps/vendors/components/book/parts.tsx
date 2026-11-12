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
    : detlioJobStatus({ status: job.status, paymentMethod: job.paymentMethod, amount: job.amount })
}

/**
 * One job on Today and on Jobs: its time, who, the DETLIO tag or Walk-in
 * ("From your link" for a booking from the garage's own page, 0073), what,
 * who is on it, and how it stands.
 */
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
          {job.source === 'detlio' ? <Tag detlio /> : <Tag>{job.origin === 'link' ? t('From your link') : t('Walk-in')}</Tag>}
        </span>
        <span className="mt-0.5 block truncate text-t4 text-[#A8A8B2]">{jobLine(job)}</span>
        {job.workers && job.workers.length > 0 && (
          <span className="mt-0.5 block truncate text-[12px] text-[#8E8E98]">
            {t('By {names}', { names: job.workers.map((worker) => worker.name.split(/\s+/)[0] ?? worker.name).join(', ') })}
          </span>
        )}
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

// ─── Stages 2 and 3 (0073) ───────────────────────────────────────────────────

/** A screen's one main action: the solid red button (Add expense, Send on WhatsApp). */
export const redButton = 'fx-red-button fx-press'

/** "+ Add" at the right of a page title (Team, Stock). `label` is already translated. */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(raised, 'flex h-11 shrink-0 items-center gap-1.5 rounded-small px-3.5 text-t4 font-semibold text-text-primary')}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </button>
  )
}

/** What a money screen says to a staff seat. */
export function OwnerOnly() {
  const t = useT()
  return <p className="fx-edge rounded-control px-4 py-4 text-t4 text-[#A8A8B2]">{t("Only the garage's owner sees money.")}</p>
}

/**
 * A raised chip with the red light under it when chosen ("Who did it?",
 * GPay / PhonePe / Paytm). A toggle: aria-pressed says its state.
 */
export function LightChip({ label, on, onClick, disabled }: { label: string; on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        raised,
        'flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] px-3 py-1.5 text-[13px]',
        on ? 'font-semibold text-text-primary' : 'font-medium text-[#A8A8B2]'
      )}
    >
      {/* Two lines at most: a long Tamil word ("கரண்ட் & தண்ணீர்") wraps rather than losing its end. */}
      <span className="line-clamp-2 max-w-full text-center leading-[1.2] break-words">{label}</span>
      <RedLight state={on ? 'on' : 'dim'} className="w-[18px]" />
    </button>
  )
}

/**
 * − amount +, recessed (Each job uses, Order supplies). `label` names what
 * it counts for screen readers; already translated.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 1_000_000,
  label,
  disabled,
}: {
  value: number
  onChange: (next: number) => void
  step?: number
  min?: number
  max?: number
  label: string
  disabled?: boolean
}) {
  const t = useT()
  const clamp = (next: number) => Math.max(min, Math.min(max, Math.round(next * 100) / 100))
  return (
    <div role="group" aria-label={label} className="fx-recessed flex h-11 shrink-0 items-center rounded-small">
      <button type="button" aria-label={t('Less')} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - step))} className="grid h-11 w-10 place-items-center text-text-primary disabled:text-[#5A5A64]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M5 12h14" />
        </svg>
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        value={String(value)}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value.replace(/[^\d.]/g, ''))
          if (Number.isFinite(next)) onChange(clamp(next))
        }}
        className="w-12 bg-transparent text-center font-numeric text-[15px] font-semibold text-text-primary outline-none"
      />
      <button type="button" aria-label={t('More')} disabled={disabled || value >= max} onClick={() => onChange(clamp(value + step))} className="grid h-11 w-10 place-items-center text-text-primary disabled:text-[#5A5A64]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  )
}

/** A labelled field in the recessed well every Garage Book form uses. `label` is already translated. */
export function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  type = 'text',
  maxLength,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  type?: string
  maxLength?: number
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-t4 font-semibold text-[#D4D4DA]">
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="fx-recessed h-12 min-w-0 rounded-control px-3.5 text-t3 text-text-primary outline-none placeholder:text-[#8A8A94]"
      />
    </div>
  )
}

/** A failed save, said in the toast. */
export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
