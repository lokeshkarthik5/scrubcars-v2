'use client'

import { useId, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import {
  IconExternalLink,
  IconFileText,
  IconShieldCheckFilled,
  IconUpload,
} from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScField, ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import {
  getAdminDocumentLink,
  openDocumentLink,
  type AdminGarageDocument,
} from '@repo/core/api/documents'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminGarageDocuments,
  useReviewDocument,
  useUploadAdminDocument,
} from '@repo/core/api/hooks/use-admin-documents'
import { istDateTimeLabel } from '@repo/core/ist-input'
import {
  AADHAAR_MASK_NOTE,
  DOCUMENT_ACCEPT,
  DOCUMENT_HINTS,
  DOCUMENT_STATUS_LABELS,
  fileLine,
  pickedFilesProblem,
} from '@repo/core/vendor-documents'
import { rememberName, rememberedName } from '@/lib/actor-name'

const STATUS_VARIANT = {
  missing: 'muted',
  pending: 'pending',
  approved: 'success',
  rejected: 'danger',
} as const

/**
 * The garage's documents, on its edit page's Documents tab: open each file
 * (a five-minute link, made per press), approve or reject it with a reason
 * the garage reads, and upload on the garage's behalf (the signed agreement,
 * mostly). Saved on its own, like Payout details: never part of "Save
 * changes". While the garage is in the Bin the files still open, and
 * nothing can be changed.
 */
export function GarageDocumentsSection({
  vendorId,
  readOnly,
}: {
  vendorId: string
  readOnly: boolean
}) {
  const { data, isLoading, error } = useAdminGarageDocuments(vendorId)
  const [actorName, setActorName] = useState(() =>
    typeof window === 'undefined' ? '' : rememberedName()
  )
  const nameOk = actorName.trim().length >= 2
  const setName = (value: string) => {
    setActorName(value)
    rememberName(value)
  }

  if (isLoading) {
    return (
      <ScSection title="Documents">
        <SkeletonList count={4} itemClassName="h-24 rounded-[10px]" />
      </ScSection>
    )
  }
  if (error || !data) {
    return (
      <ScSection title="Documents">
        <p role="alert" className="text-[12px] text-error">
          {errorMessage(error, "Couldn't load the documents.")}
        </p>
      </ScSection>
    )
  }

  const { summary } = data
  return (
    <ScSection
      title="Documents"
      action={
        summary.verified ? (
          <ScBadge variant="success">
            <IconShieldCheckFilled
              size={12}
              aria-hidden="true"
              className="mr-1"
            />
            Documents verified
          </ScBadge>
        ) : undefined
      }
    >
      <p className="text-[13px] font-medium text-text-primary">
        <span className="font-numeric">{summary.approvedRequired}</span> of{' '}
        <span className="font-numeric">{summary.required}</span> required
        approved
        {summary.toReview > 0 && (
          <>
            {' · '}
            <span className="font-numeric">{summary.toReview}</span> to review
          </>
        )}
      </p>
      <p className="text-[12px] text-text-muted">
        When the four required ones are approved, customers see a Documents
        verified badge. It does not decide whether the garage is listed (that is
        Verify). Files open in a new tab on a link that works for 5 minutes;
        don’t download or forward them. Saved immediately — not part of “Save
        changes”.
      </p>
      {!readOnly && (
        <ScField
          label="Your name"
          value={actorName}
          onChange={setName}
          autoComplete="name"
          placeholder="Recorded with each approval, rejection or upload"
        />
      )}
      <div className="flex flex-col gap-2.5">
        {data.documents.map((doc) => (
          <DocumentRow
            key={doc.type}
            vendorId={vendorId}
            doc={doc}
            readOnly={readOnly}
            actorName={nameOk ? actorName.trim() : null}
          />
        ))}
      </div>
    </ScSection>
  )
}

function DocumentRow({
  vendorId,
  doc,
  readOnly,
  actorName,
}: {
  vendorId: string
  doc: AdminGarageDocument
  readOnly: boolean
  /** Null until a name of two letters or more is typed. */
  actorName: string | null
}) {
  const review = useReviewDocument(vendorId)
  const upload = useUploadAdminDocument(vendorId)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [picked, setPicked] = useState<File[]>([])
  const [expiresOn, setExpiresOn] = useState('')
  const [approveUpload, setApproveUpload] = useState(true)
  const [error, setError] = useState('')
  const busy = review.isPending || upload.isPending
  const pickProblem = picked.length > 0 ? pickedFilesProblem(picked) : null

  const open = async (fileId: string) => {
    if (!doc.id) return
    try {
      await openDocumentLink(() =>
        getAdminDocumentLink(vendorId, doc.id!, fileId)
      )
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't open the file"))
    }
  }

  const decide = (action: 'approve' | 'reject') => {
    if (!doc.id || doc.version === null || !actorName) return
    setError('')
    review.mutate(
      {
        documentId: doc.id,
        review:
          action === 'approve'
            ? { action, version: doc.version, actorName }
            : {
                action,
                version: doc.version,
                actorName,
                reason: reason.trim(),
              },
      },
      {
        onSuccess: () => {
          setRejecting(false)
          setReason('')
          toast.success(
            `${doc.label} ${action === 'approve' ? 'approved' : 'rejected'}`
          )
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't save the review")),
      }
    )
  }

  const send = () => {
    if (!actorName || picked.length === 0 || pickProblem) return
    setError('')
    upload.mutate(
      {
        type: doc.type,
        files: picked,
        expiresOn: expiresOn || null,
        actorName,
        approve: approveUpload,
      },
      {
        onSuccess: () => {
          setPicked([])
          setExpiresOn('')
          toast.success(
            `${doc.label} uploaded${approveUpload ? ' and approved' : ''}`
          )
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't upload the document")),
      }
    )
  }

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="flex flex-col gap-2.5 rounded-[10px] border border-border p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            id={titleId}
            className="text-[13px] font-semibold text-text-primary"
          >
            {doc.label}
          </p>
          <p className="text-[12px] text-text-muted">
            {doc.required ? 'Required' : 'Optional'} ·{' '}
            {DOCUMENT_HINTS[doc.type]}
            {doc.type === 'owner_id' && ` ${AADHAAR_MASK_NOTE}.`}
          </p>
        </div>
        <ScBadge variant={STATUS_VARIANT[doc.status]} className="shrink-0">
          {DOCUMENT_STATUS_LABELS[doc.status]}
        </ScBadge>
      </div>

      {doc.status !== 'missing' && (
        <p className="text-[12px] text-text-secondary">
          Uploaded by {doc.uploadedBy}
          {doc.submittedAt && <>, {istDateTimeLabel(doc.submittedAt)}</>}
          {doc.reviewedBy && doc.reviewedAt && (
            <>
              {' · '}
              {doc.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
              {doc.reviewedBy}, {istDateTimeLabel(doc.reviewedAt)}
            </>
          )}
          {doc.expiresOn && (
            <>
              {' · '}Expires{' '}
              <span className="font-numeric">{doc.expiresOn}</span>
            </>
          )}
        </p>
      )}
      {doc.status === 'rejected' && doc.rejectionReason && (
        <p className="text-[12px] text-error">
          The garage was told: {doc.rejectionReason}
        </p>
      )}

      {doc.files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {doc.files.map((file) => (
            <li key={file.id}>
              <ScButton
                variant="secondary"
                fullWidth={false}
                onClick={() => void open(file.id)}
                aria-label={`Open ${doc.label}${doc.files.length > 1 ? `, ${file.side}` : ''} in a new tab`}
                className="flex min-h-11 items-center gap-1.5 px-3 py-2 text-[12px]"
              >
                <IconFileText size={14} aria-hidden="true" />
                {doc.files.length > 1
                  ? file.side === 'front'
                    ? 'Front'
                    : 'Back'
                  : 'Open'}{' '}
                · <span className="font-numeric">{fileLine(file)}</span>
                <IconExternalLink size={13} aria-hidden="true" />
              </ScButton>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && doc.id && !rejecting && (
        <div className="flex flex-wrap gap-2">
          {doc.status !== 'approved' && (
            <ScButton
              variant="secondary"
              fullWidth={false}
              disabled={busy || !actorName}
              onClick={() => decide('approve')}
              className="min-h-11 px-3.5 text-[12px]"
            >
              Approve
            </ScButton>
          )}
          {doc.status !== 'rejected' && (
            <ScButton
              variant="secondary"
              fullWidth={false}
              disabled={busy || !actorName}
              onClick={() => setRejecting(true)}
              className="min-h-11 px-3.5 text-[12px]"
            >
              Reject
            </ScButton>
          )}
          {!actorName && (
            <p className="self-center text-[12px] text-text-muted">
              Type your name above first.
            </p>
          )}
        </div>
      )}

      {!readOnly && rejecting && (
        <div className="flex flex-col gap-2">
          <ScTextarea
            label="What should the garage fix? (they read this)"
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The Aadhaar number is readable. Cover the first 8 digits and upload it again."
          />
          <div className="flex flex-wrap gap-2">
            <ScButton
              variant="secondary"
              fullWidth={false}
              disabled={busy || !actorName || reason.trim().length < 5}
              onClick={() => decide('reject')}
              className="min-h-11 px-3.5 text-[12px]"
            >
              {review.isPending
                ? 'Saving…'
                : `Reject ${doc.label.toLowerCase()}`}
            </ScButton>
            <ScButton
              variant="secondary"
              fullWidth={false}
              disabled={busy}
              onClick={() => {
                setRejecting(false)
                setReason('')
              }}
              className="min-h-11 px-3.5 text-[12px]"
            >
              Cancel
            </ScButton>
          </div>
        </div>
      )}

      {!readOnly && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            multiple
            hidden
            aria-label={`Choose files for ${doc.label}`}
            onChange={(e) => {
              setPicked(e.target.files ? Array.from(e.target.files) : [])
              if (inputRef.current) inputRef.current.value = ''
            }}
          />
          {picked.length === 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex min-h-11 items-center gap-1.5 self-start text-[12px] font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline disabled:opacity-50"
            >
              <IconUpload size={14} aria-hidden="true" />
              Upload for the garage
            </button>
          ) : (
            <div className="flex flex-col gap-2 border-t border-border pt-2.5">
              <ul className="text-[12px] text-text-secondary">
                {picked.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="truncate">
                    {picked.length > 1
                      ? index === 0
                        ? 'Front: '
                        : 'Back: '
                      : ''}
                    {file.name}
                  </li>
                ))}
              </ul>
              {doc.takesExpiry && (
                <ScInput
                  label="Expiry date (optional)"
                  type="date"
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                  className="font-numeric"
                />
              )}
              <ScCheckbox
                label="I have checked it: mark it approved"
                checked={approveUpload}
                onChange={setApproveUpload}
              />
              {pickProblem && (
                <p className="text-[12px] text-error">{pickProblem}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <ScButton
                  variant="secondary"
                  fullWidth={false}
                  disabled={busy || !actorName || Boolean(pickProblem)}
                  onClick={send}
                  className="min-h-11 px-3.5 text-[12px]"
                >
                  {upload.isPending
                    ? 'Uploading…'
                    : `Upload ${doc.label.toLowerCase()}`}
                </ScButton>
                <ScButton
                  variant="secondary"
                  fullWidth={false}
                  disabled={busy}
                  onClick={() => setPicked([])}
                  className="min-h-11 px-3.5 text-[12px]"
                >
                  Cancel
                </ScButton>
              </div>
              {!actorName && (
                <p className="text-[12px] text-text-muted">
                  Type your name above first.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}
    </div>
  )
}
