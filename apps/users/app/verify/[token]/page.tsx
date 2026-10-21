import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { IconCircleCheckFilled, IconLinkOff } from '@tabler/icons-react'
import { certificateDateLabel } from '@repo/core/service-history-certificate'
import { CERTIFICATE_PRINT_CSS, CertificateDocument } from '@/components/certificate/certificate-document'
import { lookupCertificate, sharedPhotoSrc } from '@/lib/certificates'

/**
 * A shared Detlio Service History certificate (API 0053): /verify/<token>,
 * opened by whoever scanned the QR code or was sent the link, signed in or
 * not. Rendered on the server, on every request (never cached: the owner can
 * stop sharing at any moment), so it is fast and needs no script.
 *
 * The token opens the car's record, so the page never hands its address on:
 * no Referer to anything it links to or loads, no Meta Pixel
 * (components/meta-pixel.tsx), the token replaced in usage events
 * (cleanPath), and kept out of search engines. The title names no car.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Check a Detlio Service History',
  referrer: 'no-referrer',
  robots: { index: false, follow: false, nocache: true },
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[840px] flex-col bg-brand-black px-4 py-6 pb-10 print:max-w-none print:bg-white print:p-0">
      <style>{CERTIFICATE_PRINT_CSS}</style>
      {children}
    </main>
  )
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <IconLinkOff size={32} stroke={1.5} aria-hidden="true" className="text-text-secondary" />
        <h1 className="text-[17px] font-semibold text-text-primary">{title}</h1>
        <div className="max-w-[340px] text-[13px] text-text-secondary">{children}</div>
        <Link
          href="/"
          className="mt-2 flex min-h-11 items-center justify-center rounded-[10px] border border-border px-5 text-sm font-semibold text-text-primary"
        >
          Go to Detlio
        </Link>
      </div>
    </Shell>
  )
}

export default async function VerifyCertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const forwarded = (await headers()).get('x-forwarded-for')
  const visitor = forwarded?.split(',')[0]?.trim() || 'unknown'
  const result = await lookupCertificate(token, visitor)

  if (result.kind === 'not_shared') {
    return (
      <Message title="This certificate is no longer shared">
        <p>
          The car&apos;s owner may have stopped sharing it, or the link has run out or was copied wrongly. Ask the
          owner for a new link.
        </p>
      </Message>
    )
  }
  if (result.kind === 'rate_limited') {
    return (
      <Message title="Too many checks just now">
        <p>Please wait a minute and open the link again.</p>
      </Message>
    )
  }
  if (result.kind === 'unavailable') {
    return (
      <Message title="Couldn’t check this certificate">
        <p>Detlio isn&apos;t answering right now. Please try again in a few minutes.</p>
      </Message>
    )
  }

  const { certificate } = result
  return (
    <Shell>
      {/* What the visitor came to find out, above the paper. */}
      <div
        role="status"
        className="flex items-start gap-3 rounded-[12px] border border-success/40 bg-success-muted px-4 py-3 print:hidden"
      >
        <IconCircleCheckFilled size={22} aria-hidden="true" className="mt-px shrink-0 text-success" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-text-primary">Genuine Detlio record</p>
          <p className="text-[12px] text-text-secondary">
            Certificate <span className="font-numeric">{certificate.certificateNumber}</span>, read from Detlio on{' '}
            <span className="font-numeric">{certificateDateLabel(certificate.asOf)}</span>. It shows the car&apos;s
            record as it stands today, without the owner&apos;s details.
          </p>
        </div>
      </div>

      <CertificateDocument
        certificate={certificate}
        showPhotos={certificate.includesPhotos}
        photoSrc={sharedPhotoSrc}
        issuedLabel="Checked"
        verification={
          <p className="max-w-[220px] text-[11px] leading-relaxed text-neutral-600 sm:text-right">
            Shared by the car&apos;s owner through Detlio. Owner&apos;s name, phone and address are never shown.
          </p>
        }
      />
    </Shell>
  )
}
