'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import {
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconRosetteDiscountCheckFilled,
} from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScField, ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScSelect } from '@repo/ui/sc/select'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type {
  AdminCertification,
  CertifyBlockedBy,
} from '@repo/core/api/certification'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminCertification,
  useCertifyGarage,
  useRecordQualityCheck,
  useRevokeCertification,
} from '@repo/core/api/hooks/use-admin-certification'
import {
  QUALITY_CHECK_KIND_LABELS,
  dateKeyLabel,
  type QualityCheckKind,
} from '@repo/core/certification'
import { istDateKey } from '@repo/core/payouts'
import { istDateTimeLabel } from '@repo/core/ist-input'
import { cn } from '@repo/core/utils'
import { SignedAs } from '@/components/signed-as'

/** Why Certify is off, in the words the tab shows under it. */
const BLOCKED: Record<CertifyBlockedBy, string> = {
  in_bin: 'The garage is in the Bin.',
  already_certified: 'Already certified.',
  not_eligible:
    'It does not meet every standard yet (the lines marked not met above).',
  no_passing_check:
    'Record a passing quality check from the last 6 months first.',
}

const CHECK_STATUS: Record<
  AdminCertification['qualityCheck']['status'],
  string
> = {
  passed: 'Passed',
  failed: 'Latest check failed',
  expired: 'Last pass is over 6 months old',
  none: 'No check yet',
}

/**
 * Detlio Certified (0048), on the garage edit page's Certification tab: the
 * standards measured now (each figure against its target, green or not),
 * Detlio's quality checks and "Record a check", then Certify or Revoke.
 * Each action saves on its own, like Documents: never part of "Save
 * changes". In the Bin everything still shows and nothing can be changed.
 */
export function GarageCertificationSection({
  vendorId,
  readOnly,
}: {
  vendorId: string
  readOnly: boolean
}) {
  const { data, isLoading, error } = useAdminCertification(vendorId)

  if (isLoading) {
    return (
      <ScSection title="Detlio Certified">
        <SkeletonList count={3} itemClassName="h-20 rounded-[10px]" />
      </ScSection>
    )
  }
  if (error || !data) {
    return (
      <ScSection title="Detlio Certified">
        <p role="alert" className="text-[12px] text-error">
          {errorMessage(error, "Couldn't load the certification.")}
        </p>
      </ScSection>
    )
  }

  const { eligibility } = data
  return (
    <div className="flex flex-col gap-3">
      <ScSection
        title="Detlio Certified"
        action={
          data.certified ? (
            <ScBadge variant="success">
              <IconRosetteDiscountCheckFilled
                size={12}
                aria-hidden="true"
                className="mr-1"
              />
              Certified
            </ScBadge>
          ) : eligibility.eligible ? (
            <ScBadge variant="pending">Eligible</ScBadge>
          ) : (
            <ScBadge variant="muted">Not eligible</ScBadge>
          )
        }
      >
        <StatusLines data={data} />
        <p className="text-[12px] text-text-muted">
          Eligible = every standard below over the last {data.rules.windowDays}{' '}
          days (Test-marked bookings left out). Certified = eligible, a passing
          quality check from the last {data.rules.qualityCheckMonths} months,
          and Certify pressed. Checked every night: a certified garage that
          falls short for {data.rules.graceDays} days loses the seal on its own.
          Customers see only the seal. Saved immediately — not part of “Save
          changes”.
        </p>
        {!readOnly && <SignedAs />}
      </ScSection>

      <ScSection title="Standards">
        <ul className="flex flex-col divide-y divide-border">
          {eligibility.rules.map((rule) => (
            <li
              key={rule.key}
              className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0"
            >
              {rule.met ? (
                <IconCircleCheckFilled
                  size={17}
                  aria-label="Met"
                  className="mt-px shrink-0 text-success"
                />
              ) : (
                <IconCircleXFilled
                  size={17}
                  aria-label="Not met"
                  className="mt-px shrink-0 text-error"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-text-primary">
                  {rule.label}
                </p>
                <p className="text-[12px] text-text-secondary">
                  <span
                    className={cn(
                      'font-numeric',
                      rule.met ? 'text-success' : 'text-error'
                    )}
                  >
                    {rule.value}
                  </span>
                  <span className="text-text-muted">
                    {' '}
                    · needs {rule.target.toLowerCase()}
                  </span>
                  {!rule.measured && (
                    <span className="text-text-muted">
                      {' '}
                      (not measured, passes)
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-text-muted">
          Measured {istDateTimeLabel(eligibility.measuredAt)}
          {data.lastEvaluatedAt && (
            <>
              {' '}
              · nightly check last ran {istDateTimeLabel(data.lastEvaluatedAt)}
            </>
          )}
        </p>
      </ScSection>

      <QualityChecks
        vendorId={vendorId}
        data={data}
        readOnly={readOnly}
      />

      {!readOnly && (
        <Decision vendorId={vendorId} data={data} />
      )}
    </div>
  )
}

function StatusLines({ data }: { data: AdminCertification }) {
  if (data.certified) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-text-primary">
          Certified {data.certifiedAt && istDateTimeLabel(data.certifiedAt)}
          {data.certifiedBy && <> by {data.certifiedBy}</>}
        </p>
        {data.atRisk && (
          <p role="status" className="text-[12px] text-warning">
            Falling short since {istDateTimeLabel(data.atRisk.since)}. It keeps
            the seal until{' '}
            <span className="font-numeric">
              {dateKeyLabel(data.atRisk.keepsUntil)}
            </span>
            , then loses it unless it is put right.
          </p>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[13px] font-medium text-text-primary">
        {data.eligibility.eligible
          ? data.qualityCheck.valid
            ? 'Meets every standard and passed its check: ready to certify.'
            : 'Meets every standard. Arrange a quality check next.'
          : 'Not certified.'}
      </p>
      {data.revoked && (
        <p className="text-[12px] text-text-secondary">
          {data.revoked.kind === 'lapsed'
            ? 'Lost automatically'
            : `Revoked by ${data.revoked.by ?? 'admin'}`}{' '}
          {istDateTimeLabel(data.revoked.at)}
          {data.revoked.reason && <>: {data.revoked.reason}</>}
        </p>
      )}
    </div>
  )
}

function QualityChecks({
  vendorId,
  data,
  readOnly,
}: {
  vendorId: string
  data: AdminCertification
  readOnly: boolean
}) {
  const record = useRecordQualityCheck(vendorId)
  const today = istDateKey(new Date())
  const [open, setOpen] = useState(false)
  const [checkedOn, setCheckedOn] = useState(today)
  const [kind, setKind] = useState<QualityCheckKind>('mystery_visit')
  const [checkerName, setCheckerName] = useState('')
  const [result, setResult] = useState<'pass' | 'fail'>('pass')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const notesOk = result === 'pass' || notes.trim().length >= 5
  const ready = checkerName.trim().length >= 2 && notesOk && checkedOn !== ''

  const save = () => {
    if (!ready) return
    setError('')
    record.mutate(
      {
        checkedOn,
        kind,
        checkerName: checkerName.trim(),
        result,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          setOpen(false)
          setCheckerName('')
          setNotes('')
          setResult('pass')
          setCheckedOn(today)
          toast.success(
            `Quality check recorded (${result === 'pass' ? 'pass' : 'fail'})`
          )
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't record the check")),
      }
    )
  }

  return (
    <ScSection
      title="Quality checks"
      action={
        <ScBadge
          variant={
            data.qualityCheck.valid
              ? 'success'
              : data.qualityCheck.status === 'failed'
                ? 'danger'
                : 'muted'
          }
        >
          {CHECK_STATUS[data.qualityCheck.status]}
        </ScBadge>
      }
    >
      <p className="text-[12px] text-text-muted">
        A mystery visit or an inspection by Detlio. The latest one from the last{' '}
        {data.rules.qualityCheckMonths} months must be a pass
        {data.qualityCheck.validUntil && (
          <>
            ; this garage’s counts until{' '}
            <span className="font-numeric">
              {dateKeyLabel(data.qualityCheck.validUntil)}
            </span>
          </>
        )}
        . The garage sees only whether and when it passed, never who checked or
        the notes.
      </p>

      {data.checks.length === 0 ? (
        <p className="text-[12px] text-text-secondary">No checks recorded.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.checks.map((check) => (
            <li
              key={check.id}
              className="rounded-[10px] border border-border p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium text-text-primary">
                  {check.kindLabel} ·{' '}
                  <span className="font-numeric">
                    {dateKeyLabel(check.checkedOn)}
                  </span>
                </p>
                <ScBadge
                  variant={check.result === 'pass' ? 'success' : 'danger'}
                  className="shrink-0"
                >
                  {check.result === 'pass' ? 'Pass' : 'Fail'}
                </ScBadge>
              </div>
              <p className="text-[12px] text-text-secondary">
                Checked by {check.checkerName} · recorded by {check.recordedBy},{' '}
                {istDateTimeLabel(check.createdAt)}
              </p>
              {check.notes && (
                <p className="mt-1 whitespace-pre-line text-[12px] text-text-primary">
                  {check.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly &&
        (open ? (
          <div className="flex flex-col gap-2.5 border-t border-border pt-3">
            <div className="grid grid-cols-2 gap-2.5">
              <ScInput
                label="Date of the visit"
                type="date"
                max={today}
                value={checkedOn}
                onChange={(e) => setCheckedOn(e.target.value)}
                className="font-numeric"
              />
              <ScSelect
                label="Kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as QualityCheckKind)}
              >
                {(
                  Object.keys(QUALITY_CHECK_KIND_LABELS) as QualityCheckKind[]
                ).map((value) => (
                  <option key={value} value={value}>
                    {QUALITY_CHECK_KIND_LABELS[value]}
                  </option>
                ))}
              </ScSelect>
            </div>
            <ScField
              label="Checked by"
              value={checkerName}
              onChange={setCheckerName}
              placeholder="Who visited"
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-text-secondary">
                Result
              </span>
              <ScSegmented
                aria-label="Result"
                value={result}
                onChange={setResult}
                options={[
                  { value: 'pass', label: 'Pass' },
                  { value: 'fail', label: 'Fail' },
                ]}
              />
            </div>
            <ScTextarea
              label={
                result === 'fail'
                  ? 'What was wrong (required)'
                  : 'Notes (optional)'
              }
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What the checker saw: the bay, the work, how the customer was treated"
            />
            <div className="flex flex-wrap gap-2">
              <ScButton
                variant="secondary"
                fullWidth={false}
                disabled={!ready || record.isPending}
                onClick={save}
                className="min-h-11 px-3.5 text-[12px]"
              >
                {record.isPending ? 'Saving…' : 'Record check'}
              </ScButton>
              <ScButton
                variant="secondary"
                fullWidth={false}
                disabled={record.isPending}
                onClick={() => setOpen(false)}
                className="min-h-11 px-3.5 text-[12px]"
              >
                Cancel
              </ScButton>
            </div>
            {error && (
              <p role="alert" className="text-[12px] text-error">
                {error}
              </p>
            )}
          </div>
        ) : (
          <ScButton
            variant="secondary"
            fullWidth={false}
            onClick={() => setOpen(true)}
            className="min-h-11 self-start px-3.5 text-[12px]"
          >
            Record a check
          </ScButton>
        ))}
    </ScSection>
  )
}

function Decision({
  vendorId,
  data,
}: {
  vendorId: string
  data: AdminCertification
}) {
  const certify = useCertifyGarage(vendorId)
  const revoke = useRevokeCertification(vendorId)
  const [revoking, setRevoking] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const busy = certify.isPending || revoke.isPending

  const doCertify = () => {
    setError('')
    certify.mutate(undefined, {
      onSuccess: () =>
        toast.success(`${data.garage.businessName} is Detlio Certified`),
      onError: (err) =>
        setError(errorMessage(err, "Couldn't certify the garage")),
    })
  }

  const doRevoke = () => {
    if (reason.trim().length < 5) return
    setError('')
    revoke.mutate(
      { reason: reason.trim() },
      {
        onSuccess: () => {
          setRevoking(false)
          setReason('')
          toast.success('Certification revoked')
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't revoke the certification")),
      }
    )
  }

  return (
    <ScSection title={data.certified ? 'Revoke' : 'Certify'}>
      {data.certified ? (
        revoking ? (
          <div className="flex flex-col gap-2">
            <ScTextarea
              label="Why (kept on record and sent to the team's Telegram)"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damage to a customer's car confirmed on 12 Oct"
            />
            <div className="flex flex-wrap gap-2">
              <ScButton
                variant="secondary"
                fullWidth={false}
                disabled={busy || reason.trim().length < 5}
                onClick={doRevoke}
                className="min-h-11 px-3.5 text-[12px]"
              >
                {revoke.isPending ? 'Revoking…' : 'Revoke certification'}
              </ScButton>
              <ScButton
                variant="secondary"
                fullWidth={false}
                disabled={busy}
                onClick={() => {
                  setRevoking(false)
                  setReason('')
                }}
                className="min-h-11 px-3.5 text-[12px]"
              >
                Cancel
              </ScButton>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[12px] text-text-secondary">
              Takes the seal away now. Customers stop seeing it at once; the
              garage can earn it again.
            </p>
            <ScButton
              variant="secondary"
              fullWidth={false}
              disabled={busy}
              onClick={() => setRevoking(true)}
              className="min-h-11 self-start px-3.5 text-[12px]"
            >
              Revoke…
            </ScButton>
          </>
        )
      ) : (
        <>
          <p className="text-[12px] text-text-secondary">
            Records your name and the time. Customers see the seal on its card
            and page, and can find it with “Certified only”.
          </p>
          <ScButton
            variant="secondary"
            fullWidth={false}
            disabled={busy || data.certifyBlockedBy !== null}
            onClick={doCertify}
            className="min-h-11 self-start px-3.5 text-[12px]"
          >
            <IconRosetteDiscountCheckFilled
              size={15}
              aria-hidden="true"
              className="mr-1.5"
            />
            {certify.isPending ? 'Certifying…' : 'Certify'}
          </ScButton>
          {data.certifyBlockedBy && (
            <p className="text-[12px] text-text-muted">
              {BLOCKED[data.certifyBlockedBy]}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}
    </ScSection>
  )
}
