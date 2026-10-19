'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import { ScSelect } from '@repo/ui/sc/select'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useComplaintLookup,
  useLogComplaint,
} from '@repo/core/api/hooks/use-admin-complaints'
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_MESSAGE_MAX,
  COMPLAINT_SOURCE_LABELS,
  LOGGED_COMPLAINT_SOURCES,
  MAX_RECEIVED_DAYS_BACK,
  type ComplaintCategory,
  type LoggedComplaintSource,
} from '@repo/core/complaints'
import { fromIstInput, toIstInput } from '@repo/core/ist-input'
import { rememberName, rememberedName } from '@/lib/actor-name'
import { formatWhen } from '@/lib/bookings'
import {
  logComplaintProblems,
  wholeBookingRef,
  wholeMobile,
} from '@/lib/complaints'

const DAY_MS = 24 * 60 * 60 * 1000

/** Under the booking field: what the reference turned out to be. */
function bookingHint(
  lookup: ReturnType<typeof useComplaintLookup>['data'],
  typedRef: string | null,
  hasAccount: boolean
): { text: string; problem: boolean } | null {
  if (!typedRef) return null
  const booking = lookup?.booking
  if (!booking) return { text: 'Looking it up…', problem: false }
  if (booking.found) {
    return {
      text: `#${booking.reference} · ${booking.garageName ?? 'Garage since deleted'} · ${formatWhen(booking.scheduledAt)}`,
      problem: false,
    }
  }
  switch (booking.refusal) {
    case 'not_found':
      return { text: 'No booking has this reference.', problem: true }
    case 'not_theirs':
      return {
        text: hasAccount
          ? "This booking is another customer's."
          : 'No booking has this reference.',
        problem: true,
      }
    case 'ambiguous':
      return {
        text: 'More than one booking starts with this. Leave it out and say which in your note.',
        problem: true,
      }
  }
}

/**
 * Log a complaint that came by phone, WhatsApp, email or in person, so it
 * gets a C-number and the same clock as one raised in the app. The clock
 * runs from when it was received, which may be up to 7 days back.
 *
 * The phone is looked up as it is typed: an account's complaint shows in
 * the customer's My complaints, with the team's answer in their Updates;
 * without one, the name typed is kept with the phone. A booking reference
 * attaches the booking and its garage.
 *
 * Mounted fresh each time it opens (keyed by the caller).
 */
export function LogComplaintDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const logComplaint = useLogComplaint()
  const [phone, setPhone] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [source, setSource] = useState<LoggedComplaintSource>('phone')
  const [category, setCategory] = useState<ComplaintCategory>('service_quality')
  const [message, setMessage] = useState('')
  const [bookingRef, setBookingRef] = useState('')
  const [receivedAt, setReceivedAt] = useState(() =>
    toIstInput(new Date().toISOString())
  )
  const [loggedBy, setLoggedBy] = useState(rememberedName)
  const [error, setError] = useState('')
  const [tried, setTried] = useState(false)

  const mobile = wholeMobile(phone)
  const ref = wholeBookingRef(bookingRef)
  const lookup = useComplaintLookup({
    phone: mobile ?? undefined,
    bookingRef: ref ?? undefined,
  })
  // Only once the look-up for this very number has answered.
  const accountName =
    mobile && !lookup.isPlaceholderData && lookup.data?.customer !== undefined
      ? (lookup.data.customer?.name ?? null)
      : undefined
  const hasAccount = accountName === undefined ? null : accountName !== null
  // A look-up that failed says nothing; the name is asked for in case.
  const lookupFailed = Boolean(mobile) && lookup.isError && hasAccount === null
  const booking = lookup.isPlaceholderData
    ? null
    : bookingHint(lookup.data, ref, hasAccount === true)

  const now = new Date()
  const receivedIso = fromIstInput(receivedAt)
  const problems = logComplaintProblems(
    {
      phone,
      hasAccount,
      customerName,
      message,
      bookingRef,
      receivedAt: receivedIso,
      loggedBy,
    },
    now
  )
  const canSubmit =
    problems.length === 0 && !booking?.problem && !logComplaint.isPending

  const submit = () => {
    setTried(true)
    if (!canSubmit || !mobile || !receivedIso) return
    setError('')
    rememberName(loggedBy.trim())
    logComplaint.mutate(
      {
        phone: mobile,
        customerName: hasAccount ? undefined : customerName.trim() || undefined,
        source,
        category,
        message: message.trim(),
        bookingRef: ref ?? undefined,
        receivedAt: receivedIso,
        loggedBy: loggedBy.trim(),
      },
      {
        onSuccess: (created) => {
          toast.success(`Complaint ${created.number} logged`)
          onClose()
          router.push(`/complaints/${created.id}`)
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't log this complaint")),
      }
    )
  }

  return (
    <ScModal
      open={open}
      onClose={onClose}
      dismissible={!logComplaint.isPending}
      aria-label="Log a complaint"
      className="flex max-w-[480px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">
          Log a complaint
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          For one that came by phone, WhatsApp, email or in person. It gets a
          C-number, and the clock runs from when we received it.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <ScInput
          id="log-complaint-phone"
          label="Customer's phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="min-h-11 font-numeric"
        />
        <p className="text-[11px] text-text-muted" aria-live="polite">
          {!mobile
            ? 'Ten digits. +91 and spaces are fine.'
            : lookupFailed
              ? "Couldn't check for an account. Type their name in case there is none."
              : hasAccount === null
                ? 'Looking for an account…'
                : hasAccount
                  ? `${accountName}'s account: they'll see it, and your answer, in the app.`
                  : "No account with this number: it's kept with the name you type."}
        </p>
      </div>

      {(hasAccount === false || lookupFailed) && (
        <ScInput
          id="log-complaint-name"
          label="Customer's name"
          autoComplete="off"
          maxLength={255}
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="min-h-11"
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ScSelect
          id="log-complaint-source"
          label="How it came"
          value={source}
          onChange={(e) => setSource(e.target.value as LoggedComplaintSource)}
          className="min-h-11"
        >
          {LOGGED_COMPLAINT_SOURCES.map((value) => (
            <option key={value} value={value}>
              {COMPLAINT_SOURCE_LABELS[value]}
            </option>
          ))}
        </ScSelect>
        <ScSelect
          id="log-complaint-category"
          label="About"
          value={category}
          onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
          className="min-h-11"
        >
          {COMPLAINT_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {COMPLAINT_CATEGORY_LABELS[value]}
            </option>
          ))}
        </ScSelect>
      </div>

      <ScTextarea
        id="log-complaint-message"
        label="What they said"
        rows={4}
        maxLength={COMPLAINT_MESSAGE_MAX}
        placeholder="In their words, as near as you can"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <div className="flex flex-col gap-1">
        <ScInput
          id="log-complaint-booking"
          label="Booking reference (optional)"
          autoComplete="off"
          spellCheck={false}
          placeholder="#3F2A9C1B"
          value={bookingRef}
          onChange={(e) => setBookingRef(e.target.value)}
          className="min-h-11 font-numeric uppercase"
        />
        {booking && (
          <p
            className={
              booking.problem
                ? 'text-[11px] text-error'
                : 'text-[11px] text-text-muted'
            }
            aria-live="polite"
          >
            {booking.text}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <ScInput
          id="log-complaint-received"
          type="datetime-local"
          label="Received at (India time)"
          min={toIstInput(
            new Date(
              now.getTime() - MAX_RECEIVED_DAYS_BACK * DAY_MS
            ).toISOString()
          )}
          max={toIstInput(now.toISOString())}
          value={receivedAt}
          onChange={(e) => setReceivedAt(e.target.value)}
          className="min-h-11 font-numeric"
        />
        <p className="text-[11px] text-text-muted">
          When the call, message or visit came, up to {MAX_RECEIVED_DAYS_BACK}{' '}
          days back.
        </p>
      </div>

      <ScInput
        id="log-complaint-actor"
        label="Your name"
        autoComplete="name"
        maxLength={100}
        value={loggedBy}
        onChange={(e) => setLoggedBy(e.target.value)}
        className="min-h-11"
      />

      {tried && problems.length > 0 && (
        <ul
          role="alert"
          className="flex flex-col gap-0.5 text-[12px] text-error"
        >
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton
          variant="secondary"
          onClick={onClose}
          disabled={logComplaint.isPending}
          className="min-h-11"
        >
          Go back
        </ScButton>
        {/* The dialog's one red button. */}
        <ScButton
          onClick={submit}
          disabled={logComplaint.isPending || (tried && !canSubmit)}
          className="min-h-11"
        >
          {logComplaint.isPending ? 'Logging…' : 'Log complaint'}
        </ScButton>
      </div>
    </ScModal>
  )
}
