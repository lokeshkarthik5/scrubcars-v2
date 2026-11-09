'use client'

import { serviceLinesOf } from '@repo/core/add-ons'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconCamera,
  IconLoader2,
  IconShieldCheck,
  IconX,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useQueryClient } from '@tanstack/react-query'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScTextarea } from '@repo/ui/sc/input'
import { TopBar } from '@repo/ui/sc/top-bar'
import { GuaranteeEvidence } from '@repo/ui/features/guarantee-photos'
import { ApiError } from '@repo/core/api/client'
import { getBooking } from '@repo/core/api/bookings'
import { uploadClaimPhoto, type CustomerClaim } from '@repo/core/api/guarantee'
import {
  guaranteeKeys,
  useBookingGuarantee,
  useBookRedo,
  useCreateClaim,
  useGuaranteeConfig,
  useRedoSlots,
} from '@repo/core/api/hooks/use-guarantee'
import {
  GUARANTEE_HOW_IT_WORKS,
  GUARANTEE_NAME,
  GUARANTEE_RULES,
  GUARANTEE_ISSUES,
  ISSUE_LABELS,
  claimFormProblem,
  type GuaranteeIssue,
} from '@repo/core/guarantee'
import { formatStepTime } from '@repo/core/job-records'
import type { Booking } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { useT } from '@repo/core/i18n'

const DAY_LABEL = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

function dayLabel(dateKey: string): string {
  return DAY_LABEL.format(new Date(`${dateKey}T12:00:00+05:30`))
}

/**
 * Detlio Guarantee (0051): the claim screen for one booking. Before a claim,
 * the form: what is wrong (from the list), at least two photos of the
 * problem taken with the camera (re-encoded in the browser, so no location
 * or camera details leave the phone), with the garage's before and after
 * photos alongside so the customer sees what Detlio compares. After it,
 * where it stands; while a redo is approved, the free times at the same
 * garage within the window, to pick one.
 */
export default function GuaranteeClaimPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const t = useT()
  const { id } = use(params)
  const config = useGuaranteeConfig()
  const on = config.data?.enabled === true
  const guarantee = useBookingGuarantee(id, on)
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    void getBooking(id).then((found) => live && setBooking(found ?? null))
    return () => {
      live = false
    }
  }, [id])

  const loading =
    config.isLoading || (on && guarantee.isLoading) || booking === undefined

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col gap-4 bg-brand-black px-4 pb-10 pt-4">
      <TopBar showBack backHref={`/bookings/${id}`} title={GUARANTEE_NAME} />
      {loading ? (
        <p role="status" className="text-t4 text-text-secondary">
          {t('Loading…')}
        </p>
      ) : !on || !booking || !guarantee.data ? (
        <Unavailable
          id={id}
          message={t("The Detlio Guarantee isn't available for this booking.")}
        />
      ) : guarantee.data.claim ? (
        <ClaimStatus booking={booking} claim={guarantee.data.claim} />
      ) : guarantee.data.canClaim ? (
        <ClaimForm booking={booking} claimBy={guarantee.data.claimBy} />
      ) : (
        <Unavailable
          id={id}
          message={t("This booking can't take a free redo claim. Use Help with this booking to raise a complaint instead.")}
        />
      )}
    </main>
  )
}

function Unavailable({ id, message }: { id: string; message: string }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-4">
      <p className="text-t4 text-text-secondary">{message}</p>
      <Link
        href={`/bookings/${id}`}
        className="flex min-h-11 items-center justify-center rounded-[10px] border border-border text-sm font-semibold text-text-primary"
      >
        {t('Back to booking')}
      </Link>
    </div>
  )
}

interface Uploaded {
  key: string
  preview: string
}

function ClaimForm({
  booking,
  claimBy,
}: {
  booking: Booking
  claimBy: string | null
}) {
  const t = useT()
  const router = useRouter()
  const create = useCreateClaim()
  const [issues, setIssues] = useState<GuaranteeIssue[]>([])
  const [otherText, setOtherText] = useState('')
  const [photos, setPhotos] = useState<Uploaded[]>([])
  const [uploading, setUploading] = useState(false)

  const problem = claimFormProblem({ issues, otherText, photos: photos.length })
  const room = GUARANTEE_RULES.maxPhotos - photos.length

  const toggle = (issue: GuaranteeIssue, checked: boolean) =>
    setIssues((current) =>
      checked ? [...current, issue] : current.filter((value) => value !== issue)
    )

  const addPhoto = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await uploadClaimPhoto(booking.id, file)
      setPhotos((current) => [
        ...current,
        { key: uploaded.key, preview: URL.createObjectURL(file) },
      ])
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Your photo did not upload. Please try again.')
      )
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    if (problem) {
      toast.error(problem)
      return
    }
    try {
      await create.mutateAsync({
        bookingId: booking.id,
        issues,
        ...(issues.includes('other') && { otherText: otherText.trim() }),
        photoKeys: photos.map((photo) => photo.key),
      })
      toast.success(t('Claim sent'))
      router.replace(`/bookings/${booking.id}/guarantee`)
    } catch (error) {
      toast.error(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : t('Could not send your claim. Please try again.')
      )
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ScCard className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <IconShieldCheck
            size={20}
            aria-hidden
            className="mt-0.5 shrink-0 text-text-primary"
          />
          <div>
            <h1 className="text-sm font-semibold text-text-primary">
              {t('Not happy with this job?')}
            </h1>
            <p className="mt-0.5 text-t5 text-text-secondary">
              {booking.vendorName} ·{' '}
              {serviceLinesOf(booking.items).map((item) => item.name).join(', ')}
              {claimBy && <> {t('· Ask by {claimBy}', { claimBy: formatStepTime(claimBy) })}</>}
            </p>
          </div>
        </div>
        <ul className="ml-1 flex list-disc flex-col gap-1 pl-4 text-t5 text-text-secondary">
          {GUARANTEE_HOW_IT_WORKS.map((line) => (
            <li key={line}>{t(line)}</li>
          ))}
        </ul>
      </ScCard>

      <ScCard className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-text-primary">
          {t("What's wrong?")}
        </h2>
        {GUARANTEE_ISSUES.map((issue) => (
          <ScCheckbox
            key={issue}
            label={t(ISSUE_LABELS[issue])}
            checked={issues.includes(issue)}
            onChange={(checked) => toggle(issue, checked)}
            className="text-t4"
          />
        ))}
        {issues.includes('other') && (
          <ScTextarea
            data-clarity-mask="true"
            label={t("Tell us what's wrong")}
            rows={3}
            maxLength={GUARANTEE_RULES.otherTextMax}
            value={otherText}
            onChange={(event) => setOtherText(event.target.value)}
          />
        )}
      </ScCard>

      <ScCard className="flex flex-col gap-2">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            {t('Photos of the problem')}
          </h2>
          <p className="mt-0.5 text-t5 text-text-secondary">
            {t('Take at least {minPhotos} with your camera, close up on what was missed. Location and camera details are removed before upload.', { minPhotos: GUARANTEE_RULES.minPhotos })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <div
              key={photo.key}
              className="relative size-20 overflow-hidden rounded-[10px] ring-1 ring-inset ring-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.preview}
                alt={t('Problem photo {value}', { value: index + 1 })}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  setPhotos((current) =>
                    current.filter((value) => value.key !== photo.key)
                  )
                }
                aria-label={t('Remove photo {value}', { value: index + 1 })}
                className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/70 text-white"
              >
                <IconX size={14} aria-hidden />
              </button>
            </div>
          ))}
          {room > 0 && (
            <label
              className={cn(
                'flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border text-t5 text-text-secondary',
                uploading && 'pointer-events-none opacity-60'
              )}
            >
              {uploading ? (
                <IconLoader2 size={20} className="animate-spin" aria-hidden />
              ) : (
                <IconCamera size={20} aria-hidden />
              )}
              {uploading ? t('Uploading') : t('Take photo')}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={uploading}
                onChange={(event) => {
                  void addPhoto(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
          )}
        </div>
      </ScCard>

      <ScCard className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-text-primary">
          {t('What Detlio compares')}
        </h2>
        <GuaranteeEvidence garagePhotos={booking.jobPhotos} />
      </ScCard>

      <ScButton
        variant="main"
        onClick={() => void submit()}
        disabled={Boolean(problem) || create.isPending || uploading}
        className="min-h-11"
      >
        {create.isPending ? t('Sending…') : t('Ask for a free redo')}
      </ScButton>
      {problem && (
        <p className="text-center text-t5 text-text-secondary">{problem}</p>
      )}
    </div>
  )
}

function ClaimStatus({
  booking,
  claim,
}: {
  booking: Booking
  claim: CustomerClaim
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-4">
      <ScCard className="flex items-start gap-3">
        <IconShieldCheck
          size={20}
          aria-hidden
          className="mt-0.5 shrink-0 text-text-primary"
        />
        <div>
          <h1 className="text-sm font-semibold text-text-primary">
            {claim.title}
          </h1>
          {claim.body && (
            <p className="mt-0.5 text-t5 text-text-secondary">
              {claim.body}
            </p>
          )}
        </div>
      </ScCard>

      {claim.canBookRedo && <RedoPicker booking={booking} claim={claim} />}

      {claim.redoBooking && (
        <Link
          href={`/bookings/${claim.redoBooking.id}`}
          className="flex min-h-11 items-center justify-center rounded-[10px] border border-border text-sm font-semibold text-text-primary"
        >
          {t('See your free redo booking')}
        </Link>
      )}

      <ScCard className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-text-primary">{t('Your claim')}</h2>
        <p className="text-t5 text-text-secondary">
          {claim.issues.map((issue) => t(ISSUE_LABELS[issue])).join(', ')}
          {claim.otherText ? ` — ${claim.otherText}` : ''}
        </p>
        <GuaranteeEvidence
          customerPhotos={claim.photos}
          garagePhotos={booking.jobPhotos}
          customerTitle={t('Your photos')}
        />
      </ScCard>

      <Link
        href={`/bookings/${booking.id}`}
        className="flex min-h-11 items-center justify-center rounded-[10px] border border-border text-sm font-semibold text-text-primary"
      >
        {t('Back to booking')}
      </Link>
    </div>
  )
}

/**
 * The free times for the redo: the days of the window, then that day's
 * times at the same garage for the same job (the slot rule's own list).
 * Booking it holds the time like any booking; there is nothing to pay.
 */
function RedoPicker({
  booking,
  claim,
}: {
  booking: Booking
  claim: CustomerClaim
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const first = useRedoSlots(claim.id, date ?? todayKey())
  const days = first.data?.days ?? []
  const shownDate = date ?? days[0] ?? null
  const slots = useRedoSlots(claim.id, shownDate)
  const book = useBookRedo(booking.id)

  const confirm = async () => {
    if (!time) return
    try {
      const result = await book.mutateAsync({
        claimId: claim.id,
        scheduledAt: time,
      })
      toast.success(t('Free redo booked'))
      void queryClient.invalidateQueries({
        queryKey: guaranteeKeys.booking(booking.id),
      })
      window.location.assign(`/bookings/${result.bookingId}`)
    } catch (error) {
      setTime(null)
      void slots.refetch()
      toast.error(
        error instanceof Error
          ? error.message
          : t('Could not book that time. Pick another one.')
      )
    }
  }

  return (
    <ScCard className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">
          {t('Pick a time at {vendorName}', { vendorName: booking.vendorName })}
        </h2>
        {claim.redoBookBy && (
          <p className="mt-0.5 text-t5 text-text-secondary">
            {t('Free of charge, by {redoBookBy}.', { redoBookBy: formatStepTime(claim.redoBookBy) })}
          </p>
        )}
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        role="listbox"
        aria-label={t('Day')}
      >
        {days.map((day) => (
          <button
            key={day}
            type="button"
            role="option"
            aria-selected={day === shownDate}
            onClick={() => {
              setDate(day)
              setTime(null)
            }}
            className={cn(
              'min-h-11 shrink-0 rounded-[10px] border px-3 text-t5',
              day === shownDate
                ? 'border-brand-white bg-surface text-text-primary'
                : 'border-border text-text-secondary'
            )}
          >
            {dayLabel(day)}
          </button>
        ))}
      </div>
      {slots.isLoading ? (
        <p role="status" className="text-t5 text-text-secondary">
          {t('Loading times…')}
        </p>
      ) : (slots.data?.slots.length ?? 0) === 0 ? (
        <p className="text-t5 text-text-secondary">
          {slots.data?.isClosed
            ? t('The garage is closed that day.')
            : t('No free times that day. Try another day.')}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {slots.data!.slots.map((slot) => (
            <button
              key={slot.time}
              type="button"
              onClick={() => setTime(slot.time)}
              aria-pressed={time === slot.time}
              className={cn(
                'min-h-[42px] rounded-[10px] border text-t4',
                time === slot.time
                  ? 'border-brand-white bg-surface text-text-primary'
                  : 'border-border text-text-secondary'
              )}
            >
              {slot.label}
            </button>
          ))}
        </div>
      )}
      <ScButton
        variant="main"
        onClick={() => void confirm()}
        disabled={!time || book.isPending}
        className="min-h-11"
      >
        {book.isPending ? t('Booking…') : t('Book my free redo')}
      </ScButton>
    </ScCard>
  )
}

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}
