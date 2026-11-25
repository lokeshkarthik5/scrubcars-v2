'use client'

import { cn } from '@repo/core/utils'
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useT } from '@repo/core/i18n'

interface OtpInputProps {
  length?: number
  onComplete?: (otp: string) => void
  /** 'glass' on the frosted sign-in card, matching the phone field there. */
  tone?: 'solid' | 'glass'
  /** The id of the message that says the code was wrong, read with each box. */
  errorId?: string
}

export function OtpInput({ length = 6, onComplete, tone = 'solid', errorId }: OtpInputProps) {
  const t = useT()
  const [values, setValues] = useState<string[]>(Array(length).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  // Reported to the parent from an effect rather than from the change handler.
  //
  // The handler used to build the next array from `values` captured at render
  // and call onComplete with it. Two changes landing in one React batch — fast
  // typing, a paste, an SMS autofill — both read the same stale array, so the
  // completed code was never assembled and onComplete never fired. The parent
  // (phone-verify.tsx) has no other channel, so its Verify button stayed
  // disabled and the code could not be submitted at all.
  useEffect(() => {
    if (values.every(Boolean)) {
      onComplete?.(values.join(''))
    }
    // onComplete is a setState in every current caller, so it is stable; naming
    // it here would re-fire on any parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values])

  // Puts several digits in from one box onward and moves to the box after
  // the last one filled (the last box once the code is complete).
  const fillFrom = (index: number, digits: string) => {
    const take = digits.slice(0, length - index)
    // Functional update: consecutive changes must each build on the previous
    // one, not on whatever `values` was when this handler was created.
    setValues((current) => {
      const next = [...current]
      take.split('').forEach((digit, k) => {
        next[index + k] = digit
      })
      return next
    })
    refs.current[Math.min(index + take.length, length - 1)]?.focus()
  }

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (raw && !digits) return

    // More than one digit at once: the phone's code suggestion above the
    // keyboard (iOS and Android put the whole code into the box in focus) or
    // a paste the paste handler did not catch. Each box used to hold one
    // character, so only the first number of the code went in (friends'
    // report, 25 Nov 2026).
    if (digits.length > 1) {
      // Typing into a box that already has a digit gives old + new; keep the
      // new one. A whole code (the length of it) always starts at box 1.
      const old = values[index]
      if (digits.length === 2 && old && digits.includes(old)) {
        fillFrom(index, digits.replace(old, ''))
      } else {
        fillFrom(digits.length >= length ? 0 : index, digits)
      }
      return
    }

    setValues((current) => {
      const next = [...current]
      next[index] = digits
      return next
    })

    if (digits && index < length - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  // A pasted code fills every box, whichever box was tapped: a whole code
  // from box 1, a part of one from the box tapped. Spaces and dashes in it
  // ("123 456", "Your code is 123456") are dropped.
  const handlePaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!digits) return
    e.preventDefault()
    fillFrom(digits.length >= length ? 0 : index, digits.slice(0, length))
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !values[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  // All six in and no error against them: the boxes join into one tick
  // (the customer website's finish only; finish.css). A wrong code parts
  // them again, so every digit can be seen and changed.
  const joined = values.every(Boolean) && !errorId
  const centre = (length - 1) / 2

  return (
    // data-clarity-mask: never recorded by Microsoft Clarity (customer app,
    // with consent).
    <div
      role="group"
      aria-label={t('Verification code')}
      className="otp-boxes relative flex justify-center gap-2"
      data-joined={joined ? '' : undefined}
      data-clarity-mask="true"
    >
      {values.map((val, i) => (
        // Each box carries its red light, lit once its digit is in. The cell
        // knows how far it is from the middle, where the boxes join.
        <span
          key={i}
          className="otp-cell relative"
          data-lit={val ? '' : undefined}
          style={{ '--otp-to-centre': `${(centre - i) * 52}px` } as React.CSSProperties}
        >
          <input
            // Six unnamed boxes read as six blank fields; each says which digit.
            aria-label={t('Digit {n} of {length}', { n: i + 1, length })}
            aria-invalid={errorId ? true : undefined}
            aria-describedby={errorId}
            ref={(el) => { refs.current[i] = el }}
            type="text"
            inputMode="numeric"
            // The phone offers the texted code on the first box; room for the
            // whole code in every box, so a suggestion or paste is never cut
            // to one digit before handleChange can spread it out.
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            value={val}
            onChange={(e) => handleChange(i, e.target.value)}
            onPaste={(e) => handlePaste(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            // Tapping a filled box selects its digit, so the next one typed
            // replaces it rather than landing beside it.
            onFocus={(e) => e.currentTarget.select()}
            // Figures in the brand's numeric face. A filled box steps up to a
            // grey edge and the focused one to white — six red outlines here
            // used to outshout the red Verify button they lead to.
            className={cn(
              'otp-box h-[50px] w-11 rounded-[10px] border text-center font-numeric text-base font-bold text-text-primary outline-none transition-colors focus:border-text-primary',
              tone === 'glass' ? 'border-white/15 bg-white/[0.06]' : 'border-border bg-surface',
              val && (tone === 'glass' ? 'border-white/30' : 'border-text-muted/60')
            )}
          />
          <span aria-hidden="true" className="otp-light hidden" />
        </span>
      ))}
      <span aria-hidden="true" className="otp-sweep hidden" />
      <span aria-hidden="true" className="otp-tick hidden">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      </span>
    </div>
  )
}
