'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconAlertTriangle, IconCamera, IconCheck, IconRefresh } from '@tabler/icons-react'
import { ApiError } from '@repo/core/api/client'
import { shineOn, useCreateShineScan, useShineConfig, useShineStatus } from '@repo/core/api/hooks/use-shine-score'
import {
  SHINE_AREAS,
  SHINE_AREA_LABELS,
  SHINE_AREA_SHORT,
  SHINE_STEP_GUIDES,
  photoWarningLead,
  scansLeftLine,
  type ShineArea,
} from '@repo/core/shine-score'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { fill, useT } from '@repo/core/i18n'
import { ScButton } from '@repo/ui/sc/button'
import { ScModal } from '@repo/ui/sc/modal'
import { TopBar } from '@repo/ui/sc/top-bar'
import { CustomerShell } from '@/components/customer-shell'
import { MainAction } from '@/components/main-action'
import { ShineOutline } from '@/components/shine/shine-outline'
import { blobToBase64, prepareShinePhoto, type ShinePhoto } from '@/lib/shine-photo'

type Photos = Partial<Record<ShineArea, ShinePhoto>>

/** The four segments under the title: done and current lit, the rest dim. */
function Progress({ upTo }: { upTo: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {SHINE_AREAS.map((area, i) => (
        <span key={area} className={cn('h-[3px] flex-1 rounded-full', i <= upTo ? 'bg-text-primary' : 'bg-white/15')} />
      ))}
    </div>
  )
}

/**
 * Shine Score (0075): four guided photos (outside front, outside side,
 * dashboard, seats & floor), a check with Retake, then the score. Signed in
 * to scan; three free scans a day (the server counts). Each photo is drawn
 * again on the phone at 1280 px, without its metadata, before anything is
 * sent, and only the pictures are sent.
 */
export default function ShineScanPage() {
  const t = useT()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const config = useShineConfig()
  const on = shineOn(config.data)
  const status = useShineStatus(on && !!user)
  const scan = useCreateShineScan()

  const [photos, setPhotos] = useState<Photos>({})
  const [step, setStep] = useState(0)
  const [checking, setChecking] = useState(false)
  const [retaking, setRetaking] = useState<ShineArea | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<ShineArea | null>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)

  // The object URLs go when the page does.
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), [])

  if (ready && !user) {
    return (
      <CustomerShell className="gap-4 py-4">
        <TopBar title={t('Shine Score')} showBack backHref="/home" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-t3 font-semibold text-text-primary">{t('Sign in to get your Shine Score')}</p>
          <p className="text-t4 text-text-secondary">{t('Free · 4 photos')}</p>
          <ScButton
            variant="main"
            className="mt-2 w-auto px-8"
            onClick={() => router.push(`/login?next=${encodeURIComponent('/shine')}`)}
          >
            {t('Sign in')}
          </ScButton>
        </div>
      </CustomerShell>
    )
  }

  if (!config.isPending && !on) {
    return (
      <CustomerShell className="gap-4 py-4">
        <TopBar title={t('Shine Score')} showBack backHref="/home" />
        <p className="py-10 text-center text-t3 text-text-secondary">{t("Shine Score isn't available right now.")}</p>
      </CustomerShell>
    )
  }

  const area = SHINE_AREAS[step]!
  const current = retaking ?? area

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setPickError(null)
    setPreparing(true)
    try {
      const photo = await prepareShinePhoto(file)
      urls.current.push(photo.url)
      const next = { ...photos, [current]: photo }
      setPhotos(next)
      if (retaking) {
        setRetaking(null)
        setChecking(true)
        return
      }
      const missing = SHINE_AREAS.findIndex((a) => !next[a])
      if (missing === -1) setChecking(true)
      else setStep(missing)
    } catch {
      setPickError(t("Couldn't read that photo. Try another one."))
    } finally {
      setPreparing(false)
    }
  }

  const inputs = (
    <>
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="shine-camera-input"
        onChange={(e) => {
          void onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="shine-gallery-input"
        onChange={(e) => {
          void onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )

  // ─── Check and retake ──────────────────────────────────────────────────────
  if (checking && SHINE_AREAS.every((a) => photos[a])) {
    const warned = SHINE_AREAS.find((a) => photos[a]?.warning)
    const left = status.data?.scansLeft
    const perDay = status.data?.scansPerDay ?? config.data?.scansPerDay ?? 3
    const noneLeft = left === 0
    const error = scan.error instanceof ApiError || scan.error instanceof Error ? scan.error.message : null
    const retake = (a: ShineArea) => {
      setViewing(null)
      setChecking(false)
      setRetaking(a)
      scan.reset()
    }
    const submit = async () => {
      if (scan.isPending || noneLeft) return
      try {
        const body = []
        for (const a of SHINE_AREAS) {
          const photo = photos[a]!
          body.push({ area: a, mimeType: photo.mimeType, dataBase64: await blobToBase64(photo.blob) })
        }
        const result = await scan.mutateAsync(body)
        router.replace(`/shine/${result.scan.id}`)
      } catch {
        // Shown from scan.error below; the photos stay for another go.
      }
    }
    const leftLine = left === undefined ? null : scansLeftLine(left, perDay)
    return (
      <CustomerShell className="gap-4 pt-1 pb-8">
        {inputs}
        <TopBar title={t('Shine Score')} showBack backHref="/home" />
        <Progress upTo={3} />
        <div>
          <h2 className="text-[24px] leading-[1.25] font-semibold tracking-[-0.02em] text-text-primary">
            {t('Check your photos')}
          </h2>
          <p className="mt-1.5 text-t3 leading-snug text-text-secondary">
            {t('Tap a photo to see it bigger. Retake any that are blurry or dark.')}
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-2.5" aria-label={t('Your photos')}>
          {SHINE_AREAS.map((a) => {
            const photo = photos[a]!
            return (
              <li key={a} className="relative aspect-[4/3.3] overflow-hidden rounded-[16px] bg-surface">
                <button
                  type="button"
                  onClick={() => setViewing(a)}
                  aria-label={t('View {name}', { name: t(SHINE_AREA_LABELS[a]).toLowerCase() })}
                  className="block size-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" className="size-full object-cover" />
                </button>
                <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-t5 font-medium text-white backdrop-blur">
                  {t(SHINE_AREA_SHORT[a])}
                </span>
                {photo.warning ? (
                  <button
                    type="button"
                    onClick={() => retake(a)}
                    aria-label={t('Retake {name}', { name: t(SHINE_AREA_LABELS[a]).toLowerCase() })}
                    className="absolute top-2 right-2 flex min-h-8 items-center gap-1 rounded-full bg-black/60 px-2.5 text-t5 font-medium text-white backdrop-blur"
                  >
                    <IconRefresh size={13} stroke={1.8} aria-hidden />
                    {t('Retake')}
                  </button>
                ) : (
                  <span
                    aria-hidden
                    className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-success text-white"
                  >
                    <IconCheck size={15} stroke={2.4} />
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        {warned && (
          <p className="flex items-start gap-2.5 rounded-[16px] border border-line px-4 py-3 text-t4 leading-snug text-text-secondary" role="status">
            <IconAlertTriangle size={18} stroke={1.6} aria-hidden className="mt-px shrink-0 text-warning" />
            <span>
              <b className="font-medium text-text-primary">
                {(() => {
                  const lead = photoWarningLead(warned, photos[warned]!.warning!)
                  return t(lead.text, { area: t(lead.area) })
                })()}
              </b>{' '}
              {photos[warned]!.warning === 'dark'
                ? t('A brighter photo gives a fairer score.')
                : t('A sharper photo gives a fairer score.')}
            </span>
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-[16px] border border-line px-4 py-3 text-t4 leading-snug text-text-primary">
            {error}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-2.5 pt-2">
          <MainAction
            onClick={() => void submit()}
            disabled={scan.isPending || noneLeft || left === undefined}
            className="min-h-12"
          >
            {scan.isPending ? t('Scoring your photos…') : error ? t('Try again') : t('Get my score')}
          </MainAction>
          <p className="text-center text-t5 text-text-muted">
            {noneLeft
              ? t("You've used today's {count} free scans. Come back tomorrow.", { count: perDay })
              : leftLine
                ? `${t('Free')} · ${t(leftLine.key, { left: leftLine.left, perDay: leftLine.perDay })} · ${t('your photos stay private')}`
                : t('your photos stay private')}
          </p>
        </div>

        <ScModal
          open={viewing !== null}
          onClose={() => setViewing(null)}
          aria-label={viewing ? t(SHINE_AREA_LABELS[viewing]) : t('Photo')}
          className="max-w-[420px] px-3"
        >
          {viewing && (
            <div className="flex flex-col gap-3">
              <p className="text-t4 font-medium text-text-primary">{t(SHINE_AREA_LABELS[viewing])}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos[viewing]!.url}
                alt={t(SHINE_AREA_LABELS[viewing])}
                className="max-h-[60vh] w-full rounded-[12px] object-contain"
              />
              <div className="flex gap-2">
                <ScButton variant="secondary" onClick={() => retake(viewing)} className="min-h-11">
                  {t('Retake')}
                </ScButton>
                <ScButton variant="secondary" onClick={() => setViewing(null)} className="min-h-11">
                  {t('Close')}
                </ScButton>
              </div>
            </div>
          )}
        </ScModal>
      </CustomerShell>
    )
  }

  // ─── One guided photo ──────────────────────────────────────────────────────
  const guide = SHINE_STEP_GUIDES[current]
  const shown = photos[current]
  const index = SHINE_AREAS.indexOf(current)
  return (
    <CustomerShell className="gap-3.5 pt-1 pb-8">
      {inputs}
      <TopBar
        title={t('Shine Score')}
        showBack
        backHref="/home"
        right={
          <span className="text-t4 text-dim">
            {fill(t('Photo {number} of {total}'), {
              number: <span className="font-numeric">{index + 1}</span>,
              total: <span className="font-numeric">{SHINE_AREAS.length}</span>,
            })}
          </span>
        }
      />
      <Progress upTo={index} />

      <div className="relative aspect-[4/4.4] overflow-hidden rounded-[22px] bg-[radial-gradient(ellipse_at_50%_80%,#3a2a1e_0%,#1d1c20_55%,#141417_100%)]">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown.url} alt="" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <ShineOutline area={current} className="absolute inset-x-6 top-1/2 -translate-y-1/2" />
        <span className="fx-glass absolute top-3 left-3 rounded-full px-2.5 py-1 text-t5 font-medium text-white">
          {t(SHINE_AREA_LABELS[current])}
        </span>
        <span className="absolute inset-x-0 bottom-4 text-center text-t4 font-medium text-white [text-shadow:0_1px_4px_rgb(0_0_0/0.6)]">
          {t(guide.fit)}
        </span>
      </div>

      <p className="text-t3 leading-snug text-text-secondary">{t(guide.hint)}</p>

      <ol className="grid grid-cols-4 gap-2" aria-label={t('Photos')}>
        {SHINE_AREAS.map((a, i) => {
          const photo = photos[a]
          const isCurrent = a === current
          return (
            <li key={a} className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                disabled={!photo && !isCurrent}
                onClick={() => {
                  if (retaking) setRetaking(a)
                  else setStep(i)
                }}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${t(SHINE_AREA_SHORT[a])}${photo ? `, ${t('taken')}` : ''}`}
                className={cn(
                  'grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[10px] border',
                  isCurrent ? 'border-dashed border-[#ff2d4a] bg-[#ff2d4a]/10' : photo ? 'border-line' : 'border-dashed border-line'
                )}
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="" className="size-full object-cover" />
                ) : (
                  <IconCamera size={16} stroke={1.6} aria-hidden className={isCurrent ? 'text-white' : 'text-text-muted'} />
                )}
              </button>
              <span className="text-center text-t5 leading-tight text-text-secondary">{t(SHINE_AREA_SHORT[a])}</span>
            </li>
          )
        })}
      </ol>

      {pickError && (
        <p role="alert" className="text-center text-t4 text-text-primary">
          {pickError}
        </p>
      )}

      <div className="mt-auto flex flex-col items-center gap-1 pt-2">
        <MainAction
          onClick={() => cameraInput.current?.click()}
          disabled={preparing}
          className="min-h-12"
        >
          {!preparing && <IconCamera size={17} stroke={1.6} aria-hidden />}
          {preparing ? t('Getting the photo ready…') : t('Take photo')}
        </MainAction>
        <button
          type="button"
          disabled={preparing}
          onClick={() => galleryInput.current?.click()}
          className="min-h-11 px-4 text-t3 text-text-secondary"
        >
          {t('Choose from gallery')}
        </button>
      </div>
    </CustomerShell>
  )
}
