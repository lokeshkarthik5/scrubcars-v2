'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { useHeroShine } from '@repo/ui/sc/hero-shine'
import { cn } from '@repo/core/utils'
import { isHomeHubEnabled } from '@/lib/home-hub'

interface MainActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** As on ScButton. */
  fullWidth?: boolean
  /** Today's classes, used exactly as they are while the hub is off. */
  className?: string
  /** Classes for the hero pill, which brings its own size and shape. */
  heroClassName?: string
  /** After the label on the hero pill only: the approved ↗. */
  heroIcon?: ReactNode
  /**
   * False keeps today's button even with the hub on, for a state that is not
   * the action yet: checkout's graphite "Pick a time", which is red nowhere.
   */
  hero?: boolean
}

/**
 * A screen's one main action — the garage page's Book Now, checkout's Pay,
 * a final bill's Pay. With NEXT_PUBLIC_HOME_HUB on it is the Home hub's red
 * pill (ScButton "hero": the gradient that keeps white text above 4.5:1, and
 * the two-sweep shine, off under reduced motion and while disabled, and run
 * once per visit however often the button is disabled or steps back to plain
 * — useHeroShine); with it off it is the ScButton each screen drew before,
 * with the same classes and the same label, so production does not change by
 * a pixel.
 *
 * One per screen. Everything else on it stays outlined or quiet.
 */
export function MainAction({
  className,
  heroClassName,
  heroIcon,
  hero = true,
  children,
  ...props
}: MainActionProps) {
  const hub = isHomeHubEnabled()
  // Held here, above both looks, so checkout's Pay stepping back to "Pick a
  // time" and returning is still the same button with its shine spent: both
  // branches below are an ScButton in the same place, so React keeps the one
  // <button> throughout.
  const { attach, className: shineClassName } = useHeroShine<HTMLButtonElement>(hub)

  if (!hub) {
    return (
      <ScButton className={className} {...props}>
        {children}
      </ScButton>
    )
  }
  if (!hero) {
    return (
      <ScButton ref={attach} className={className} {...props}>
        {children}
      </ScButton>
    )
  }
  return (
    <ScButton
      ref={attach}
      variant="hero"
      className={cn(heroClassName, shineClassName)}
      {...props}
    >
      {/* The label sits above the band of light only as an element of its
          own (`.cta-hero > *` in globals.css). */}
      <span>{children}</span>
      {heroIcon}
    </ScButton>
  )
}
