'use client'

import { cn } from '@repo/core/utils'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

interface OtpInputProps {
  length?: number
  onComplete?: (otp: string) => void
  /** 'glass' on the frosted sign-in card, matching the phone field there. */
  tone?: 'solid' | 'glass'
}

export function OtpInput({ length = 6, onComplete, tone = 'solid' }: OtpInputProps) {
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

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return

    // Functional update: consecutive changes must each build on the previous
    // one, not on whatever `values` was when this handler was created.
    setValues((current) => {
      const next = [...current]
      next[index] = value
      return next
    })

    if (value && index < length - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !values[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  return (
    <div className="flex justify-center gap-2">
      {values.map((val, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={val}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          // Figures in the brand's numeric face. A filled box steps up to a
          // grey edge and the focused one to white — six red outlines here
          // used to outshout the red Verify button they lead to.
          className={cn(
            'h-[50px] w-11 rounded-[10px] border text-center font-numeric text-base font-bold text-text-primary outline-none transition-colors focus:border-text-primary',
            tone === 'glass' ? 'border-white/15 bg-white/[0.06]' : 'border-border bg-surface',
            val && (tone === 'glass' ? 'border-white/30' : 'border-text-muted/60')
          )}
        />
      ))}
    </div>
  )
}
