'use client'

import { IconChevronDown } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

interface ScPhoneInputProps {
  value: string
  /** Receives digits only — non-numeric input is stripped. */
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  /** Wire up when country selection ships; until then the code renders inert. */
  onCountryClick?: () => void
  /** 'glass' for the frosted sign-in card, where a solid field reads as a hole. */
  tone?: 'solid' | 'glass'
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
  className,
}: ScPhoneInputProps) {
  const code = (
    <>
      <span className="text-[15px] leading-none">🇮🇳</span>
      +91
      <IconChevronDown size={16} className="text-text-secondary" />
    </>
  )
  const codeClass = cn(
    'flex shrink-0 items-center gap-1.5 border-r px-3.5 text-[15px] text-text-primary',
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
          'flex overflow-hidden rounded-[12px] border transition-colors focus-within:border-brand-red',
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
        <input
          id="sc-phone"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          className="w-full flex-1 bg-transparent px-3.5 py-4 text-[15px] text-text-primary outline-none"
        />
      </div>
    </div>
  )
}
