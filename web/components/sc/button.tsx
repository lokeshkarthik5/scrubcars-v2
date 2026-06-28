import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

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
}

export const ScButton = forwardRef<HTMLButtonElement, ScButtonProps>(
  ({ className, variant = 'primary', fullWidth = true, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'rounded-[10px] py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
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
