'use client'

import type { InputHTMLAttributes } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import { normaliseIndianMobile } from '@repo/core/phone'
import { cn } from '@repo/core/utils'

interface ScPhoneInputProps {
  value: string
  /**
   * Receives the national digits only: "+91 98765 43210" pasted or autofilled
   * arrives as "9876543210". See normaliseIndianMobile.
   */
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  /** Wire up when country selection ships; until then the code renders inert. */
  onCountryClick?: () => void
  /** 'glass' for the frosted sign-in card, where a solid field reads as a hole. */
  tone?: 'solid' | 'glass'
  /** For screens where the number is the only thing to do. */
  autoFocus?: boolean
  /** The label on the keyboard's return key, e.g. 'go' when it submits. */
  enterKeyHint?: InputHTMLAttributes<HTMLInputElement>['enterKeyHint']
  /** The id of the message that explains what is wrong with the number. */
  errorId?: string
  className?: string
}

/**
 * The +91 phone field shared by every login/onboarding screen. One control so
 * customer, vendor and admin entry points don't drift apart again.
 */
export function ScPhoneInput({
  value,
  onChange,
  label,
  placeholder = 'Phone number',
  onCountryClick,
  tone = 'solid',
  autoFocus,
  enterKeyHint,
  errorId,
  className,
}: ScPhoneInputProps) {
  // The chevron promises a picker, so it shows only once there is one. On the
  // inert label it read as a dropdown that did nothing when tapped.
  const code = (
    <>
      <span className="text-[16px] leading-none">🇮🇳</span>
      +91
      {onCountryClick && (
        <IconChevronDown size={16} className="text-text-secondary" />
      )}
    </>
  )
  const codeClass = cn(
    'flex shrink-0 items-center gap-1.5 border-r px-3.5 text-[16px] text-text-primary',
    tone === 'glass' ? 'border-white/15' : 'border-border'
  )

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor="sc-phone" className="text-[11px] font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div
        className={cn(
          // A light edge marks focus; red is for the Send OTP button below.
          'flex overflow-hidden rounded-[12px] border transition-colors focus-within:border-text-secondary',
          tone === 'glass' ? 'border-white/15 bg-white/[0.06]' : 'border-border bg-surface'
        )}
      >
        {/* Country picker isn't built yet — render it inert rather than as a
            focusable button that does nothing. */}
        {onCountryClick ? (
          <button type="button" onClick={onCountryClick} className={codeClass}>
            {code}
          </button>
        ) : (
          <div aria-hidden className={codeClass}>
            {code}
          </div>
        )}
        {/* No maxLength: the browser would cut a pasted "+91 98765 43210" to
            ten characters before onChange could read the whole thing. The
            length is enforced on the normalised digits instead — an edit that
            would leave more than ten is refused, as maxLength would refuse the
            keystroke. 16px is the body size, and the size below which iOS
            Safari zooms into a focused field. */}
        <input
          id="sc-phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          enterKeyHint={enterKeyHint}
          // Sign-in screens draw no label above the field, and a placeholder
          // is no name once a digit is typed.
          aria-label={label ? undefined : 'Phone number'}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            const digits = normaliseIndianMobile(e.target.value)
            if (digits.length <= 10) onChange(digits)
          }}
          className="w-full flex-1 bg-transparent px-3.5 py-4 text-[16px] text-text-primary outline-none"
        />
      </div>
    </div>
  )
}
