'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  IconAlertTriangle,
  IconCamera,
  IconCircle,
  IconCircleCheck,
  IconClock,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { fill, useT } from '@repo/core/i18n'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { Chip } from '@repo/ui/sc/chip'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { TopBar } from '@repo/ui/sc/top-bar'
import { TierMedalIcon } from '@repo/ui/features/tier-medal'
import { uploadLuxuryPhoto, type GarageLuxury, type LuxuryApplication } from '@repo/core/api/luxury'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useGarageLuxury, useSendLuxuryApplication } from '@repo/core/api/hooks/use-luxury'
import { useGarageTier } from '@repo/core/api/hooks/use-tiers'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { brandChipLabel, LUXURY_BRANDS, LUXURY_LIMITS } from '@repo/core/luxury'
import { TIER_LABELS } from '@repo/core/tiers'
import { cn } from '@repo/core/utils'
import {
  formFromApplication,
  formPayload,
  istShortDay,
  reapplyLabel,
  shownScreen,
  toggleBrand,
  type LuxuryForm,
} from '@repo/core/luxury-form'

/** What a Bronze garage gets ready while it works towards Silver. */
const NEEDS = [
  'The brands you work on',
  'At least 3 photos of past luxury jobs',
  'A covered or indoor bay',
  'The products you use',
  'Who does the work',
] as const

const INTRO =
  'Customers who drive a luxury car see specialist garages first. The Detlio team checks every application before the badge shows.'

/**
 * Settings → Luxury car specialist (0083, mockup 3-garage-app.png): where a
 * Silver or Gold garage applies for the badge, and reads the team's answer.
 * A Bronze garage sees it locked, with its steps to Silver. The owner seat
 * only (the API refuses an operator). apps/vendors-app's settings/luxury.tsx
 * is the same screen.
 */
export default function LuxurySpecialistPage() {
  const t = useT()
  const router = useRouter()
  const isVendorAdmin = useIsVendorAdmin()
  const vendorId = useAuthStore((s) => s.activeVendorId) ?? undefined
  const luxury = useGarageLuxury(vendorId, isVendorAdmin)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home')
  }, [isVendorAdmin, router])

  // A company switch is a different garage: start from its own state.
  const [seenVendor, setSeenVendor] = useState(vendorId)
  if (seenVendor !== vendorId) {
    setSeenVendor(vendorId)
    setEditing(false)
  }

  const data = luxury.data
  const screen = data ? shownScreen(data, editing) : null

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar title={t('Luxury car specialist')} showBack backHref="/settings" />

      {luxury.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-[13px] text-error">
            {t('Couldn’t load this. Check your connection and try again.')}
          </p>
          <ScButton variant="outline" size="md" fullWidth={false} onClick={() => void luxury.refetch()} className="px-4">
            {t('Try again')}
          </ScButton>
        </div>
      ) : !data || !screen ? (
        <SkeletonList count={3} itemClassName="h-32" />
      ) : screen === 'locked' ? (
        <Locked vendorId={vendorId} />
      ) : screen === 'form' || screen === 'more' ? (
        <ApplyForm
          key={`${data.application?.updatedAt ?? 'new'}-${screen}`}
          data={data}
          asked={screen === 'more' ? data.application : null}
          onSent={() => setEditing(false)}
        />
      ) : (
        <Answered data={data} screen={screen} onEdit={() => setEditing(true)} />
      )}
    </AppShell>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

const BOX_TONES = {
  neutral: { box: 'border-border bg-surface', icon: 'text-text-secondary' },
  warning: { box: 'border-warning bg-warning-muted/20', icon: 'text-warning' },
  success: { box: 'border-success/50 bg-success-muted/20', icon: 'text-success' },
} as const

/** The state box at the top: under review, asked for more, approved and the rest. */
function StateBox({
  tone,
  icon,
  title,
  children,
}: {
  tone: keyof typeof BOX_TONES
  icon: ReactNode
  title: string
  children?: ReactNode
}) {
  const styles = BOX_TONES[tone]
  return (
    <div role="status" className={cn('flex items-start gap-3 rounded-[14px] border px-4 py-3', styles.box)}>
      <span className={cn('mt-px shrink-0', styles.icon)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-text-primary">{title}</p>
        {children && <div className="mt-0.5 text-[12px] text-text-secondary">{children}</div>}
      </div>
    </div>
  )
}

function CardHead({ title, line }: { title: string; line?: string }) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
      {line && <p className="mt-0.5 text-[12px] text-text-secondary">{line}</p>}
    </div>
  )
}

function Intro() {
  const t = useT()
  return (
    <div>
      <h2 className="text-[15px] font-semibold text-text-primary">{t('Apply for the badge')}</h2>
      <p className="mt-0.5 text-[12px] text-text-secondary">{t(INTRO)}</p>
    </div>
  )
}

/** A Bronze garage: today's tier card, what to get ready, and a grey Send for review. */
function Locked({ vendorId }: { vendorId: string | undefined }) {
  const t = useT()
  const { data: tier } = useGarageTier(vendorId)
  const next = tier?.next
  const percent = next && next.total > 0 ? Math.round((next.done / next.total) * 100) : 0
  return (
    <>
      <Intro />
      <ScCard className="flex flex-col gap-3" role="region" aria-label={t('For Silver and Gold garages')}>
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-border bg-surface-elevated">
            <TierMedalIcon tier={tier?.tier ?? 'bronze'} size={26} className={cn(!tier?.tier && 'grayscale')} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-muted">
              {t('For Silver and Gold garages')}
            </p>
            <h2 className="text-[16px] font-semibold text-text-primary">
              {tier?.tier ? t("You're {tier}", { tier: t(TIER_LABELS[tier.tier]) }) : t('No tier yet')}
            </h2>
            <p className="text-[12px] text-text-secondary">
              {t('Reach Silver, then apply here.')}
              {next && (
                <>
                  {' '}
                  {fill(t('Next: {tier}, {done} of {total} done'), {
                    tier: t(TIER_LABELS[next.tier]),
                    done: <span className="font-numeric">{next.done}</span>,
                    total: <span className="font-numeric">{next.total}</span>,
                  })}
                </>
              )}
            </p>
          </div>
        </div>
        {next && (
          <div
            role="progressbar"
            aria-label={t('Progress to {tier}', { tier: t(TIER_LABELS[next.tier]) })}
            aria-valuemin={0}
            aria-valuemax={next.total}
            aria-valuenow={next.done}
            className="h-1.5 overflow-hidden rounded-full bg-surface-elevated"
          >
            <div className="h-full rounded-full bg-text-primary" style={{ width: `${percent}%` }} />
          </div>
        )}
        <Link
          href="/home"
          className="press flex h-[52px] items-center justify-center rounded-full border border-white/25 text-[15px] font-medium text-text-primary hover:bg-surface"
        >
          {t('See your steps to Silver')}
        </Link>
      </ScCard>

      <ScCard className="flex flex-col gap-3">
        <CardHead title={t('What you’ll need')} line={t('Get these ready while you work towards Silver.')} />
        <ul className="flex flex-col gap-2">
          {NEEDS.map((need) => (
            <li key={need} className="flex items-center gap-2.5 text-[13px] text-text-secondary">
              <IconCircle size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
              {t(need)}
            </li>
          ))}
        </ul>
      </ScCard>

      <ScButton variant="main" size="lg" disabled>
        {t('Send for review')}
      </ScButton>
    </>
  )
}

/** The form, empty or filled in from what was sent ("Asked for more", "Edit application"). */
function ApplyForm({
  data,
  asked,
  onSent,
}: {
  data: GarageLuxury
  asked: LuxuryApplication | null
  onSent: () => void
}) {
  const t = useT()
  const vendorId = useAuthStore((s) => s.activeVendorId) ?? undefined
  const send = useSendLuxuryApplication(vendorId)
  const [form, setForm] = useState<LuxuryForm>(() =>
    formFromApplication(data.application?.status === 'review' || asked ? data.application : null)
  )
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const payload = formPayload(form)
  const roomLeft = LUXURY_LIMITS.maxPhotos - form.photos.length

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files).slice(0, roomLeft)) {
        const url = await uploadLuxuryPhoto(file)
        setForm((current) =>
          current.photos.length >= LUXURY_LIMITS.maxPhotos
            ? current
            : { ...current, photos: [...current.photos, { url, caption: null }] }
        )
      }
    } catch (error) {
      toast.error(errorMessage(error, t('Upload failed. Please try again.')))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const submit = () => {
    if (!payload) return
    send.mutate(payload, {
      onSuccess: () => {
        toast.success(t('Sent for review'))
        onSent()
      },
      onError: (error) => toast.error(errorMessage(error, t('Couldn’t send it. Please try again.'))),
    })
  }

  return (
    <>
      {asked && (
        <StateBox tone="warning" icon={<IconAlertTriangle size={18} aria-hidden="true" />} title={t('Detlio asked for more')}>
          {asked.teamNote && <p>“{asked.teamNote}”</p>}
          <p>
            {t('{who}, {date}. Add it and send again.', {
              who: asked.decidedBy ?? 'Detlio',
              date: asked.decidedAt ? istShortDay(asked.decidedAt) : '',
            })}
          </p>
        </StateBox>
      )}

      <div className="flex flex-col gap-2">
        <Intro />
        <p className="flex items-center gap-2 text-[12px] text-text-secondary">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-elevated px-2 py-0.5 font-medium text-text-primary">
            {data.tier && <TierMedalIcon tier={data.tier} size={13} />}
            {data.tier ? t("You're {tier}", { tier: t(TIER_LABELS[data.tier]) }) : null}
          </span>
          {/* Editing while under review below Silver (the API allows it): on hold, not "can apply". */}
          {data.silverOrGold
            ? t('You can apply.')
            : t('On hold while you’re below Silver. The team looks at it once you’re Silver again.')}
        </p>
      </div>

      <ScCard className="flex flex-col gap-3">
        <CardHead
          title={t('Brands you work on')}
          line={t('Pick the ones you’ve worked on many times. Customers see these.')}
        />
        <div className="flex flex-wrap gap-2">
          {LUXURY_BRANDS.map((brand) => (
            <Chip
              key={brand}
              label={brandChipLabel(brand)}
              selected={form.brands.includes(brand)}
              onClick={() => setForm((current) => toggleBrand(current, brand))}
            />
          ))}
        </div>
      </ScCard>

      <ScCard className="flex flex-col gap-3">
        <CardHead
          title={t('Photos of past luxury jobs')}
          line={t('At least 3. Show the car and the finished work. You can hide number plates.')}
        />
        <div className="grid grid-cols-3 gap-2">
          {form.photos.map((photo, index) => (
            <div key={photo.url} className="relative aspect-[4/3.6] overflow-hidden rounded-[10px] border border-border bg-surface-elevated">
              {/* eslint-disable-next-line @next/next/no-img-element -- an R2 upload, sized by the tile */}
              <img src={photo.url} alt={photo.caption ?? t('Photo {n}', { n: index + 1 })} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={t('Remove photo {n}', { n: index + 1 })}
                onClick={() => setForm((current) => ({ ...current, photos: current.photos.filter((p) => p.url !== photo.url) }))}
                className="tap-target absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <IconX size={14} aria-hidden="true" />
              </button>
              <input
                aria-label={t('Car in photo {n}', { n: index + 1 })}
                placeholder={t('Add the car')}
                maxLength={LUXURY_LIMITS.captionMax}
                value={photo.caption ?? ''}
                onChange={(event) => {
                  const caption = event.target.value
                  setForm((current) => ({
                    ...current,
                    photos: current.photos.map((p) => (p.url === photo.url ? { ...p, caption } : p)),
                  }))
                }}
                className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-[11px] text-white outline-none placeholder:text-white/60"
              />
            </div>
          ))}
          {roomLeft > 0 && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              className="flex aspect-[4/3.6] flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border text-[12px] text-text-secondary disabled:opacity-60"
            >
              <IconCamera size={18} aria-hidden="true" />
              {uploading ? t('Uploading…') : t('Add photo')}
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(event) => void addFiles(event.target.files)}
        />
        <p className="text-[12px] text-text-muted">
          {t('{count} added', { count: form.photos.length })}
        </p>
      </ScCard>

      <ScCard className="flex flex-col gap-3">
        <CardHead title={t('Covered or indoor bay')} line={t('Where the car is worked on, out of the sun and rain.')} />
        <div role="radiogroup" aria-label={t('Covered or indoor bay')} className="grid grid-cols-2 gap-2">
          {([true, false] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              role="radio"
              aria-checked={form.coveredBay === value}
              onClick={() => setForm((current) => ({ ...current, coveredBay: value }))}
              className={cn(
                'h-12 rounded-[12px] border text-[14px] font-medium transition-colors',
                form.coveredBay === value
                  ? 'border-brand-white bg-brand-white text-brand-black'
                  : 'border-border bg-surface text-text-primary'
              )}
            >
              {value ? t('Yes') : t('No')}
            </button>
          ))}
        </div>
      </ScCard>

      <ScCard className="flex flex-col gap-2">
        <CardHead title={t('Products you use')} />
        <ScTextarea
          aria-label={t('Products you use')}
          rows={3}
          maxLength={LUXURY_LIMITS.productsMax}
          value={form.products}
          onChange={(event) => setForm((current) => ({ ...current, products: event.target.value }))}
        />
        <p className="text-[11px] text-text-muted">{t('For example your ceramic, PPF and polish brands.')}</p>
      </ScCard>

      <ScCard className="flex flex-col gap-2">
        <CardHead title={t('Trained staff')} />
        <ScInput
          aria-label={t('Trained staff')}
          maxLength={LUXURY_LIMITS.staffMax}
          value={form.staff}
          onChange={(event) => setForm((current) => ({ ...current, staff: event.target.value }))}
        />
        <p className="text-[11px] text-text-muted">{t('Who does the work, and any training they have.')}</p>
      </ScCard>

      <div className="flex flex-col gap-2">
        <ScButton variant="main" size="lg" disabled={!payload || send.isPending || uploading} onClick={submit}>
          {send.isPending ? t('Sending…') : t('Send for review')}
        </ScButton>
        <p className="text-center text-[11px] text-text-muted">
          {t('Your prices don’t change: customers still pay your hatchback, sedan or SUV price.')}
        </p>
      </div>
    </>
  )
}

/** Sent: under review, approved, hidden, declined or removed, with what was sent. */
function Answered({
  data,
  screen,
  onEdit,
}: {
  data: GarageLuxury
  screen: 'review' | 'approved' | 'hidden' | 'declined' | 'removed'
  onEdit: () => void
}) {
  const t = useT()
  const app = data.application
  return (
    <>
      {screen === 'review' && app && (
        <StateBox tone="neutral" icon={<IconClock size={18} aria-hidden="true" />} title={t('Under review')}>
          <p>
            {t('Sent on {date}. The Detlio team usually replies within 3 working days. We’ll send you a notification.', {
              date: istShortDay(app.sentAt),
            })}
          </p>
          {!data.silverOrGold && (
            <p className="mt-1 text-warning">{t('On hold while you’re below Silver. The team looks at it once you’re Silver again.')}</p>
          )}
        </StateBox>
      )}
      {screen === 'approved' && (
        <StateBox tone="success" icon={<IconCircleCheck size={18} aria-hidden="true" />} title={t("You're a Luxury car specialist")}>
          {t('Customers now see the badge and your brands on your listing. Detlio can remove it if standards slip.')}
        </StateBox>
      )}
      {screen === 'hidden' && (
        <StateBox tone="warning" icon={<IconAlertTriangle size={18} aria-hidden="true" />} title={t('Your badge is hidden for now')}>
          {t('Customers see the Luxury specialist badge only on Silver and Gold garages. It comes back when you’re Silver again.')}
        </StateBox>
      )}
      {screen === 'declined' && app && (
        <StateBox tone="warning" icon={<IconInfoCircle size={18} aria-hidden="true" />} title={t('Not this time')}>
          {app.teamNote && <p>“{app.teamNote}”</p>}
          {data.reapplyOn && <p>{t('You can apply again on {date}.', { date: reapplyLabel(data.reapplyOn) })}</p>}
        </StateBox>
      )}
      {screen === 'removed' && app && (
        <StateBox tone="warning" icon={<IconInfoCircle size={18} aria-hidden="true" />} title={t('Detlio removed your badge')}>
          {app.teamNote && <p>“{app.teamNote}”</p>}
          <p>{data.silverOrGold ? t('Put it right, then apply again.') : t('Reach Silver, then apply again.')}</p>
        </StateBox>
      )}

      {app && <WhatYouSent app={app} />}

      {screen === 'review' && (
        <div className="flex flex-col gap-2">
          <ScButton variant="outline" size="md" onClick={onEdit}>
            {t('Edit application')}
          </ScButton>
          <p className="text-[11px] text-text-muted">{t('Editing keeps your place in the queue.')}</p>
        </div>
      )}
      {screen === 'removed' && data.silverOrGold && (
        <ScButton variant="outline" size="md" onClick={onEdit}>
          {t('Apply again')}
        </ScButton>
      )}
    </>
  )
}

function WhatYouSent({ app }: { app: LuxuryApplication }) {
  const t = useT()
  const rows: Array<[string, string]> = [
    [t('Brands'), app.brands.map(brandChipLabel).join(', ')],
    [t('Covered bay'), app.coveredBay ? t('Yes') : t('No')],
    [t('Products'), app.products ?? '—'],
    [t('Staff'), app.staff ?? '—'],
  ]
  return (
    <ScCard className="flex flex-col gap-3">
      <CardHead title={t('What you sent')} />
      <div className="grid grid-cols-4 gap-1.5">
        {app.photos.map((photo, index) => (
          <div key={photo.url} className="relative aspect-square overflow-hidden rounded-[8px] bg-surface-elevated">
            {/* eslint-disable-next-line @next/next/no-img-element -- an R2 upload, sized by the tile */}
            <img src={photo.url} alt={photo.caption ?? t('Photo {n}', { n: index + 1 })} className="h-full w-full object-cover" />
            {photo.caption && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-3 text-[10px] leading-tight text-white">
                {photo.caption}
              </span>
            )}
          </div>
        ))}
      </div>
      <dl className="flex flex-col divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[110px_1fr] gap-3 py-2 text-[13px] first:pt-0 last:pb-0">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>
    </ScCard>
  )
}
