'use client'

import { useState } from 'react'
import { IconBell, IconCalendar, IconChevronRight, IconInfoCircle, IconUsers } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScField, ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSelect } from '@repo/ui/sc/select'
import {
  errorMessage,
  useDiscountVendorOptions,
} from '@repo/core/api/hooks/use-discounts'
import { useNoticeAudienceCount } from '@repo/core/api/hooks/use-notices'
import type {
  AdminNotice,
  NoticeAudience,
  NoticeAudienceParams,
  NoticeInput,
} from '@repo/core/api/admin'
import { bannedPhraseIn } from '@repo/core/copy-rules'
import { useDebounced } from '@repo/core/hooks/use-debounced'
import { useNow } from '@repo/core/hooks/use-now'
import { fromIstInput, istWindowLabel, toIstInput } from '@repo/core/ist-input'
import { isAllowedNoticeLink } from '@repo/core/notice-link'
import { cn } from '@repo/core/utils'

// Lengths match the columns (0031): a notice is one line on a booking tile
// and two in Updates, so the body is short on purpose.
const TITLE_MAX = 60
const BODY_MAX = 200
const LABEL_MAX = 30

/** Controlled strings, converted once on submit, as the discount form does. */
interface FormState {
  title: string
  body: string
  linkUrl: string
  linkLabel: string
  audience: NoticeAudience
  vendorId: string
  /** India time, as the datetime-local inputs hold it (ist-input.ts). */
  bookingFrom: string
  bookingTo: string
  startsAt: string
  endsAt: string
  isActive: boolean
}

const EMPTY: FormState = {
  title: '',
  body: '',
  linkUrl: '',
  linkLabel: '',
  audience: 'all',
  vendorId: '',
  bookingFrom: '',
  bookingTo: '',
  startsAt: '',
  endsAt: '',
  isActive: true,
}

function toFormState(notice: AdminNotice): FormState {
  return {
    title: notice.title,
    body: notice.body,
    linkUrl: notice.linkUrl ?? '',
    linkLabel: notice.linkLabel ?? '',
    audience: notice.audience,
    vendorId: notice.vendorId ?? '',
    bookingFrom: toIstInput(notice.bookingFrom),
    bookingTo: toIstInput(notice.bookingTo),
    startsAt: toIstInput(notice.startsAt),
    endsAt: toIstInput(notice.endsAt),
    isActive: notice.isActive,
  }
}

/** A field label with a character counter on its right. */
function CountedLabel({ htmlFor, label, length, max }: { htmlFor: string; label: string; length: number; max: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[11px] font-medium text-text-secondary">
        {label}
      </label>
      <span aria-hidden="true" className="font-numeric text-[11px] text-text-muted">
        {length} / {max}
      </span>
    </div>
  )
}

interface NoticeFormProps {
  /** Absent = create. Present = edit that notice. */
  notice?: AdminNotice
  onSubmit: (input: NoticeInput) => void
  isPending: boolean
  error?: unknown
  onCancel: () => void
}

export function NoticeForm({ notice, onSubmit, isPending, error, onCancel }: NoticeFormProps) {
  const [form, setForm] = useState<FormState>(notice ? toFormState(notice) : EMPTY)
  const { data: vendors = [] } = useDiscountVendorOptions()
  const nowMs = useNow()

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const title = form.title.trim()
  const body = form.body.trim()
  const linkUrl = form.linkUrl.trim()
  const linkLabel = form.linkLabel.trim()
  const isWindow = form.audience === 'with_booking_between'
  const startsIso = fromIstInput(form.startsAt)
  const endsIso = fromIstInput(form.endsAt)
  const bookingFromIso = fromIstInput(form.bookingFrom)
  const bookingToIso = fromIstInput(form.bookingTo)

  // Each problem beside its field, as the server would word it.
  const titleBanned = bannedPhraseIn(title)
  const bodyBanned = bannedPhraseIn(body)
  const labelBanned = bannedPhraseIn(linkLabel)
  const linkProblem =
    linkUrl && !isAllowedNoticeLink(linkUrl)
      ? 'Use an https:// link or a path in the app, like /bookings.'
      : Boolean(linkUrl) !== Boolean(linkLabel)
        ? 'A link needs both an address and a label.'
        : null
  const windowProblem = !isWindow
    ? null
    : !bookingFromIso || !bookingToIso
      ? 'Give both ends of the booking window.'
      : Date.parse(bookingToIso) <= Date.parse(bookingFromIso)
        ? 'The booking window must end after it starts.'
        : null
  // A blank start is "now" on a new notice; the server keeps the stored one
  // on an edit, which the field already shows.
  const effectiveStartMs = startsIso ? Date.parse(startsIso) : nowMs
  const endProblem = !endsIso
    ? 'Pick when the notice ends.'
    : Date.parse(endsIso) <= effectiveStartMs
      ? 'The notice must end after it starts.'
      : null

  const isValid =
    title.length >= 3 &&
    body.length >= 3 &&
    !titleBanned &&
    !bodyBanned &&
    !labelBanned &&
    !linkProblem &&
    !windowProblem &&
    !endProblem

  const vendorName = vendors.find((v) => v.id === form.vendorId)?.businessName ??
    (form.vendorId && form.vendorId === notice?.vendorId ? notice.vendorName : null)

  // "Reaches 14 customers", once the audience can be counted.
  const countParams: NoticeAudienceParams | null = !isWindow
    ? { audience: 'all' }
    : bookingFromIso && bookingToIso && !windowProblem
      ? {
          audience: 'with_booking_between',
          vendorId: form.vendorId || undefined,
          bookingFrom: bookingFromIso,
          bookingTo: bookingToIso,
        }
      : null
  // Debounced as text, as the discount form does: an object would be new on
  // every render and keep the timer running.
  const countParamsKey = countParams ? JSON.stringify(countParams) : null
  const countKey = useDebounced(countParamsKey, 300)
  const reach = useNoticeAudienceCount(
    countKey ? (JSON.parse(countKey) as NoticeAudienceParams) : null
  )
  // As on the discount form: a count is shown only for the window and garage
  // on screen, never the previous one's kept in place while the new one loads.
  const countCurrent = countKey === countParamsKey && !reach.isPlaceholderData
  const countData = countCurrent ? reach.data : undefined
  const countError = countCurrent ? reach.error : null

  const handleSubmit = () => {
    if (!isValid || isPending || !endsIso) return
    onSubmit({
      title,
      body,
      linkUrl: linkUrl || null,
      linkLabel: linkLabel || null,
      audience: form.audience,
      // Everyone has no window and no garage; the server refuses one with them.
      vendorId: isWindow ? form.vendorId || null : null,
      bookingFrom: isWindow ? bookingFromIso : null,
      bookingTo: isWindow ? bookingToIso : null,
      ...(startsIso ? { startsAt: startsIso } : {}),
      endsAt: endsIso,
      isActive: form.isActive,
    })
  }

  return (
    <div className="grid gap-4 pb-8 lg:grid-cols-[minmax(0,1fr)_424px] lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        <ScCard className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">Message</h2>
          <div className="flex flex-col gap-1.5">
            <CountedLabel htmlFor="notice-title" label="Title" length={form.title.length} max={TITLE_MAX} />
            <ScInput
              id="notice-title"
              placeholder="Slot may move: rain"
              maxLength={TITLE_MAX}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
            {titleBanned && (
              <p className="text-[11px] text-warning">
                Notices can&apos;t say &ldquo;{titleBanned}&rdquo;. Say plainly what is happening.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <CountedLabel htmlFor="notice-body" label="Message" length={form.body.length} max={BODY_MAX} />
            <ScTextarea
              id="notice-body"
              rows={3}
              maxLength={BODY_MAX}
              placeholder="Heavy rain is forecast. The garage may call you to move your time."
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
            />
            {bodyBanned && (
              <p className="text-[11px] text-warning">
                Notices can&apos;t say &ldquo;{bodyBanned}&rdquo;. Say plainly what is happening.
              </p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <ScField
              id="notice-link"
              label="Link (optional)"
              placeholder="/bookings or https://…"
              value={form.linkUrl}
              onChange={(value) => set('linkUrl', value)}
            />
            <ScField
              id="notice-link-label"
              label="Link label"
              placeholder="My bookings"
              maxLength={LABEL_MAX}
              value={form.linkLabel}
              onChange={(value) => set('linkLabel', value)}
            />
          </div>
          {(linkProblem || labelBanned) && (
            <p className="text-[11px] text-warning">
              {labelBanned
                ? `Notices can't say "${labelBanned}". Say plainly what is happening.`
                : linkProblem}
            </p>
          )}
          <p className="text-[11px] text-text-muted">
            Notices show in the app only. They are not how customers are told
            about changes to the terms: that is a WhatsApp message or a call.
          </p>
        </ScCard>

        <ScCard className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[15px] font-semibold text-text-primary">Who sees it</legend>
            {(
              [
                {
                  value: 'all',
                  label: 'Everyone',
                  hint: 'Pinned at the top of Updates for every customer.',
                },
                {
                  value: 'with_booking_between',
                  label: 'Customers with a booking between two times',
                  hint: 'First in their Updates, and one line on their Next booking tile.',
                },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex min-h-11 cursor-pointer items-start gap-3 rounded-[12px] border px-3 py-2.5',
                  form.audience === option.value ? 'border-text-secondary bg-surface-elevated/50' : 'border-border'
                )}
              >
                <input
                  type="radio"
                  name="notice-audience"
                  value={option.value}
                  checked={form.audience === option.value}
                  onChange={() => set('audience', option.value)}
                  className="mt-0.5 size-4 shrink-0 accent-brand-white"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] text-text-primary">{option.label}</span>
                  <span className="block text-[11px] text-text-secondary">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {isWindow && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <ScField
                  id="notice-booking-from"
                  label="Booking from, IST"
                  type="datetime-local"
                  value={form.bookingFrom}
                  onChange={(value) => set('bookingFrom', value)}
                />
                <ScField
                  id="notice-booking-to"
                  label="Booking to, IST"
                  type="datetime-local"
                  value={form.bookingTo}
                  onChange={(value) => set('bookingTo', value)}
                />
              </div>
              <ScSelect
                id="notice-vendor"
                label="Garage (optional)"
                value={form.vendorId}
                onChange={(e) => set('vendorId', e.target.value)}
              >
                <option value="">Any garage</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.businessName}
                  </option>
                ))}
              </ScSelect>
              {windowProblem && (form.bookingFrom || form.bookingTo) && (
                <p className="text-[11px] text-warning">{windowProblem}</p>
              )}
            </>
          )}
        </ScCard>

        <ScCard className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">When</h2>
          <div className="grid grid-cols-2 gap-3">
            <ScField
              id="notice-starts"
              label={notice ? 'Starts, IST' : 'Starts, IST (blank = now)'}
              type="datetime-local"
              value={form.startsAt}
              onChange={(value) => set('startsAt', value)}
            />
            <ScField
              id="notice-ends"
              label="Ends, IST"
              type="datetime-local"
              value={form.endsAt}
              onChange={(value) => set('endsAt', value)}
            />
          </div>
          <p className="text-[11px] text-text-muted">
            Times are India time (IST). There is no delete: End now on the list
            stops a notice and keeps the record.
          </p>
          {endProblem && form.endsAt && <p className="text-[11px] text-warning">{endProblem}</p>}
          <ScCheckbox
            label="Active"
            checked={form.isActive}
            onChange={(checked) => set('isActive', checked)}
          />
        </ScCard>
      </div>

      <aside
        aria-label="Preview for customers"
        className="flex flex-col gap-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        <ScCard className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-text-primary">Preview</h2>
            <span className="text-[11px] text-text-muted">Live as you type</span>
          </div>
          <NoticePreview
            title={title}
            body={body}
            linkLabel={linkLabel}
            isWindow={isWindow}
            vendorName={vendorName}
          />
        </ScCard>

        <ScCard className="flex items-start gap-3 px-4 py-4">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-secondary"
          >
            <IconUsers size={18} stroke={1.5} />
          </span>
          <div className="min-w-0" aria-live="polite">
            <p className="text-[15px] font-semibold text-text-primary">
              {!countParams ? (
                'Reaches: pick the window'
              ) : countData ? (
                <>
                  Reaches <span className="font-numeric">{countData.count.toLocaleString('en-IN')}</span>{' '}
                  {countData.count === 1 ? 'customer' : 'customers'}
                </>
              ) : countError ? (
                'Reaches: couldn’t count'
              ) : (
                'Reaches: counting…'
              )}
            </p>
            <p className="text-[12px] text-text-secondary">
              {countError
                ? errorMessage(countError, "Couldn't count the customers just now.")
                : isWindow
                  ? 'Customers with a booking in that window now. Anyone who books into it later sees it too.'
                  : 'Every signed-up customer, counted now.'}
            </p>
            {endsIso && (
              <p className="mt-2 font-numeric text-[12px] text-text-muted">
                {istWindowLabel(startsIso, endsIso)}
              </p>
            )}
          </div>
        </ScCard>
      </aside>

      <div className="flex flex-col gap-2 lg:col-start-1">
        {Boolean(error) && (
          <p role="alert" className="text-[12px] text-error">
            {errorMessage(error, 'Failed to save the notice')}
          </p>
        )}
        <div className="flex items-center gap-2">
          <ScButton disabled={!isValid || isPending} onClick={handleSubmit}>
            {isPending ? 'Saving…' : notice ? 'Save changes' : 'Create notice'}
          </ScButton>
          <ScButton variant="secondary" fullWidth={false} disabled={isPending} onClick={onCancel} className="px-4">
            Cancel
          </ScButton>
        </div>
      </div>
    </div>
  )
}

/**
 * How the notice reaches a customer. An 'everyone' notice is the pinned first
 * row of Updates (and of Home's Updates block). A booking-window notice leads
 * the Updates of the customers it is about and rides on their Next booking
 * tile as one line, its title.
 *
 * A sketch after the approved Home design, drawn here because the customer's
 * Updates row and Next booking tile do not exist yet: they come with the
 * customer Home (B2), which should build them as shared pieces in
 * packages/ui/src/home, as the offer coupon is, and switch this preview over
 * to them. Until then it shows only what the notice itself decides (its
 * words, its link, where it lands) and leaves the customer's own booking as
 * a placeholder rather than inventing one.
 */
function NoticePreview({
  title,
  body,
  linkLabel,
  isWindow,
  vendorName,
}: {
  title: string
  body: string
  linkLabel: string
  isWindow: boolean
  vendorName: string | null
}) {
  const shownTitle = title || 'Your title shows here'
  return (
    // A 390pt phone's column at any window width, as the offer preview is,
    // so a title is cut where it will be on a phone.
    <div className="mx-auto flex w-full max-w-[390px] flex-col gap-4 rounded-[22px] border border-border bg-brand-black px-4 py-4">
      {isWindow && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-text-muted">On their Next booking tile</p>
          <div className="flex flex-col gap-2 rounded-[18px] border border-border bg-surface px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-text-secondary">Next booking</p>
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-surface-elevated text-text-primary"
              >
                <IconCalendar size={16} stroke={1.5} />
              </span>
            </div>
            <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-primary">
              <IconInfoCircle size={14} stroke={1.5} aria-hidden="true" className="shrink-0 text-text-muted" />
              <span className="truncate">{shownTitle}</span>
            </p>
            <p className="text-[12px] text-text-muted">
              Their booking&apos;s day and time{vendorName ? ` · ${vendorName}` : ''}
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-text-muted">
          {isWindow ? 'First in their Updates' : 'Pinned at the top of Updates'}
        </p>
        <div className="flex items-start gap-3 rounded-[18px] border border-border bg-surface px-3.5 py-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-primary"
          >
            <IconBell size={18} stroke={1.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text-primary">{shownTitle}</p>
            <p className="line-clamp-2 text-[12px] text-text-secondary">
              {body || 'The message shows here, on two lines at most.'}
            </p>
            <p className="mt-1 text-[12px] text-text-muted">Detlio team</p>
            {linkLabel && (
              <p className="mt-1 inline-flex items-center gap-0.5 text-[12px] font-medium text-text-primary">
                {linkLabel}
                <IconChevronRight size={14} aria-hidden="true" />
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
