'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCar, IconCopy, IconLink, IconPrinter, IconShare } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { Chip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { Notice } from '@repo/ui/sc/notice'
import { ScSwitch } from '@repo/ui/sc/switch'
import { TopBar } from '@repo/ui/sc/top-bar'
import { ApiError } from '@repo/core/api/client'
import type { CertificateShare } from '@repo/core/api/certificates'
import { useCertificateShare, useOwnCertificate } from '@repo/core/api/hooks/use-certificate'
import {
  certificateDateLabel,
  certificateFileTitle,
  PHOTO_PLATE_WARNING,
  SHARE_EXPIRY_OPTIONS,
  shortVerifyLink,
  verifyPath,
  viewsLine,
} from '@repo/core/service-history-certificate'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { CERTIFICATE_PRINT_CSS, CertificateDocument } from '@/components/certificate/certificate-document'
import { QrCode } from '@/components/certificate/qr-code'

/**
 * How long a print screen has to show up before we say it won't (as on the
 * receipt). A browser that opens one fires beforeprint straight away.
 */
const PRINT_OPEN_WAIT_MS = 1000

type Expiry = (typeof SHARE_EXPIRY_OPTIONS)[number]['days']

/** "25 Oct 2026" from an instant, in IST. */
function istDate(iso: string): string {
  return certificateDateLabel(new Date(new Date(iso).getTime() + 330 * 60 * 1000).toISOString().slice(0, 10))
}

/**
 * Profile → a car → Service history certificate (API 0053): every completed
 * job on the car through Detlio as a printable A4 record with the Detlio
 * seal, and a link the customer can share when selling the car. The link
 * opens /verify/<token>, which anyone can check signed out; it shows no
 * personal data, and photos only if the customer includes them.
 *
 * Printing is how it becomes a PDF, as with the receipt: every browser
 * offers "Save as PDF" in its print screen.
 */
export default function CarCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const query = useOwnCertificate(id, { enabled: !!user })
  const action = useCertificateShare(id)

  // Before a link exists, the choices it will be made with.
  const [localPhotos, setLocalPhotos] = useState(false)
  const [expiry, setExpiry] = useState<Expiry>(null)
  // The number-plate warning, shown before photos go on.
  const [askPhotos, setAskPhotos] = useState(false)
  const [confirm, setConfirm] = useState<'stop' | 'renew' | null>(null)
  const [printBlocked, setPrintBlocked] = useState(false)

  const data = query.data
  const share = data?.share ?? null
  const includePhotos = share ? share.includePhotos : localPhotos

  // The saved PDF is named after the page title.
  const number = data?.certificate.certificateNumber ?? null
  useEffect(() => {
    if (!number) return
    const previous = document.title
    document.title = certificateFileTitle(number)
    return () => {
      document.title = previous
    }
  }, [number])

  const print = () => {
    setPrintBlocked(false)
    let opened = false
    const onPrint = () => {
      opened = true
    }
    const printMedia = window.matchMedia('print')
    window.addEventListener('beforeprint', onPrint)
    printMedia.addEventListener('change', onPrint)
    window.print()
    window.setTimeout(() => {
      window.removeEventListener('beforeprint', onPrint)
      printMedia.removeEventListener('change', onPrint)
      if (!opened) setPrintBlocked(true)
    }, PRINT_OPEN_WAIT_MS)
  }

  const run = (
    next: Parameters<typeof action.mutate>[0],
    done: string,
    after?: () => void
  ) =>
    action.mutate(next, {
      onSuccess: () => {
        toast.success(done)
        after?.()
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Something went wrong'),
    })

  const setPhotos = (on: boolean) => {
    if (on && !askPhotos) {
      setAskPhotos(true)
      return
    }
    setAskPhotos(false)
    if (share) run({ kind: 'photos', includePhotos: on }, on ? 'Photos added to your link' : 'Photos removed from your link')
    else setLocalPhotos(on)
  }

  const makeLink = () =>
    run({ kind: 'share', includePhotos, expiresInDays: expiry }, share ? 'New link made' : 'Link ready to share', () =>
      setConfirm(null)
    )

  if (ready && !user) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black px-4 py-4">
        <TopBar showBack backHref={`/profile/cars/${id}`} title="Service history" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">Sign in to see your car&apos;s certificate</p>
          <ScButton
            className="mt-2 w-auto px-8"
            onClick={() => router.push(`/login?next=${encodeURIComponent(`/profile/cars/${id}/certificate`)}`)}
          >
            Sign in
          </ScButton>
        </div>
      </main>
    )
  }

  const notFound = query.error instanceof ApiError && query.error.status === 404

  if (!ready || query.isPending || notFound || !data) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black px-4 py-4">
        <TopBar showBack backHref={`/profile/cars/${id}`} title="Service history" />
        {!ready || query.isPending ? (
          <div className="flex flex-col gap-3 pt-2" aria-busy="true">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : notFound ? (
          <EmptyState
            icon={<IconCar size={32} stroke={1.5} />}
            title="This car isn't in your garage"
            subtitle="It may have been removed. Your cars are in Profile."
            actionLabel="Go to Profile"
            onAction={() => router.push('/profile#vehicles')}
          />
        ) : (
          <ErrorState
            message="Couldn't load this certificate. Check your connection."
            onRetry={() => void query.refetch()}
          />
        )}
      </main>
    )
  }

  const live = share?.state === 'active' && share.token ? share : null
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const url = live ? `${origin}${verifyPath(live.token!)}` : null

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[840px] flex-col bg-brand-black px-4 pb-10 print:max-w-none print:bg-white print:p-0">
      <style>{CERTIFICATE_PRINT_CSS}</style>

      {/* Everything used to get the certificate out of the app. None of it
          belongs on the paper. */}
      <div className="flex flex-col gap-3 print:hidden">
        <TopBar showBack backHref={`/profile/cars/${id}`} title="Service history certificate" center />

        <ScButton onClick={print} className="flex min-h-11 items-center justify-center gap-2">
          <IconPrinter size={18} aria-hidden="true" />
          Print / Save as PDF
        </ScButton>
        {printBlocked && (
          <p
            role="alert"
            className="rounded-[10px] border border-warning bg-warning-muted px-3 py-2 text-[13px] text-warning"
          >
            Your browser can&apos;t print from here. Open this page in Chrome or Safari (⋮ › Open in browser) to save
            it as a PDF. You may need to sign in there.
          </p>
        )}
        <p className="text-[12px] text-text-muted">
          On Android, choose <strong>Save as PDF</strong> as the printer; on iPhone, tap <strong>Share</strong> on the
          print screen, then <strong>Save to Files</strong>.
        </p>

        <ScCard role="region" aria-label="Share link" className="flex flex-col gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-text-primary">
              <IconLink size={16} aria-hidden="true" />
              Share link
            </h2>
            <p className="mt-0.5 text-[12px] text-text-secondary">
              Anyone with the link, or the QR code on the printout, can check this record is genuine. They see the
              car, garages, dates and services. Never your name, phone or address, or the full number plate.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-text-primary">Include before/after photos</p>
              <p className="text-[11px] text-text-secondary">Off unless you turn it on.</p>
            </div>
            <ScSwitch
              checked={includePhotos}
              disabled={action.isPending}
              onChange={setPhotos}
              label="Include before/after photos"
            />
          </div>
          {askPhotos && (
            <Notice title="Photos may show your number plate" tone="warning" role="alert">
              <span className="block">{PHOTO_PLATE_WARNING}</span>
              <span className="mt-2 flex gap-2">
                <ScButton
                  variant="secondary"
                  fullWidth={false}
                  className="min-h-11 px-4"
                  onClick={() => setPhotos(true)}
                >
                  Include photos
                </ScButton>
                <ScButton variant="secondary" fullWidth={false} className="min-h-11 px-4" onClick={() => setAskPhotos(false)}>
                  Not now
                </ScButton>
              </span>
            </Notice>
          )}

          {live ? (
            <LiveLink
              share={live}
              url={url!}
              shortLink={shortVerifyLink(origin, live.token!)}
              busy={action.isPending}
              confirm={confirm}
              setConfirm={setConfirm}
              onStop={() => run({ kind: 'stop' }, 'Stopped sharing', () => setConfirm(null))}
              onRenew={makeLink}
            />
          ) : (
            <>
              {share?.state === 'expired' && (
                <p className="text-[12px] text-warning">
                  Your link ran out{share.expiresAt ? ` on ${istDate(share.expiresAt)}` : ''}. Make a new one to share
                  again.
                </p>
              )}
              {share?.state === 'active' && !share.token && (
                <p className="text-[12px] text-text-secondary">
                  Your link still works for whoever has it, but it can&apos;t be shown here. Make a new link to print a
                  QR code; the old one will stop working.
                </p>
              )}
              <div>
                <p className="text-[12px] font-medium text-text-primary">Link works for</p>
                <div role="group" aria-label="Link works for" className="-mx-1 mt-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {SHARE_EXPIRY_OPTIONS.map((option) => (
                    <Chip
                      key={option.label}
                      label={option.days === null ? 'Until you stop it' : option.label}
                      selected={expiry === option.days}
                      onClick={() => setExpiry(option.days)}
                    />
                  ))}
                </div>
              </div>
              <ScButton
                variant="secondary"
                disabled={action.isPending}
                onClick={makeLink}
                className="flex min-h-11 items-center justify-center gap-2"
              >
                <IconLink size={16} aria-hidden="true" />
                {share ? 'Make a new link' : 'Share link'}
              </ScButton>
            </>
          )}
        </ScCard>
      </div>

      <CertificateDocument
        certificate={data.certificate}
        showPhotos={includePhotos}
        verification={
          url && live ? (
            <div className="flex items-center gap-3 sm:flex-row-reverse sm:text-right">
              <QrCode value={url} size={104} label="QR code to check this certificate on Detlio" />
              <div className="min-w-0 max-w-[180px]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-600">Check it is genuine</p>
                <p className="mt-0.5 break-all font-numeric text-[11px] text-brand-rich">
                  {shortVerifyLink(origin, live.token!)}
                </p>
              </div>
            </div>
          ) : (
            <p className="max-w-[220px] text-[11px] leading-relaxed text-neutral-600 sm:text-right">
              Not shared. Share it from the Detlio app to add a QR code anyone can scan to check this record.
            </p>
          )
        }
      />
    </main>
  )
}

/** The live link: copy, share, how often it was opened, and stopping or replacing it. */
function LiveLink({
  share,
  url,
  shortLink,
  busy,
  confirm,
  setConfirm,
  onStop,
  onRenew,
}: {
  share: CertificateShare
  url: string
  shortLink: string
  busy: boolean
  confirm: 'stop' | 'renew' | null
  setConfirm: (value: 'stop' | 'renew' | null) => void
  onStop: () => void
  onRenew: () => void
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.info("Couldn't copy the link. Press and hold it to copy it instead.")
    }
  }

  const shareIt = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Detlio Service History', url })
        return
      } catch (error) {
        // Closing the share sheet is a choice, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copy()
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="break-all rounded-[10px] border border-border px-3 py-2 font-numeric text-[12px] text-text-primary">
        {shortLink}
      </p>
      <div className="flex gap-2">
        <ScButton variant="secondary" onClick={shareIt} className="flex min-h-11 items-center justify-center gap-2">
          <IconShare size={16} aria-hidden="true" />
          Share
        </ScButton>
        <ScButton variant="secondary" onClick={copy} className="flex min-h-11 items-center justify-center gap-2">
          <IconCopy size={16} aria-hidden="true" />
          Copy link
        </ScButton>
      </div>
      <p className="text-[11px] text-text-secondary">
        {viewsLine(share.viewCount, share.lastViewedAt)} ·{' '}
        {share.expiresAt ? `works until ${istDate(share.expiresAt)}` : 'works until you stop it'}
      </p>

      {confirm ? (
        <Notice
          title={confirm === 'stop' ? 'Stop sharing?' : 'Make a new link?'}
          tone="warning"
          role="alert"
        >
          <span className="block">
            {confirm === 'stop'
              ? 'The link and the QR code on any printout stop working at once.'
              : 'The current link and the QR code on any printout stop working. Print the certificate again for the new one.'}
          </span>
          <span className="mt-2 flex gap-2">
            <ScButton
              variant="secondary"
              fullWidth={false}
              disabled={busy}
              className="min-h-11 px-4"
              onClick={confirm === 'stop' ? onStop : onRenew}
            >
              {confirm === 'stop' ? 'Stop sharing' : 'Make a new link'}
            </ScButton>
            <ScButton variant="secondary" fullWidth={false} className="min-h-11 px-4" onClick={() => setConfirm(null)}>
              Cancel
            </ScButton>
          </span>
        </Notice>
      ) : (
        <div className="flex flex-wrap gap-x-2">
          <button
            type="button"
            onClick={() => setConfirm('stop')}
            className="min-h-11 px-1 text-[12px] font-semibold text-text-primary underline underline-offset-2"
          >
            Stop sharing
          </button>
          <button
            type="button"
            onClick={() => setConfirm('renew')}
            className="min-h-11 px-1 text-[12px] font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
          >
            New link
          </button>
        </div>
      )}
    </div>
  )
}
