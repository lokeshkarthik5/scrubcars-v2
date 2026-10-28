'use client'

import { useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { IconExternalLink, IconFileText, IconUpload } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScTextarea } from '@repo/ui/sc/input'
import { LoadError } from '@repo/ui/sc/load-error'
import { Notice } from '@repo/ui/sc/notice'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Skeleton } from '@repo/ui/sc/skeleton'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminAgreements, usePublishAgreement } from '@repo/core/api/hooks/use-tiers'
import {
  AGREEMENT_CONTENT_TYPE,
  AGREEMENT_GRACE_DAYS,
  AGREEMENT_NOTE_MAX,
  agreementTitle,
  pickedAgreementProblem,
} from '@repo/core/agreements'
import { fileLine } from '@repo/core/vendor-documents'
import { istDateTimeLabel } from '@repo/core/ist-input'
import { SignedAs } from '@/components/signed-as'

/**
 * Settings → Garage agreement (0063): upload each version of the Detlio
 * garage agreement as a PDF. The newest is the one every garage's owner is
 * asked to accept in the garage app (Bronze needs it); a garage that
 * accepted an older version keeps Bronze for 30 days. Versions are never
 * deleted: acceptances point at them.
 */
export default function GarageAgreementSettingsPage() {
  const agreements = useAdminAgreements()
  const publish = usePublishAgreement()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState('')

  const versions = agreements.data?.versions ?? []
  const nextVersion = (versions[0]?.version ?? 0) + 1

  const pick = (picked: File | null) => {
    setProblem('')
    if (!picked) return setFile(null)
    const wrong = pickedAgreementProblem({ type: picked.type, size: picked.size })
    if (wrong) {
      setFile(null)
      setProblem(wrong)
      return
    }
    setFile(picked)
  }

  const submit = () => {
    if (!file) return
    setProblem('')
    publish.mutate(
      { file, note: note.trim() || null },
      {
        onSuccess: (version) => {
          toast.success(`${version.title} published`)
          setFile(null)
          setNote('')
        },
        onError: (err) => setProblem(errorMessage(err, 'Couldn’t publish the agreement')),
      }
    )
  }

  return (
    <>
      <PageHeader
        title="Garage agreement"
        subtitle="Each version as a PDF. Garages accept the newest in the garage app."
        backHref="/settings"
      />

      {agreements.isError ? (
        <LoadError what="the agreement" onRetry={() => void agreements.refetch()} />
      ) : !agreements.data ? (
        <Skeleton className="h-40 rounded-[12px]" />
      ) : (
        <>
          {!agreements.data.storageReady && (
            <Notice tone="warning" title="File storage is not set up">
              The API has no R2 bucket, so no PDF can be uploaded here.
            </Notice>
          )}

          <ScCard className="flex flex-col gap-3" role="region" aria-label="Publish a new version">
            <div>
              <h2 className="text-[15px] font-medium text-text-primary">Publish {agreementTitle(nextVersion)}</h2>
              <p className="text-[13px] text-text-secondary">
                {versions.length === 0
                  ? 'The first version starts Bronze: garages earn it by accepting. Until then the nightly tier check waits.'
                  : `Every garage is asked to accept it. Those that accepted v${versions[0]!.version} keep Bronze for ${AGREEMENT_GRACE_DAYS} days meanwhile.`}
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={AGREEMENT_CONTENT_TYPE}
              hidden
              aria-label="Choose the agreement PDF"
              onChange={(e) => {
                pick(e.target.files?.[0] ?? null)
                if (inputRef.current) inputRef.current.value = ''
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <ScButton
                variant="secondary"
                fullWidth={false}
                disabled={publish.isPending || !agreements.data.storageReady}
                onClick={() => inputRef.current?.click()}
                className="min-h-11 px-4 text-[13px]"
              >
                <IconUpload size={15} aria-hidden="true" className="mr-1.5" />
                {file ? 'Choose another PDF' : 'Choose PDF'}
              </ScButton>
              {file && (
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-text-secondary">
                  <IconFileText size={16} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-text-muted">
                    · {fileLine({ contentType: file.type, sizeBytes: file.size })}
                  </span>
                </span>
              )}
            </div>
            <ScTextarea
              label="What changed (optional; garages see it)"
              rows={2}
              maxLength={AGREEMENT_NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Pickup & drop clause added"
            />
            <SignedAs />
            <ScButton
              fullWidth={false}
              disabled={!file || publish.isPending}
              onClick={submit}
              className="min-h-11 self-start px-5 text-[14px]"
            >
              {publish.isPending ? 'Publishing…' : `Publish v${nextVersion}`}
            </ScButton>
            {problem && (
              <p role="alert" className="text-[12px] text-error">
                {problem}
              </p>
            )}
          </ScCard>

          <section aria-labelledby="agreement-versions" className="flex flex-col gap-2">
            <h2 id="agreement-versions" className="text-[13px] font-medium text-text-secondary">
              Versions
            </h2>
            {versions.length === 0 ? (
              <p className="text-[13px] text-text-muted">None published yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {versions.map((v, i) => (
                  <li key={v.id}>
                    <ScCard className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-text-primary">
                          {v.title}
                          {i === 0 && <span className="ml-2 text-[12px] font-normal text-success">Current</span>}
                        </p>
                        <p className="text-[12px] text-text-secondary">
                          {istDateTimeLabel(v.publishedAt)} by {v.publishedBy} ·{' '}
                          <span className="font-numeric">{v.acceptances}</span>{' '}
                          {v.acceptances === 1 ? 'garage accepted' : 'garages accepted'}
                        </p>
                        {v.note && <p className="text-[12px] text-text-muted">{v.note}</p>}
                      </div>
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center gap-1 text-[13px] font-medium text-text-primary underline underline-offset-2"
                      >
                        Open PDF
                        <IconExternalLink size={14} aria-hidden="true" />
                      </a>
                    </ScCard>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}
