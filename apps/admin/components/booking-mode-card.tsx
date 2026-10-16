'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { IconAlertCircle, IconCheck, IconUsers } from '@tabler/icons-react'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ApiError } from '@repo/core/api/client'
import { updateAdminVendor } from '@repo/core/api/admin'
import { cn } from '@repo/core/utils'
import {
  BOOKING_MODE_OPTIONS,
  DEFAULT_DOORSTEP_RADIUS_KM,
  bookingModeFlags,
  bookingModeOf,
  bookingReachLine,
  parseRadiusInput,
  radiusText,
  type BookingMode,
} from '@/lib/garage-edit'

/** Figures in a sentence set in the numeric face, the rest left in Inter. */
function WithFigures({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d+)/).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-numeric">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  )
}

interface BookingModeCardProps {
  mode: BookingMode | null
  onModeChange: (mode: BookingMode) => void
  /** The "Travels up to" box as typed. */
  radius: string
  onRadiusChange: (value: string) => void
  onRadiusBlur?: () => void
  /** The radius the status line reports: the saved one on the edit page. */
  reachKm: number | null
  radiusError?: string | null
  /** The quiet note in the corner on the edit page; absent on Add vendor. */
  saveState?: 'idle' | 'saving' | 'saved'
  error?: string | null
  paused?: boolean
  /**
   * Whether customers can see the garage at all (Active and verified). The
   * card is the first thing on every tab, so during setup it must not read
   * as though the garage were already taking bookings.
   */
  live: boolean
  /** The garage drew its own doorstep area, which the radius then doesn't touch. */
  drawnArea?: boolean
}

/**
 * "How customers book": the garage's drop-in and doorstep switches as one
 * choice in the customers' own words, the doorstep radius beside it, and a
 * line saying what a customer can book as a result.
 *
 * It used to be two unlabelled 12px checkboxes in the third cell of a radius
 * grid on the third tab, under a "Pickup & drop" question that looked like it
 * but did nothing — which is why the owner could not find it. Now it sits
 * above the tabs, the first thing on every one of them.
 */
export function BookingModeCard({
  mode,
  onModeChange,
  radius,
  onRadiusChange,
  onRadiusBlur,
  reachKm,
  radiusError,
  saveState,
  error,
  paused,
  live,
  drawnArea = false,
}: BookingModeCardProps) {
  const radiusId = useId()
  const radiusHintId = useId()
  const radiusErrorId = useId()
  const hint = BOOKING_MODE_OPTIONS.find((option) => option.value === mode)?.hint
  const reach = bookingReachLine(mode, reachKm, { drawnArea })
  const travels = mode === 'doorstep' || mode === 'both'

  return (
    <section
      aria-labelledby={`${radiusId}-title`}
      className="rounded-[16px] border border-border bg-surface p-4"
    >
      <div className="flex min-h-[22px] items-center justify-between gap-3">
        <h2 id={`${radiusId}-title`} className="text-[15px] font-medium tracking-[-0.01em] text-text-primary">
          How customers book
        </h2>
        {saveState && (
          // Always mounted, so the change is announced when it lands.
          <span role="status" className="flex items-center gap-1.5 text-[12.5px] text-text-secondary">
            {saveState === 'saved' && (
              <IconCheck size={15} stroke={2} className="text-success" aria-hidden="true" />
            )}
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Saves on tap'}
          </span>
        )}
      </div>

      {/* A radiogroup, not tabs: the choice changes the garage, not what is
          on screen. Raised graphite for the pick, never red — red on this
          page is Save changes. */}
      <ScSegmented<BookingMode>
        aria-label="How customers book"
        value={mode ?? ('' as BookingMode)}
        onChange={onModeChange}
        options={BOOKING_MODE_OPTIONS.map(({ value, label }) => ({ value, label }))}
        className="mt-3.5 border border-border bg-brand-black p-[3px] [&>button]:min-h-11 [&>button]:text-[14px]"
      />
      <p className="mt-2.5 text-[13px] leading-snug text-text-muted">
        {hint ?? 'Pick how customers can book this garage.'}
      </p>

      {travels && (
        <div className="-mx-4 mt-4 border-t border-border px-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <label htmlFor={radiusId} className="block text-[15px] tracking-[-0.01em] text-text-primary">
                Travels up to
              </label>
              <span id={radiusHintId} className="mt-0.5 block text-[12.5px] text-text-muted">
                {drawnArea ? (
                  // Kept editable: if the garage clears its area, this is
                  // what applies from then on.
                  'Not used while the garage’s own drawn area is set.'
                ) : (
                  <>
                    Optional. Empty means <span className="font-numeric">{DEFAULT_DOORSTEP_RADIUS_KM}</span> km.
                  </>
                )}
              </span>
            </div>
            <div
              className={cn(
                'flex h-[46px] w-[100px] shrink-0 items-center gap-1.5 rounded-[12px] border bg-surface px-3.5 transition-colors focus-within:border-text-secondary',
                radiusError ? 'border-error' : 'border-border'
              )}
            >
              <input
                id={radiusId}
                value={radius}
                inputMode="decimal"
                autoComplete="off"
                placeholder={String(DEFAULT_DOORSTEP_RADIUS_KM)}
                aria-describedby={radiusError ? `${radiusHintId} ${radiusErrorId}` : radiusHintId}
                aria-invalid={radiusError ? true : undefined}
                onChange={(e) => onRadiusChange(e.target.value)}
                onBlur={onRadiusBlur}
                onKeyDown={(e) => {
                  // Enter commits, as leaving the box does.
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                className="w-full min-w-0 bg-transparent font-numeric text-[17px] font-medium text-text-primary outline-none placeholder:text-text-muted"
              />
              <span aria-hidden="true" className="text-[13px] text-text-muted">
                km
              </span>
            </div>
          </div>
          {/* Inside the doorstep block, so it goes with the box it is about
              when the garage switches to "At the garage". */}
          {radiusError && (
            <p id={radiusErrorId} className="mt-2 text-[12.5px] text-error">
              {radiusError}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-error">
          {error}
        </p>
      )}

      <div className="-mx-4 -mb-4 mt-4 flex items-start gap-2.5 rounded-b-[15px] border-t border-border bg-white/[0.025] px-4 py-3.5 text-[13px] leading-snug text-text-muted">
        <IconUsers size={17} stroke={1.5} className="mt-px shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0">
          {reach ? (
            <>
              <span className="block">{live ? 'Customers can book' : 'When live, customers can book'}</span>
              <span className="mt-px block text-[14px] text-text-primary">
                <WithFigures text={reach} />
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-error">
              Nothing is switched on, so customers can’t book this garage.
            </span>
          )}
          {!live && (
            <span className="mt-1.5 flex items-start gap-1.5 text-error">
              <IconAlertCircle size={15} className="mt-px shrink-0" aria-hidden="true" />
              Not live yet: customers can’t see this garage until it’s Active and verified (Details).
            </span>
          )}
          {paused && (
            <span className="mt-1.5 flex items-start gap-1.5 text-error">
              <IconAlertCircle size={15} className="mt-px shrink-0" aria-hidden="true" />
              Bookings are paused, so no one can book right now. Resume them in Operations.
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

const SAVED_NOTE_MS = 2500
// A tap, or each arrow key on the radiogroup, waits this long for the next
// one, so going from "At the garage" to "Both" with the keyboard does not
// save "Doorstep" (drop-in off) on the way.
const MODE_SAVE_DELAY_MS = 400

type BookingPatch = { dropinEnabled?: boolean; doorstepEnabled?: boolean; doorstepRadiusKm?: number | null }

/**
 * The card on the edit page, where it saves the moment it changes — like
 * Pause, and like the garage app — through the same admin vendor update the
 * form uses. "Save changes" never sends these fields, so nothing is saved
 * twice and the form can't put back a value this card just changed.
 */
export function LiveBookingModeCard({
  vendorId,
  dropinEnabled,
  doorstepEnabled,
  doorstepRadiusKm,
  drawnArea,
  paused,
  live,
  onAuthError,
  onSaved,
}: {
  vendorId: string
  /** As loaded. Read once: from then on the card holds the garage's state. */
  dropinEnabled: boolean
  doorstepEnabled: boolean
  doorstepRadiusKm: number | null
  drawnArea: boolean
  paused: boolean
  live: boolean
  onAuthError: () => void
  /** Each change the server accepted, so the page can mark the garage list stale. */
  onSaved?: () => void
}) {
  const [mode, setMode] = useState<BookingMode | null>(() =>
    bookingModeOf(dropinEnabled, doorstepEnabled)
  )
  const [radius, setRadius] = useState(radiusText(doorstepRadiusKm))
  const [savedKm, setSavedKm] = useState<number | null>(doorstepRadiusKm)
  const [radiusError, setRadiusError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  // What the server last accepted, to put back if a change is refused.
  const confirmed = useRef({ mode, km: doorstepRadiusKm })
  // What was last asked for, whether or not it has landed: a new change is
  // compared with this, not with `confirmed`, or a change made while an
  // earlier one is still queued could be skipped as "no change".
  const requested = useRef({ mode, km: doorstepRadiusKm })
  // Each field's latest request. Only the latest may put the card back on a
  // refusal; an older one that fails while a newer one is queued leaves the
  // card to the newer one's answer.
  const latest = useRef({ mode: 0, km: 0 })
  // One change at a time, in the order they were made: two quick taps must
  // not land in the other order and leave the garage on the first.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modeTimer = useRef<{ timer: ReturnType<typeof setTimeout>; send: () => void } | null>(null)

  // A mode change still waiting out its delay is sent when the page goes, not
  // dropped: the admin saw it selected.
  useEffect(
    () => () => {
      const waiting = modeTimer.current
      if (!waiting) return
      clearTimeout(waiting.timer)
      waiting.send()
    },
    []
  )

  const save = (
    patch: BookingPatch,
    field: 'mode' | 'km',
    onRefused: () => void,
    onAccepted: (isLatest: boolean) => void
  ) => {
    const seq = ++latest.current[field]
    pending.current += 1
    setSaveState('saving')
    if (savedTimer.current) clearTimeout(savedTimer.current)

    queue.current = queue.current.then(async () => {
      try {
        await updateAdminVendor(vendorId, patch)
        onAccepted(seq === latest.current[field])
        onSaved?.()
        // A later change landing means an earlier refusal no longer
        // describes the garage.
        setError(null)
        // "Saved" only once nothing else is on its way, a pick still
        // waiting out its delay included.
        if (pending.current === 1 && !modeTimer.current) {
          setSaveState('saved')
          savedTimer.current = setTimeout(() => setSaveState('idle'), SAVED_NOTE_MS)
        }
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          onAuthError()
          return
        }
        if (seq === latest.current[field]) onRefused()
        setSaveState('idle')
        setError(
          err instanceof ApiError ? err.message : 'Couldn’t save that. Check the connection and try again.'
        )
      } finally {
        pending.current -= 1
      }
    })
  }

  const changeMode = (next: BookingMode) => {
    // The pick already on screen, with nothing waiting: nothing to do.
    if (next === mode && !modeTimer.current) return
    if (next === 'garage') {
      // The radius box goes away with doorstep: whatever was half-typed in
      // it, and what was said about it, go too.
      setRadiusError(null)
      setRadius(radiusText(requested.current.km))
    }
    if (modeTimer.current) clearTimeout(modeTimer.current.timer)
    setMode(next)
    if (next === requested.current.mode) {
      // Back to what was already asked for before the delay ran out.
      modeTimer.current = null
      setSaveState(pending.current > 0 ? 'saving' : 'idle')
      return
    }
    setSaveState('saving')
    setError(null)
    const send = () => {
      modeTimer.current = null
      requested.current = { ...requested.current, mode: next }
      save(
        bookingModeFlags(next),
        'mode',
        () => {
          // A newer pick still waiting out its delay decides instead.
          if (modeTimer.current) return
          requested.current = { ...requested.current, mode: confirmed.current.mode }
          setMode(confirmed.current.mode)
        },
        (isLatest) => {
          confirmed.current = { ...confirmed.current, mode: next }
          // Shown again in case an earlier refusal put the card back.
          if (isLatest && !modeTimer.current) setMode(next)
        }
      )
    }
    modeTimer.current = { timer: setTimeout(send, MODE_SAVE_DELAY_MS), send }
  }

  const commitRadius = () => {
    const asked = requested.current.km
    // Tapped in and out without a change: a stored value is left alone, even
    // one the old admin form allowed and this box would not (40 km, say).
    if (radius.trim() === radiusText(asked)) {
      setRadiusError(null)
      return
    }
    const parsed = parseRadiusInput(radius)
    if (!parsed.ok) {
      setRadiusError(parsed.message)
      return
    }
    setRadiusError(null)
    const km = parsed.km
    // Tidy what was typed ("08" → "8").
    setRadius(radiusText(km))
    if (km === asked) return
    requested.current = { ...requested.current, km }
    setError(null)
    save(
      { doorstepRadiusKm: km },
      'km',
      () => {
        requested.current = { ...requested.current, km: confirmed.current.km }
        setRadius(radiusText(confirmed.current.km))
      },
      () => {
        // The box already shows it (set at commit), and may hold a newer
        // value being typed, so only the status line follows.
        confirmed.current = { ...confirmed.current, km }
        setSavedKm(km)
      }
    )
  }

  return (
    <BookingModeCard
      mode={mode}
      onModeChange={changeMode}
      radius={radius}
      onRadiusChange={(value) => {
        setRadius(value)
        if (radiusError) setRadiusError(null)
      }}
      onRadiusBlur={commitRadius}
      reachKm={savedKm}
      radiusError={radiusError}
      saveState={saveState}
      error={error}
      paused={paused}
      live={live}
      drawnArea={drawnArea}
    />
  )
}
