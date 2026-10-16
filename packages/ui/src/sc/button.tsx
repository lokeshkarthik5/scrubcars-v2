import { cn } from '@repo/core/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'cta' | 'hero'

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
  // The Home hub's one red action: the gradient pill with its intro shine
  // (`cta-hero` in globals.css). Wrap the label in an element, so it sits
  // above the band of light. One per screen; behind NEXT_PUBLIC_HOME_HUB.
  hero: 'cta-hero flex h-[52px] items-center justify-center gap-2 rounded-full py-0 text-[15px] font-medium tracking-[-0.005em]',
}

/**
 * The classes an ScButton is drawn with, for the one thing that has to look
 * like a button without being one: a link that navigates (ScButtonLink). A
 * <button> inside an <a> is two controls in one place to a screen reader, and
 * invalid HTML besides.
 */
export function scButtonClass({
  variant = 'primary',
  fullWidth = true,
  className,
}: {
  variant?: ButtonVariant
  fullWidth?: boolean
  className?: string
} = {}) {
  return cn(
    // `press` dips the button on tap; it is inert when disabled and under
    // reduced motion (see globals.css).
    'press rounded-[10px] py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
    fullWidth && 'w-full',
    variantStyles[variant],
    className
  )
}

export const ScButton = forwardRef<HTMLButtonElement, ScButtonProps>(
  ({ className, variant = 'primary', fullWidth = true, children, ...props }, ref) => (
    <button
      ref={ref}
      className={scButtonClass({ variant, fullWidth, className })}
      {...props}
    >
      {children}
    </button>
  )
)
ScButton.displayName = 'ScButton'
