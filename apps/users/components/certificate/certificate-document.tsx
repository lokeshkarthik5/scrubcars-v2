import type { ReactNode } from 'react'
import type { CertificateJob, ServiceHistoryCertificate } from '@repo/core/api/certificates'
import {
  bodyTypeLabel,
  CERTIFICATE_SCOPE_NOTE,
  CERTIFICATE_TITLE,
  certificateDateLabel,
} from '@repo/core/service-history-certificate'
import { tierMedalName } from '@repo/core/tiers'
import { TierMedalIcon } from '@repo/ui/features/tier-medal'
import { CertificateSeal } from './certificate-seal'

/**
 * The A4 page both certificate screens print: the owner's
 * (/profile/cars/<id>/certificate) and the public check (/verify/<token>).
 * No hooks and nothing browser-only, so the public page renders it on the
 * server.
 *
 * White paper whatever the app's theme, like the receipt, so what is on
 * screen is what prints and what the saved PDF looks like. Black text on
 * paper (grey fades on a cheap printer); the seal keeps its brand red.
 */
export const CERTIFICATE_PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; }
  .certificate-doc, .certificate-doc *:not(.certificate-seal *) { color: #000 !important; border-color: #d4d4d4 !important; }
  .certificate-doc li { break-inside: avoid; }
}
`

/** The garage's tier medal as customers see it today ("Gold garage"), or nothing: one sign, as on the garage cards. */
function GarageMark({ garage }: { garage: CertificateJob['garage'] }) {
  if (!garage.tier) return null
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium">
      <TierMedalIcon tier={garage.tier} size={13} />
      {tierMedalName(garage.tier)}
    </span>
  )
}

function photosLine(photos: CertificateJob['photos']): string {
  if (photos.before && photos.after) return 'Before and after photos taken'
  if (photos.before) return 'Before photos taken'
  if (photos.after) return 'After photos taken'
  return 'No photos on record'
}

function Field({ label, value, numeric = false }: { label: string; value: ReactNode; numeric?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-600">{label}</dt>
      <dd className={`mt-0.5 text-[14px] font-medium ${numeric ? 'font-numeric' : ''}`}>{value}</dd>
    </div>
  )
}

export function CertificateDocument({
  certificate,
  showPhotos,
  photoSrc = (value) => value,
  verification,
  issuedLabel = 'Issued',
}: {
  certificate: ServiceHistoryCertificate
  /** Show each job's before/after pair (when it has one). */
  showPhotos: boolean
  /** Where a pair's value is loaded from: the public page prefixes the API. */
  photoSrc?: (value: string) => string
  /** The QR code and link block, or what to print without one. */
  verification: ReactNode
  /** "Issued" on the owner's copy; "Checked" on the public page. */
  issuedLabel?: string
}) {
  const { car, jobs, totals } = certificate
  const carName = `${car.make} ${car.model}`

  return (
    <article
      aria-label={`${CERTIFICATE_TITLE} certificate ${certificate.certificateNumber}`}
      className="certificate-doc mt-4 flex flex-col gap-5 rounded-2xl bg-white px-5 py-6 text-brand-rich sm:px-10 sm:py-10 print:mt-0 print:rounded-none print:p-0"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* The wordmark in type: the logo artwork is white, for the app's
              dark screens, and would vanish on paper. */}
          <p className="text-[26px] font-bold leading-none tracking-tight">
            Detlio
            <span className="text-brand-red [print-color-adjust:exact]" aria-hidden="true">
              .
            </span>
          </p>
          <h1 className="mt-3 text-[20px] font-semibold leading-tight sm:text-[24px]">Service History</h1>
          <p className="mt-1 text-[12px] text-neutral-600">
            Certificate <span className="font-numeric font-medium text-brand-rich">{certificate.certificateNumber}</span>
          </p>
          <p className="text-[12px] text-neutral-600">
            {issuedLabel} <span className="font-numeric">{certificateDateLabel(certificate.asOf)}</span>
          </p>
        </div>
        <span className="certificate-seal">
          <CertificateSeal size={92} />
        </span>
      </header>

      <section aria-label="The car" className="border-t border-neutral-200 pt-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Field label="Car" value={carName} />
          <Field label="Colour" value={car.color || '—'} />
          <Field label="Body type" value={bodyTypeLabel(car.bodyType)} />
          <Field
            label="Registration"
            numeric
            value={
              car.registration ? (
                <span aria-label={`Registration, partly hidden: ${car.registration}`}>{car.registration}</span>
              ) : (
                'Not shown'
              )
            }
          />
        </dl>
      </section>

      <section aria-label="Summary" className="grid grid-cols-3 gap-2 border-t border-neutral-200 pt-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-600">Jobs through Detlio</p>
          <p className="mt-0.5 font-numeric text-[20px] font-bold">{totals.jobs}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-600">First service</p>
          <p className="mt-0.5 font-numeric text-[14px] font-medium">
            {totals.firstServiceOn ? certificateDateLabel(totals.firstServiceOn) : '—'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-600">Latest service</p>
          <p className="mt-0.5 font-numeric text-[14px] font-medium">
            {totals.lastServiceOn ? certificateDateLabel(totals.lastServiceOn) : '—'}
          </p>
        </div>
      </section>

      <section aria-labelledby="certificate-jobs" className="border-t border-neutral-200 pt-4">
        <h2 id="certificate-jobs" className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
          Jobs, newest first
        </h2>
        {jobs.length === 0 ? (
          <p className="text-[13px] text-neutral-600">No completed jobs through Detlio yet.</p>
        ) : (
          <ol aria-label={`Jobs on this ${carName}, newest first`} className="flex flex-col">
            {jobs.map((job, index) => {
              const pair = showPhotos ? job.photoPair : null
              const date = certificateDateLabel(job.date)
              return (
                <li
                  key={`${job.date}-${index}`}
                  className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-dashed border-neutral-200 py-3 first:border-t-0 first:pt-0 sm:grid-cols-[104px_minmax(0,1fr)_auto]"
                >
                  <p className="font-numeric text-[13px] font-medium">{date}</p>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold">{job.services.join(', ') || 'Service'}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-neutral-700">
                      <span>{job.garage.name}</span>
                      <GarageMark garage={job.garage} />
                    </p>
                    <p className="text-[11px] text-neutral-600">{photosLine(job.photos)}</p>
                  </div>
                  {pair && (
                    <div className="col-start-2 flex gap-2 sm:col-start-3 sm:row-start-1">
                      {(['before', 'after'] as const).map((stage) => (
                        <figure key={stage} className="flex flex-col items-start gap-0.5">
                          {/* A plain img: these are short-lived API paths or
                              the owner's own photos, never worth caching
                              through the image optimiser. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photoSrc(pair[stage])}
                            alt={`${stage === 'before' ? 'Before' : 'After'}: ${job.services.join(', ')} at ${job.garage.name}, ${date}`}
                            width={88}
                            height={66}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="h-[66px] w-[88px] rounded-md border border-neutral-200 bg-neutral-100 object-cover"
                          />
                          <figcaption className="text-[10px] uppercase tracking-wide text-neutral-600">
                            {stage === 'before' ? 'Before' : 'After'}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <footer className="flex flex-col gap-4 border-t border-neutral-200 pt-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 text-[11px] leading-relaxed text-neutral-600 sm:max-w-[60%]">
          <p>{CERTIFICATE_SCOPE_NOTE}</p>
          <p className="mt-1">
            This is a record of work booked through Detlio, not an inspection report. It says nothing about the
            car&apos;s condition, mileage or ownership. Garage marks show each garage&apos;s standing on the date above.
          </p>
          <p className="mt-1 font-medium text-brand-rich">Detlio · detlio.com</p>
        </div>
        <div className="shrink-0">{verification}</div>
      </footer>
    </article>
  )
}
