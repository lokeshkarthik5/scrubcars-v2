'use client'

import { cn } from '@repo/core/utils'
import { useRef, useState, type KeyboardEvent } from 'react'

interface OtpInputProps {
  length?: number
  onComplete?: (otp: string) => void
}

export function OtpInput({ length = 6, onComplete }: OtpInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...values]
    next[index] = value
    setValues(next)

    if (value && index < length - 1) {
      refs.current[index + 1]?.focus()
    }

    if (next.every((v) => v) && onComplete) {
      onComplete(next.join(''))
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
          className={cn(
            'h-[50px] w-11 rounded-[10px] border border-border bg-surface text-center text-base font-semibold text-text-primary outline-none transition-colors focus:border-brand-red',
            val && 'border-brand-red'
          )}
        />
      ))}
    </div>
  )
}
