import { cn } from '@repo/core/utils'
import { type ButtonHTMLAttributes, forwardRef, useId } from 'react'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'cta'
  | 'hero'
  // The pill family from the UX audit's consistency system. New screens use
  // these; the five above stay as they are for the screens that have them.
  | 'main'
  | 'outline'
  | 'text'
  | 'danger-outline'

/** Height of a pill-family button: 52px, or 56px for a screen's main action. */
export type ButtonSize = 'md' | 'lg'

interface ScButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
  /** Pill family only ('main', 'outline', 'text', 'danger-outline'). */
  size?: ButtonSize
  /**
   * Why the button can't be pressed yet, written under it in grey ("Pick a
   * time first"). Only shown while `disabled`; the button turns a neutral
   * grey instead of a faded colour, which reads as "not ready", not "error".
   */
  disabledReason?: string
}

/** The Home hub pill's shape, kept apart so a greyed hero keeps it. */
const HERO_SHAPE =
  'flex h-[52px] items-center justify-center gap-2 rounded-full py-0 text-[15px] font-medium tracking-[-0.005em]'
const CTA_SHAPE = 'rounded-full py-4 text-[15px]'

const variantStyles: Record<ButtonVariant, string> = {
  // The red fill is --color-brand-red-fill (#E4002B): white on it is 4.85:1,
  // where white on #EF3240 was 3.87:1, under AA.
  primary:
    'bg-brand-red-fill text-brand-white hover:bg-brand-red-fill-hover disabled:opacity-40',
  secondary:
    'bg-transparent border border-border text-brand-white hover:bg-surface',
  ghost: 'bg-transparent text-brand-red hover:opacity-80',
  // Login/auth call-to-action: sits muted until the form is valid, then fills
  // with brand red. Opt-in so ordinary primary buttons keep their own look.
  cta: `${CTA_SHAPE} bg-brand-red-fill text-brand-white hover:bg-brand-red-fill-hover disabled:bg-surface-elevated disabled:text-text-secondary disabled:hover:bg-surface-elevated`,
  // The Home hub's one red action: the gradient pill with its intro shine
  // (`cta-hero` in globals.css). Wrap the label in an element, so it sits
  // above the band of light. One per screen; behind NEXT_PUBLIC_HOME_HUB.
  hero: `cta-hero ${HERO_SHAPE}`,
  // A screen's one red action: the CTA gradient, without the hero's shine.
  // Pure white text, which cta.test.ts measures at 4.5:1 or more on the
  // gradient's lightest stop. Grey when disabled, never a faded red.
  main: 'bg-(image:--gradient-cta) text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_22px_-12px_rgba(228,0,43,0.6)] hover:brightness-95 disabled:bg-none disabled:bg-surface-elevated disabled:text-text-secondary disabled:shadow-none disabled:hover:brightness-100',
  // The second action beside it.
  outline:
    'border border-white/25 bg-transparent text-text-primary hover:bg-surface disabled:border-border disabled:text-text-muted disabled:hover:bg-transparent',
  // A quiet action in words. White, not red: red is kept for the one button.
  text: 'bg-transparent px-3 text-text-primary underline-offset-4 hover:underline disabled:text-text-muted disabled:no-underline',
  // A destructive second action (Cancel booking, Delete). Amber, the colour
  // of every caution: red would read as "press me".
  'danger-outline':
    'border border-error/60 bg-transparent text-error hover:bg-error-muted disabled:border-border disabled:text-text-muted disabled:hover:bg-transparent',
}

const PILLS = new Set<ButtonVariant>([
  'main',
  'outline',
  'text',
  'danger-outline',
])

const pillSizes: Record<ButtonSize, string> = {
  md: 'h-[52px]',
  lg: 'h-14',
}

/** Not ready yet: grey in any variant, with its shape kept. */
const GREYED =
  'border-transparent bg-surface-elevated text-text-secondary shadow-none hover:bg-surface-elevated disabled:opacity-100'

/**
 * The classes an ScButton is drawn with, for the one thing that has to look
 * like a button without being one: a link that navigates (ScButtonLink). A
 * <button> inside an <a> is two controls in one place to a screen reader, and
 * invalid HTML besides.
 */
export function scButtonClass({
  variant = 'primary',
  fullWidth = true,
  size = 'md',
  greyed = false,
  className,
}: {
  variant?: ButtonVariant
  fullWidth?: boolean
  /** Pill family only; the older variants keep their own height. */
  size?: ButtonSize
  /** Drawn as "not ready yet" (a disabled button with a reason). */
  greyed?: boolean
  className?: string
} = {}) {
  const pill = PILLS.has(variant)
  const shape =
    variant === 'hero' ? HERO_SHAPE : variant === 'cta' ? CTA_SHAPE : ''
  return cn(
    // `press` dips the button on tap; it is inert when disabled and under
    // reduced motion (see globals.css).
    pill
      ? // 52–56px: wet or gloved hands, one thumb (the garage audit).
        'press inline-flex items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed'
      : 'press rounded-[10px] py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
    pill && pillSizes[size],
    fullWidth && 'w-full',
    greyed ? cn(shape, GREYED) : variantStyles[variant],
    className
  )
}

export const ScButton = forwardRef<HTMLButtonElement, ScButtonProps>(
  (
    {
      className,
      variant = 'primary',
      fullWidth = true,
      size = 'md',
      disabledReason,
      children,
      ...props
    },
    ref
  ) => {
    const reasonId = useId()
    const withReason = Boolean(props.disabled && disabledReason)
    const button = (
      <button
        ref={ref}
        className={scButtonClass({
          variant,
          fullWidth,
          size,
          greyed: withReason,
          className,
        })}
        {...props}
        aria-describedby={
          withReason
            ? [props['aria-describedby'], reasonId].filter(Boolean).join(' ')
            : props['aria-describedby']
        }
      >
        {children}
      </button>
    )
    // Wrapped only when there is a reason, so every other layout is as it was.
    if (!withReason) return button
    return (
      <div
        className={cn(
          'flex flex-col items-center',
          fullWidth ? 'w-full' : 'w-fit'
        )}
      >
        {button}
        <p
          id={reasonId}
          className="mt-1.5 text-center text-[13px] leading-snug text-text-secondary"
        >
          {disabledReason}
        </p>
      </div>
    )
  }
)
ScButton.displayName = 'ScButton'
