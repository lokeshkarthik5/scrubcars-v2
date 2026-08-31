import { cn } from '@repo/core/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'cta'

interface ScButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-red text-brand-white hover:bg-brand-red-hover disabled:opacity-40',
  secondary:
    'bg-transparent border border-border text-brand-white hover:bg-surface',
  ghost: 'bg-transparent text-brand-red hover:opacity-80',
  // Login/auth call-to-action: sits muted until the form is valid, then fills
  // with brand red. Opt-in so ordinary primary buttons keep their own look.
  cta: 'rounded-full py-4 text-[15px] bg-brand-red text-brand-white hover:bg-brand-red-hover disabled:bg-surface-elevated disabled:text-text-secondary disabled:hover:bg-surface-elevated',
}

export const ScButton = forwardRef<HTMLButtonElement, ScButtonProps>(
  ({ className, variant = 'primary', fullWidth = true, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        // `press` dips the button on tap; it is inert when disabled and under
        // reduced motion (see globals.css).
        'press rounded-[10px] py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
        fullWidth && 'w-full',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
)
ScButton.displayName = 'ScButton'
