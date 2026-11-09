'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconEye,
  IconFileText,
  IconShieldCheckFilled,
  IconUpload,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { fill, useT } from '@repo/core/i18n'
import { AppShell } from '@repo/ui/sc/app-shell'
import { StatusChip } from '@repo/ui/sc/status-chip'
import type { StatusTone } from '@repo/core/status-tone'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput } from '@repo/ui/sc/input'
import { Notice } from '@repo/ui/sc/notice'
import { Reveal } from '@repo/ui/sc/reveal'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { TopBar } from '@repo/ui/sc/top-bar'
import {
  getGarageDocumentLink,
  getGarageDocuments,
  getGarageDocumentsConfig,
  openDocumentLink,
  removeGarageDocument,
  uploadGarageDocument,
  type GarageDocument,
  type GarageDocuments,
} from '@repo/core/api/documents'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { onVendorSwitch, useAuthStore } from '@repo/core/stores/auth-store'
import {
  AADHAAR_MASK_NOTE,
  DOCUMENT_ACCEPT,
  documentHint,
  DOCUMENT_STATUS_LABELS,
  fileLine,
  garageCanRemove,
  pickedFilesProblem,
} from '@repo/core/vendor-documents'

/** One colour per meaning (UX audit, garage finding 7): amber only for the one to fix. */
const STATUS_TONE: Record<GarageDocument['status'] | 'missing', StatusTone> = {
  missing: 'closed',
  pending: 'progress',
  approved: 'done',
  rejected: 'attention',
}

/**
 * A label inside a sentence: "Upload bank proof", but "Upload GST
 * certificate" and "Replace owner ID", where lower-casing it all wrote
 * "gst" and "id". Only a first word that isn't an acronym loses its capital.
 */
function inSentence(label: string): string {
  const [first = '', ...rest] = label.split(' ')
  const acronym = first.length > 1 && first === first.toUpperCase()
  return [acronym ? first : first.toLowerCase(), ...rest].join(' ')
}

/** "31 Mar 2027" from YYYY-MM-DD, read as a calendar day. */
function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Settings → Documents: what the garage uploads for Detlio to check, and
 * where each one stands. When every required one is approved, the documents
 * count as checked: one of the steps to Silver (0063).
 *
 * The owner seat only (the API refuses an operator), and only while the
 * server has its private documents bucket; otherwise there is nothing here.
 */
export default function GarageDocumentsPage() {
  const t = useT()
  const router = useRouter()
  const isVendorAdmin = useIsVendorAdmin()
  const activeVendorId = useAuthStore((s) => s.activeVendorId)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [data, setData] = useState<GarageDocuments | null>(null)
  const [failed, setFailed] = useState(false)

  // Operators get 403 here, and their nav has no Settings, so this is only
  // reachable by typing the URL.
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home')
  }, [isVendorAdmin, router])

  const fetchAll = useCallback(async () => {
    const config = await getGarageDocumentsConfig()
    return {
      enabled: config.enabled,
      data: config.enabled ? await getGarageDocuments() : null,
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const next = await fetchAll()
      setEnabled(next.enabled)
      setData(next.data)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [fetchAll])

  // Again on a company switch: the documents belong to the active garage.
  useEffect(() => {
    if (!isVendorAdmin) return
    let cancelled = false
    fetchAll()
      .then((next) => {
        if (cancelled) return
        setEnabled(next.enabled)
        setData(next.data)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [isVendorAdmin, activeVendorId, fetchAll])
  useEffect(() => onVendorSwitch(() => void load()), [load])

  const replaceDocument = (next: GarageDocument) =>
    setData(
      (current) =>
        current && {
          ...current,
          documents: current.documents.map((doc) =>
            doc.type === next.type ? next : doc
          ),
        }
    )

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar title={t('Documents')} showBack backHref="/settings" />

      {failed ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-[13px] text-error">
            {t('Couldn’t load your documents.')}
          </p>
          <ScButton
            variant="outline"
            size="md"
            fullWidth={false}
            onClick={() => void load()}
            className="px-4"
          >
            {t('Try again')}
          </ScButton>
        </div>
      ) : enabled === false ? (
        <Notice tone="neutral" title={t('Documents aren’t open yet')}>
          {t('Detlio will tell you when you can upload them here.')}
        </Notice>
      ) : !data ? (
        <SkeletonList count={4} itemClassName="h-32" />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <SectionHeader
              title={t('Your documents')}
              subtitle={t(
                'Detlio checks these. When the required ones are approved, your documents count as checked, one of the steps to Silver. Only you and the Detlio team can open them.'
              )}
            />
            {data.summary.verified ? (
              <Notice tone="neutral" title={t('Documents checked')}>
                {t('That step to Silver is done.')}
              </Notice>
            ) : (
              <p className="text-[13px] font-medium text-text-primary">
                {fill(t('{done} of {count} required approved'), {
                  done: (
                    <span className="font-numeric">
                      {data.summary.approvedRequired}
                    </span>
                  ),
                  count: <span className="font-numeric">{data.summary.required}</span>,
                })}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2.5">
            {data.documents.map((doc, i) => (
              <Reveal key={doc.type} index={i}>
                <DocumentCard
                  doc={doc}
                  onUploaded={(next) => {
                    replaceDocument(next)
                    void load()
                  }}
                  onRemoved={(next) => setData(next)}
                />
              </Reveal>
            ))}
          </section>
        </>
      )}
    </AppShell>
  )
}

function DocumentCard({
  doc,
  onUploaded,
  onRemoved,
}: {
  doc: GarageDocument
  onUploaded: (doc: GarageDocument) => void
  /** Removed (0065): the documents as they are now. */
  onRemoved: (documents: GarageDocuments) => void
}) {
  const t = useT()
  // The document's name, as the server sends it, in the language in use.
  const label = t(doc.label)
  const inputRef = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<File[]>([])
  const [expiresOn, setExpiresOn] = useState(doc.expiresOn ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleId = useId()
  const problem = picked.length > 0 ? pickedFilesProblem(picked) : null

  const pick = (files: FileList | null) => {
    setError('')
    setPicked(files ? Array.from(files) : [])
    if (inputRef.current) inputRef.current.value = ''
  }

  const send = async () => {
    if (problem || picked.length === 0) return
    setBusy(true)
    setError('')
    try {
      const next = await uploadGarageDocument({
        type: doc.type,
        files: picked,
        expiresOn: expiresOn || null,
      })
      setPicked([])
      toast.success(t('{document} sent for review', { document: label }))
      onUploaded(next)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('Upload failed. Please try again.')
      )
    } finally {
      setBusy(false)
    }
  }

  // Remove (0065): an optional document, or your own upload of a required
  // one Detlio has not approved yet. Asked once more first.
  const [confirmRemove, setConfirmRemove] = useState(false)
  const remove = async () => {
    if (!doc.id) return
    setBusy(true)
    setError('')
    try {
      const next = await removeGarageDocument(doc.id)
      setConfirmRemove(false)
      toast.success(t('{document} removed', { document: label }))
      onRemoved(next)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Couldn’t remove it. Please try again.')
      )
    } finally {
      setBusy(false)
    }
  }

  const view = async (fileId: string) => {
    if (!doc.id) return
    try {
      await openDocumentLink(() => getGarageDocumentLink(doc.id!, fileId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Couldn’t open the file'))
    }
  }

  return (
    <ScCard
      className="flex flex-col gap-3"
      role="group"
      aria-labelledby={titleId}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            id={titleId}
            className="text-[13px] font-semibold text-text-primary"
          >
            {label}
          </p>
          <p className="text-[11px] text-text-muted">
            {doc.required ? t('Required') : t('Optional')}
          </p>
        </div>
        <StatusChip
          tone={STATUS_TONE[doc.status]}
          dot={doc.status !== 'approved'}
        >
          {doc.status === 'approved' && (
            <IconShieldCheckFilled size={12} aria-hidden="true" />
          )}
          {t(DOCUMENT_STATUS_LABELS[doc.status])}
        </StatusChip>
      </div>

      <p className="text-[12px] leading-relaxed text-text-secondary">
        {documentHint(doc.type, doc.required)}
      </p>
      {doc.type === 'owner_id' && (
        <p className="text-[12px] font-medium text-text-primary">
          {t(AADHAAR_MASK_NOTE)}.
        </p>
      )}

      {doc.status === 'rejected' && doc.rejectionReason && (
        <Notice title={t('What to fix')}>{doc.rejectionReason}</Notice>
      )}

      {doc.files.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-border pt-3">
          {doc.files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-secondary">
                <IconFileText
                  size={14}
                  aria-hidden="true"
                  className="shrink-0"
                />
                <span className="truncate">
                  {file.side === 'front'
                    ? doc.files.length > 1
                      ? t('Front')
                      : t('File')
                    : t('Back')}{' '}
                  · <span className="font-numeric">{fileLine(file)}</span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => void view(file.id)}
                aria-label={
                  doc.files.length > 1
                    ? file.side === 'front'
                      ? t('View {document}, front', { document: label })
                      : t('View {document}, back', { document: label })
                    : t('View {photo}', { photo: label })
                }
                className="flex min-h-11 shrink-0 items-center gap-1 text-[12px] font-medium text-text-primary underline-offset-2 hover:underline"
              >
                <IconEye size={14} aria-hidden="true" /> {t('View')}
              </button>
            </li>
          ))}
          {doc.expiresOn && (
            <li className="text-[12px] text-text-secondary">
              {fill(t('Expires {date}'), {
                date: <span className="font-numeric">{dayLabel(doc.expiresOn)}</span>,
              })}
            </li>
          )}
          {doc.uploadedByDetlio && (
            <li className="text-[11px] text-text-muted">{t('Uploaded by Detlio')}</li>
          )}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        multiple
        hidden
        aria-label={t('Choose files for {document}', { document: label })}
        onChange={(e) => pick(e.target.files)}
      />

      {confirmRemove ? (
        <div
          role="group"
          aria-label={t('Remove {document}?', { document: label })}
          className="flex flex-col gap-2 border-t border-border pt-3"
        >
          <p className="text-[13px] text-text-primary">
            {t('Remove {document}? It goes back to Not uploaded and its files are deleted.', {
              document: inSentence(label),
            })}
          </p>
          {error && (
            <p role="alert" className="text-[12px] text-error">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <ScButton
              variant="outline"
              size="md"
              onClick={() => void remove()}
              disabled={busy}
            >
              {busy
                ? t('Removing…')
                : t('Remove {photo}', { photo: inSentence(label) })}
            </ScButton>
            <ScButton
              variant="outline"
              size="md"
              fullWidth={false}
              disabled={busy}
              onClick={() => setConfirmRemove(false)}
              className="px-4"
            >
              {t('Keep it')}
            </ScButton>
          </div>
        </div>
      ) : picked.length === 0 ? (
        <div className="flex flex-col gap-1">
          <ScButton
            variant="outline"
            size="md"
            onClick={() => inputRef.current?.click()}
            className="flex items-center justify-center gap-1.5"
          >
            <IconUpload size={16} aria-hidden="true" />
            {doc.status === 'missing'
              ? t('Upload {document}', { document: inSentence(label) })
              : t('Replace {document}', { document: inSentence(label) })}
          </ScButton>
          <p className="text-[13px] text-text-secondary">
            {t('A photo or PDF, up to 10 MB.')}
            {/* Only an ID card has two sides; a shop photo doesn't. */}
            {doc.type === 'owner_id' &&
              ` ${t('Two files if it has a front and a back.')}`}
            {doc.status === 'approved' &&
              ` ${t('Replacing it sends it back for review.')}`}
          </p>
          {garageCanRemove(doc) && (
            <button
              type="button"
              onClick={() => {
                setError('')
                setConfirmRemove(true)
              }}
              aria-label={t('Remove {photo}', { photo: label })}
              className="min-h-11 self-start text-[12px] font-medium text-text-secondary underline-offset-2 hover:underline"
            >
              {t('Remove')}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <ul className="flex flex-col gap-1 text-[12px] text-text-secondary">
            {picked.map((file, index) => (
              <li key={`${file.name}-${index}`} className="truncate">
                {picked.length > 1
                  ? index === 0
                    ? `${t('Front')}: `
                    : `${t('Back')}: `
                  : ''}
                {file.name}
              </li>
            ))}
          </ul>
          {doc.takesExpiry && (
            <ScInput
              label={t('Expiry date (optional)')}
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              className="font-numeric"
            />
          )}
          {problem && <p className="text-[12px] text-error">{problem}</p>}
          {error && (
            <p role="alert" className="text-[12px] text-error">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <ScButton
              variant="main"
              size="lg"
              onClick={() => void send()}
              disabled={busy || Boolean(problem)}
            >
              {busy ? t('Sending…') : t('Send for review')}
            </ScButton>
            <ScButton
              variant="outline"
              size="md"
              fullWidth={false}
              disabled={busy}
              onClick={() => setPicked([])}
              className="px-4"
            >
              {t('Cancel')}
            </ScButton>
          </div>
        </div>
      )}
    </ScCard>
  )
}
